/**
 * Convex schema projection.
 *
 * Consumes Manifest IR + projection config and emits a `convex/schema.ts`
 * string (`defineSchema` / `defineTable` + `convex/values` validators) as a
 * single `ProjectionArtifact`.
 *
 * Boundary rules (mirrors the Prisma projection):
 *   - Relational/document interpretation starts HERE. No Convex concept (table
 *     name, validator, index, reference shape) lives in Manifest core grammar
 *     or IR — all of it arrives via projection options.
 *   - The projection carries NO knowledge of any specific application. Anything
 *     resembling an app-specific string in this file is a bug.
 *   - `computed` properties are derived and MUST NEVER become fields. We do this
 *     structurally by iterating `entity.properties` only, never
 *     `entity.computedProperties`.
 *   - The IR `id` property maps to Convex's built-in document `_id` and is NOT
 *     emitted as a field.
 *   - Entities with `external: true` are skipped. Stores with target `memory` /
 *     `localStorage` are skipped. Targets `durable` / `postgres` / `supabase`
 *     are emission targets. Entities with no store entry are skipped (no
 *     implicit ownership — this also naturally excludes mixin entities).
 *   - Unknown `type.name` produces a hard error diagnostic. No fallback.
 */

import type { IR, IREntity, IREnum, IRProperty, IRRelationship, IRStore } from '../../ir';
import type {
  ProjectionArtifact,
  ProjectionDiagnostic,
  ProjectionRequest,
  ProjectionResult,
  ProjectionTarget,
} from '../interface';

import { normalizeOptions, type IndexEntry, resolveConvexTableName, collectConvexAuthConfigDiagnostics, collectConvexNamingPrecedenceDiagnostics } from './options.js';
import { resolveConvexValidator, isConvexSearchIndexFieldType } from './type-mapping.js';
import { generateQueries, generateMutations } from './functions.js';
import { generateCrons, generateHttp, generateSagas } from './orchestration.js';
import { generateComputedHelpers } from './computed.js';
import { collectEncryptedDiagnostics } from './privacy.js';
import { collectUnsupportedDiagnostics, CONVEX_PROJECTION_CAPABILITIES } from './capabilities.js';
import { isPersistentEntity, isPersistentStoreTarget } from './persist.js';
import { CONVEX_DESCRIPTOR_META } from './descriptor-meta.js';
import { generateReactClient } from './react-client.js';


export { isPersistentEntity } from './persist.js';
export { resolveConvexTableName } from './options.js';

// ============================================================================
// Surface identifiers
// ============================================================================

const SURFACE_SCHEMA = 'convex.schema' as const;
const SURFACE_QUERIES = 'convex.queries' as const;
const SURFACE_MUTATIONS = 'convex.mutations' as const;
const SURFACE_CRONS = 'convex.crons' as const;
const SURFACE_HTTP = 'convex.http' as const;
const SURFACE_SAGAS = 'convex.sagas' as const;
const SURFACE_COMPUTED = 'convex.computed' as const;
const SURFACE_REACT = 'convex.react' as const;
const SURFACES = [
  SURFACE_SCHEMA,
  SURFACE_QUERIES,
  SURFACE_MUTATIONS,
  SURFACE_CRONS,
  SURFACE_HTTP,
  SURFACE_SAGAS,
  SURFACE_COMPUTED,
  SURFACE_REACT,
] as const;

// ============================================================================
// Store target classification (identical policy to the Prisma projection)
// ============================================================================

function isPersistent(target: IRStore['target']): boolean {
  return isPersistentStoreTarget(target);
}

// ============================================================================
// Naming
// ============================================================================

export type NormalizedOptions = ReturnType<typeof normalizeOptions>;

