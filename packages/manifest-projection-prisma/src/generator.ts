/**
 * Prisma schema projection.
 *
 * Consumes Manifest IR + projection config and emits a Prisma schema string
 * as a single `ProjectionArtifact`.
 *
 * Boundary rules (Checkpoint 1, normative):
 *   - Relational interpretation starts HERE. No relational concept (table
 *     name, column name, precision, indexes) lives in Manifest core grammar
 *     or IR — all of it arrives via projection options.
 *   - The projection carries NO knowledge of any specific application,
 *     database instance, tenant layout, table naming scheme, or domain
 *     meaning of any field. Anything resembling an app-specific string in
 *     this file is a bug.
 *   - `computed` properties are derived and MUST NEVER become columns. We
 *     do this structurally by iterating `entity.properties` only and never
 *     touching `entity.computedProperties`.
 *   - `external: true` entities are skipped. Stores with target `'memory'`
 *     or `'localStorage'` are skipped. Targets `'durable'`, `'postgres'`,
 *     and `'supabase'` are emission targets. Entities with no store entry
 *     are skipped (no implicit ownership).
 *   - Unknown `type.name` produces a hard error diagnostic. No fallback.
 */

import type { IR, IREntity, IRProperty, IRRelationship, IRStore, IRValue } from '@angriff36/manifest/ir';
import type {
  ProjectionArtifact,
  ProjectionDiagnostic,
  ProjectionRequest,
  ProjectionResult,
  ProjectionTarget,
} from '@angriff36/manifest/projections/nextjs';

import { normalizeOptions, type PrismaProjectionOptions, type IndexEntry } from './options.js';
import {
  resolvePrismaScalar,
  isDecimalScalar,
  DEFAULT_DECIMAL_PRECISION,
  DEFAULT_DECIMAL_SCALE,
} from './type-mapping.js';

// ============================================================================
// Surface identifiers
// ============================================================================

const SURFACE_SCHEMA = 'prisma.schema' as const;

const SURFACES = [SURFACE_SCHEMA] as const;

// ============================================================================
// Store target classification
// ============================================================================

/**
 * Store targets the Prisma projection considers persistent and therefore
 * eligible for model emission. `'durable'` is the backend-neutral signal
 * introduced in Phase 2; `'postgres'` / `'supabase'` are the legacy
 * backend-specific names that the runtime engine still knows about.
 */
const PERSISTENT_TARGETS: ReadonlySet<IRStore['target']> = new Set([
  'durable',
  'postgres',
  'supabase',
]);

function isPersistent(target: IRStore['target']): boolean {
  return PERSISTENT_TARGETS.has(target);
}

// ============================================================================
// Helpers
// ============================================================================

