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

import type { IR, IREntity, IREnum, IRProperty, IRRelationship, IRStore, IRValue } from '../../ir';
import type {
  ProjectionArtifact,
  ProjectionDiagnostic,
  ProjectionRequest,
  ProjectionResult,
  ProjectionTarget,
} from '../interface';
import { pluralize, resolveColumnName, resolveTableName } from '../shared/naming.js';
import {
  type ForeignKeyConfig,
  type IndexEntry,
  normalizeOptions,
  type PrismaProjectionOptions,
  type PrismaProvider,
} from './options.js';
import { PRISMA_DESCRIPTOR_META } from './descriptor-meta.js';
import {
  DEFAULT_DECIMAL_PRECISION,
  DEFAULT_DECIMAL_SCALE,
  isDecimalScalar,
  resolvePrismaScalar,
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
// Multi-schema layout
// ============================================================================

/**
 * Providers that support multiple database schemas in Prisma. Enabling
 * `multiSchema` with any other provider is a hard error.
 */
const MULTISCHEMA_PROVIDERS: ReadonlySet<PrismaProvider> = new Set<PrismaProvider>([
  'postgresql',
  'cockroachdb',
  'sqlserver',
]);

/**
 * Resolve the database schema a model belongs to, or `undefined` when the
 * flat layout is in effect (multiSchema disabled). Resolution order:
 *   1. explicit `entitySchema[name]` override
 *   2. the entity's IR `module` (the real layout we are preserving)
 *   3. `defaultSchema` (default `"public"`)
 */
function resolveSchemaName(entity: IREntity, options: PrismaProjectionOptions): string | undefined {
  const ms = options.multiSchema;
  if (!ms?.enabled) {
    return;
  }
  return ms.entitySchema?.[entity.name] ?? entity.module ?? ms.defaultSchema ?? 'public';
}

/**
 * Resolve the database schema an enum belongs to (multiSchema only). Mirrors
 * `resolveSchemaName` for entities: explicit `entitySchema[name]` override,
 * then the enum's IR `module`, then `defaultSchema`.
 */
function resolveEnumSchemaName(
  enumDef: IREnum,
  options: PrismaProjectionOptions,
): string | undefined {
  const ms = options.multiSchema;
  if (!ms?.enabled) {
    return;
  }
  return ms.entitySchema?.[enumDef.name] ?? enumDef.module ?? ms.defaultSchema ?? 'public';
}

/**
 * Emit a Prisma `enum` block from an IR enum. Only the value *names* are
 * emitted: a Prisma enum value identifier IS its stored database value, whereas
 * an IR enum value's `label` is UI-display-only and `ordinal` is a sort hint —
 * neither is expressible as plain Prisma enum syntax (and emitting `label` via
 * `@map` would silently change the stored value), so both are intentionally
 * dropped. Declaration order is preserved (authoritative from the IR).
 */
function emitEnum(enumDef: IREnum, options: PrismaProjectionOptions): string {
  const lines: string[] = [`enum ${enumDef.name} {`];
  for (const value of enumDef.values) {
    lines.push(`  ${value.name}`);
  }
  const schemaName = resolveEnumSchemaName(enumDef, options);
  if (schemaName) {
    lines.push('');
    lines.push(`  @@schema("${schemaName}")`);
  }
  lines.push('}');
  return lines.join('\n');
}

/**
 * Build the datasource `schemas = [...]` list: explicit entries first (order
 * preserved), then any schema referenced by a model OR enum but not explicitly
 * listed, appended in sorted order. Guarantees every referenced schema is declared.
 */
function buildSchemasList(
  entities: IREntity[],
  enums: IREnum[],
  options: PrismaProjectionOptions,
): string[] {
  const ordered: string[] = [...(options.multiSchema?.schemas ?? [])];
  const used = new Set<string>();
  for (const entity of entities) {
    const schema = resolveSchemaName(entity, options);
    if (schema) {
      used.add(schema);
    }
  }
  for (const enumDef of enums) {
    const schema = resolveEnumSchemaName(enumDef, options);
    if (schema) {
      used.add(schema);
    }
  }
  for (const schema of [...used].sort()) {
    if (!ordered.includes(schema)) {
      ordered.push(schema);
    }
  }
  return ordered;
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
      return;
    case 'array': {
      const elements = value.elements.map(literalToPrismaDefault);
      if (elements.some((element) => element === undefined)) {
        return;
      }
      return `[${elements.join(', ')}]`;
    }
    case 'object':
      // Object defaults are not portable to Prisma scalar columns; consumers can
      // supply their own via fieldAttributes. Json columns are handled separately
      // (see irValueToJsonString) — this path is for non-Json scalars, so skip.
      return;
  }
}

/**
 * Serialize an IR literal value to a JSON string for a Prisma `Json` column
 * default. Prisma requires Json defaults as double-quoted JSON strings
 * (`@default("{}")`, `@default("[]")`, `@default("{ \"a\": 1 }")`), NOT the bare
 * bracket form used for scalar lists. Returns undefined if serialization fails.
 */
function irValueToJsonString(value: IRValue): string | undefined {
  const toJs = (v: IRValue): unknown => {
    switch (v.kind) {
      case 'string':
        return v.value;
      case 'number':
        return v.value;
      case 'boolean':
        return v.value;
      case 'null':
        return null;
      case 'array':
        return v.elements.map(toJs);
      case 'object': {
        const obj: Record<string, unknown> = {};
        for (const [k, el] of Object.entries(v.properties)) {
          obj[k] = toJs(el);
        }
        return obj;
      }
    }
  };
  try {
    return JSON.stringify(toJs(value));
  } catch {
    return;
  }
}

