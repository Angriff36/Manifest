/**
 * Convex mutation emission for IR referential `onDelete` / `onUpdate` actions.
 *
 * Single-column and composite belongsTo/ref edges. setNull clears via
 * `undefined` (Convex `v.optional` rejects JSON `null`).
 */

import type { IR, IRCommand } from '../../ir';
import type { ProjectionDiagnostic } from '../interface';
import type { NormalizedOptions } from './generator.js';
import {
  collectInboundOnDeleteEdges,
  collectInboundOnUpdateEdges,
  type InboundReferentialEdge,
} from './referential-edges.js';

export type {
  InboundOnDeleteEdge,
  InboundReferentialEdge,
} from './referential-edges.js';
export {
  collectInboundOnDeleteEdges,
  collectInboundOnUpdateEdges,
} from './referential-edges.js';

export function isHardDeleteCommand(cmd: IRCommand): boolean {
  if (cmd.name !== 'delete' && cmd.name !== 'remove') return false;
  return !(cmd.actions ?? []).some((action) => action.kind === 'mutate' && !!action.target);
}

function parentMatchExpr(remote: string): string {
  return remote === 'id' ? 'parentId' : `parent[${JSON.stringify(remote)}]`;
}

function beforeMatchExpr(remote: string): string {
  return remote === 'id' ? 'parentId' : `before[${JSON.stringify(remote)}]`;
}

function updateNewExpr(remote: string): string {
  if (remote === 'id') return 'updates._id !== undefined ? updates._id : updates.id';
  return `updates[${JSON.stringify(remote)}]`;
}

function renderIndexQuery(
  edge: InboundReferentialEdge,
  matchExprs: string[],
  indent: string,
  bindName: string,
): string[] {
  const eqChain = edge.pairs
    .map((pair, index) => `.eq(${JSON.stringify(pair.local)}, ${matchExprs[index]})`)
    .join('');
  return [
    `${indent}const ${bindName} = await ctx.db`,
    `${indent}  .query(${JSON.stringify(edge.childTable)})`,
    `${indent}  .withIndex(${JSON.stringify(edge.indexName)}, (q: any) => q${eqChain})`,
  ];
}

function patchObjectLiteral(edge: InboundReferentialEdge, valueExprs: string[]): string {
  return edge.pairs
    .map((pair, index) => `${pair.local}: ${valueExprs[index]}`)
    .join(', ');
}

function renderOnDeleteParentCase(parentEntity: string, edges: InboundReferentialEdge[]): string {
  const inbound = edges.filter((edge) => edge.parentEntity === parentEntity);
  const lines: string[] = [`    case ${JSON.stringify(parentEntity)}: {`];

  for (const edge of inbound.filter((item) => item.action === 'restrict')) {
    const matches = edge.pairs.map((pair) => parentMatchExpr(pair.remote));
    lines.push(
      `      {`,
      ...renderIndexQuery(edge, matches, '        ', '__dep'),
      `          .first();`,
      `        if (__dep) {`,
      `          throw new Error(`,
      `            "REFERENTIAL_RESTRICT: cannot delete " + ${JSON.stringify(edge.parentEntity)} +`,
      `            "('" + String(parentId) + "') — " + ${JSON.stringify(`${edge.childEntity}.${edge.relationshipName}`)} +`,
      `            " declares onDelete: restrict and dependent rows exist"`,
      `          );`,
      `        }`,
      `      }`,
    );
  }

  for (const edge of inbound.filter((item) => item.action === 'cascade')) {
    const matches = edge.pairs.map((pair) => parentMatchExpr(pair.remote));
    lines.push(
      `      {`,
      ...renderIndexQuery(edge, matches, '        ', '__kids'),
      `          .collect();`,
      `        for (const __kid of __kids) {`,
      `          await __applyReferentialOnDelete(ctx, ${JSON.stringify(edge.childEntity)}, __kid._id, visiting);`,
      `          await ctx.db.delete(__kid._id);`,
      `        }`,
      `      }`,
    );
  }

  for (const edge of inbound.filter(
    (item) => item.action === 'setNull' || item.action === 'setDefault',
  )) {
    const matches = edge.pairs.map((pair) => parentMatchExpr(pair.remote));
    const values = edge.patchValues ?? edge.pairs.map(() => 'undefined');
    lines.push(
      `      {`,
      ...renderIndexQuery(edge, matches, '        ', '__kids'),
      `          .collect();`,
      `        for (const __kid of __kids) {`,
      `          await ctx.db.patch(__kid._id, { ${patchObjectLiteral(edge, values)} } as any);`,
      `        }`,
      `      }`,
    );
  }

  lines.push(`      break;`, `    }`);
  return lines.join('\n');
}