/**
 * Map FK column name → target Convex table for an entity's belongsTo/ref
 * relationships, REGARDLESS of `referenceMode`. The schema surface emits a
 * `by_<fk>` index for every reference whether the column is rendered as a
 * `v.id(...)` (convexId) or a `v.string()` (stringId), so index DERIVATION must
 * see all references in both modes. Shared by the schema generator (index
 * emission) and the functions generator (reference-query derivation) so the two
 * surfaces cannot disagree about which references are indexed.
 *
 * Contrast {@link collectFkTargets}, which is convexId-only because it drives
 * `v.id(...)` *typing* of the column / query arg, not index existence.
 */
export function collectReferenceFields(
  entity: IREntity,
  ir: IR,
  options: NormalizedOptions,
): Map<string, string> {
  const map = new Map<string, string>();
  const tenantProp = ir.tenant?.property;
  for (const rel of entity.relationships) {
    if (rel.kind !== 'belongsTo' && rel.kind !== 'ref') continue;
    const fkField = resolveReferenceField(entity, rel, tenantProp, options);
    map.set(fkField, resolveConvexTableName(rel.target, options));
  }
  return map;
}

/**
 * Map FK column name → target Convex table for an entity's belongsTo/ref
 * relationships (convexId mode only; empty in stringId mode). Shared by the
 * schema generator (to retype FK-backing properties to `v.id`) and the functions
 * generator (to type create-mutation args / reference query args as `v.id`).
 */
export function collectFkTargets(
  entity: IREntity,
  ir: IR,
  options: NormalizedOptions,
): Map<string, string> {
  if (options.referenceMode !== 'convexId') return new Map();
  return collectReferenceFields(entity, ir, options);
}

/**
 * Resolve the system events-table name, guaranteed not to collide with any
 * persistent entity's table (a `defineSchema` key collision would silently
 * clobber the entity table). Deterministically suffixes `_` on collision.
 * Shared by the schema and functions generators so they always agree.
 */
export function resolveEventsTableName(ir: IR, options: NormalizedOptions): string {
  const taken = new Set<string>();
  for (const entity of ir.entities) {
    if (!isPersistentEntity(entity, ir)) continue;
    taken.add(resolveConvexTableName(entity.name, options));
  }
  let name = options.eventsTable;
  while (taken.has(name)) name += '_';
  return name;
}

// ============================================================================
// Enum emission
// ============================================================================

/** Enum value names (handles both string and `{ name }` IR forms). */
function enumValueNames(enumDef: IREnum): string[] {
  return enumDef.values.map((v) => (typeof v === 'string' ? v : v.name));
}

/** `v.union(v.literal("a"), v.literal("b"))`, or `v.literal("a")` for a single value. */
function enumValidatorMembers(enumDef: IREnum): string[] {
  return enumValueNames(enumDef).map((name) => `v.literal(${JSON.stringify(name)})`);
}

// ============================================================================
// Per-property field emission
// ============================================================================

interface FieldEmission {
  /** Field line body without indentation/trailing comma, e.g. `status: v.string()`. Null if unmappable. */
  line: string | null;
  diagnostics: ProjectionDiagnostic[];
}

/**
 * Build a validator expression for a property, applying enum/array/nullable
 * wrapping. Returns `undefined` (with a diagnostic) for unmappable types.
 */