function literalToPrismaDefault(value: IRValue): string | undefined {
  switch (value.kind) {
    case 'string':
      return `"${value.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    case 'number':
      return String(value.value);
    case 'boolean':
      return value.value ? 'true' : 'false';
    case 'null':
      // Prisma's `@default(null)` is not a thing; nullable columns omit @default.
      return undefined;
    case 'array':
    case 'object':
      // Non-scalar defaults are not portable to Prisma; consumers can supply
      // their own via columnMappings + hand-edited schema. Silently skip.
      return undefined;
  }
}

function buildIndexLine(entry: IndexEntry): string {
  if (Array.isArray(entry)) {
    return `  @@index([${entry.join(', ')}])`;
  }
  const fields = `[${entry.fields.join(', ')}]`;
  return entry.name
    ? `  @@index(${fields}, name: "${entry.name}")`
    : `  @@index(${fields})`;
}

// ============================================================================
// Per-property line emission
// ============================================================================

interface PropertyEmission {
  line: string | null;
  diagnostics: ProjectionDiagnostic[];
}

/**
 * Emit a single Prisma model field line for an IR property, or null if the
 * property is unmappable (with a diagnostic explaining why).
 */
function emitPropertyLine(
  entity: IREntity,
  prop: IRProperty,
  options: PrismaProjectionOptions,
): PropertyEmission {
  const diagnostics: ProjectionDiagnostic[] = [];

  // Resolve the Prisma scalar type via overrides → defaults.
  const typeOverrides = options.typeMappings?.[entity.name];
  const hasOverride = typeOverrides !== undefined
    && Object.prototype.hasOwnProperty.call(typeOverrides, prop.name);
  const scalar = resolvePrismaScalar(prop.type.name, typeOverrides, prop.name);

  if (!scalar) {
    // Special-case the bare `number` ambiguity. `number` is intentionally
    // absent from DEFAULT_TYPE_MAPPING because Manifest does not distinguish
    // integers from real numbers from money. Silently mapping it to Float
    // is the silent-rounding bug class this project exists to prevent.
    // Emit a targeted diagnostic that tells the author exactly how to pick
    // a precise type — DO NOT fall through to PRISMA_UNKNOWN_TYPE here, the
    // resolution path is different (the type *name* is known; what's
    // missing is precision intent).
    if (prop.type.name === 'number' && !hasOverride) {
      diagnostics.push({
        severity: 'error',
        code: 'PRISMA_AMBIGUOUS_NUMBER',
        entity: entity.name,
        message:
          `Property '${entity.name}.${prop.name}' is typed 'number', which is ambiguous (Manifest does not ` +
          `distinguish integers from real numbers from money). Pick a precise type in the .manifest source: ` +
          `'int' or 'bigint' for counts and ids, 'float' for measurements where rounding is acceptable, ` +
          `'money' or 'decimal' for currency and other exact-decimal values. ` +
          `Or supply a 'typeMappings.${entity.name}.${prop.name}' override.`,
      });
      return { line: null, diagnostics };
    }

    diagnostics.push({
      severity: 'error',
      code: 'PRISMA_UNKNOWN_TYPE',
      entity: entity.name,
      message:
        `Property '${entity.name}.${prop.name}' has IR type '${prop.type.name}' which is not in the default type mapping ` +
        `and no override was supplied in 'typeMappings.${entity.name}.${prop.name}'. ` +
        `Add an entry to typeMappings, or change the property type in the .manifest source.`,
    });
    return { line: null, diagnostics };
  }

  // Required / optional. `id`-named properties are always required + @id.
  const isId = prop.name === 'id';
  const isRequired = isId || prop.modifiers.includes('required');
  const nullableSuffix = isRequired ? '' : '?';

  // Attribute list, ordered: @id, @unique, @default, @map, @db.Decimal
  const attrs: string[] = [];
  if (isId) attrs.push('@id');
  if (prop.modifiers.includes('unique') && !isId) attrs.push('@unique');

  if (prop.defaultValue) {
    const def = literalToPrismaDefault(prop.defaultValue);
    if (def !== undefined) attrs.push(`@default(${def})`);
  }

  const colMap = options.columnMappings?.[entity.name]?.[prop.name];
  if (colMap) attrs.push(`@map("${colMap}")`);

  // Decimal-family handling. Any property whose RESOLVED scalar is `Decimal`
  // gets a `@db.Decimal(p, s)` attribute. If the consumer supplied a precision
  // override, use it; otherwise fall back to the package-default precision/scale.
  //
  // This rule is intentionally keyed on the resolved scalar, not on the IR
  // type.name — that way both `property x: money` AND a `typeMappings`-routed
  // override that lands on `Decimal` pick up the same default precision.
  // No silent rounding: precision is always present when the scalar is Decimal.
  const prec = options.precision?.[entity.name]?.[prop.name];
  if (prec) {
    attrs.push(`@db.Decimal(${prec.precision}, ${prec.scale})`);
  } else if (isDecimalScalar(scalar)) {
    attrs.push(`@db.Decimal(${DEFAULT_DECIMAL_PRECISION}, ${DEFAULT_DECIMAL_SCALE})`);
  }

  const attrPart = attrs.length ? ' ' + attrs.join(' ') : '';
  return {
    line: `  ${prop.name} ${scalar}${nullableSuffix}${attrPart}`,
    diagnostics,
  };
}

// ============================================================================
// Relationship emission
// ============================================================================

/**
 * Look up the IR `type.name` of a target entity's `id` property and resolve
 * it to a Prisma scalar via the same mapping path as regular properties.
 * Used to type FK columns so they match the parent PK.
 *
 * Falls back to `'String'` when:
 *   - the target entity isn't in this IR (cross-IR reference; consumer will
 *     hand-wire), or
 *   - the target has no property named `id` (a `PRISMA_NO_ID_PROPERTY` info
 *     diagnostic will already have fired against the target's model).
 */
function targetIdPrismaType(
  targetEntityName: string,
  ir: IR,
  options: PrismaProjectionOptions,
): string {
  const target = ir.entities.find((e) => e.name === targetEntityName);
  if (!target) return 'String';
  const idProp = target.properties.find((p) => p.name === 'id');
  if (!idProp) return 'String';
  const overrides = options.typeMappings?.[targetEntityName];
  return resolvePrismaScalar(idProp.type.name, overrides, 'id') ?? 'String';
}

/**
 * Find every relationship declared on `targetEntity` whose target is
 * `fromEntityName`. These are the "opposite-side" relationships used to:
 *   - decide whether a `belongsTo`/`ref` is 1:1 (target has `hasOne` back)
 *     vs 1:N (target has `hasMany` back), which controls `@unique` on the FK.
 *   - diagnose multi-relation ambiguity (Prisma requires named @relation
 *     when more than one relation exists between the same pair).
 *   - diagnose missing back-relations (Prisma rejects one-sided relations).
 */
function findOppositeRelations(
  fromEntityName: string,
  rel: IRRelationship,
  ir: IR,
): IRRelationship[] {
  const target = ir.entities.find((e) => e.name === rel.target);
  if (!target) return [];
  return target.relationships.filter((r) => r.target === fromEntityName);
}

interface RelationEmission {
  lines: string[];
  diagnostics: ProjectionDiagnostic[];
}

/**
 * Emit Prisma field lines for one IR relationship.
 *
 * Handled cases:
 *   - `hasMany name: T` → `name T[]`
 *   - `hasOne name: T` → `name T?`
 *   - `belongsTo name: T` → `{fk} {fkType}[ @unique]` + `name T @relation(fields: [{fk}], references: [id])`
 *   - `ref name: T` → same shape as `belongsTo`; "ref" signals "loose" back-relation
 *     not required.
 *
 * Diagnostic-only (no field lines emitted because Prisma would reject them):
 *   - `through ...` (explicit many-to-many): emit `PRISMA_RELATION_VIA_THROUGH_UNIMPLEMENTED`
 *     info. The consumer wires the join entity's belongsTo relations themselves.
 *   - Multiple relationships between the same pair: emit
 *     `PRISMA_RELATION_AMBIGUOUS` info. Prisma needs named `@relation("name")`
 *     to disambiguate; Phase-3 emission doesn't generate names.
 *
 * Warning-only (field IS emitted, but Prisma may reject):
 *   - `hasMany` / `hasOne` / `belongsTo` with no opposite side declared:
 *     emit `PRISMA_RELATION_MISSING_BACKSIDE` warning explaining what
 *     declaration to add on the other entity. `ref` does NOT warn — that
 *     relation kind is explicitly "loose" by author intent.
 */
function emitRelationship(
  entity: IREntity,
  rel: IRRelationship,
  ir: IR,
  options: PrismaProjectionOptions,
): RelationEmission {
  const diagnostics: ProjectionDiagnostic[] = [];
  const lines: string[] = [];

  // (1) `through` → join-entity-mediated many-to-many. Not Prisma-emittable
  //     on this side; consumer must declare the join entity separately.
  if (rel.through) {
    diagnostics.push({
      severity: 'info',
      code: 'PRISMA_RELATION_VIA_THROUGH_UNIMPLEMENTED',
      entity: entity.name,
      message:
        `Relationship '${entity.name}.${rel.name}' uses 'through ${rel.through}' (many-to-many via join entity). ` +
        `The projection does not emit this as a Prisma field — declare the join entity ('${rel.through}') ` +
        `as its own entity with two belongsTo relations to wire the Prisma schema.`,
    });
    lines.push(
      `  // ${rel.kind} ${rel.name}: ${rel.target} through ${rel.through} — see PRISMA_RELATION_VIA_THROUGH_UNIMPLEMENTED`,
    );
    return { lines, diagnostics };
  }

  // (2) Ambiguity: multiple rels from this entity to the same target, OR
  //     multiple opposite rels pointing back at us. Prisma needs named
  //     @relation("name") to disambiguate; this emission doesn't generate
  //     names. Detection happens once per relationship — both sides will
  //     trip the diagnostic which is fine (each side needs the fix).
  const sameTargetCount = entity.relationships.filter((r) => r.target === rel.target).length;
  const opposites = findOppositeRelations(entity.name, rel, ir);
  if (sameTargetCount > 1 || opposites.length > 1) {
    diagnostics.push({
      severity: 'info',
      code: 'PRISMA_RELATION_AMBIGUOUS',
      entity: entity.name,
      message:
        `Relationship '${entity.name}.${rel.name}' → ${rel.target} is one of multiple relations between these entities. ` +
        `Prisma requires named relations (e.g. \`@relation("authoredBooks")\`) to disambiguate; the projection does not ` +
        `emit names automatically. Add the @relation name by hand, or refactor to a single relation.`,
    });
    lines.push(
      `  // ${rel.kind} ${rel.name}: ${rel.target} — see PRISMA_RELATION_AMBIGUOUS`,
    );
    return { lines, diagnostics };
  }

  switch (rel.kind) {
    case 'hasMany': {
      lines.push(`  ${rel.name} ${rel.target}[]`);
      if (opposites.length === 0) {
        diagnostics.push({
          severity: 'warning',
          code: 'PRISMA_RELATION_MISSING_BACKSIDE',
          entity: entity.name,
          message:
            `Relationship '${entity.name}.${rel.name}: ${rel.target}[]' has no back-relation declared on ${rel.target}. ` +
            `Prisma rejects one-sided relations — add a 'belongsTo' (or 'ref') from ${rel.target} back to ${entity.name}.`,
        });
      }
      return { lines, diagnostics };
    }

    case 'hasOne': {
      lines.push(`  ${rel.name} ${rel.target}?`);
      if (opposites.length === 0) {
        diagnostics.push({
          severity: 'warning',
          code: 'PRISMA_RELATION_MISSING_BACKSIDE',
          entity: entity.name,
          message:
            `Relationship '${entity.name}.${rel.name}: ${rel.target}?' has no back-relation declared on ${rel.target}. ` +
            `Prisma rejects one-sided relations — add a 'belongsTo' (or 'ref') from ${rel.target} back to ${entity.name}, ` +
            `and the FK will be marked @unique automatically.`,
        });
      }
      return { lines, diagnostics };
    }

    case 'belongsTo':
    case 'ref': {
      // FK field name: config override > IR foreignKey > default `${name}Id`.
      const fkName =
        options.foreignKeys?.[entity.name]?.[rel.name]
        ?? rel.foreignKey
        ?? `${rel.name}Id`;
      const fkType = targetIdPrismaType(rel.target, ir, options);

      // 1:1 if the target has a `hasOne` pointing back at us (Prisma requires
      // @unique on the FK side). Plain `hasMany` opposite → 1:N → no @unique.
      const isOneToOne = opposites.some((o) => o.kind === 'hasOne');
      const uniqueAttr = isOneToOne ? ' @unique' : '';

      // FK scalar column line — supports the same `columnMappings` knob as
      // any other property. The FK field name is a "virtual property" from
      // the consumer's perspective and can be re-mapped to a snake_case
      // database column via the existing config.
      const colMap = options.columnMappings?.[entity.name]?.[fkName];
      const colMapAttr = colMap ? ` @map("${colMap}")` : '';
      lines.push(`  ${fkName} ${fkType}${uniqueAttr}${colMapAttr}`);

      // Relation field line.
      lines.push(`  ${rel.name} ${rel.target} @relation(fields: [${fkName}], references: [id])`);

      // belongsTo without a declared back-relation: Prisma rejects this.
      // `ref` is "loose by design" — no warning, the author is explicitly
      // signalling that no back-relation is expected on the target.
      if (rel.kind === 'belongsTo' && opposites.length === 0) {
        diagnostics.push({
          severity: 'warning',
          code: 'PRISMA_RELATION_MISSING_BACKSIDE',
          entity: entity.name,
          message:
            `Relationship '${entity.name}.${rel.name}: ${rel.target}' (belongsTo) has no back-relation declared on ${rel.target}. ` +
            `Prisma rejects one-sided relations — add 'hasMany' or 'hasOne' on ${rel.target} pointing back to ${entity.name}.`,
        });
      }

      return { lines, diagnostics };
    }
  }
}

