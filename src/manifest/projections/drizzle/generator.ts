/**
 * Drizzle ORM schema projection.
 *
 * Consumes Manifest IR + projection config and emits Drizzle ORM TypeScript
 * table definitions as a single `ProjectionArtifact`.
 *
 * Boundary rules (following Prisma projection conventions):
 *   - Relational interpretation starts HERE. No relational concept (table
 *     name, column name, precision, indexes) lives in Manifest core grammar
 *     or IR — all of it arrives via projection options.
 *   - The projection carries NO knowledge of any specific application,
 *     database instance, tenant layout, table naming scheme, or domain
 *     meaning of any field.
 *   - `computed` properties are derived and MUST NEVER become columns.
 *   - `external: true` entities are skipped. Stores with target `'memory'`
 *     or `'localStorage'` are skipped.
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

import {
  normalizeOptions,
  type DrizzleProjectionOptions,
  type ForeignKeyConfig,
  type IndexEntry,
} from './options.js';
import { DRIZZLE_DESCRIPTOR_META } from './descriptor-meta.js';
import {
  resolveDrizzleColumnType,
  isNumericType,
  tableFunctionForDialect,
  importPathForDialect,
  DEFAULT_DECIMAL_PRECISION,
  DEFAULT_DECIMAL_SCALE,
  type DrizzleDialect,
} from './type-mapping.js';

// ============================================================================
// Surface identifiers
// ============================================================================

const SURFACE_SCHEMA = 'drizzle.schema' as const;
const SURFACES = [SURFACE_SCHEMA] as const;

// ============================================================================
// Store target classification
// ============================================================================

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

function literalToDrizzleDefault(value: IRValue): string | undefined {
  switch (value.kind) {
    case 'string':
      return `"${value.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    case 'number':
      return String(value.value);
    case 'boolean':
      return value.value ? 'true' : 'false';
    case 'null':
      return undefined;
    case 'array': {
      const elements = value.elements.map(literalToDrizzleDefault);
      if (elements.some((element) => element === undefined)) return undefined;
      return `[${elements.join(', ')}]`;
    }
    case 'object':
      return undefined;
  }
}

/**
 * Convert a Manifest RefAction value (camelCase) to a Drizzle referential action
 * string (lowercase, matching Drizzle's API: 'cascade', 'restrict', 'setNull', 'noAction', 'setDefault').
 */
function toDrizzleAction(action: string): string {
  // Drizzle uses camelCase for setNull, setDefault, noAction
  // which already matches Manifest's IR format, so just return as-is.
  return `'${action}'`;
}

// ============================================================================
// Per-property column emission
// ============================================================================

interface PropertyEmission {
  line: string | null;
  diagnostics: ProjectionDiagnostic[];
}

/**
 * Emit a single Drizzle column definition line for an IR property, or null if
 * the property is unmappable (with a diagnostic explaining why).
 *
 * Example output:
 *   id: uuid("id").primaryKey().defaultRandom()
 *   name: varchar("name", { length: 255 }).notNull()
 *   qty: integer("qty")
 */
