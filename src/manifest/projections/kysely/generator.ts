/**
 * Kysely Type-Safe Query Builder projection.
 *
 * Consumes Manifest IR + projection config and emits a Kysely-compatible
 * TypeScript types file as a single `ProjectionArtifact`.
 *
 * Kysely (https://kysely.dev) is a type-safe SQL query builder for TypeScript.
 * Unlike Prisma or Drizzle, Kysely does NOT manage schema migrations or
 * generate DDL. Instead, it provides compile-time type safety by mapping
 * table names to row interfaces via a `Database` interface.
 *
 * This projection generates:
 *   1. A per-table TypeScript interface (e.g., `TaskTable`)
 *   2. A `Database` interface mapping table names to those interfaces
 *   3. A factory function for creating a configured `Kysely<Database>` instance
 *
 * Boundary rules (following Prisma/Drizzle projection conventions):
 *   - Relational interpretation starts HERE. No relational concept (table
 *     name, column name) lives in Manifest core grammar or IR — all of it
 *     arrives via projection options.
 *   - The projection carries NO knowledge of any specific application,
 *     database instance, tenant layout, table naming scheme, or domain
 *     meaning of any field.
 *   - `computed` properties are derived and MUST NEVER become columns.
 *   - `external: true` entities are skipped. Non-SQL store targets are skipped.
 *   - Unknown `type.name` produces a hard error diagnostic. No fallback.
 */

import type { IR, IREntity, IRProperty, IRStore } from '../../ir';
import type {
  ProjectionArtifact,
  ProjectionDiagnostic,
  ProjectionRequest,
  ProjectionResult,
  ProjectionTarget,
} from '../interface';

import { normalizeOptions, type KyselyProjectionOptions } from './options.js';
import { KYSELY_DESCRIPTOR_META } from './descriptor-meta.js';
import {
  resolveKyselyColumnType,
  dialectClassName,
  dialectConfigTypeName,
  type KyselyDialect,
} from './type-mapping.js';

// ============================================================================
// Surface identifiers
// ============================================================================

const SURFACE_TYPES = 'kysely.types' as const;
const SURFACES = [SURFACE_TYPES] as const;

// ============================================================================
// Store target classification
// ============================================================================

/**
 * Store targets the Kysely projection considers eligible for type emission.
 * Kysely works with SQL databases, so only SQL-compatible targets qualify.
 * 'durable' is the backend-neutral signal for "any SQL store".
 */
const KYSELY_COMPATIBLE_TARGETS: ReadonlySet<IRStore['target']> = new Set([
  'durable',
  'postgres',
  'supabase',
  'turso',
]);

function isKyselyCompatible(target: IRStore['target']): boolean {
  return KYSELY_COMPATIBLE_TARGETS.has(target);
}

// ============================================================================
// Per-property type emission
// ============================================================================

interface PropertyEmission {
  line: string | null;
  diagnostics: ProjectionDiagnostic[];
}

/**
 * Resolve the SQL/Kysely column name for an IR property (or FK field).
 * Explicit `columnMappings` win; otherwise the IR field name is used.
 */
function resolveColumnName(
  entityName: string,
  propertyName: string,
  options: KyselyProjectionOptions,
): string {
  return options.columnMappings?.[entityName]?.[propertyName] ?? propertyName;
}

/**
 * Format a column name as a TypeScript interface property key.
 * Valid identifiers stay bare; anything else is JSON-quoted.
 */
function formatColumnPropertyKey(columnName: string): string {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(columnName)) {
    return columnName;
  }
  return JSON.stringify(columnName);
}

/**
 * Emit a single Kysely column type line for an IR property.
 *
 * Example output:
 *   id: Generated<string>;
 *   name: string;
 *   qty: number | null;
 *   created_at: ColumnType<Date, Date | string | undefined, Date | string>;
 */