// ============================================================================
// Per-entity model emission
// ============================================================================

interface ModelEmission {
  lines: string[];
  diagnostics: ProjectionDiagnostic[];
}

function emitModel(
  entity: IREntity,
  ir: IR,
  options: PrismaProjectionOptions,
): ModelEmission {
  const diagnostics: ProjectionDiagnostic[] = [];
  const lines: string[] = [];

  lines.push(`model ${entity.name} {`);

  let sawIdProperty = false;
  // STRUCTURAL invariant: iterate `properties` only. `computedProperties`
  // is a separate list and MUST never become columns. We do not even
  // reference it.
  for (const prop of entity.properties) {
    if (prop.name === 'id') sawIdProperty = true;
    const { line, diagnostics: propDiags } = emitPropertyLine(entity, prop, options);
    diagnostics.push(...propDiags);
    if (line !== null) lines.push(line);
  }

  if (!sawIdProperty) {
    diagnostics.push({
      severity: 'info',
      code: 'PRISMA_NO_ID_PROPERTY',
      entity: entity.name,
      message:
        `Entity '${entity.name}' has no property named 'id'. The emitted Prisma model has no @id field; ` +
        `Prisma's schema validator will reject it. Either add 'property required id: string' to the entity, ` +
        `or hand-edit the emitted model.`,
    });
  }

  // Relationships — emit real Prisma fields (Step 3).
  //
  // Each IR relationship turns into one or more Prisma model lines via
  // `emitRelationship`. The helper consults the target entity's own
  // relationships to decide 1:1 vs 1:N (controls @unique on the FK),
  // detects ambiguity (multiple rels between the same pair), detects
  // missing back-relations, and handles `through` (join-entity M2M) by
  // emitting a structured diagnostic rather than an unwirable field.
  //
  // A blank line separator visually groups relation fields below regular
  // properties — common Prisma style and easier to skim.
  if (entity.relationships.length > 0) {
    lines.push('');
    for (const rel of entity.relationships) {
      const { lines: relLines, diagnostics: relDiags } = emitRelationship(entity, rel, ir, options);
      lines.push(...relLines);
      diagnostics.push(...relDiags);
    }
  }

  // @@map (table name override)
  const tableMap = options.tableMappings?.[entity.name];
  if (tableMap) {
    lines.push('');
    lines.push(`  @@map("${tableMap}")`);
  }

  // @@index lines
  const idx = options.indexes?.[entity.name];
  if (idx && idx.length > 0) {
    if (!tableMap) lines.push('');
    for (const entry of idx) lines.push(buildIndexLine(entry));
  }

  lines.push('}');
  return { lines, diagnostics };
}