export function buildValidator(
  entity: IREntity,
  prop: IRProperty,
  ir: IR,
  options: NormalizedOptions,
  fkTargetTable: string | undefined,
): { validator: string | undefined; diagnostics: ProjectionDiagnostic[] } {
  const diagnostics: ProjectionDiagnostic[] = [];

  // A property that backs a belongsTo/ref relationship is retyped as a typed
  // reference (convexId mode): the declared scalar (string/uuid) becomes
  // v.id("<targetTable>"), preserving the property's own optional/nullable.
  if (fkTargetTable) {
    const nullableRef = prop.type.nullable === true;
    const refValidator = nullableRef
      ? `v.union(v.id(${JSON.stringify(fkTargetTable)}), v.null())`
      : `v.id(${JSON.stringify(fkTargetTable)})`;
    return { validator: refValidator, diagnostics };
  }

  // array<T> / list<T> / T[] → v.array(<element>)
  const isArray =
    (prop.type.name === 'array' || prop.type.name === 'list') && !!prop.type.generic;
  const effectiveTypeName = isArray ? prop.type.generic!.name : prop.type.name;

  const typeOverrides = options.typeMappings[entity.name];
  const hasOverride =
    typeOverrides !== undefined && Object.prototype.hasOwnProperty.call(typeOverrides, prop.name);

  const enumDef = ir.enums?.find((e) => e.name === effectiveTypeName);

  let base: string | undefined;
  const nullable = prop.type.nullable === true;
  // Collect union members so enum + nullable compose into ONE flat union.
  const members: string[] = [];

  if (enumDef && !hasOverride) {
    members.push(...enumValidatorMembers(enumDef));
  } else {
    base = resolveConvexValidator(effectiveTypeName, typeOverrides, prop.name);
    if (!base) {
      if (effectiveTypeName === 'number' && !hasOverride) {
        diagnostics.push({
          severity: 'error',
          code: 'CONVEX_AMBIGUOUS_NUMBER',
          entity: entity.name,
          message:
            `Property '${entity.name}.${prop.name}' is typed 'number', which is ambiguous ` +
            `(Manifest does not distinguish integers from real numbers from money). Pick a precise ` +
            `type in the .manifest source: 'int'/'bigint' for counts and ids, 'float' for ` +
            `measurements where rounding is acceptable, 'money'/'decimal' for exact-decimal values. ` +
            `Or supply a 'typeMappings.${entity.name}.${prop.name}' override.`,
        });
      } else {
        diagnostics.push({
          severity: 'error',
          code: 'CONVEX_UNKNOWN_TYPE',
          entity: entity.name,
          message:
            `Property '${entity.name}.${prop.name}' has unknown type '${effectiveTypeName}' with no ` +
            `'typeMappings.${entity.name}.${prop.name}' override. Add a mapping or use a known type.`,
        });
      }
      return { validator: undefined, diagnostics };
    }
    members.push(base);
  }

  if (nullable) members.push('v.null()');

  let validator: string;
  if (members.length === 1) {
    validator = members[0];
  } else {
    validator = `v.union(${members.join(', ')})`;
  }

  if (isArray) validator = `v.array(${validator})`;

  return { validator, diagnostics };
}

function emitPropertyField(
  entity: IREntity,
  prop: IRProperty,
  ir: IR,
  options: NormalizedOptions,
  fkTargetTable: string | undefined,
): FieldEmission {
  const { validator, diagnostics } = buildValidator(entity, prop, ir, options, fkTargetTable);
  if (!validator) return { line: null, diagnostics };

  const required = prop.modifiers.includes('required');
  const wrapped = required ? validator : `v.optional(${validator})`;
  return { line: `${prop.name}: ${wrapped}`, diagnostics };
}

// ============================================================================
// Reference (FK) emission
// ============================================================================

/** Resolve the single non-tenant FK column for a belongsTo/ref relationship. */
function resolveReferenceField(
  entity: IREntity,
  rel: IRRelationship,
  tenantProp: string | undefined,
  options: NormalizedOptions,
): string {
  const override = options.references[entity.name]?.[rel.name];
  if (override) return override;
  const fields = rel.foreignKey?.fields ?? [];
  const nonTenant = fields.find((f) => f !== tenantProp);
  return nonTenant ?? `${rel.name}Id`;
}

// ============================================================================
// Index collection
// ============================================================================

export interface IndexDef {
  name: string;
  fields: string[];
}

interface SearchIndexDef {
  name: string;
  searchField: string;
  filterFields: string[];
}

export function indexEntryToDef(entry: IndexEntry): IndexDef {
  if (Array.isArray(entry)) {
    return { name: `by_${entry.join('_')}`, fields: entry };
  }
  return { name: entry.name ?? `by_${entry.fields.join('_')}`, fields: entry.fields };
}

// ============================================================================
// Per-entity table emission
// ============================================================================