function emitPropertyColumn(
  entity: IREntity,
  prop: IRProperty,
  ir: IR,
  options: KyselyProjectionOptions,
): PropertyEmission {
  const diagnostics: ProjectionDiagnostic[] = [];

  const isArray = prop.type.name === 'array' && prop.type.generic;
  const effectiveTypeName = isArray ? prop.type.generic!.name : prop.type.name;

  const isValueObject = ir.values?.some((v) => v.name === effectiveTypeName);
  const typeOverrides = isValueObject ? undefined : options.typeMappings?.[entity.name];
  const hasOverride =
    typeOverrides !== undefined && Object.prototype.hasOwnProperty.call(typeOverrides, prop.name);

  const colType = isValueObject
    ? { tsType: 'unknown' }
    : resolveKyselyColumnType(effectiveTypeName, typeOverrides, prop.name);

  if (!colType) {
    if (effectiveTypeName === 'number' && !hasOverride) {
      diagnostics.push({
        severity: 'error',
        code: 'KYSELY_AMBIGUOUS_NUMBER',
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
      code: 'KYSELY_UNKNOWN_TYPE',
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
  // For array types, only the type's nullable flag controls array nullability.
  // For scalar types, both the type's nullable flag and the absence of 'required'
  // modifier contribute.
  const isNullable = isArray
    ? prop.type.nullable
    : prop.type.nullable || !prop.modifiers.includes('required');

  // Determine if this column should use Generated<T>
  // Generated<T> is used for columns with database-side defaults:
  // - id columns (auto-generated IDs)
  // - columns with defaultValue
  const useGenerated = isId || prop.defaultValue !== undefined;

  // Determine if this column should use ColumnType for select/insert/update transforms
  const useColumnType = colType.columnType === true;

  // Build the TypeScript type expression
  let tsExpr: string;
  if (useColumnType) {
    // ColumnType<SelectType, InsertType, UpdateType>
    // For Date columns, allow Date | string on insert/update
    tsExpr = `ColumnType<${colType.tsType}, ${colType.tsType} | string | undefined, ${colType.tsType} | string>`;
  } else if (useGenerated) {
    tsExpr = `Generated<${colType.tsType}>`;
  } else {
    tsExpr = colType.tsType;
  }

  // For array types, wrap in array before adding nullable marker
  if (isArray) {
    tsExpr = `${tsExpr}[]`;
  }

  // Add nullable marker (after array wrapping for correct precedence)
  if (isNullable && !useGenerated) {
    tsExpr = `${tsExpr} | null`;
  }

  const columnKey = formatColumnPropertyKey(resolveColumnName(entity.name, prop.name, options));
  return {
    line: `  ${columnKey}: ${tsExpr};`,
    diagnostics,
  };
}

// ============================================================================
// Per-entity table interface emission
// ============================================================================

interface TableInterfaceEmission {
  interfaceCode: string;
  tableName: string;
  diagnostics: ProjectionDiagnostic[];
}

function emitTableInterface(
  entity: IREntity,
  ir: IR,
  options: KyselyProjectionOptions,
): TableInterfaceEmission {
  const diagnostics: ProjectionDiagnostic[] = [];
  const columns: string[] = [];

  // Emit properties (never computedProperties)
  for (const prop of entity.properties) {
    const { line, diagnostics: propDiags } = emitPropertyColumn(entity, prop, ir, options);
    diagnostics.push(...propDiags);
    if (line !== null) columns.push(line);
  }

  // Emit FK columns from belongsTo/ref relationships
  for (const rel of entity.relationships) {
    if (rel.kind === 'belongsTo' || rel.kind === 'ref') {
      const fkField = rel.foreignKey?.fields?.[0] ?? `${rel.name}Id`;
      // Check if FK field is already declared as a property
      const fkAlreadyDeclared = entity.properties.some((p) => p.name === fkField);
      if (!fkAlreadyDeclared) {
        // Look up the target entity's id type
        const targetEntity = ir.entities.find((e) => e.name === rel.target);
        const targetIdProp = targetEntity?.properties.find((p) => p.name === 'id');
        const fkTsType = targetIdProp
          ? (resolveKyselyColumnType(targetIdProp.type.name, undefined, targetIdProp.name)
              ?.tsType ?? 'string')
          : 'string';

        const refNullable = targetIdProp?.type.nullable ?? false;
        const tsExpr = refNullable ? `${fkTsType} | null` : fkTsType;
        const columnKey = formatColumnPropertyKey(
          resolveColumnName(entity.name, fkField, options),
        );

        columns.push(`  ${columnKey}: ${tsExpr};`);
      }
    }
  }

  const tableName = options.tableMappings?.[entity.name] ?? entity.name.toLowerCase();
  const interfaceName = `${entity.name}Table`;

  let interfaceCode = `export interface ${interfaceName} {\n${columns.join('\n')}\n}`;
  // Add composite key comment
  const hasCompositeKey = entity.key && entity.key.length > 0;
  if (hasCompositeKey) {
    interfaceCode = `// Composite primary key: [${entity.key!.join(', ')}]\nexport interface ${interfaceName} {\n${columns.join('\n')}\n}`;
  }

  return { interfaceCode, tableName, diagnostics };
}

// ============================================================================
// Projection target
// ============================================================================

export class KyselyProjection implements ProjectionTarget {
  readonly name = 'kysely';
  readonly description =
    'Manifest IR → Kysely Type-Safe Query Builder types projection. Generates Database interface and per-table row types for Kysely query building.';
  readonly surfaces = SURFACES;
  readonly descriptorMeta = KYSELY_DESCRIPTOR_META;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    if (request.surface !== SURFACE_TYPES) {
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
    const dialect = (options.dialect ?? 'postgresql') as KyselyDialect;

    const storeByEntity = new Map<string, IRStore['target']>();
    for (const s of ir.stores) storeByEntity.set(s.entity, s.target);

    const toEmit: IREntity[] = [];
    const emittedEntities = new Set<string>();

    for (const entity of ir.entities) {
      if ((entity as IREntity & { external?: boolean }).external === true) {
        diagnostics.push({
          severity: 'info',
          code: 'KYSELY_SKIPPED_EXTERNAL',
          entity: entity.name,
          message: `Entity '${entity.name}' is marked external; skipped.`,
        });
        continue;
      }

      const target = storeByEntity.get(entity.name);
      if (target === undefined) {
        diagnostics.push({
          severity: 'info',
          code: 'KYSELY_SKIPPED_NO_STORE',
          entity: entity.name,
          message: `Entity '${entity.name}' has no 'store' declaration; skipped.`,
        });
        continue;
      }
      if (!isKyselyCompatible(target)) {
        diagnostics.push({
          severity: 'info',
          code: 'KYSELY_SKIPPED_INCOMPATIBLE',
          entity: entity.name,
          message: `Entity '${entity.name}' has store target '${target}' which is not SQL-compatible; skipped.`,
        });
        continue;
      }

      toEmit.push(entity);
      emittedEntities.add(entity.name);
    }

    // Emit per-table interfaces
    const tableInterfaces: string[] = [];
    const dbMappings: string[] = [];

    for (const entity of toEmit) {
      const {
        interfaceCode,
        tableName,
        diagnostics: tableDiags,
      } = emitTableInterface(entity, ir, options);
      diagnostics.push(...tableDiags);
      if (interfaceCode) {
        tableInterfaces.push(interfaceCode);
      }
      // Map table name → interface in the Database interface
      const propName = tableName; // e.g., "task", "user"
      const interfaceName = `${entity.name}Table`;
      dbMappings.push(`  ${propName}: ${interfaceName};`);
    }

    // Determine if we need Generated, ColumnType imports
    const needsGenerated = toEmit.some((entity) =>
      entity.properties.some((p) => p.name === 'id' || p.defaultValue !== undefined),
    );
    const needsColumnType = toEmit.some((entity) =>
      entity.properties.some((p) => {
        const effectiveTypeName =
          p.type.name === 'array' && p.type.generic ? p.type.generic.name : p.type.name;
        return (
          effectiveTypeName === 'date' ||
          effectiveTypeName === 'datetime' ||
          effectiveTypeName === 'timestamp'
        );
      }),
    );

    // Build the header
    const header: string[] = [
      '// Auto-generated by @manifest/projection-kysely',
      '// DO NOT EDIT — regenerate with the projection.',
      '',
    ];

    // Type-only imports
    const typeImports: string[] = [];
    if (needsGenerated) typeImports.push('Generated');
    if (needsColumnType) typeImports.push('ColumnType');
    if (typeImports.length > 0) {
      header.push(`import type { ${typeImports.join(', ')} } from 'kysely';`);
    }

    // Runtime imports for factory
    if (options.emitFactory && toEmit.length > 0) {
      const cls = dialectClassName(dialect);
      header.push(`import { Kysely, ${cls} } from 'kysely';`);
    }

    header.push('');

    const codeParts: string[] = [header.join('\n')];

    if (tableInterfaces.length > 0) {
      codeParts.push(
        '// ============================================================================',
      );
      codeParts.push('// Table interfaces');
      codeParts.push(
        '// ============================================================================',
      );
      codeParts.push('');
      codeParts.push(tableInterfaces.join('\n\n'));
      codeParts.push('');
    }

    // Database interface
    if (dbMappings.length > 0) {
      codeParts.push(
        '// ============================================================================',
      );
      codeParts.push('// Database interface');
      codeParts.push(
        '// ============================================================================',
      );
      codeParts.push('');
      codeParts.push(`export interface ${options.databaseInterfaceName} {`);
      codeParts.push(dbMappings.join('\n'));
      codeParts.push('}');
      codeParts.push('');
    }

    // Factory function
    if (options.emitFactory && toEmit.length > 0) {
      codeParts.push(
        '// ============================================================================',
      );
      codeParts.push('// Kysely instance factory');
      codeParts.push(
        '// ============================================================================',
      );
      codeParts.push('');
      const cls = dialectClassName(dialect);
      const configType = dialectConfigTypeName(dialect);
      codeParts.push(
        `export function ${options.factoryFunctionName}(config: ${configType}): Kysely<${options.databaseInterfaceName}> {`,
      );
      codeParts.push(`  return new Kysely<${options.databaseInterfaceName}>({`);
      codeParts.push(`    dialect: new ${cls}(config),`);
      codeParts.push(`  });`);
      codeParts.push(`}`);
    }

    const code = codeParts.join('\n');

    const artifacts: ProjectionArtifact[] = [
      {
        id: 'kysely.types',
        pathHint: options.output,
        contentType: 'typescript',
        code,
      },
    ];

    return { artifacts, diagnostics };
  }
}
