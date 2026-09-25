/**
 * Convex lowering of entity-scoped aggregates — `count(Entity where f == v, …)`
 * and `sum(Entity where …, of q)` — for reaction params and command
 * guards/constraints (docs/spec/builtins.md, "Entity-scoped aggregates").
 *
 * The read is chosen from the equality predicates:
 * - an `id` predicate is a point read (`normalizeId` + `db.get`), never a scan;
 * - otherwise the declared index (config `indexes`) or single-field index
 *   (`indexed` / reference field) covering the most predicates, in index field
 *   order, drives `withIndex`;
 * - predicates the index does not cover, soft-delete and tenant scope are
 *   applied as JS filters, mirroring the hardened read surface.
 */

import type { IR, IREntity, IRExpression } from '../../ir';
import type { ProjectionDiagnostic } from '../interface';
import {
  collectReferenceFields,
  indexEntryToDef,
  resolveConvexTableName,
  type NormalizedOptions,
} from './generator.js';

type AggregateExpr = Extract<IRExpression, { kind: 'aggregate' }>;

export interface AggregateReadContext {
  ir: IR;
  options: NormalizedOptions;
  /** Renders a predicate value in the caller's scope (null when unresolved). */
  renderValue: (value: IRExpression) => string | null;
  /** Read-side tenant/soft-delete filtering for the scanned entity. */
  readFilter: (entity: IREntity) => {
    hasTenant: boolean;
    tenantProp: string | undefined;
    hasSoftDelete: boolean;
    deletedProp: string;
  };
  /** Emits the handler's tenant binding once; returns the line or null. */
  tenantBinding: (tenantProp: string) => string | null;
  /** Local the tenant binding declares (default `__tenant`). */
  tenantVar?: string;
  /** Diagnostic label, e.g. "reaction X→Y.cmd param 'n'". */
  label: string;
}

export interface AggregateReadResult {
  lines: string[];
  /** Expression holding the count/sum after `lines` run. */
  valueVar: string | null;
  diagnostics: ProjectionDiagnostic[];
}

interface IndexCandidate {
  name: string;
  fields: string[];
}

function indexCandidates(entity: IREntity, ir: IR, options: NormalizedOptions): IndexCandidate[] {
  const refFields = collectReferenceFields(entity, ir, options);
  const singles: IndexCandidate[] = entity.properties
    .filter((p) => p.modifiers.includes('indexed') || refFields.has(p.name))
    .map((p) => ({ name: `by_${p.name}`, fields: [p.name] }));
  const declared = (options.indexes?.[entity.name] ?? []).map(indexEntryToDef);
  return [...singles, ...declared];
}

/** Number of leading index fields matched by an equality predicate. */
function coveredPrefix(index: IndexCandidate, predicateFields: Set<string>): number {
  let n = 0;
  while (n < index.fields.length && predicateFields.has(index.fields[n]!)) n++;
  return n;
}

/**
 * Picks the index covering the most leading predicate fields. With equal
 * coverage the earlier predicate's single-field index wins, which keeps the
 * pre-existing "first indexed predicate" choice for one-field reads.
 */
function chooseIndex(
  entity: IREntity,
  predicates: AggregateExpr['predicates'],
  ir: IR,
  options: NormalizedOptions,
): { index: IndexCandidate; covered: string[] } | null {
  const fields = new Set(predicates.map((p) => p.field));
  let best: { index: IndexCandidate; covered: number; order: number } | null = null;
  for (const index of indexCandidates(entity, ir, options)) {
    const covered = coveredPrefix(index, fields);
    if (covered === 0) continue;
    const order = predicates.findIndex((p) => p.field === index.fields[0]);
    if (!best || covered > best.covered || (covered === best.covered && order < best.order)) {
      best = { index, covered, order };
    }
  }
  return best ? { index: best.index, covered: best.index.fields.slice(0, best.covered) } : null;
}