interface TableEmission {
  block: string | null;
  diagnostics: ProjectionDiagnostic[];
}

function emitTable(entity: IREntity, ir: IR, options: NormalizedOptions): TableEmission {
  const diagnostics: ProjectionDiagnostic[] = [];
  const tableName = resolveConvexTableName(entity.name, options);
  const tenantProp = ir.tenant?.property;

  const fieldLines: string[] = [];
  const emittedFieldNames = new Set<string>();
  const indexes: IndexDef[] = [];
  const indexNames = new Set<string>();
  const searchIndexes: SearchIndexDef[] = [];
  const searchIndexNames = new Set<string>();

  const addIndex = (def: IndexDef): void => {
    if (indexNames.has(def.name)) return;
    indexNames.add(def.name);
    indexes.push(def);
  };

  const addSearchIndex = (def: SearchIndexDef): void => {
    if (searchIndexNames.has(def.name)) return;
    searchIndexNames.add(def.name);
    searchIndexes.push(def);
  };

  // Map FK column name → target table for belongsTo/ref relationships. In
  // convexId mode, a property whose name matches an FK column is retyped to a
  // v.id reference. Skipped entirely in stringId mode (properties keep scalars).
  const fkTargets = collectFkTargets(entity, ir, options);

  // Properties (skip computed structurally by only reading `properties`; skip
  // the IR `id` — Convex's document `_id` is identity).
  for (const prop of entity.properties) {
    if (prop.name === 'id') continue;
    const { line, diagnostics: d } = emitPropertyField(
      entity,
      prop,
      ir,
      options,
      fkTargets.get(prop.name),
    );
    diagnostics.push(...d);
    if (line) {
      fieldLines.push(line);
      emittedFieldNames.add(prop.name);
      if (prop.modifiers.includes('indexed')) {
        addIndex({ name: `by_${prop.name}`, fields: [prop.name] });
      }
      if (prop.modifiers.includes('searchable') && isConvexSearchIndexFieldType(prop.type.name)) {
        addSearchIndex({
          name: `search_${prop.name}`,
          searchField: prop.name,
          filterFields: [],
        });
      }
    }
  }

  // Tenant index (the tenant column is a regular property; index it for scoped reads).
  if (tenantProp && emittedFieldNames.has(tenantProp)) {
    addIndex({ name: `by_${tenantProp}`, fields: [tenantProp] });
    for (const si of searchIndexes) {
      if (!si.filterFields.includes(tenantProp)) {
        si.filterFields.push(tenantProp);
      }
    }
  }

  // References from belongsTo/ref relationships.
  for (const rel of entity.relationships) {
    if (rel.kind !== 'belongsTo' && rel.kind !== 'ref') continue;
    const fkField = resolveReferenceField(entity, rel, tenantProp, options);
    if (!emittedFieldNames.has(fkField)) {
      const targetTable = resolveConvexTableName(rel.target, options);
      const ref =
        options.referenceMode === 'stringId'
          ? 'v.string()'
          : `v.id(${JSON.stringify(targetTable)})`;
      fieldLines.push(`${fkField}: v.optional(${ref})`);
      emittedFieldNames.add(fkField);
    }
    addIndex({ name: `by_${fkField}`, fields: [fkField] });
    if (rel.onDelete || rel.onUpdate) {
      diagnostics.push({
        severity: 'info',
        code: 'CONVEX_REFERENTIAL_ACTION_DEFERRED',
        entity: entity.name,
        message:
          `Relationship '${entity.name}.${rel.name}' declares a referential action ` +
          `(onDelete/onUpdate). Convex has no schema-level cascade; this becomes cascade ` +
          `logic in the delete command (functions surface, Phase 2).`,
      });
    }
  }

  // Consumer-supplied composite/named indexes.
  for (const entry of options.indexes[entity.name] ?? []) {
    addIndex(indexEntryToDef(entry));
  }

  if (fieldLines.length === 0) {
    // A persistent entity with no emittable fields is unusual but not fatal;
    // Convex requires at least an empty object — emit it and warn.
    diagnostics.push({
      severity: 'warning',
      code: 'CONVEX_EMPTY_TABLE',
      entity: entity.name,
      message: `Entity '${entity.name}' produced no schema fields; emitting an empty table.`,
    });
  }

  const fieldsBlock = fieldLines.map((l) => `    ${l},`).join('\n');
  let block = `  ${tableName}: defineTable({\n${fieldsBlock}${fieldsBlock ? '\n' : ''}  })`;
  for (const idx of indexes) {
    const cols = idx.fields.map((f) => JSON.stringify(f)).join(', ');
    block += `\n    .index(${JSON.stringify(idx.name)}, [${cols}])`;
  }
  for (const si of searchIndexes) {
    const filterPart =
      si.filterFields.length > 0
        ? `, filterFields: [${si.filterFields.map((f) => JSON.stringify(f)).join(', ')}]`
        : '';
    block += `\n    .searchIndex(${JSON.stringify(si.name)}, { searchField: ${JSON.stringify(si.searchField)}${filterPart} })`;
  }
  return { block, diagnostics };
}