// ============================================================================
// Schema-level emission (datasource + generator + models)
// ============================================================================

function emitDatasourceBlock(provider: PrismaProjectionOptions['provider']): string[] {
  if (!provider) return [];
  return [
    'datasource db {',
    `  provider = "${provider}"`,
    '  url      = env("DATABASE_URL")',
    '}',
    '',
    'generator client {',
    '  provider = "prisma-client-js"',
    '}',
    '',
  ];
}

// ============================================================================
// Projection target
// ============================================================================

export class PrismaProjection implements ProjectionTarget {
  readonly name = 'prisma';
  readonly description =
    'Manifest IR → Prisma schema projection. Compile-time only. App-agnostic.';
  readonly surfaces = SURFACES;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    if (request.surface !== SURFACE_SCHEMA) {
      return {
        artifacts: [],
        diagnostics: [
          {
            severity: 'error',
            code: 'UNKNOWN_SURFACE',
            message: `Unknown surface '${request.surface}'. Available: ${SURFACES.join(', ')}.`,
          },
        ],
      };
    }

    const options = normalizeOptions(request.options);
    const diagnostics: ProjectionDiagnostic[] = [];

    // Build a fast lookup from entity name → store target (or undefined if
    // no store is declared for that entity). Order of `ir.stores` is the
    // order in IR; for duplicates the last entry wins, which mirrors how
    // the runtime engine resolves stores today.
    const storeByEntity = new Map<string, IRStore['target']>();
    for (const s of ir.stores) storeByEntity.set(s.entity, s.target);