function buildIndexLine(entry: IndexEntry): string {
  if (Array.isArray(entry)) {
    return `  @@index([${entry.join(', ')}])`;
  }
  const fields = `[${entry.fields.join(', ')}]`;
  return entry.name ? `  @@index(${fields}, name: "${entry.name}")` : `  @@index(${fields})`;
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
  diagnostics: ProjectionDiagnostic[];
  line: string | null;
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

  const isValueObject = ir.values?.some((v) => v.name === effectiveTypeName);
  // Enum-typed property: the IR type name matches a declared enum. The Prisma
  // field type IS the enum name (emitted as a `enum` block by emitEnum), unless
  // a typeMappings override is explicitly supplied.
  const isEnum = (ir.enums?.some((e) => e.name === effectiveTypeName) ?? false) && !isValueObject;
  const typeOverrides = isValueObject ? undefined : options.typeMappings?.[entity.name];
  const hasOverride =
    typeOverrides !== undefined && Object.prototype.hasOwnProperty.call(typeOverrides, prop.name);
  const scalar = isValueObject
    ? 'Json'
    : isEnum && !hasOverride
      ? effectiveTypeName
      : resolvePrismaScalar(effectiveTypeName, typeOverrides, prop.name);

  if (!scalar) {
    if (effectiveTypeName === 'number' && !hasOverride) {
      diagnostics.push({
        severity: 'error',
        code: 'PRISMA_AMBIGUOUS_NUMBER',
        entity: entity.name,
        message:
          `Property '${entity.name}.${prop.name}' is typed 'number', which is ambiguous (Manifest does not ` +
          'distinguish integers from real numbers from money). Pick a precise type in the .manifest source: ' +
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
        'Add an entry to typeMappings, or change the property type in the .manifest source.',
    });
    return { line: null, diagnostics };
  }

  // @id is auto-added for a property named 'id' UNLESS the entity uses a composite key
  // (in that case @@id([...]) is emitted at model level; the id column is not special).
  const hasCompositeKey = entity.key && entity.key.length > 0;
  const isId = prop.name === 'id' && !hasCompositeKey;
  // A scalar column is nullable IFF the IR type is nullable — i.e. the .manifest
  // source wrote an explicit `?` on the property type. `required`/id no longer
  // drive the suffix: a non-nullable type emits NOT NULL even without `required`,
  // and the edge case `required` + `?` type emits `?` (the declared type wins).
  // Prisma list fields (String[]) are implicitly optional — never append ?.
  const nullableSuffix = isArray ? '' : prop.type.nullable ? '?' : '';
  // Prisma list suffix: scalar becomes scalar[].
  const listSuffix = isArray ? '[]' : '';

  // Attribute list, ordered: @id, @unique, @default, @map, @db.Decimal, @db.ObjectId,
  // dbAttributes (@db.*), fieldAttributes (@unique, @default(now()), @updatedAt, etc.)
  const attrs: string[] = [];
  if (isId) {
    attrs.push('@id');
  }
  if (prop.modifiers.includes('unique') && !isId) {
    attrs.push('@unique');
  }

  const isMongo = options.provider === 'mongodb';
  const colMapOverride = options.columnMappings?.[entity.name]?.[prop.name];
  if (isId && isMongo && !colMapOverride && !prop.defaultValue) {
    attrs.push('@default(auto())');
  }

  // Scan fieldAttributes early to detect @default overrides.
  // We need to know BEFORE emitting the IR default whether the consumer
  // supplied their own @default. Actual push is deferred after dbAttributes.
  const fieldAttrs = options.fieldAttributes?.[entity.name]?.[prop.name];
  const fieldAttrHasDefault = fieldAttrs?.some((fa) => /^@default\b/.test(fa)) ?? false;

  // NOTE: IR-level @default is NOT emitted here. It's emitted after dbAttributes
  // so that the attribute ordering matches the existing test expectations
  // (@id → @map → @db.* → @default → @updatedAt → @unique).

  if (colMapOverride) {
    attrs.push(`@map("${colMapOverride}")`);
  } else if (isId && isMongo) {
    attrs.push('@map("_id")');
  } else if (options.naming) {
    // Auto-casing convention: emit @map only when the physical name differs
    // from the IR property name. The Prisma field identifier stays prop.name.
    const phys = resolveColumnName(prop.name, options.naming);
    if (phys !== prop.name) {
      attrs.push(`@map("${phys}")`);
    }
  }

  // Native-type precedence: an explicit `precision` entry wins, then an
  // explicit `dbAttributes` entry, then the default @db.Decimal for decimal
  // scalars. Previously dbAttributes was SKIPPED whenever the default
  // @db.Decimal fired, so `money`-typed columns could never be annotated
  // @db.Money — an explicit per-field override must beat a derived default.
  //
  // Precision-resolution order (highest to lowest priority):
  //   1. options.precision[entity][prop]  — explicit consumer override
  //   2. prop.type.params                — precision/scale compiled into IR
  //   3. Default @db.Decimal(12,2)       — applied below for decimal scalars
  const optPrec = options.precision?.[entity.name]?.[prop.name];
  const typeParams = prop.type.params;
  const prec =
    optPrec ??
    (typeParams && (typeParams.precision !== undefined || typeParams.scale !== undefined)
      ? {
          precision: typeParams.precision ?? DEFAULT_DECIMAL_PRECISION,
          scale: typeParams.scale ?? DEFAULT_DECIMAL_SCALE,
        }
      : undefined);
  const dbAttr = options.dbAttributes?.[entity.name]?.[prop.name];
  // A Manifest `uuid` maps to the `String` scalar, but on PostgreSQL/CockroachDB
  // the physical column is a native `uuid` — so derive `@db.Uuid` automatically
  // instead of making every consumer repeat it per field in `dbAttributes`.
  // Postgres family only: MySQL/SQLite/SQL Server/Mongo have no `@db.Uuid`, and
  // when `provider` is unset the dialect is unknown so we stay conservative.
  const isPgFamily = options.provider === 'postgresql' || options.provider === 'cockroachdb';
  if (prec) {
    attrs.push(`@db.Decimal(${prec.precision}, ${prec.scale})`);
  } else if (dbAttr) {
    attrs.push(`@db.${dbAttr}`);
  } else if (isDecimalScalar(scalar)) {
    attrs.push(`@db.Decimal(${DEFAULT_DECIMAL_PRECISION}, ${DEFAULT_DECIMAL_SCALE})`);
  } else if (effectiveTypeName === 'uuid' && isPgFamily) {
    attrs.push('@db.Uuid');
  }

  if (isId && isMongo && scalar === 'String') {
    const idTypeOverride = options.typeMappings?.[entity.name]?.id;
    if (!idTypeOverride || idTypeOverride === 'String') {
      attrs.push('@db.ObjectId');
    }
  }

  // `= now()` / `= today()` default: emit a store-level `@default(now())` so the
  // column is populated even when a row is inserted without the field.
  if (prop.autoNow && !fieldAttrHasDefault) {
    attrs.push('@default(now())');
  }

  // IR-level default: only emit if fieldAttributes didn't supply a @default override.
  // Exception: a `uuid` property with an empty-string default (`uuid? = ""`, the
  // Manifest "unset FK" sentinel). `''` is not a valid uuid literal, so on native
  // uuid columns (Postgres family) `@default("")` produces `SET DEFAULT ''` DDL
  // that the database rejects (22P02: invalid input syntax for type uuid). The
  // sentinel's seeding semantics live in the runtime (which maps "" → NULL for
  // uuid columns); the store-level default is meaningless and undeployable.
  const isEmptyUuidSentinel =
    effectiveTypeName === 'uuid' &&
    prop.defaultValue?.kind === 'string' &&
    prop.defaultValue.value === '';
  if (prop.defaultValue && !fieldAttrHasDefault && !isEmptyUuidSentinel) {
    if (isEnum && prop.defaultValue.kind === 'string') {
      // An enum default is a member identifier, emitted bare (`@default(draft)`),
      // never quoted like a string literal (`@default("draft")` would be invalid).
      attrs.push(`@default(${prop.defaultValue.value})`);
    } else if (
      scalar === 'Json' &&
      !isArray &&
      (prop.defaultValue.kind === 'object' || prop.defaultValue.kind === 'array')
    ) {
      // Json column object/array defaults must be double-quoted JSON strings
      // (`@default("{}")`, `@default("[]")`), not the bare bracket form Prisma
      // reserves for scalar lists. Serialize then escape for the Prisma string.
      const json = irValueToJsonString(prop.defaultValue);
      if (json !== undefined) {
        const escaped = json.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        attrs.push(`@default("${escaped}")`);
      }
    } else {
      const def = literalToPrismaDefault(prop.defaultValue);
      if (def !== undefined) {
        attrs.push(`@default(${def})`);
      }
    }
  }

  // Field-level attributes from config (e.g. @unique, @default(now()), @updatedAt).
  // For @default: replaces any IR-emitted @default in-place (consumer override wins).
  // For all other kinds: suppressed if already present from IR/modifiers.
  if (fieldAttrs && fieldAttrs.length > 0) {
    for (const fa of fieldAttrs) {
      const faKind = fa.match(/^@\w+/)?.[0];
      if (faKind === '@default') {
        // Replace any existing @default (from IR) in-place to preserve attribute order.
        const idx = attrs.findIndex((a) => a.startsWith('@default'));
        if (idx === -1) {
          attrs.push(fa);
        } else {
          attrs[idx] = fa;
        }
      } else if (faKind) {
        // Non-default: skip if this kind already exists in attrs.
        if (!attrs.some((a) => a.startsWith(faKind))) {
          attrs.push(fa);
        }
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
  if (!target) {
    return 'String';
  }
  const prop = target.properties.find((p) => p.name === targetPropName);
  if (!prop) {
    return 'String';
  }
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
  if (!target) {
    return [];
  }
  return target.relationships.filter((r) => {
    if (r.target !== fromEntityName) {
      return false;
    }
    if (target.name === fromEntityName && r.name === rel.name) {
      return false;
    }
    return true;
  });
}

/**
 * Deterministic Prisma `@relation` name for a relation that is one of several
 * between the same pair of entities. Anchored on the FK-owning side
 * (`belongsTo`/`ref`) so both sides compute the identical string and Prisma can
 * pair them. The FK field name is unique per entity, so the name is unique.
 */
function ambiguousRelationName(fkOwnerEntity: string, fkRelName: string): string {
  return `${fkOwnerEntity}_${fkRelName}`;
}

/**
 * Resolve the shared `@relation` name to put on the non-FK side
 * (`hasMany`/`hasOne`) of an ambiguous relation, by pairing it with a
 * FK-owning relation on the target.
 *
 * Pairing: if the target has exactly one FK relation pointing back, use it.
 * Otherwise pair by declaration order (i-th back-relation ↔ i-th FK relation).
 *
 * ponytail: order-based pairing for the N-FK case — correct when both sides are
 * declared in parallel order (the natural hand-written case). The IR carries no
 * inverse pointer, so order is the only deterministic signal; the projection
 * emits a PRISMA_RELATION_PAIRING_ASSUMED info diagnostic so a human can verify.
 * Upgrade path: add an explicit `inverse` field to IRRelationship.
 *
 * Returns undefined when no FK-owning back side exists (genuinely unpairable).
 */
function resolveBacksideRelationName(
  entity: IREntity,
  rel: IRRelationship,
  ir: IR,
): string | undefined {
  const target = ir.entities.find((e) => e.name === rel.target);
  if (!target) {
    return;
  }
  const fkRels = target.relationships.filter(
    (r) => (r.kind === 'belongsTo' || r.kind === 'ref') && r.target === entity.name,
  );
  if (fkRels.length === 0) {
    return;
  }
  if (fkRels.length === 1) {
    return ambiguousRelationName(target.name, fkRels[0].name);
  }
  const backRels = entity.relationships.filter(
    (r) => (r.kind === 'hasMany' || r.kind === 'hasOne') && r.target === target.name,
  );
  const idx = backRels.findIndex((r) => r.name === rel.name);
  const paired = fkRels[idx];
  return paired ? ambiguousRelationName(target.name, paired.name) : undefined;
}

interface RelationEmission {
  diagnostics: ProjectionDiagnostic[];
  lines: string[];
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

  // (1) `through` → many-to-many via explicit join entity.
  // Emit a collection to the join rows (if the author did not already declare
  // hasMany Join). Target Tag[] is runtime-only (two-hop); Prisma wires Join.
  if (rel.through) {
    const joinName = rel.through;
    const alreadyHasJoinCollection = entity.relationships.some(
      (r) => !r.through && (r.kind === 'hasMany' || r.kind === 'hasOne') && r.target === joinName,
    );
    if (!alreadyHasJoinCollection) {
      const fieldName = lowerFirst(pluralize(joinName));
      const collision = entity.properties.some((p) => p.name === fieldName);
      if (!collision) {
        lines.push(`  ${fieldName} ${joinName}[]`);
      } else {
        diagnostics.push({
          severity: 'warning',
          code: 'PRISMA_THROUGH_JOIN_FIELD_COLLISION',
          entity: entity.name,
          message:
            `Relationship '${entity.name}.${rel.name}' through '${joinName}' needs a Prisma field ` +
            `'${fieldName} ${joinName}[]', but that name collides with a property. Rename the property ` +
            `or declare 'hasMany …: ${joinName}' explicitly.`,
        });
        lines.push(
          `  // ${rel.kind} ${rel.name}: ${rel.target} through ${joinName} — see PRISMA_THROUGH_JOIN_FIELD_COLLISION`,
        );
      }
    } else {
      lines.push(
        `  // ${rel.kind} ${rel.name}: ${rel.target} through ${joinName} — runtime two-hop; join rows via existing ${joinName} hasMany`,
      );
    }
    return { lines, diagnostics };
  }

  // (2) Ambiguity: multiple relations between this pair of entities. Prisma
  // requires a named `@relation` on BOTH sides. We derive a deterministic name
  // anchored on the FK-owning side so both sides agree (see helpers above).
  const sameTargetCount = entity.relationships.filter((r) => r.target === rel.target).length;
  const opposites = findOppositeRelations(entity.name, rel, ir);
  // Also ambiguous if autoBackRelations will add an inverse field to the same
  // target on this model (bidirectional A↔B belongsTo pairs) — count all the
  // Prisma fields this model will carry referencing the target.
  const isAmbiguous =
    sameTargetCount > 1 ||
    opposites.length > 1 ||
    totalRelationFields(entity.name, rel.target, ir, options) > 1;
  let relationName: string | undefined;
  if (isAmbiguous) {
    if (rel.kind === 'belongsTo' || rel.kind === 'ref') {
      relationName = ambiguousRelationName(entity.name, rel.name);
    } else {
      relationName = resolveBacksideRelationName(entity, rel, ir);
      const fkBack = ir.entities
        .find((e) => e.name === rel.target)
        ?.relationships.filter(
          (r) => (r.kind === 'belongsTo' || r.kind === 'ref') && r.target === entity.name,
        );
      if (relationName && fkBack && fkBack.length > 1) {
        diagnostics.push({
          severity: 'info',
          code: 'PRISMA_RELATION_PAIRING_ASSUMED',
          entity: entity.name,
          message:
            `Relationship '${entity.name}.${rel.name}' → ${rel.target} was paired with ` +
            `'${rel.target}.${relationName.slice(rel.target.length + 1)}' by declaration order ` +
            `(emitted as @relation("${relationName}")). The IR carries no inverse pointer; ` +
            'verify the pairing is correct, or declare the relations in parallel order on both sides.',
        });
      }
    }
    if (!relationName) {
      // hasMany/hasOne with no FK-owning back side: Prisma can't form the
      // relation at all. Surface it rather than emit invalid schema.
      diagnostics.push({
        severity: 'warning',
        code: 'PRISMA_RELATION_AMBIGUOUS',
        entity: entity.name,
        message:
          `Relationship '${entity.name}.${rel.name}' → ${rel.target} is one of multiple relations between ` +
          `these entities, but ${rel.target} declares no 'belongsTo'/'ref' back to ${entity.name} to anchor a ` +
          `named relation. Add a FK-owning relation on ${rel.target}, or refactor to a single relation.`,
      });
      lines.push(`  // ${rel.kind} ${rel.name}: ${rel.target} — see PRISMA_RELATION_AMBIGUOUS`);
      return { lines, diagnostics };
    }
  }
  const relNameArg = relationName ? `"${relationName}"` : '';
  const relNameSuffix = relationName ? ` @relation(${relNameArg})` : '';

  switch (rel.kind) {
    case 'hasMany': {
      lines.push(`  ${rel.name} ${rel.target}[]${relNameSuffix}`);
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
      lines.push(`  ${rel.name} ${rel.target}?${relNameSuffix}`);
      if (opposites.length === 0) {
        diagnostics.push({
          severity: 'warning',
          code: 'PRISMA_RELATION_MISSING_BACKSIDE',
          entity: entity.name,
          message:
            `Relationship '${entity.name}.${rel.name}: ${rel.target}?' has no back-relation declared on ${rel.target}. ` +
            `Prisma rejects one-sided relations — add a 'belongsTo' (or 'ref') from ${rel.target} back to ${entity.name}, ` +
            'and the FK will be marked @unique automatically.',
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

      if (configFkOverride === undefined) {
        fkFields = rel.foreignKey?.fields ?? [`${rel.name}Id`];
      } else if (typeof configFkOverride === 'string') {
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
          const uniqueAttr = !isComposite && isOneToOne ? ' @unique' : '';
          // Explicit columnMappings override wins; otherwise the auto-casing
          // convention maps the physical FK column name (identifier stays fkField).
          let physMap = options.columnMappings?.[entity.name]?.[fkField];
          if (!physMap && options.naming) {
            const phys = resolveColumnName(fkField, options.naming);
            if (phys !== fkField) {
              physMap = phys;
            }
          }
          const colMapAttr = physMap ? ` @map("${physMap}")` : '';
          lines.push(`  ${fkField} ${fkType}${uniqueAttr}${colMapAttr}`);
        }
      }

      // For composite 1:1, emit @@unique at model level.
      if (isComposite && isOneToOne) {
        lines.push(`  @@unique([${fkFields.join(', ')}])`);
      }

      // Prisma rule: if any FK scalar field is nullable, the relation field must
      // be nullable too. A synthesized FK column is non-null; a declared property
      // column's nullability follows its IR type — MATCHING the type-driven
      // nullability rule in emitPropertyLine (prop.type.nullable ? '?' : '').
      const fkOptional = fkFields.some((f) => {
        const prop = entity.properties.find((p) => p.name === f);
        if (!prop) {
          return false; // synthesized FK column is non-null
        }
        const isArr = prop.type.name === 'array' && !!prop.type.generic;
        return !isArr && prop.type.nullable;
      });
      const optionalMark = fkOptional ? '?' : '';

      // Relation field line with correct fields/references and optional referential actions.
      // Config-level onDelete/onUpdate (from ForeignKeyConfig) take precedence over IR-level.
      const nameAttr = relationName ? `${relNameArg}, ` : '';
      const fieldsAttr = `fields: [${fkFields.join(', ')}]`;
      const refsAttr = `references: [${refsFields.join(', ')}]`;
      // Prisma rejects the implicit SetNull/Cascade referential actions on a
      // self-relation or a reference cycle (e.g. A→B belongsTo while B→A
      // belongsTo). Such relations must carry NoAction on at least one side; we
      // default BOTH sides to NoAction (valid, and side-independent) unless the
      // user explicitly configured actions.
      const isSelfRelation = rel.target === entity.name;
      const targetEntity = ir.entities.find((e) => e.name === rel.target);
      const isMutualCycle =
        !isSelfRelation &&
        !!targetEntity?.relationships.some(
          (r) =>
            (r.kind === 'belongsTo' || r.kind === 'ref') && r.target === entity.name && !r.through,
        );
      // `NoAction` is the cycle-breaker in relational mode, but it is not
      // implemented for Postgres under relationMode="prisma" — there the allowed
      // set is Cascade/Restrict/SetNull, so use Restrict to break the cycle.
      const cycleDefault =
        isSelfRelation || isMutualCycle
          ? options.relationMode === 'prisma'
            ? 'Restrict'
            : 'NoAction'
          : undefined;
      const effectiveOnDelete =
        configOnDelete ?? (rel.onDelete ? toPrismaAction(rel.onDelete) : cycleDefault);
      const effectiveOnUpdate =
        configOnUpdate ?? (rel.onUpdate ? toPrismaAction(rel.onUpdate) : cycleDefault);
      const onDeleteAttr = effectiveOnDelete ? `, onDelete: ${effectiveOnDelete}` : '';
      const onUpdateAttr = effectiveOnUpdate ? `, onUpdate: ${effectiveOnUpdate}` : '';
      lines.push(
        `  ${rel.name} ${rel.target}${optionalMark} @relation(${nameAttr}${fieldsAttr}, ${refsAttr}${onDeleteAttr}${onUpdateAttr})`,
      );

      // With autoBackRelations the projection emits the inverse on the target,
      // so a missing declared back-relation is no longer a problem.
      if (opposites.length === 0 && !options.autoBackRelations) {
        diagnostics.push({
          severity: 'warning',
          code: 'PRISMA_RELATION_MISSING_BACKSIDE',
          entity: entity.name,
          message:
            `Relationship '${entity.name}.${rel.name}: ${rel.target}' (${rel.kind}) has no back-relation declared on ${rel.target}. ` +
            `Prisma rejects one-sided relations — add 'hasMany' or 'hasOne' on ${rel.target} pointing back to ${entity.name}, ` +
            'or enable projections.prisma.options.autoBackRelations to emit it automatically.',
        });
      }

      return { lines, diagnostics };
    }
  }
}

/**
 * Auto-emit inverse relation fields on `target` for every `belongsTo`/`ref` on
 * another emitted entity that points at `target` but is not covered by a
 * declared `hasMany`/`hasOne` on `target`. Active only when
 * `options.autoBackRelations` is set. The emitted field is `<pluralCamelOwner>
 * Owner[]`; ambiguous pairs (multiple relations between the two entities) carry
 * a deterministic `@relation("Owner_<rel>")` name matching the FK-owning side
 * (see {@link ambiguousRelationName}). Field names are uniquified against the
 * provided `existingFieldNames` set.
 */
/**
 * Number of synthetic inverse fields `owner`'s model gains that reference
 * `target`: `target`'s FK-owning relations back to `owner` not already covered
 * by a declared `hasMany`/`hasOne` on `owner`. Zero unless autoBackRelations.
 */
function autoInverseCountFor(ownerName: string, targetName: string, ir: IR): number {
  const owner = ir.entities.find((e) => e.name === ownerName);
  const target = ir.entities.find((e) => e.name === targetName);
  if (!(owner && target)) {
    return 0;
  }
  const targetForwards = target.relationships.filter(
    (r) => (r.kind === 'belongsTo' || r.kind === 'ref') && r.target === ownerName && !r.through,
  ).length;
  const ownerDeclaredInverses = owner.relationships.filter(
    (r) => (r.kind === 'hasMany' || r.kind === 'hasOne') && r.target === targetName,
  ).length;
  return Math.max(0, targetForwards - ownerDeclaredInverses);
}

/**
 * Total Prisma relation FIELDS `owner`'s model will carry that reference
 * `target` — declared relations plus any auto-emitted inverses. When > 1, every
 * such field needs an explicit `@relation` name (Prisma's ambiguity rule). This
 * is what makes a bidirectional pair (A→B belongsTo AND B→A belongsTo, each
 * auto-gaining an inverse) resolve correctly under autoBackRelations.
 */
function totalRelationFields(
  ownerName: string,
  targetName: string,
  ir: IR,
  options: PrismaProjectionOptions,
): number {
  const owner = ir.entities.find((e) => e.name === ownerName);
  if (!owner) {
    return 0;
  }
  const declared = owner.relationships.filter((r) => r.target === targetName && !r.through).length;
  const auto = options.autoBackRelations ? autoInverseCountFor(ownerName, targetName, ir) : 0;
  return declared + auto;
}

/**
 * True when some relation in the IR references `target` via a single-column
 * `references: [id]`. A composite-PK model (`@@id([tenantId, id])`) does not make
 * `id` alone unique, so such a reference requires an explicit `@@unique([id])`.
 * We only emit that unique when a single-id reference actually exists (the
 * reference mandates the uniqueness), rather than assuming every composite `id`
 * is globally unique.
 */
function isReferencedBySingleId(
  target: IREntity,
  ir: IR,
  options: PrismaProjectionOptions,
): boolean {
  for (const e of ir.entities) {
    for (const r of e.relationships) {
      if ((r.kind !== 'belongsTo' && r.kind !== 'ref') || r.target !== target.name || r.through) {
        continue;
      }
      const cfg = options.foreignKeys?.[e.name]?.[r.name];
      const refs = (cfg && typeof cfg !== 'string' ? cfg.references : undefined) ??
        r.foreignKey?.references ?? ['id'];
      if (refs.length === 1 && refs[0] === 'id') {
        return true;
      }
    }
  }
  return false;
}

function emitAutoInverseRelations(
  target: IREntity,
  ir: IR,
  options: PrismaProjectionOptions,
  context: RelationContext,
  existingFieldNames: Set<string>,
): RelationEmission {
  const lines: string[] = [];
  const diagnostics: ProjectionDiagnostic[] = [];
  if (!(options.autoBackRelations && context.emittedEntities.has(target.name))) {
    return { lines, diagnostics };
  }

  for (const owner of ir.entities) {
    // Self-relations are handled too: a self belongsTo (e.g. parent) needs a
    // named self-inverse (e.g. children) — Prisma requires names on both.
    if (!context.emittedEntities.has(owner.name)) {
      continue;
    }

    // FK-owning relations owner → target (skip join-table relations).
    const forwards = owner.relationships.filter(
      (r) => (r.kind === 'belongsTo' || r.kind === 'ref') && r.target === target.name && !r.through,
    );
    if (forwards.length === 0) {
      continue;
    }

    // Inverses already declared on target pointing back at owner cover the
    // first N forwards (order-paired, consistent with resolveBacksideRelationName).
    const declaredInverses = target.relationships.filter(
      (r) => (r.kind === 'hasMany' || r.kind === 'hasOne') && r.target === owner.name,
    );

    // A name is needed when this model will carry more than one field referencing
    // `owner` (declared + auto, either direction). A field-name suffix is needed
    // only when this single owner contributes more than one inverse here.
    const needsName = totalRelationFields(target.name, owner.name, ir, options) > 1;
    const needsSuffix = forwards.length > 1;

    for (let i = declaredInverses.length; i < forwards.length; i++) {
      const fwd = forwards[i];
      const base = lowerFirst(pluralize(owner.name));
      const field = needsSuffix ? `${base}${capitalizeFirst(fwd.name)}` : base;
      let unique = field;
      for (let n = 2; existingFieldNames.has(unique); n++) {
        unique = `${field}${n}`;
      }
      existingFieldNames.add(unique);
      const relName = needsName ? ambiguousRelationName(owner.name, fwd.name) : undefined;
      const relAttr = relName ? ` @relation("${relName}")` : '';
      lines.push(`  ${unique} ${owner.name}[]${relAttr}`);
    }
  }
  return { lines, diagnostics };
}

function lowerFirst(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

function capitalizeFirst(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// ============================================================================
// Per-entity model emission
// ============================================================================

interface ModelEmission {
  diagnostics: ProjectionDiagnostic[];
  lines: string[];
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
    const merged = {
      ...options,
      fieldAttributes: { ...options.fieldAttributes },
    };
    merged.fieldAttributes[entity.name] = {
      ...merged.fieldAttributes[entity.name],
    };
    const fa = merged.fieldAttributes[entity.name];
    if (!fa['createdAt']) {
      fa['createdAt'] = ['@default(now())'];
    }
    if (!fa['updatedAt']) {
      fa['updatedAt'] = ['@updatedAt'];
    }
    effectiveOptions = merged;
  }

  let sawIdProperty = false;
  // STRUCTURAL invariant: iterate `properties` only. `computedProperties`
  // is a separate list and MUST never become columns.
  for (const prop of entity.properties) {
    if (prop.name === 'id') {
      sawIdProperty = true;
    }
    const { line, diagnostics: propDiags } = emitPropertyLine(entity, prop, ir, effectiveOptions);
    diagnostics.push(...propDiags);
    if (line !== null) {
      lines.push(line);
    }
  }

  // Composite PK suppresses the PRISMA_NO_ID_PROPERTY check since
  // the entity's identity is established via @@id([...]) below.
  const hasCompositeKey = entity.key && entity.key.length > 0;
  if (!(sawIdProperty || hasCompositeKey)) {
    // No PK at all — Prisma will reject this model. Skip it rather than emitting
    // an invalid model that makes prisma validate fail on an otherwise clean schema.
    diagnostics.push({
      severity: 'error',
      code: 'PRISMA_NO_ID_PROPERTY',
      entity: entity.name,
      message:
        `Entity '${entity.name}' has no property named 'id' and no composite 'key' declaration. ` +
        'Prisma requires every model to have at least one unique identity field. ' +
        `Add 'property required id: string' to the entity or declare 'key [field1, field2, ...]'. ` +
        'This model is skipped; all other models are still emitted.',
    });
    return { lines: [], diagnostics };
  }

  if (ir.tenant) {
    const tenantProp = ir.tenant.property;
    const alreadyDeclared = entity.properties.some((p) => p.name === tenantProp);
    if (!alreadyDeclared) {
      const tenantScalar =
        resolvePrismaScalar(ir.tenant.type.name, undefined, tenantProp) ?? 'String';
      lines.push(`  ${tenantProp} ${tenantScalar}`);
    }
  }

  // Track field identifiers already used on this model so auto-inverse
  // relation field names don't collide with properties, FK columns, the tenant
  // column, or declared relation fields.
  const usedFieldNames = new Set<string>();
  for (const p of entity.properties) {
    usedFieldNames.add(p.name);
  }
  if (ir.tenant) {
    usedFieldNames.add(ir.tenant.property);
  }
  for (const r of entity.relationships) {
    usedFieldNames.add(r.name);
    for (const fk of r.foreignKey?.fields ?? [`${r.name}Id`]) {
      usedFieldNames.add(fk);
    }
  }

  // Relationships
  if (entity.relationships.length > 0) {
    lines.push('');
    for (const rel of entity.relationships) {
      const { lines: relLines, diagnostics: relDiags } = emitRelationship(
        entity,
        rel,
        ir,
        options,
        context,
      );
      lines.push(...relLines);
      diagnostics.push(...relDiags);
    }
  }

  // Auto-emitted inverse relations for one-sided belongsTo/ref pointing here.
  const auto = emitAutoInverseRelations(entity, ir, options, context, usedFieldNames);
  if (auto.lines.length > 0) {
    if (entity.relationships.length === 0) {
      lines.push('');
    }
    lines.push(...auto.lines);
  }
  diagnostics.push(...auto.diagnostics);

  // @@map (table name override). Explicit tableMappings wins; otherwise the
  // auto-casing convention maps the physical table name (model name stays
  // entity.name, so relations/indexes are unaffected).
  let tableMap = options.tableMappings?.[entity.name];
  if (!tableMap && options.naming) {
    const phys = resolveTableName(entity.name, options.naming);
    if (phys !== entity.name) {
      tableMap = phys;
    }
  }
  let hadModelAttr = false;
  if (tableMap) {
    lines.push('');
    lines.push(`  @@map("${tableMap}")`);
    hadModelAttr = true;
  }

  // @@id for composite PK
  if (hasCompositeKey) {
    if (!hadModelAttr) {
      lines.push('');
      hadModelAttr = true;
    }
    lines.push(`  @@id([${entity.key!.join(', ')}])`);
    // A composite PK does not make `id` alone unique. If some relation references
    // this model via single-column `[id]`, Prisma needs an explicit unique on id.
    if (
      entity.key!.includes('id') &&
      entity.key!.length > 1 &&
      isReferencedBySingleId(entity, ir, options)
    ) {
      lines.push('  @@unique([id])');
    }
  }

  // @@unique for alternate keys (non-PK unique constraints for FK references targets)
  if (entity.alternateKeys && entity.alternateKeys.length > 0) {
    if (!hadModelAttr) {
      lines.push('');
      hadModelAttr = true;
    }
    for (const ak of entity.alternateKeys) {
      lines.push(`  @@unique([${ak.join(', ')}])`);
    }
  }

  // @@index lines
  const idx = options.indexes?.[entity.name];
  if (idx && idx.length > 0) {
    if (!hadModelAttr) {
      lines.push('');
    }
    for (const entry of idx) {
      lines.push(buildIndexLine(entry));
    }
  }

  // @@index for properties with the `indexed` modifier — emit one @@index per
  // such property, but skip any that are already covered by options.indexes.
  const indexedModifierProps = entity.properties.filter((p) => p.modifiers.includes('indexed'));
  for (const indexedProp of indexedModifierProps) {
    const alreadyInOptions = (idx ?? []).some((entry) =>
      Array.isArray(entry)
        ? entry.includes(indexedProp.name)
        : entry.fields.includes(indexedProp.name),
    );
    if (!alreadyInOptions) {
      if (!hadModelAttr) {
        lines.push('');
        hadModelAttr = true;
      }
      lines.push(`  @@index([${indexedProp.name}])`);
    }
  }

  if (ir.tenant) {
    const tenantProp = ir.tenant.property;
    const alreadyIndexed =
      (idx ?? []).some((entry) =>
        Array.isArray(entry) ? entry.includes(tenantProp) : entry.fields.includes(tenantProp),
      ) || (entity.key ?? []).includes(tenantProp);
    if (!alreadyIndexed) {
      if (!hadModelAttr) {
        lines.push('');
        hadModelAttr = true;
      }
      lines.push(`  @@index([${tenantProp}])`);
    }
  }

  // @@fulltext for searchable properties
  const searchableFields = entity.properties
    .filter((p) => p.modifiers.includes('searchable'))
    .map((p) => p.name);
  if (searchableFields.length > 0) {
    if (!hadModelAttr) {
      lines.push('');
      hadModelAttr = true;
    }
    lines.push(`  @@fulltext([${searchableFields.join(', ')}])`);
  }

  // @@schema — preserve the model's module layout when multiSchema is enabled.
  const schemaName = resolveSchemaName(entity, options);
  if (schemaName) {
    if (!hadModelAttr) {
      lines.push('');
      hadModelAttr = true;
    }
    lines.push(`  @@schema("${schemaName}")`);
  }

  lines.push('}');

  if (ir.tenant) {
    const tableName = tableMap ?? entity.name;
    const tenantCol = ir.tenant.property;
    lines.push('');
    lines.push('// -- RLS policy (apply manually or via migration):');
    lines.push(`// ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY;`);
    lines.push(`// CREATE POLICY tenant_isolation ON "${tableName}"`);
    lines.push(`//   USING ("${tenantCol}" = current_setting('app.tenant_id'));`);
  }

  return { lines, diagnostics };
}

// ============================================================================
// Schema-level emission (datasource + generator + models)
// ============================================================================

function emitDatasourceBlock(
  provider: PrismaProjectionOptions['provider'],
  schemas: readonly string[] = [],
  relationMode?: PrismaProjectionOptions['relationMode'],
  generator?: PrismaProjectionOptions['generator'],
): string[] {
  if (!provider) {
    return [];
  }
  // Prisma 7+: datasource block carries only the provider — no `url` property.
  // The connection URL MUST be supplied by the consumer via prisma.config.ts.
  // A prisma.config.ts companion artifact is emitted alongside this schema.
  //
  // Multi-schema: when models declare `@@schema(...)`, the datasource must list
  // every referenced schema via `schemas = [...]`. multiSchema is GA in current
  // Prisma (no previewFeatures flag required).
  const datasource = ['datasource db {', `  provider = "${provider}"`];
  if (relationMode) {
    datasource.push(`  relationMode = "${relationMode}"`);
  }
  if (schemas.length > 0) {
    datasource.push(`  schemas  = [${schemas.map((s) => `"${s}"`).join(', ')}]`);
  }
  datasource.push('}');

  // generator client block — defaults to the legacy prisma-client-js generator
  // for back-compat; consumers override provider/output/moduleFormat/etc. via
  // the `generator` option. Keys/values are emitted verbatim.
  const generatorFields =
    generator && Object.keys(generator).length > 0 ? generator : { provider: 'prisma-client-js' };
  const generatorBlock = [
    'generator client {',
    ...Object.entries(generatorFields).map(([k, v]) => `  ${k} = "${v}"`),
    '}',
  ];

  return [...datasource, '', ...generatorBlock, ''];
}

function emitPrismaConfigTs(envVar = 'DATABASE_URL'): string {
  return [
    '// Auto-generated by @manifest/projection-prisma',
    '// Prisma 7+: connection URL lives here, not in schema.prisma.',
    '// Set the DATABASE_URL environment variable (or replace with your env var name).',
    "import { defineConfig } from 'prisma/config';",
    '',
    'export default defineConfig({',
    // PrismaConfig (prisma >= 7.8 types) takes a singular flat `datasource`;
    // the legacy plural nested form typechecks red and was silently ignored
    // at runtime (the CLI fell back to env loading).
    '  datasource: {',
    `    url: process.env.${envVar},`,
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
  readonly description = 'Manifest IR → Prisma schema projection. Compile-time only. App-agnostic.';
  readonly surfaces = SURFACES;
  readonly descriptorMeta = PRISMA_DESCRIPTOR_META;

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

    let options = normalizeOptions(request.options);
    const diagnostics: ProjectionDiagnostic[] = [];

    // Multi-schema provider guard. Multiple schemas are a PostgreSQL /
    // CockroachDB / SQL Server capability; on any other provider we cannot
    // emit a valid multi-schema layout, so fall back to flat and explain why.
    if (
      options.multiSchema?.enabled &&
      options.provider &&
      !MULTISCHEMA_PROVIDERS.has(options.provider)
    ) {
      diagnostics.push({
        severity: 'error',
        code: 'PRISMA_MULTISCHEMA_UNSUPPORTED_PROVIDER',
        message:
          `multiSchema is enabled but provider '${options.provider}' does not support multiple database schemas. ` +
          `Prisma multi-schema requires 'postgresql', 'cockroachdb', or 'sqlserver'. ` +
          'Models are emitted WITHOUT @@schema (flat layout). Remove multiSchema or switch provider.',
      });
      options = {
        ...options,
        multiSchema: { ...options.multiSchema, enabled: false },
      };
    }

    const storeByEntity = new Map<string, IRStore['target']>();
    for (const s of ir.stores) {
      storeByEntity.set(s.entity, s.target);
    }

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

    // Enums referenced by an emitted (durable) entity's property. We only emit
    // enum blocks that a Prisma model actually uses — an enum referenced solely
    // by a skipped (memory/external) entity would be an orphan declaration.
    const referencedEnumNames = new Set<string>();
    for (const entity of toEmit) {
      for (const prop of entity.properties) {
        const typeName =
          prop.type.name === 'array' && prop.type.generic ? prop.type.generic.name : prop.type.name;
        if ((ir.enums ?? []).some((e) => e.name === typeName)) {
          referencedEnumNames.add(typeName);
        }
      }
    }
    const enumsToEmit = (ir.enums ?? []).filter((e) => referencedEnumNames.has(e.name));

    // Schemas referenced by the models/enums we are about to emit (empty when
    // multiSchema is disabled). Drives both the datasource `schemas = [...]`
    // list and the models-only advisory below.
    const schemasList = buildSchemasList(toEmit, enumsToEmit, options);

    // Models-only mode (no provider → no datasource block): @@schema is still
    // emitted, but the consumer's existing datasource must declare the schemas.
    if (options.multiSchema?.enabled && !options.provider && schemasList.length > 0) {
      diagnostics.push({
        severity: 'info',
        code: 'PRISMA_MULTISCHEMA_MODELS_ONLY',
        message:
          'multiSchema is enabled with no provider (models-only mode). @@schema(...) is emitted on each model, ' +
          'but no datasource block is generated. Ensure your existing datasource declares ' +
          `schemas = [${schemasList.map((s) => `"${s}"`).join(', ')}].`,
      });
    }

    const context: RelationContext = { emittedEntities };
    const modelBlocks: string[] = [];
    for (const entity of toEmit) {
      const { lines, diagnostics: modelDiags } = emitModel(entity, ir, options, context);
      diagnostics.push(...modelDiags);
      modelBlocks.push(lines.join('\n'));
    }

    const enumBlocks: string[] = enumsToEmit.map((e) => emitEnum(e, options));

    const header = [
      '// Auto-generated by @manifest/projection-prisma',
      '// DO NOT EDIT — regenerate with the projection.',
      '',
      ...emitDatasourceBlock(
        options.provider,
        schemasList,
        options.relationMode,
        options.generator,
      ),
    ];

    const headerStr = header.join('\n');
    const bodyBlocks = [...modelBlocks, ...enumBlocks];
    const code =
      bodyBlocks.length > 0
        ? headerStr + '\n' + bodyBlocks.join('\n\n') + '\n'
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