// ============================================================================
// Projection target
// ============================================================================

export class ConvexProjection implements ProjectionTarget {
  readonly name = 'convex';
  readonly description =
    'Convex schema projection (defineSchema/defineTable + convex/values validators, ' +
    'enum unions, v.id references, indexes).';
  readonly surfaces = SURFACES;
  readonly capabilities = CONVEX_PROJECTION_CAPABILITIES;
  readonly descriptorMeta = CONVEX_DESCRIPTOR_META;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    const optionsEarly = normalizeOptions(request.options);
    const crossCutting = [
      ...collectEncryptedDiagnostics(ir),
      ...collectUnsupportedDiagnostics(ir),
      ...collectConvexNamingPrecedenceDiagnostics(request.options, optionsEarly),
      ...collectConvexAuthConfigDiagnostics(ir, optionsEarly),
    ];

    if (request.surface === SURFACE_QUERIES) {
      const { code, diagnostics } = generateQueries(ir, request.options);
      return {
        artifacts: [
          { id: SURFACE_QUERIES, pathHint: 'convex/queries.ts', contentType: 'typescript', code },
        ],
        diagnostics: [...diagnostics, ...crossCutting],
      };
    }
    if (request.surface === SURFACE_MUTATIONS) {
      const { code, diagnostics } = generateMutations(ir, request.options);
      return {
        artifacts: [
          {
            id: SURFACE_MUTATIONS,
            pathHint: 'convex/mutations.ts',
            contentType: 'typescript',
            code,
          },
        ],
        diagnostics: [...diagnostics, ...crossCutting],
      };
    }
    if (request.surface === SURFACE_CRONS) {
      const { code, diagnostics } = generateCrons(ir, request.options);
      return {
        artifacts: [
          { id: SURFACE_CRONS, pathHint: 'convex/crons.ts', contentType: 'typescript', code },
        ],
        diagnostics: [...diagnostics, ...crossCutting],
      };
    }
    if (request.surface === SURFACE_HTTP) {
      const { code, diagnostics } = generateHttp(ir, request.options);
      return {
        artifacts: [
          { id: SURFACE_HTTP, pathHint: 'convex/http.ts', contentType: 'typescript', code },
        ],
        diagnostics: [...diagnostics, ...crossCutting],
      };
    }
    if (request.surface === SURFACE_SAGAS) {
      const { code, diagnostics } = generateSagas(ir, request.options);
      return {
        artifacts: [
          { id: SURFACE_SAGAS, pathHint: 'convex/sagas.ts', contentType: 'typescript', code },
        ],
        diagnostics: [...diagnostics, ...crossCutting],
      };
    }
    if (request.surface === SURFACE_COMPUTED) {
      const options = normalizeOptions(request.options);
      const { code, diagnostics } = generateComputedHelpers(ir, options);
      return {
        artifacts: [
          {
            id: SURFACE_COMPUTED,
            pathHint: 'convex/computed.ts',
            contentType: 'typescript',
            code,
          },
        ],
        diagnostics: [...diagnostics, ...crossCutting],
      };
    }
    if (request.surface === SURFACE_REACT) {
      const { code, diagnostics, pathHint } = generateReactClient(ir, request.options);
      return {
        artifacts: [
          {
            id: SURFACE_REACT,
            pathHint,
            contentType: 'typescript',
            code,
          },
        ],
        diagnostics: [...diagnostics, ...crossCutting],
      };
    }
    if (request.surface !== SURFACE_SCHEMA) {
      return {
        artifacts: [],
        diagnostics: [
          {
            severity: 'info',
            code: 'CONVEX_UNSUPPORTED_SURFACE',
            message: `Convex projection does not support surface '${request.surface}'. Supported: ${SURFACES.join(', ')}.`,
          },
          ...crossCutting,
        ],
      };
    }