    const modelBlocks: string[] = [];

    // Iterate `ir.entities` in source order (Checkpoint 1: no re-sorting).
    for (const entity of ir.entities) {
      // 1. Skip explicitly external entities.
      if (entity.external === true) {
        diagnostics.push({
          severity: 'info',
          code: 'PRISMA_SKIPPED_EXTERNAL',
          entity: entity.name,
          message: `Entity '${entity.name}' is marked external; skipped (no Prisma model emitted).`,
        });
        continue;
      }

      // 2. Resolve the store target and skip non-persistent / undeclared.
      const target = storeByEntity.get(entity.name);
      if (target === undefined) {
        diagnostics.push({
          severity: 'info',
          code: 'PRISMA_SKIPPED_NO_STORE',
          entity: entity.name,
          message: `Entity '${entity.name}' has no 'store' declaration; skipped. Add 'store ${entity.name} in durable' to emit a Prisma model.`,
        });
        continue;
      }
      if (!isPersistent(target)) {
        diagnostics.push({
          severity: 'info',
          code: 'PRISMA_SKIPPED_NON_DURABLE',
          entity: entity.name,
          message: `Entity '${entity.name}' has store target '${target}'; skipped. Flip to 'durable' to emit a Prisma model.`,
        });
        continue;
      }

      const { lines, diagnostics: modelDiags } = emitModel(entity, ir, options);
      diagnostics.push(...modelDiags);
      modelBlocks.push(lines.join('\n'));
    }

    const header = [
      '// Auto-generated by @manifest/projection-prisma',
      '// DO NOT EDIT — regenerate with the projection.',
      '',
      ...emitDatasourceBlock(options.provider),
    ];

    // Header always ends with `\n` (the trailing '' in the array). Add one
    // more `\n` before the first model to produce a visible blank line
    // between header/datasource and the first `model` block.
    const headerStr = header.join('\n');
    const code = (modelBlocks.length > 0)
      ? headerStr + '\n' + modelBlocks.join('\n\n') + '\n'
      : headerStr + '// No persistent entities found in IR.\n';

    const artifact: ProjectionArtifact = {
      id: 'prisma.schema',
      pathHint: options.output,
      contentType: 'prisma',
      code,
    };

    return { artifacts: [artifact], diagnostics };
  }
}
