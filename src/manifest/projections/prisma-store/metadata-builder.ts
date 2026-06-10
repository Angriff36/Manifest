import type { IR, IREntity, IRProperty } from '../../ir.js';
import type { ProjectionDiagnostic } from '../interface.js';
import { resolveColumnName, resolveTableName } from '../shared/naming.js';
import { resolvePrismaScalar } from '../prisma/type-mapping.js';
import type { PrismaStoreProjectionOptions } from './options.js';
import type { PrismaFieldMeta, PrismaModelMetadata } from '../../stores/prisma-generic/types.js';
import { collectDurableEntities } from './persistence.js';

function toLowerCamelCase(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function resolveAccessor(entityName: string, options: PrismaStoreProjectionOptions): string {
  const explicit = options.accessorNames?.[entityName];
  if (explicit) return explicit;
  if (options.naming) return resolveTableName(entityName, options.naming);
  return toLowerCamelCase(entityName);
}

function resolvePhysicalColumn(
  entityName: string,
  propName: string,
  options: PrismaStoreProjectionOptions,
): string {
  const override = options.columnMappings?.[entityName]?.[propName];
  if (override) return override;
  if (options.naming) return resolveColumnName(propName, options.naming);
  return propName;
}

function resolveSchemaName(entity: IREntity, options: PrismaStoreProjectionOptions): string | null {
  const ms = options.multiSchema;
  if (!ms?.enabled) return null;
  return ms.entitySchema?.[entity.name] ?? entity.module ?? ms.defaultSchema ?? 'public';
}

function enumNames(ir: IR): Set<string> {
  return new Set((ir.enums ?? []).map(e => e.name));
}

function fieldHasDefault(
  entity: IREntity,
  prop: IRProperty,
  options: PrismaStoreProjectionOptions,
): boolean {
  if (prop.defaultValue) return true;
  const fieldAttrs = options.fieldAttributes?.[entity.name]?.[prop.name];
  return fieldAttrs?.some(fa => /^@default\b/.test(fa)) ?? false;
}

function fieldIsUpdatedAt(entity: IREntity, prop: IRProperty, options: PrismaStoreProjectionOptions): boolean {
  const fieldAttrs = options.fieldAttributes?.[entity.name]?.[prop.name];
  return fieldAttrs?.some(fa => fa === '@updatedAt' || fa.startsWith('@updatedAt(')) ?? false;
}

function buildFieldMeta(
  entity: IREntity,
  prop: IRProperty,
  ir: IR,
  options: PrismaStoreProjectionOptions,
  pkFields: string[],
  diagnostics: ProjectionDiagnostic[],
): PrismaFieldMeta | null {
  const isArray = prop.type.name === 'array' && prop.type.generic;
  const effectiveTypeName = isArray ? prop.type.generic!.name : prop.type.name;
  const isValueObject = ir.values?.some(v => v.name === effectiveTypeName);
  const typeOverrides = isValueObject ? undefined : options.typeMappings?.[entity.name];
  const scalar = isValueObject ? 'Json' : resolvePrismaScalar(effectiveTypeName, typeOverrides, prop.name);

  if (!scalar) {
    diagnostics.push({
      severity: 'warning',
      code: 'PRISMA_STORE_UNMAPPABLE_FIELD',
      entity: entity.name,
      message:
        `Property '${entity.name}.${prop.name}' has unmappable IR type '${effectiveTypeName}'; ` +
        'skipped in store metadata. Add a typeMappings override or change the property type.',
    });
    return null;
  }

  const hasCompositeKey = Boolean(entity.key && entity.key.length > 0);
  const physicalName = resolvePhysicalColumn(entity.name, prop.name, options);
  const isPkColumn = pkFields.includes(physicalName);
  const isId = prop.name === 'id' && !hasCompositeKey;
  const isRequired = isId || prop.modifiers.includes('required') || isPkColumn;

  return {
    name: physicalName,
    irName: prop.name,
    type: scalar,
    isEnum: enumNames(ir).has(effectiveTypeName),
    isList: Boolean(isArray),
    optional: !isRequired,
    hasDefault: fieldHasDefault(entity, prop, options),
    isUpdatedAt: fieldIsUpdatedAt(entity, prop, options),
    isId,
  };
}

function resolvePkFields(entity: IREntity, options: PrismaStoreProjectionOptions): string[] {
  if (entity.key && entity.key.length > 0) {
    return entity.key.map(k =>
      resolvePhysicalColumn(entity.name, k, options),
    );
  }
  const idProp = entity.properties.find(p => p.name === 'id');
  if (idProp) {
    return [resolvePhysicalColumn(entity.name, 'id', options)];
  }
  return ['id'];
}

export function buildPrismaModelMetadata(
  ir: IR,
  options: PrismaStoreProjectionOptions,
): { metadata: PrismaModelMetadata; diagnostics: ProjectionDiagnostic[] } {
  const diagnostics: ProjectionDiagnostic[] = [];
  const metadata: PrismaModelMetadata = {};

  for (const entity of collectDurableEntities(ir)) {
    const pkFields = resolvePkFields(entity, options);
    const whereAccessor = pkFields.length > 1 ? pkFields.join('_') : pkFields[0];
    const tableOverride = options.tableMappings?.[entity.name];
    const dbName = tableOverride
      ?? (options.naming ? resolveTableName(entity.name, options.naming) : null);
    const dbNameDiffers = dbName !== null && dbName !== entity.name;

    const fields: PrismaFieldMeta[] = [];
    for (const prop of entity.properties) {
      const field = buildFieldMeta(entity, prop, ir, options, pkFields, diagnostics);
      if (field) fields.push(field);
    }

    const hasDeletedAt = fields.some(
      f => f.irName === 'deletedAt' || f.name === 'deletedAt' || f.name === 'deleted_at',
    );

    metadata[entity.name] = {
      accessor: resolveAccessor(entity.name, options),
      dbName: dbNameDiffers ? dbName : null,
      pgSchema: resolveSchemaName(entity, options),
      pkFields,
      whereAccessor,
      hasDeletedAt,
      ...(entity.versionProperty ? { versionProperty: entity.versionProperty } : {}),
      fields,
    };
  }

  return { metadata, diagnostics };
}

export function emitMetadataModule(metadata: PrismaModelMetadata): string {
  const header = [
    '// Auto-generated by @manifest/projection-prisma-store',
    '// DO NOT EDIT — regenerate with the prisma-store.metadata surface.',
    '',
    "import type { PrismaModelMetadata } from '@angriff36/manifest/stores/prisma-generic';",
    '',
  ].join('\n');

  const body = `export const PRISMA_MODEL_METADATA: PrismaModelMetadata = ${JSON.stringify(metadata, null, 2)};\n`;
  return header + body;
}

export function emitRegistryModule(
  entityNames: string[],
  options: PrismaStoreProjectionOptions,
): string {
  const storeImport = options.storeImportPath ?? '@angriff36/manifest/stores/prisma-generic';
  const metaImport = options.metadataImportPath ?? './prisma-model-metadata.generated.js';
  const namesJson = JSON.stringify(entityNames, null, 2);

  return [
    '// Auto-generated by @manifest/projection-prisma-store',
    '// DO NOT EDIT — regenerate with the prisma-store.registry surface.',
    '',
    "import type { EntityInstance, Store } from '@angriff36/manifest';",
    `import { GenericPrismaStore } from '${storeImport}';`,
    `import { PRISMA_MODEL_METADATA } from '${metaImport}';`,
    '',
    'export type PrismaClientLike = Record<string, unknown>;',
    '',
    `export const DURABLE_ENTITY_NAMES = ${namesJson} as const;`,
    '',
    'export function createGenericPrismaStore(',
    '  prisma: PrismaClientLike,',
    '  entityName: string,',
    '  tenantId: string,',
    '): Store<EntityInstance> {',
    '  return new GenericPrismaStore(prisma, entityName, tenantId, PRISMA_MODEL_METADATA);',
    '}',
    '',
    'export function createAllGenericPrismaStores(',
    '  prisma: PrismaClientLike,',
    '  tenantId: string,',
    '): Record<string, Store<EntityInstance>> {',
    '  const stores: Record<string, Store<EntityInstance>> = {};',
    '  for (const name of DURABLE_ENTITY_NAMES) {',
    '    stores[name] = createGenericPrismaStore(prisma, name, tenantId);',
    '  }',
    '  return stores;',
    '}',
    '',
  ].join('\n');
}