    const options = normalizeOptions(request.options);
    const diagnostics: ProjectionDiagnostic[] = [...crossCutting];
    const blocks: string[] = [];

    for (const entity of ir.entities) {
      if ((entity as { external?: boolean }).external === true) continue;
      const store = ir.stores.find((s) => s.entity === entity.name);
      if (!store || !isPersistent(store.target)) continue;

      const { block, diagnostics: d } = emitTable(entity, ir, options);
      diagnostics.push(...d);
      if (block) blocks.push(block);
    }

    const entityBlockCount = blocks.length;

    if (options.emitEventsTable) {
      const t = resolveEventsTableName(ir, options);
      if (t !== options.eventsTable) {
        diagnostics.push({
          severity: 'warning',
          code: 'CONVEX_EVENTS_TABLE_COLLISION',
          message: `Events table '${options.eventsTable}' collides with an entity table; using '${t}'. Set the 'eventsTable' option to choose a non-colliding name.`,
        });
      }
      blocks.push(
        `  ${t}: defineTable({\n` +
          `    type: v.string(),\n` +
          `    entity: v.string(),\n` +
          `    entityId: v.string(),\n` +
          `    payload: v.any(),\n` +
          `    createdAt: v.number(),\n` +
          `  })\n` +
          `    .index("by_type", ["type"])\n` +
          `    .index("by_entity", ["entity"])\n` +
          `    .index("by_entityId", ["entityId"])`,
      );
    }

    // Idempotency table — auto-emitted when any webhook declares idempotencyHeader.
    // The generated convex/http.ts references this same table name for dedup storage.
    const hasIdempotencyWebhook = (ir.webhooks ?? []).some((w) => !!w.idempotencyHeader);
    if (hasIdempotencyWebhook) {
      const idemTbl = options.idempotencyTable;
      blocks.push(
        `  ${idemTbl}: defineTable({\n` +
          `    key: v.string(),\n` +
          `    webhookName: v.string(),\n` +
          `    seenAt: v.number(),\n` +
          `  })\n` +
          `    .index("by_key", ["key"])`,
      );
    }

    if (entityBlockCount === 0) {
      diagnostics.push({
        severity: 'warning',
        code: 'CONVEX_EMPTY_SCHEMA',
        message: 'No persistent entities found; emitted an empty Convex schema.',
      });
    }

    const code =
      `// GENERATED by the Manifest → Convex projection. DO NOT EDIT.\n` +
      `// ${blocks.length} table(s) from ${ir.entities.length} entit(y/ies).\n\n` +
      `import { defineSchema, defineTable } from "convex/server";\n` +
      `import { v } from "convex/values";\n\n` +
      `export default defineSchema({\n` +
      `${blocks.join(',\n')}${blocks.length ? ',\n' : ''}` +
      `});\n`;

    const artifact: ProjectionArtifact = {
      id: 'convex.schema',
      pathHint: options.output,
      contentType: 'typescript',
      code,
    };

    return { artifacts: [artifact], diagnostics };
  }
}