function renderOnUpdateParentCase(parentEntity: string, edges: InboundReferentialEdge[]): string {
  const inbound = edges.filter((edge) => edge.parentEntity === parentEntity);
  const lines: string[] = [`    case ${JSON.stringify(parentEntity)}: {`];

  for (const edge of inbound) {
    const oldExprs = edge.pairs.map((pair) => beforeMatchExpr(pair.remote));
    const newExprs = edge.pairs.map((pair) => updateNewExpr(pair.remote));
    const changedCheck = edge.pairs
      .map((_, index) => `__new${index} !== undefined && __new${index} !== __old${index}`)
      .join(' || ');

    lines.push(`      {`);
    for (let index = 0; index < edge.pairs.length; index += 1) {
      lines.push(
        `        const __old${index} = ${oldExprs[index]};`,
        `        const __new${index} = ${newExprs[index]};`,
      );
    }
    lines.push(`        if (${changedCheck}) {`);

    const oldBinds = edge.pairs.map((_, index) => `__old${index}`);
    if (edge.action === 'restrict') {
      lines.push(
        ...renderIndexQuery(edge, oldBinds, '          ', '__dep'),
        `            .first();`,
        `          if (__dep) {`,
        `            throw new Error(`,
        `              "REFERENTIAL_RESTRICT: cannot update " + ${JSON.stringify(edge.parentEntity)} +`,
        `              "('" + String(parentId) + "') — " + ${JSON.stringify(`${edge.childEntity}.${edge.relationshipName}`)} +`,
        `              " declares onUpdate: restrict and dependent rows exist"`,
        `            );`,
        `          }`,
      );
    } else if (edge.action === 'cascade') {
      const cascadeValues = edge.pairs.map((_, index) => `__new${index}`);
      lines.push(
        ...renderIndexQuery(edge, oldBinds, '          ', '__kids'),
        `            .collect();`,
        `          for (const __kid of __kids) {`,
        `            await ctx.db.patch(__kid._id, { ${patchObjectLiteral(edge, cascadeValues)} } as any);`,
        `          }`,
      );
    } else {
      const values = edge.patchValues ?? edge.pairs.map(() => 'undefined');
      lines.push(
        ...renderIndexQuery(edge, oldBinds, '          ', '__kids'),
        `            .collect();`,
        `          for (const __kid of __kids) {`,
        `            await ctx.db.patch(__kid._id, { ${patchObjectLiteral(edge, values)} } as any);`,
        `          }`,
      );
    }
    lines.push(`        }`, `      }`);
  }

  lines.push(`      break;`, `    }`);
  return lines.join('\n');
}

function renderSwitchHelper(
  name: string,
  args: string[],
  bodyPreamble: string[],
  cases: string,
): string {
  return [
    `async function ${name}(`,
    ...args.map((arg, index) => `  ${arg}${index < args.length - 1 ? ',' : ''}`),
    `): Promise<void> {`,
    ...bodyPreamble,
    `  switch (entityName) {`,
    cases,
    `    default:`,
    `      break;`,
    `  }`,
    `}`,
  ].join('\n');
}

export function renderReferentialOnDeleteHelper(
  ir: IR,
  options: NormalizedOptions,
): { code: string | null; diagnostics: ProjectionDiagnostic[]; parentEntities: Set<string> } {
  const { edges, diagnostics } = collectInboundOnDeleteEdges(ir, options);
  const parentEntities = new Set(edges.map((edge) => edge.parentEntity));
  if (parentEntities.size === 0) {
    return { code: null, diagnostics, parentEntities };
  }

  const cases = [...parentEntities]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => renderOnDeleteParentCase(name, edges))
    .join('\n');

  const code = renderSwitchHelper(
    '__applyReferentialOnDelete',
    [
      'ctx: MutationCtx',
      'entityName: string',
      'parentId: any',
      'visiting: Set<string> = new Set()',
    ],
    [
      `  const visitKey = entityName + ":" + String(parentId);`,
      `  if (visiting.has(visitKey)) return;`,
      `  visiting.add(visitKey);`,
      `  const parent = await ctx.db.get(parentId) as Record<string, any> | null;`,
      `  if (!parent) return;`,
    ],
    cases,
  );

  return { code, diagnostics, parentEntities };
}

export function renderReferentialOnUpdateHelper(
  ir: IR,
  options: NormalizedOptions,
): { code: string | null; diagnostics: ProjectionDiagnostic[]; parentEntities: Set<string> } {
  const { edges, diagnostics } = collectInboundOnUpdateEdges(ir, options);
  const parentEntities = new Set(edges.map((edge) => edge.parentEntity));
  if (parentEntities.size === 0) {
    return { code: null, diagnostics, parentEntities };
  }

  const cases = [...parentEntities]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => renderOnUpdateParentCase(name, edges))
    .join('\n');

  const code = renderSwitchHelper(
    '__applyReferentialOnUpdate',
    [
      'ctx: MutationCtx',
      'entityName: string',
      'parentId: any',
      'before: Record<string, any>',
      'updates: Record<string, any>',
    ],
    [],
    cases,
  );

  return { code, diagnostics, parentEntities };
}

export function renderReferentialOnDeleteCall(entityName: string): string {
  return `    await __applyReferentialOnDelete(ctx, ${JSON.stringify(entityName)}, docId);\n`;
}

export function renderReferentialOnUpdateCall(entityName: string): string {
  return `    await __applyReferentialOnUpdate(ctx, ${JSON.stringify(entityName)}, docId, doc, updates);\n`;
}
