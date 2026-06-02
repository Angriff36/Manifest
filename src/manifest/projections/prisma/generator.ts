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

import { normalizeOptions, type PrismaProjectionOptions, type IndexEntry, type ForeignKeyConfig } from './options.js';
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
    case 'array': {
      const elements = value.elements.map(literalToPrismaDefault);
      if (elements.some(element => element === undefined)) return undefined;
      return `[${elements.join(', ')}]`;
    }
    case 'object':
      // Object defaults are not portable to Prisma; consumers can supply
      // their own via fieldAttributes. Silently skip.
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
  ir: IR,
  options: PrismaProjectionOptions,
): PropertyEmission {
  const diagnostics: ProjectionDiagnostic[] = [];

  // Array type handling: array<T> or T[] produces Prisma ScalarType[]
  // (e.g. array<string> → String[], array<int> → Int[]).
  const isArray = prop.type.name === 'array' && prop.type.generic;
  const effectiveTypeName = isArray ? prop.type.generic!.name : prop.type.name;

  const isValueObject = ir.values?.some(v => v.name === effectiveTypeName);
  const typeOverrides = isValueObject ? undefined : options.typeMappings?.[entity.name];
  const hasOverride = typeOverrides !== undefined
    && Object.prototype.hasOwnProperty.call(typeOverrides, prop.name);
  const scalar = isValueObject ? 'Json' : resolvePrismaScalar(effectiveTypeName, typeOverrides, prop.name);

  if (!scalar) {
    if (effectiveTypeName === 'number' && !hasOverride) {
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
        `Property '${entity.name}.${prop.name}' has IR type '${effectiveTypeName}' which is not in the default type mapping ` +
        `and no override was supplied in 'typeMappings.${entity.name}.${prop.name}'. ` +
        `Add an entry to typeMappings, or change the property type in the .manifest source.`,
    });
    return { line: null, diagnostics };
  }

  // @id is auto-added for a property named 'id' UNLESS the entity uses a composite key
  // (in that case @@id([...]) is emitted at model level; the id column is not special).
  const hasCompositeKey = entity.key && entity.key.length > 0;
  const isId = prop.name === 'id' && !hasCompositeKey;
  const isRequired = isId || prop.modifiers.includes('required');
  // Prisma list fields (String[]) are implicitly optional — never append ?.
  const nullableSuffix = isArray ? '' : (isRequired ? '' : '?');
  // Prisma list suffix: scalar becomes scalar[].
  const listSuffix = isArray ? '[]' : '';

  // Attribute list, ordered: @id, @unique, @default, @map, @db.Decimal, @db.ObjectId,
  // dbAttributes (@db.*), fieldAttributes (@unique, @default(now()), @updatedAt, etc.)
  const attrs: string[] = [];
  if (isId) attrs.push('@id');
  if (prop.modifiers.includes('unique') && !isId) attrs.push('@unique');

  const isMongo = options.provider === 'mongodb';
  const colMapOverride = options.columnMappings?.[entity.name]?.[prop.name];
  if (isId && isMongo && !colMapOverride && !prop.defaultValue) {
    attrs.push('@default(auto())');
  }

  // Scan fieldAttributes early to detect @default overrides.
  // We need to know BEFORE emitting the IR default whether the consumer
  // supplied their own @default. Actual push is deferred after dbAttributes.
  const fieldAttrs = options.fieldAttributes?.[entity.name]?.[prop.name];
  const fieldAttrHasDefault = fieldAttrs?.some(fa => /^@default\b/.test(fa)) ?? false;

  // NOTE: IR-level @default is NOT emitted here. It's emitted after dbAttributes
  // so that the attribute ordering matches the existing test expectations
  // (@id → @map → @db.* → @default → @updatedAt → @unique).

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

  // Generic @db.* attribute emission from config.
  // Skip if a @db.Decimal was already emitted by the precision path above.
  const hasDbDecimal = attrs.some(a => a.startsWith('@db.Decimal'));
  const dbAttr = options.dbAttributes?.[entity.name]?.[prop.name];
  if (dbAttr && !hasDbDecimal) {
    attrs.push(`@db.${dbAttr}`);
  }

  // IR-level default: only emit if fieldAttributes didn't supply a @default override.
  if (prop.defaultValue && !fieldAttrHasDefault) {
    const def = literalToPrismaDefault(prop.defaultValue);
    if (def !== undefined) attrs.push(`@default(${def})`);
  }

  // Field-level attributes from config (e.g. @unique, @default(now()), @updatedAt).
  // For @default: replaces any IR-emitted @default in-place (consumer override wins).
  // For all other kinds: suppressed if already present from IR/modifiers.
  if (fieldAttrs && fieldAttrs.length > 0) {
    for (const fa of fieldAttrs) {
      const faKind = fa.match(/^@\w+/)?.[0];
      if (faKind === '@default') {
        // Replace any existing @default (from IR) in-place to preserve attribute order.
        const idx = attrs.findIndex(a => a.startsWith('@default'));
        if (idx !== -1) {
          attrs[idx] = fa;
        } else {
          attrs.push(fa);
        }
      } else if (faKind) {
        // Non-default: skip if this kind already exists in attrs.
        if (!attrs.some(a => a.startsWith(faKind))) attrs.push(fa);
      } else {
        attrs.push(fa);
      }
    }
  }

  const attrPart = attrs.length ? ' ' + attrs.join(' ') : '';
  const encryptedComment = prop.modifiers.includes('encrypted')
    ? ' // @encrypted — envelope-encrypted at runtime'
    : '';
  return {
    line: `  ${prop.name} ${scalar}${listSuffix}${nullableSuffix}${attrPart}${encryptedComment}`,
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
      // Config override can be a string (FK column name) or an object
      // (ForeignKeyConfig with fields, references, and optional referential actions).
      const configFkOverride = options.foreignKeys?.[entity.name]?.[rel.name];
      let fkFields: string[];
      let configRefs: string[] | undefined;
      let configOnDelete: string | undefined;
      let configOnUpdate: string | undefined;

      if (configFkOverride !== undefined) {
        if (typeof configFkOverride === 'string') {
          // Legacy/simple form: just the FK column name.
          fkFields = [configFkOverride];
        } else {
          // Object form: ForeignKeyConfig with fields, references, actions.
          const fkObj = configFkOverride as ForeignKeyConfig;
          fkFields = fkObj.fields;
          configRefs = fkObj.references;
          configOnDelete = fkObj.onDelete;
          configOnUpdate = fkObj.onUpdate;
        }
      } else {
        fkFields = rel.foreignKey?.fields ?? [`${rel.name}Id`];
      }

      const refsFields: string[] = configRefs ?? rel.foreignKey?.references ?? ['id'];
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
      // Config-level onDelete/onUpdate (from ForeignKeyConfig) take precedence over IR-level.
      const fieldsAttr = `fields: [${fkFields.join(', ')}]`;
      const refsAttr = `references: [${refsFields.join(', ')}]`;
      const effectiveOnDelete = configOnDelete ?? (rel.onDelete ? toPrismaAction(rel.onDelete) : undefined);
      const effectiveOnUpdate = configOnUpdate ?? (rel.onUpdate ? toPrismaAction(rel.onUpdate) : undefined);
      const onDeleteAttr = effectiveOnDelete ? `, onDelete: ${effectiveOnDelete}` : '';
      const onUpdateAttr = effectiveOnUpdate ? `, onUpdate: ${effectiveOnUpdate}` : '';
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

  let effectiveOptions = options;
  if (entity.timestamps) {
    const merged = { ...options, fieldAttributes: { ...options.fieldAttributes } };
    merged.fieldAttributes[entity.name] = { ...merged.fieldAttributes[entity.name] };
    const fa = merged.fieldAttributes[entity.name];
    if (!fa['createdAt']) fa['createdAt'] = ['@default(now())'];
    if (!fa['updatedAt']) fa['updatedAt'] = ['@updatedAt'];
    effectiveOptions = merged;
  }

  let sawIdProperty = false;
  // STRUCTURAL invariant: iterate `properties` only. `computedProperties`
  // is a separate list and MUST never become columns.
  for (const prop of entity.properties) {
    if (prop.name === 'id') sawIdProperty = true;
    const { line, diagnostics: propDiags } = emitPropertyLine(entity, prop, ir, effectiveOptions);
    diagnostics.push(...propDiags);
    if (line !== null) lines.push(line);
  }

  // Composite PK suppresses the PRISMA_NO_ID_PROPERTY check since
  // the entity's identity is established via @@id([...]) below.
  const hasCompositeKey = entity.key && entity.key.length > 0;
  if (!sawIdProperty && !hasCompositeKey) {
    // No PK at all — Prisma will reject this model. Skip it rather than emitting
    // an invalid model that makes prisma validate fail on an otherwise clean schema.
    diagnostics.push({
      severity: 'error',
      code: 'PRISMA_NO_ID_PROPERTY',
      entity: entity.name,
      message:
        `Entity '${entity.name}' has no property named 'id' and no composite 'key' declaration. ` +
        `Prisma requires every model to have at least one unique identity field. ` +
        `Add 'property required id: string' to the entity or declare 'key [field1, field2, ...]'. ` +
        `This model is skipped; all other models are still emitted.`,
    });
    return { lines: [], diagnostics };
  }

  if (ir.tenant) {
    const tenantProp = ir.tenant.property;
    const alreadyDeclared = entity.properties.some(p => p.name === tenantProp);
    if (!alreadyDeclared) {
      const tenantScalar = resolvePrismaScalar(ir.tenant.type.name, undefined, tenantProp) ?? 'String';
      lines.push(`  ${tenantProp} ${tenantScalar}`);
    }
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

  if (ir.tenant) {
    const tenantProp = ir.tenant.property;
    const alreadyIndexed = (idx ?? []).some(entry =>
      Array.isArray(entry) ? entry.includes(tenantProp) : entry.fields.includes(tenantProp)
    ) || (entity.key ?? []).includes(tenantProp);
    if (!alreadyIndexed) {
      if (!hadModelAttr) { lines.push(''); hadModelAttr = true; }
      lines.push(`  @@index([${tenantProp}])`);
    }
  }

  // @@fulltext for searchable properties
  const searchableFields = entity.properties.filter(p => p.modifiers.includes('searchable')).map(p => p.name);
  if (searchableFields.length > 0) {
    if (!hadModelAttr) { lines.push(''); hadModelAttr = true; }
    lines.push(`  @@fulltext([${searchableFields.join(', ')}])`);
  }

  lines.push('}');

  if (ir.tenant) {
    const tableName = options.tableMappings?.[entity.name] ?? entity.name;
    const tenantCol = ir.tenant.property;
    lines.push('');
    lines.push(`// -- RLS policy (apply manually or via migration):`);
    lines.push(`// ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY;`);
    lines.push(`// CREATE POLICY tenant_isolation ON "${tableName}"`);
    lines.push(`//   USING ("${tenantCol}" = current_setting('app.tenant_id'));`);
  }

  return { lines, diagnostics };
}

// ============================================================================
// Schema-level emission (datasource + generator + models)
// ============================================================================

function emitDatasourceBlock(provider: PrismaProjectionOptions['provider']): string[] {
  if (!provider) return [];
  // Prisma 7+: datasource block carries only the provider — no `url` property.
  // The connection URL MUST be supplied by the consumer via prisma.config.ts.
  // A prisma.config.ts companion artifact is emitted alongside this schema.
  return [
    'datasource db {',
    `  provider = "${provider}"`,
    '}',
    '',
    'generator client {',
    '  provider = "prisma-client-js"',
    '}',
    '',
  ];
}

function emitPrismaConfigTs(envVar = 'DATABASE_URL'): string {
  return [
    '// Auto-generated by @manifest/projection-prisma',
    '// Prisma 7+: connection URL lives here, not in schema.prisma.',
    '// Set the DATABASE_URL environment variable (or replace with your env var name).',
    "import { defineConfig } from 'prisma/config';",
    '',
    'export default defineConfig({',
    '  datasources: {',
    '    db: {',
    `      url: process.env.${envVar},`,
    '    },',
    '  },',
    '});',
    '',
  ].join('\n');
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

    const artifacts: ProjectionArtifact[] = [
      {
        id: 'prisma.schema',
        pathHint: options.output,
        contentType: 'prisma',
        code,
      },
    ];

    // When a provider is set, emit a prisma.config.ts companion so consumers have
    // a complete, runnable output (Prisma 7 requires the URL here, not in schema).
    if (options.provider) {
      artifacts.push({
        id: 'prisma.config.ts',
        pathHint: 'prisma.config.ts',
        contentType: 'typescript',
        code: emitPrismaConfigTs(options.urlEnvVar ?? 'DATABASE_URL'),
      });
    }

    return { artifacts, diagnostics };
  }
}