export function renderEntityAggregateRead(
  e: AggregateExpr,
  varBase: string,
  ctx: AggregateReadContext,
): AggregateReadResult {
  const { ir, options, label } = ctx;
  const diagnostics: ProjectionDiagnostic[] = [];
  const entity = ir.entities.find((en) => en.name === e.entity);
  if (!entity) {
    diagnostics.push({
      severity: 'error',
      code: 'CONVEX_AGGREGATE_UNKNOWN_ENTITY',
      message: `${label} ${e.op}s unknown entity '${e.entity}'; omitted.`,
    });
    return { lines: [], valueVar: null, diagnostics };
  }
  if (e.op === 'sum' && !e.field) {
    diagnostics.push({
      severity: 'error',
      code: 'CONVEX_AGGREGATE_SUM_MISSING_FIELD',
      message: `${label} sum is missing 'of' field; omitted.`,
    });
    return { lines: [], valueVar: null, diagnostics };
  }

  const values = new Map<AggregateExpr['predicates'][number], string>();
  for (const pr of e.predicates) {
    const code = ctx.renderValue(pr.value);
    if (code === null) {
      diagnostics.push({
        severity: 'warning',
        code: 'CONVEX_UNRESOLVED_AGGREGATE_PREDICATE',
        message: `${label} ${e.op} predicate '${pr.field}' value unresolved.`,
      });
      return { lines: [], valueVar: null, diagnostics };
    }
    values.set(pr, code);
  }

  const table = resolveConvexTableName(e.entity, options);
  const rowsVar = `${varBase}_rows`;
  const lines: string[] = [];
  let remaining = e.predicates;

  const idPred = e.predicates.find((pr) => pr.field === 'id');
  if (idPred) {
    const idVar = `${varBase}_id`;
    lines.push(
      `    const ${idVar} = typeof ${values.get(idPred)} === "string" ? ctx.db.normalizeId("${table}", ${values.get(idPred)}) : null;`,
    );
    lines.push(`    const ${varBase}_row = ${idVar} ? await ctx.db.get(${idVar}) : null;`);
    lines.push(`    const ${rowsVar} = ${varBase}_row ? [${varBase}_row] : [];`);
    remaining = e.predicates.filter((pr) => pr !== idPred);
  } else {
    const chosen = chooseIndex(entity, e.predicates, ir, options);
    if (chosen) {
      const eqs = chosen.covered
        .map((field) => {
          const pr = e.predicates.find((p) => p.field === field)!;
          return `.eq("${field}", ${values.get(pr)})`;
        })
        .join('');
      lines.push(
        `    const ${rowsVar} = await ctx.db.query("${table}").withIndex("${chosen.index.name}", (q) => q${eqs}).collect();`,
      );
      const covered = new Set(chosen.covered);
      remaining = e.predicates.filter((pr) => !covered.has(pr.field));
    } else {
      lines.push(`    const ${rowsVar} = await ctx.db.query("${table}").collect();`);
      diagnostics.push({
        severity: 'info',
        code: 'CONVEX_AGGREGATE_UNINDEXED',
        message: `${label} ${e.op}s '${e.entity}' with no indexed/foreign-key predicate; rendered a table scan (mark an equality field indexed for speed).`,
      });
    }
  }

  const filters = remaining.map((pr) => `(d as any).${pr.field} === ${values.get(pr)}`);
  const rf = ctx.readFilter(entity);
  if (rf.hasSoftDelete) filters.push(`(d as any).${rf.deletedProp} == null`);
  if (rf.hasTenant && rf.tenantProp) {
    const binding = ctx.tenantBinding(rf.tenantProp);
    if (binding) lines.push(binding);
    filters.push(`(d as any).${rf.tenantProp} === ${ctx.tenantVar ?? '__tenant'}`);
  }
  const chain = filters.map((f) => `.filter((d) => ${f})`).join('');
  if (e.op === 'count') {
    lines.push(`    const ${varBase} = ${rowsVar}${chain}.length;`);
  } else {
    lines.push(`    const ${rowsVar}f = ${rowsVar}${chain};`);
    lines.push(
      `    const ${varBase} = ${rowsVar}f.reduce((acc, d) => { const n = Number((d as any).${e.field}); return acc + (Number.isFinite(n) ? n : 0); }, 0);`,
    );
  }
  return { lines, valueVar: varBase, diagnostics };
}

/** Entity-scoped aggregate nodes in `expr` that can be read before it runs. */
export function collectEntityAggregates(expr: IRExpression | undefined): AggregateExpr[] {
  const found: AggregateExpr[] = [];
  const walk = (e: IRExpression | undefined): void => {
    if (!e) return;
    switch (e.kind) {
      case 'aggregate':
        // Nested aggregates in predicate values are not hoisted: the outer
        // read then fails to resolve its predicate and stays fail-closed.
        found.push(e);
        return;
      case 'member':
        walk(e.object);
        return;
      case 'binary':
        walk(e.left);
        walk(e.right);
        return;
      case 'unary':
        walk(e.operand);
        return;
      case 'call':
        walk(e.callee);
        e.args.forEach(walk);
        return;
      case 'conditional':
        walk(e.condition);
        walk(e.consequent);
        walk(e.alternate);
        return;
      case 'array':
        e.elements.forEach(walk);
        return;
      case 'object':
        e.properties.forEach((p) => walk(p.value));
        return;
      // Lambda bodies bind per-element params a hoisted read cannot see.
      case 'lambda':
      default:
        return;
    }
  };
  walk(expr);
  return found;
}