function emitPropertyColumn(
  entity: IREntity,
  prop: IRProperty,
  ir: IR,
  options: DrizzleProjectionOptions,
  _dialect: DrizzleDialect,
): PropertyEmission {
  const diagnostics: ProjectionDiagnostic[] = [];

  const isArray = prop.type.name === 'array' && prop.type.generic;
  const effectiveTypeName = isArray ? prop.type.generic!.name : prop.type.name;

  const isValueObject = ir.values?.some((v) => v.name === effectiveTypeName);
  const typeOverrides = isValueObject ? undefined : options.typeMappings?.[entity.name];
  const hasOverride =
    typeOverrides !== undefined && Object.prototype.hasOwnProperty.call(typeOverrides, prop.name);

  const colType = isValueObject
    ? { builder: 'jsonb' }
    : resolveDrizzleColumnType(effectiveTypeName, typeOverrides, prop.name);

  if (!colType) {
    if (effectiveTypeName === 'number' && !hasOverride) {
      diagnostics.push({
        severity: 'error',
        code: 'DRIZZLE_AMBIGUOUS_NUMBER',
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
      code: 'DRIZZLE_UNKNOWN_TYPE',
      entity: entity.name,
      message:
        `Property '${entity.name}.${prop.name}' has IR type '${effectiveTypeName}' which is not in the default type mapping ` +
        `and no override was supplied in 'typeMappings.${entity.name}.${prop.name}'. ` +
        `Add an entry to typeMappings, or change the property type in the .manifest source.`,
    });
    return { line: null, diagnostics };
  }

  const hasCompositeKey = entity.key && entity.key.length > 0;
  const isId = prop.name === 'id' && !hasCompositeKey;
  const isRequired = isId || prop.modifiers.includes('required');
  const isUnique = prop.modifiers.includes('unique') && !isId;

  // Column name: use columnMappings override, else use property name
  const colName = options.columnMappings?.[entity.name]?.[prop.name] ?? prop.name;

  // Build the column builder call
  const builder = colType.builder;

  // Build params for the builder call
  const builderParams: string[] = [`"${colName}"`];

  // Type-specific parameters
  //
  // Precision-resolution order (highest to lowest priority):
  //   1. options.precision[entity][prop]  — explicit consumer override
  //   2. prop.type.params                — precision/scale compiled into IR
  //   3. Default numeric(12, 2)          — applied below for decimal scalars
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
  if (isNumericType({ builder }) || (prec && colType.builder === 'numeric')) {
    if (prec) {
      builderParams.push(`{ precision: ${prec.precision}, scale: ${prec.scale} }`);
    } else if (isNumericType({ builder })) {
      builderParams.push(
        `{ precision: ${DEFAULT_DECIMAL_PRECISION}, scale: ${DEFAULT_DECIMAL_SCALE} }`,
      );
    }
  } else if (colType.hasParams && colType.defaultParams && colType.builder === 'varchar') {
    builderParams.push(`{ length: ${colType.defaultParams} }`);
  } else if (colType.hasParams && colType.defaultParams?.includes('mode')) {
    // bigint mode param
    builderParams.push(colType.defaultParams);
  }

  // Array type: for PostgreSQL, Drizzle uses .array() modifier
  // e.g. varchar("tags", { length: 255 }).array()
  let columnExpr = `${builder}(${builderParams.join(', ')})`;

  // Chain modifiers
  const modifiers: string[] = [];

  // Primary key
  if (isId) {
    modifiers.push('.primaryKey()');
    // UUID primary key gets .defaultRandom()
    if (colType.builder === 'uuid' && !prop.defaultValue) {
      modifiers.push('.defaultRandom()');
    }
  }

  // Not null (required)
  if (isRequired && !isId) {
    modifiers.push('.notNull()');
  }

  // Unique (on column)
  if (isUnique) {
    modifiers.push('.unique()');
  }

  // Encrypted column annotation (informational — encryption is handled at runtime)
  const isEncrypted = prop.modifiers.includes('encrypted');
  if (isEncrypted) {
    diagnostics.push({
      severity: 'info',
      message: `Column '${prop.name}' is marked encrypted — values are envelope-encrypted at runtime.`,
    });
  }

  // Default value
  if (prop.defaultValue && !isId) {
    const def = literalToDrizzleDefault(prop.defaultValue);
    if (def !== undefined) {
      modifiers.push(`.default(${def})`);
    }
  }

  // Array modifier (applied after other modifiers except in specific cases)
  if (isArray) {
    modifiers.push('.array()');
  }

  columnExpr += modifiers.join('');

  const commentPrefix = isEncrypted ? `  // @encrypted — values stored as envelope JSON\n` : '';
  return {
    line: `${commentPrefix}  ${prop.name}: ${columnExpr},`,
    diagnostics,
  };
}

// ============================================================================
// Relationship emission
// ============================================================================

/**
 * Look up the Drizzle column type for a named property on the target entity.
 * Used to type FK columns so they match the referenced parent column.
 */
function targetPropDrizzleType(
  targetEntityName: string,
  targetPropName: string,
  ir: IR,
  options: DrizzleProjectionOptions,
): string {
  const target = ir.entities.find((e) => e.name === targetEntityName);
  if (!target) return 'varchar';
  const prop = target.properties.find((p) => p.name === targetPropName);
  if (!prop) return 'varchar';
  const overrides = options.typeMappings?.[targetEntityName];
  const colType = resolveDrizzleColumnType(prop.type.name, overrides, targetPropName);
  return colType?.builder ?? 'varchar';
}

/**
 * Find opposite-side relationships for cardinality detection.
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

interface RelationContext {
  emittedEntities: ReadonlySet<string>;
}

/**
 * Emit Drizzle column and relation lines for one IR relationship.
 */
function emitRelationship(
  entity: IREntity,
  rel: IRRelationship,
  ir: IR,
  options: DrizzleProjectionOptions,
  context: RelationContext,
): RelationEmission {
  const diagnostics: ProjectionDiagnostic[] = [];
  const lines: string[] = [];

  // Dangling target guard.
  if (!context.emittedEntities.has(rel.target)) {
    diagnostics.push({
      severity: 'warning',
      code: 'DRIZZLE_RELATION_TARGET_NOT_EMITTED',
      entity: entity.name,
      message:
        `Relationship '${entity.name}.${rel.name}' (${rel.kind} → ${rel.target}) targets an entity that is not emitted. ` +
        `${rel.target} may be external, have a non-persistent store, or have no store declaration.`,
    });
    return { lines, diagnostics };
  }

  // through → many-to-many via explicit join entity (Drizzle wires Join; target[] is runtime)
  if (rel.through) {
    return { lines, diagnostics };
  }

  // Ambiguity check
  const sameTargetCount = entity.relationships.filter((r) => r.target === rel.target).length;
  const opposites = findOppositeRelations(entity.name, rel, ir);
  if (sameTargetCount > 1 || opposites.length > 1) {
    diagnostics.push({
      severity: 'info',
      code: 'DRIZZLE_RELATION_AMBIGUOUS',
      entity: entity.name,
      message:
        `Relationship '${entity.name}.${rel.name}' → ${rel.target} is one of multiple relations between these entities. ` +
        `Consider using named relations to disambiguate.`,
    });
    return { lines, diagnostics };
  }

  const isOneToOne = opposites.some((o) => o.kind === 'hasOne');

  switch (rel.kind) {
    case 'hasMany':
    case 'hasOne': {
      // In Drizzle, the relation is declared via the `relations()` API.
      // For hasMany/hasOne, we emit a comment noting the relation is set up
      // on the belongsTo side. The actual relation definition is handled
      // in a separate relations export below.
      if (opposites.length === 0) {
        diagnostics.push({
          severity: 'warning',
          code: 'DRIZZLE_RELATION_MISSING_BACKSIDE',
          entity: entity.name,
          message:
            `Relationship '${entity.name}.${rel.name}: ${rel.target}' has no back-relation. ` +
            `Add a 'belongsTo' from ${rel.target} back to ${entity.name}.`,
        });
      }
      // hasMany/hasOne don't emit columns; the relation is defined via the Drizzle relations() API
      // which we handle separately after all tables are emitted.
      return { lines, diagnostics };
    }

    case 'belongsTo':
    case 'ref': {
      const configFkOverride = options.foreignKeys?.[entity.name]?.[rel.name];
      let fkFields: string[];
      let configRefs: string[] | undefined;

      if (configFkOverride !== undefined) {
        if (typeof configFkOverride === 'string') {
          fkFields = [configFkOverride];
        } else {
          const fkObj = configFkOverride as ForeignKeyConfig;
          fkFields = fkObj.fields;
          configRefs = fkObj.references;
        }
      } else {
        fkFields = rel.foreignKey?.fields ?? [`${rel.name}Id`];
      }

      const refsFields: string[] = configRefs ?? rel.foreignKey?.references ?? ['id'];
      const isComposite = fkFields.length > 1;

      // Emit FK column(s) if not already declared as entity properties
      for (let i = 0; i < fkFields.length; i++) {
        const fkField = fkFields[i];
        const refField = refsFields[i] ?? 'id';
        const fkAlreadyDeclared = entity.properties.some((p) => p.name === fkField);
        if (!fkAlreadyDeclared) {
          const fkBuilder = targetPropDrizzleType(rel.target, refField, ir, options);
          const colMap = options.columnMappings?.[entity.name]?.[fkField];
          const colName = colMap ?? fkField;
          let fkLine = `  ${fkField}: ${fkBuilder}("${colName}")`;
          if (isOneToOne && !isComposite) {
            fkLine += '.unique()';
          }
          fkLine += ',';
          lines.push(fkLine);
        }
      }

      if (opposites.length === 0) {
        diagnostics.push({
          severity: 'warning',
          code: 'DRIZZLE_RELATION_MISSING_BACKSIDE',
          entity: entity.name,
          message:
            `Relationship '${entity.name}.${rel.name}' (${rel.kind}) has no back-relation on ${rel.target}. ` +
            `Add 'hasMany' or 'hasOne' on ${rel.target} pointing back to ${entity.name}.`,
        });
      }

      return { lines, diagnostics };
    }
  }
}

// ============================================================================
// Per-entity table emission
// ============================================================================

interface TableEmission {
  /** The table export statement */
  tableCode: string;
  /** The relations export statement (if any relationships exist) */
  relationsCode: string | null;
  diagnostics: ProjectionDiagnostic[];
}

function emitTable(
  entity: IREntity,
  ir: IR,
  options: DrizzleProjectionOptions,
  context: RelationContext,
): TableEmission {
  const diagnostics: ProjectionDiagnostic[] = [];
  const dialect = (options.dialect ?? 'postgresql') as DrizzleDialect;
  const tableFn = tableFunctionForDialect(dialect);
  const columns: string[] = [];

  let sawIdProperty = false;

  // Iterate properties only — computedProperties are never columns
  for (const prop of entity.properties) {
    if (prop.name === 'id') sawIdProperty = true;
    const { line, diagnostics: propDiags } = emitPropertyColumn(entity, prop, ir, options, dialect);
    diagnostics.push(...propDiags);
    if (line !== null) columns.push(line);
  }

  const hasCompositeKey = entity.key && entity.key.length > 0;
  if (!sawIdProperty && !hasCompositeKey) {
    diagnostics.push({
      severity: 'error',
      code: 'DRIZZLE_NO_ID_PROPERTY',
      entity: entity.name,
      message:
        `Entity '${entity.name}' has no property named 'id' and no composite 'key' declaration. ` +
        `Drizzle requires every table to have a primary key. ` +
        `Add 'property required id: string' to the entity or declare 'key [field1, field2, ...]'.`,
    });
    return { tableCode: '', relationsCode: null, diagnostics };
  }

  // Collect FK column lines from relationships
  const fkColumns: string[] = [];
  for (const rel of entity.relationships) {
    const { lines, diagnostics: relDiags } = emitRelationship(entity, rel, ir, options, context);
    diagnostics.push(...relDiags);
    fkColumns.push(...lines);
  }

  // Table name: use tableMappings override, else use lowercase entity name
  const tableName = options.tableMappings?.[entity.name] ?? entity.name.toLowerCase();
  // Variable name: use tableMappings if present, else camelCase entity name
  const varName =
    options.tableMappings?.[entity.name] ??
    entity.name.charAt(0).toLowerCase() + entity.name.slice(1);

  // Build composite PK constraint
  const compositePkLine = hasCompositeKey ? `\n    ${entity.key!.map((k) => k).join(', ')}` : null;

  // Build unique constraints from alternateKeys
  const uniqueConstraints: string[] = [];
  if (entity.alternateKeys && entity.alternateKeys.length > 0) {
    for (const ak of entity.alternateKeys) {
      uniqueConstraints.push(ak.join(', '));
    }
  }

  // Build index definitions from options
  const indexDefinitions: string[] = [];
  const idx = options.indexes?.[entity.name];
  if (idx && idx.length > 0) {
    for (const entry of idx) {
      if (Array.isArray(entry)) {
        indexDefinitions.push(entry.join(', '));
      } else {
        indexDefinitions.push(entry.fields.join(', '));
      }
    }
  }

  // Combine all columns
  const allColumns = [...columns, ...fkColumns];

  // Build the table definition
  let tableBody = allColumns.join('\n');

  // Add composite PK
  if (compositePkLine) {
    tableBody += `\n  // Composite primary key`;
    tableBody += `\n  // pk: [${entity.key!.join(', ')}]`;
  }

  const tableCode = `export const ${varName} = ${tableFn}("${tableName}", {\n${tableBody}\n});`;

  // Build relations code if entity has relationships
  let relationsCode: string | null = null;
  if (entity.relationships.length > 0) {
    const relLines: string[] = [];
    for (const rel of entity.relationships) {
      if (!context.emittedEntities.has(rel.target)) continue;
      if (rel.through) continue;

      const sameTargetCount = entity.relationships.filter((r) => r.target === rel.target).length;
      if (sameTargetCount > 1) continue;

      const opposites = findOppositeRelations(entity.name, rel, ir);
      const isOneToOne = opposites.some((o) => o.kind === 'hasOne');

      // Determine FK fields
      const configFkOverride = options.foreignKeys?.[entity.name]?.[rel.name];
      let fkFields: string[];
      if (configFkOverride !== undefined) {
        if (typeof configFkOverride === 'string') {
          fkFields = [configFkOverride];
        } else {
          fkFields = (configFkOverride as ForeignKeyConfig).fields;
        }
      } else {
        fkFields = rel.foreignKey?.fields ?? [`${rel.name}Id`];
      }

      // Determine references
      let refsFields: string[];
      if (configFkOverride && typeof configFkOverride !== 'string') {
        refsFields = (configFkOverride as ForeignKeyConfig).references ?? ['id'];
      } else {
        refsFields = rel.foreignKey?.references ?? ['id'];
      }

      // Determine referential actions
      let onDelete: string | undefined;
      let onUpdate: string | undefined;
      if (configFkOverride && typeof configFkOverride !== 'string') {
        onDelete = (configFkOverride as ForeignKeyConfig).onDelete;
        onUpdate = (configFkOverride as ForeignKeyConfig).onUpdate;
      }
      if (!onDelete && rel.onDelete) onDelete = rel.onDelete;
      if (!onUpdate && rel.onUpdate) onUpdate = rel.onUpdate;

      const targetVarName =
        options.tableMappings?.[rel.target] ??
        rel.target.charAt(0).toLowerCase() + rel.target.slice(1);

      switch (rel.kind) {
        case 'hasMany':
          relLines.push(`  ${rel.name}: many(${targetVarName}),`);
          break;
        case 'hasOne':
          relLines.push(`  ${rel.name}: one(${targetVarName}),`);
          break;
        case 'belongsTo':
        case 'ref': {
          const relConfig: string[] = [];
          relConfig.push(`fields: [${fkFields.map((f) => `${varName}.${f}`).join(', ')}]`);
          relConfig.push(
            `references: [${refsFields.map((r) => `${targetVarName}.${r}`).join(', ')}]`,
          );
          if (onDelete) relConfig.push(`onDelete: ${toDrizzleAction(onDelete)}`);
          if (onUpdate) relConfig.push(`onUpdate: ${toDrizzleAction(onUpdate)}`);

          // In Drizzle, belongsTo uses one() with references
          if (isOneToOne) {
            relLines.push(`  ${rel.name}: one(${targetVarName}, { ${relConfig.join(', ')} }),`);
          } else {
            relLines.push(`  ${rel.name}: one(${targetVarName}, { ${relConfig.join(', ')} }),`);
          }
          break;
        }
      }
    }

    if (relLines.length > 0) {
      relationsCode = `export const ${varName}Relations = relations(${varName}, ({ one, many }) => ({\n${relLines.join('\n')}\n}));`;
    }
  }

  return { tableCode, relationsCode, diagnostics };
}

// ============================================================================
// Index emission
// ============================================================================

function emitIndexes(entity: IREntity, options: DrizzleProjectionOptions): string[] {
  const idx = options.indexes?.[entity.name];
  const varName =
    options.tableMappings?.[entity.name] ??
    entity.name.charAt(0).toLowerCase() + entity.name.slice(1);
  return [
    ...emitConfiguredIndexes(idx, varName),
    ...emitIndexedPropertyIndexes(entity, idx, varName),
    ...emitSearchableGinIndex(entity, options, varName),
  ];
}

function emitConfiguredIndexes(
  idx: IndexEntry[] | undefined,
  varName: string,
): string[] {
  if (!idx || idx.length === 0) return [];
  const lines: string[] = [];
  for (const entry of idx) {
    const fields = Array.isArray(entry) ? entry : entry.fields;
    const name =
      !Array.isArray(entry) && entry.name ? entry.name : `${varName}_${fields.join('_')}_idx`;
    lines.push(`export const ${name.replace(/[^a-zA-Z0-9_]/g, '_')} = index("${name}")`);
    lines.push(`  .on(${fields.map((f) => `${varName}.${f}`).join(', ')});`);
    lines.push(``);
  }
  return lines;
}

function emitIndexedPropertyIndexes(
  entity: IREntity,
  idx: IndexEntry[] | undefined,
  varName: string,
): string[] {
  const lines: string[] = [];
  const indexedProps = entity.properties.filter((p) => p.modifiers.includes('indexed'));
  for (const indexedProp of indexedProps) {
    const alreadyInOptions = (idx ?? []).some((entry) => {
      const fields = Array.isArray(entry) ? entry : entry.fields;
      return fields.includes(indexedProp.name);
    });
    if (alreadyInOptions) continue;
    const name = `${varName}_${indexedProp.name}_idx`;
    lines.push(`export const ${name} = index("${name}")`);
    lines.push(`  .on(${varName}.${indexedProp.name});`);
    lines.push(``);
  }
  return lines;
}

function emitSearchableGinIndex(
  entity: IREntity,
  options: DrizzleProjectionOptions,
  varName: string,
): string[] {
  const dialect = (options.dialect ?? 'postgresql') as DrizzleDialect;
  const searchableFields = entity.properties
    .filter((p) => p.modifiers.includes('searchable'))
    .map((p) => p.name);
  if (searchableFields.length === 0 || dialect !== 'postgresql') return [];
  const tsvectorParts = searchableFields.map((f) => `"${f}"`).join(` || ' ' || `);
  const idxName = `${varName}_search_idx`;
  return [
    `export const ${idxName} = index("${idxName}")`,
    `  .using("gin", sql\`to_tsvector('english', ${tsvectorParts})\`);`,
    ``,
  ];
}

// ============================================================================
// Projection target
// ============================================================================

export class DrizzleProjection implements ProjectionTarget {
  readonly name = 'drizzle';
  readonly description =
    'Manifest IR → Drizzle ORM schema projection. TypeScript-first, compatible with Drizzle Kit migrations.';
  readonly surfaces = SURFACES;
  readonly descriptorMeta = DRIZZLE_DESCRIPTOR_META;

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
    const dialect = (options.dialect ?? 'postgresql') as DrizzleDialect;

    const storeByEntity = new Map<string, IRStore['target']>();
    for (const s of ir.stores) storeByEntity.set(s.entity, s.target);

    const toEmit: IREntity[] = [];
    const emittedEntities = new Set<string>();

    for (const entity of ir.entities) {
      if ((entity as IREntity & { external?: boolean }).external === true) {
        diagnostics.push({
          severity: 'info',
          code: 'DRIZZLE_SKIPPED_EXTERNAL',
          entity: entity.name,
          message: `Entity '${entity.name}' is marked external; skipped.`,
        });
        continue;
      }

      const target = storeByEntity.get(entity.name);
      if (target === undefined) {
        diagnostics.push({
          severity: 'info',
          code: 'DRIZZLE_SKIPPED_NO_STORE',
          entity: entity.name,
          message: `Entity '${entity.name}' has no 'store' declaration; skipped.`,
        });
        continue;
      }
      if (!isPersistent(target)) {
        diagnostics.push({
          severity: 'info',
          code: 'DRIZZLE_SKIPPED_NON_DURABLE',
          entity: entity.name,
          message: `Entity '${entity.name}' has store target '${target}'; skipped.`,
        });
        continue;
      }

      toEmit.push(entity);
      emittedEntities.add(entity.name);
    }

    const context: RelationContext = { emittedEntities };

    // Emit tables
    const tableDefs: string[] = [];
    const relationDefs: string[] = [];
    const indexDefs: string[] = [];

    for (const entity of toEmit) {
      const {
        tableCode,
        relationsCode,
        diagnostics: tableDiags,
      } = emitTable(entity, ir, options, context);
      diagnostics.push(...tableDiags);
      if (tableCode) {
        tableDefs.push(tableCode);
      }
      if (relationsCode) {
        relationDefs.push(relationsCode);
      }
      // Emit indexes
      const entityIndexes = emitIndexes(entity, options);
      indexDefs.push(...entityIndexes);
    }

    // Build the final schema file
    const tableFn = tableFunctionForDialect(dialect);
    const importPath = importPathForDialect(dialect);

    // Determine which column types are used so we import only what's needed
    const usedTypes = new Set<string>();
    for (const entity of toEmit) {
      for (const prop of entity.properties) {
        const isArray = prop.type.name === 'array' && prop.type.generic;
        const effectiveTypeName = isArray ? prop.type.generic!.name : prop.type.name;
        const isValueObject = ir.values?.some((v) => v.name === effectiveTypeName);
        const overrides = isValueObject ? undefined : options.typeMappings?.[entity.name];
        const colType = isValueObject
          ? { builder: 'jsonb' }
          : resolveDrizzleColumnType(effectiveTypeName, overrides, prop.name);
        if (colType) usedTypes.add(colType.builder);
      }
    }

    const header = [
      '// Auto-generated by @manifest/projection-drizzle',
      '// DO NOT EDIT — regenerate with the projection.',
    ];

    // Only emit imports when there are tables to emit
    if (tableDefs.length > 0) {
      header.push('');
      header.push(`import { ${tableFn} } from '${importPath}';`);

      // Add type imports
      if (usedTypes.size > 0) {
        const types = Array.from(usedTypes).sort((a, b) => a.localeCompare(b)).join(', ');
        header.push(`import { ${types} } from '${importPath}';`);
      }
    }

    // Add relations import if any relations exist
    const hasRelations = relationDefs.length > 0;
    if (hasRelations) {
      header.push(`import { relations } from 'drizzle-orm';`);
    }

    // Add index import if any indexes exist
    if (indexDefs.length > 0) {
      header.push(`import { index } from '${importPath}';`);
    }

    header.push('');

    const codeParts: string[] = [header.join('\n')];

    if (tableDefs.length > 0) {
      codeParts.push(tableDefs.join('\n\n'));
    }

    if (hasRelations) {
      codeParts.push('');
      codeParts.push(relationDefs.join('\n\n'));
    }

    if (indexDefs.length > 0) {
      codeParts.push('');
      codeParts.push(indexDefs.join('\n'));
    }

    const code = codeParts.join('\n');

    const artifacts: ProjectionArtifact[] = [
      {
        id: 'drizzle.schema',
        pathHint: options.output,
        contentType: 'typescript',
        code,
      },
    ];

    return { artifacts, diagnostics };
  }
}
