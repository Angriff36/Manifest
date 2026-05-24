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

import type { IR, IREntity, IRProperty, IRRelationship, IRStore, IRValue } from '../../ir';
import type {
  ProjectionArtifact,
  ProjectionDiagnostic,
  ProjectionRequest,
  ProjectionResult,
  ProjectionTarget,
} from '../interface';

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

/**
 * Convert a Manifest RefAction value (camelCase) to a Prisma referential action
 * (PascalCase). e.g. `cascade` → `Cascade`, `setNull` → `SetNull`.
 */
function toPrismaAction(action: string): string {
  return action.charAt(0).toUpperCase() + action.slice(1);
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

  // Attribute list, ordered: @id, @unique, @default, @map, @db.Decimal, @db.ObjectId
  const attrs: string[] = [];
  if (isId) attrs.push('@id');
  if (prop.modifiers.includes('unique') && !isId) attrs.push('@unique');

  const isMongo = options.provider === 'mongodb';
  const colMapOverride = options.columnMappings?.[entity.name]?.[prop.name];
  if (isId && isMongo && !colMapOverride && !prop.defaultValue) {
    attrs.push('@default(auto())');
  }

  if (prop.defaultValue) {
    const def = literalToPrismaDefault(prop.defaultValue);
    if (def !== undefined) attrs.push(`@default(${def})`);
  }

  if (colMapOverride) {
    attrs.push(`@map("${colMapOverride}")`);
  } else if (isId && isMongo) {
    attrs.push('@map("_id")');
  }

  const prec = options.precision?.[entity.name]?.[prop.name];
  if (prec) {
    attrs.push(`@db.Decimal(${prec.precision}, ${prec.scale})`);
  } else if (isDecimalScalar(scalar)) {
    attrs.push(`@db.Decimal(${DEFAULT_DECIMAL_PRECISION}, ${DEFAULT_DECIMAL_SCALE})`);
  }

  if (isId && isMongo && scalar === 'String') {
    const idTypeOverride = options.typeMappings?.[entity.name]?.id;
    if (!idTypeOverride || idTypeOverride === 'String') {
      attrs.push('@db.ObjectId');
    }
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
 * Look up the Prisma scalar type for a named property on the target entity.
 * Used to type FK columns so they match the referenced parent column.
 * Falls back to `'String'` when the target or property is not found.
 */
function targetPropPrismaType(
  targetEntityName: string,
  targetPropName: string,
  ir: IR,
  options: PrismaProjectionOptions,
): string {
  const target = ir.entities.find((e) => e.name === targetEntityName);
  if (!target) return 'String';
  const prop = target.properties.find((p) => p.name === targetPropName);
  if (!prop) return 'String';
  const overrides = options.typeMappings?.[targetEntityName];
  return resolvePrismaScalar(prop.type.name, overrides, targetPropName) ?? 'String';
}

/**
 * Find every relationship declared on `targetEntity` whose target is
 * `fromEntityName`. These are the "opposite-side" relationships used to
 * decide cardinality (1:1 vs 1:N) and detect ambiguity or missing back-rels.
 *
 * SELF-RELATION HANDLING: when `rel.target === fromEntityName`, we filter
 * the relationship out of its own opposite set by name to avoid false-positive
 * ambiguity and suppress the missing-backside warning.
 */
function findOppositeRelations(
  fromEntityName: string,
  rel: IRRelationship,
  ir: IR,
): IRRelationship[] {
  const target = ir.entities.find((e) => e.name === rel.target);
  if (!target) return [];
  return target.relationships.filter((r) => {
    if (r.target !== fromEntityName) return false;
    if (target.name === fromEntityName && r.name === rel.name) return false;
    return true;
  });
}

interface RelationEmission {
  lines: string[];
  diagnostics: ProjectionDiagnostic[];
}

/**
 * Per-projection-run context computed before any model is emitted. Holds the
 * set of entity names that WILL be emitted as Prisma models.
 */
interface RelationContext {
  emittedEntities: ReadonlySet<string>;
}

/**
 * Emit Prisma field lines for one IR relationship.
 *
 * Composite-PK/FK additions (v1.0):
 *   - `foreignKey.fields` is an array of local column names (1 = single, N = composite).
 *   - `foreignKey.references` is an array of remote column names (absent → default ["id"]).
 *   - For composite FK: emit one column line per local field; emit `@@unique([...])` for 1:1.
 *   - `onDelete`/`onUpdate`: emit as Prisma referential action attributes when present.
 */
function emitRelationship(
  entity: IREntity,
  rel: IRRelationship,
  ir: IR,
  options: PrismaProjectionOptions,
  context: RelationContext,
): RelationEmission {
  const diagnostics: ProjectionDiagnostic[] = [];
  const lines: string[] = [];

  // (0) Dangling target guard.
  if (!context.emittedEntities.has(rel.target)) {
    diagnostics.push({
      severity: 'warning',
      code: 'PRISMA_RELATION_TARGET_NOT_EMITTED',
      entity: entity.name,
      message:
        `Relationship '${entity.name}.${rel.name}' (${rel.kind} → ${rel.target}) targets an entity that is not emitted as a Prisma model. ` +
        `${rel.target} may be 'external entity', have a non-persistent store (memory/localStorage), or have no store declaration. ` +
        `The relation field has been skipped to avoid a dangling reference; declare ${rel.target} as a durable entity, or remove the relationship.`,
    });
    lines.push(
      `  // ${rel.kind} ${rel.name}: ${rel.target} — see PRISMA_RELATION_TARGET_NOT_EMITTED`,
    );
    return { lines, diagnostics };
  }

  // (1) `through` → join-entity-mediated many-to-many.
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

  // (2) Ambiguity check.
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
      // Config override is single-column and always wins over IR FK fields.
      const configFkOverride = options.foreignKeys?.[entity.name]?.[rel.name];
      const fkFields: string[] = configFkOverride
        ? [configFkOverride]
        : (rel.foreignKey?.fields ?? [`${rel.name}Id`]);
      const refsFields: string[] = rel.foreignKey?.references ?? ['id'];
      const isComposite = fkFields.length > 1;

      // 1:1 if target has a `hasOne` pointing back at us.
      const isOneToOne = opposites.some((o) => o.kind === 'hasOne');

      // Emit FK column(s). Each local FK field gets a column line unless
      // the entity already declares a property with that name.
      for (let i = 0; i < fkFields.length; i++) {
        const fkField = fkFields[i];
        const refField = refsFields[i] ?? 'id';
        const fkAlreadyDeclared = entity.properties.some((p) => p.name === fkField);
        if (!fkAlreadyDeclared) {
          const fkType = targetPropPrismaType(rel.target, refField, ir, options);
          // For single-column 1:1 → @unique on the column. For composite, @@unique at model level.
          const uniqueAttr = (!isComposite && isOneToOne) ? ' @unique' : '';
          const colMap = options.columnMappings?.[entity.name]?.[fkField];
          const colMapAttr = colMap ? ` @map("${colMap}")` : '';
          lines.push(`  ${fkField} ${fkType}${uniqueAttr}${colMapAttr}`);
        }
      }

      // For composite 1:1, emit @@unique at model level.
      if (isComposite && isOneToOne) {
        lines.push(`  @@unique([${fkFields.join(', ')}])`);
      }

      // Relation field line with correct fields/references and optional referential actions.
      const fieldsAttr = `fields: [${fkFields.join(', ')}]`;
      const refsAttr = `references: [${refsFields.join(', ')}]`;
      const onDeleteAttr = rel.onDelete ? `, onDelete: ${toPrismaAction(rel.onDelete)}` : '';
      const onUpdateAttr = rel.onUpdate ? `, onUpdate: ${toPrismaAction(rel.onUpdate)}` : '';
      lines.push(
        `  ${rel.name} ${rel.target} @relation(${fieldsAttr}, ${refsAttr}${onDeleteAttr}${onUpdateAttr})`,
      );

      if (opposites.length === 0) {
        diagnostics.push({
          severity: 'warning',
          code: 'PRISMA_RELATION_MISSING_BACKSIDE',
          entity: entity.name,
          message:
            `Relationship '${entity.name}.${rel.name}: ${rel.target}' (${rel.kind}) has no back-relation declared on ${rel.target}. ` +
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
  context: RelationContext,
): ModelEmission {
  const diagnostics: ProjectionDiagnostic[] = [];
  const lines: string[] = [];

  lines.push(`model ${entity.name} {`);

  let sawIdProperty = false;
  // STRUCTURAL invariant: iterate `properties` only. `computedProperties`
  // is a separate list and MUST never become columns.
  for (const prop of entity.properties) {
    if (prop.name === 'id') sawIdProperty = true;
    const { line, diagnostics: propDiags } = emitPropertyLine(entity, prop, options);
    diagnostics.push(...propDiags);
    if (line !== null) lines.push(line);
  }

  // Composite PK suppresses the PRISMA_NO_ID_PROPERTY diagnostic since
  // the entity's identity is established via @@id([...]) below.
  const hasCompositeKey = entity.key && entity.key.length > 0;
  if (!sawIdProperty && !hasCompositeKey) {
    diagnostics.push({
      severity: 'info',
      code: 'PRISMA_NO_ID_PROPERTY',
      entity: entity.name,
      message:
        `Entity '${entity.name}' has no property named 'id'. The emitted Prisma model has no @id field; ` +
        `Prisma's schema validator will reject it. Either add 'property required id: string' to the entity, ` +
        `declare a composite key with 'key [field1, field2, ...]', or hand-edit the emitted model.`,
    });
  }

  // Relationships
  if (entity.relationships.length > 0) {
    lines.push('');
    for (const rel of entity.relationships) {
      const { lines: relLines, diagnostics: relDiags } = emitRelationship(entity, rel, ir, options, context);
      lines.push(...relLines);
      diagnostics.push(...relDiags);
    }
  }

  // @@map (table name override)
  const tableMap = options.tableMappings?.[entity.name];
  let hadModelAttr = false;
  if (tableMap) {
    lines.push('');
    lines.push(`  @@map("${tableMap}")`);
    hadModelAttr = true;
  }

  // @@id for composite PK
  if (hasCompositeKey) {
    if (!hadModelAttr) { lines.push(''); hadModelAttr = true; }
    lines.push(`  @@id([${entity.key!.join(', ')}])`);
  }

  // @@unique for alternate keys (non-PK unique constraints for FK references targets)
  if (entity.alternateKeys && entity.alternateKeys.length > 0) {
    if (!hadModelAttr) { lines.push(''); hadModelAttr = true; }
    for (const ak of entity.alternateKeys) {
      lines.push(`  @@unique([${ak.join(', ')}])`);
    }
  }

  // @@index lines
  const idx = options.indexes?.[entity.name];
  if (idx && idx.length > 0) {
    if (!hadModelAttr) lines.push('');
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

    const storeByEntity = new Map<string, IRStore['target']>();
    for (const s of ir.stores) storeByEntity.set(s.entity, s.target);

    const toEmit: IREntity[] = [];
    const emittedEntities = new Set<string>();

    for (const entity of ir.entities) {
      if ((entity as IREntity & { external?: boolean }).external === true) {
        diagnostics.push({
          severity: 'info',
          code: 'PRISMA_SKIPPED_EXTERNAL',
          entity: entity.name,
          message: `Entity '${entity.name}' is marked external; skipped (no Prisma model emitted).`,
        });
        continue;
      }

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

      toEmit.push(entity);
      emittedEntities.add(entity.name);
    }

    const context: RelationContext = { emittedEntities };
    const modelBlocks: string[] = [];
    for (const entity of toEmit) {
      const { lines, diagnostics: modelDiags } = emitModel(entity, ir, options, context);
      diagnostics.push(...modelDiags);
      modelBlocks.push(lines.join('\n'));
    }

    const header = [
      '// Auto-generated by @manifest/projection-prisma',
      '// DO NOT EDIT — regenerate with the projection.',
      '',
      ...emitDatasourceBlock(options.provider),
    ];

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
