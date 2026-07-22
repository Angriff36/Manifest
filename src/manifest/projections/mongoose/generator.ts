/**
 * Mongoose schema projection.
 *
 * Emits TypeScript Mongoose model/schema definitions from Manifest IR.
 * Only entities with `store … in mongodb` are emitted.
 */

import type { IR, IREntity, IRProperty, IRStore } from '../../ir';
import type {
  ProjectionArtifact,
  ProjectionDiagnostic,
  ProjectionRequest,
  ProjectionResult,
  ProjectionTarget,
} from '../interface';

import { MONGOOSE_DESCRIPTOR_META } from './descriptor-meta.js';
import { normalizeOptions, type NormalizedMongooseOptions } from './options.js';
import { resolveMongooseType } from './type-mapping.js';

const SURFACE_SCHEMA = 'mongoose.schema' as const;
const SURFACES = [SURFACE_SCHEMA] as const;

const MONGOOSE_COMPATIBLE_TARGETS: ReadonlySet<IRStore['target']> = new Set(['mongodb']);

interface FieldEmission {
  line: string | null;
  diagnostics: ProjectionDiagnostic[];
}

function resolveFieldName(
  entityName: string,
  propertyName: string,
  options: NormalizedMongooseOptions,
): string {
  return options.fieldMappings[entityName]?.[propertyName] ?? propertyName;
}

function formatFieldKey(fieldName: string): string {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(fieldName)) {
    return fieldName;
  }
  return JSON.stringify(fieldName);
}

function emitPropertyField(
  entity: IREntity,
  prop: IRProperty,
  ir: IR,
  options: NormalizedMongooseOptions,
): FieldEmission {
  const diagnostics: ProjectionDiagnostic[] = [];
  const isArray = prop.type.name === 'array' && prop.type.generic;
  const effectiveTypeName = isArray ? prop.type.generic!.name : prop.type.name;
  const isValueObject = ir.values?.some((v) => v.name === effectiveTypeName);
  const typeOverrides = isValueObject ? undefined : options.typeMappings[entity.name];
  const hasOverride =
    typeOverrides !== undefined && Object.prototype.hasOwnProperty.call(typeOverrides, prop.name);

  const resolved = isValueObject
    ? { schemaType: 'Schema.Types.Mixed' }
    : resolveMongooseType(effectiveTypeName, typeOverrides, prop.name);

  if (!resolved) {
    if (effectiveTypeName === 'number' && !hasOverride) {
      diagnostics.push({
        severity: 'error',
        code: 'MONGOOSE_AMBIGUOUS_NUMBER',
        entity: entity.name,
        message:
          `Property '${entity.name}.${prop.name}' is typed 'number', which is ambiguous. ` +
          `Use 'int', 'bigint', 'float', 'money', or 'decimal', or supply ` +
          `'typeMappings.${entity.name}.${prop.name}'.`,
      });
      return { line: null, diagnostics };
    }
    diagnostics.push({
      severity: 'error',
      code: 'MONGOOSE_UNKNOWN_TYPE',
      entity: entity.name,
      message:
        `Property '${entity.name}.${prop.name}' has IR type '${effectiveTypeName}' with no ` +
        `default Mongoose mapping and no typeMappings override.`,
    });
    return { line: null, diagnostics };
  }

  const isRequired = prop.modifiers.includes('required') || prop.name === 'id';
  const isUnique = prop.modifiers.includes('unique');
  const parts: string[] = [`type: ${resolved.schemaType}`];
  if (options.includeValidation && isRequired) {
    parts.push('required: true');
  }
  if (options.includeValidation && isUnique) {
    parts.push('unique: true');
  }

  let fieldExpr = `{ ${parts.join(', ')} }`;
  if (isArray) {
    fieldExpr = `[${fieldExpr}]`;
  }

  const fieldKey = formatFieldKey(resolveFieldName(entity.name, prop.name, options));
  return { line: `    ${fieldKey}: ${fieldExpr},`, diagnostics };
}

function emitEntitySchema(
  entity: IREntity,
  ir: IR,
  options: NormalizedMongooseOptions,
): { code: string; diagnostics: ProjectionDiagnostic[] } {
  const diagnostics: ProjectionDiagnostic[] = [];
  const fields: string[] = [];

  for (const prop of entity.properties) {
    const { line, diagnostics: fieldDiags } = emitPropertyField(entity, prop, ir, options);
    diagnostics.push(...fieldDiags);
    if (line !== null) fields.push(line);
  }

  for (const rel of entity.relationships) {
    if (rel.kind !== 'belongsTo' && rel.kind !== 'ref') continue;
    const fkField = rel.foreignKey?.fields?.[0] ?? `${rel.name}Id`;
    if (entity.properties.some((p) => p.name === fkField)) continue;
    const fieldKey = formatFieldKey(resolveFieldName(entity.name, fkField, options));
    fields.push(`    ${fieldKey}: { type: Schema.Types.ObjectId, ref: '${rel.target}' },`);
  }

  const collection = options.collectionMappings[entity.name] ?? entity.name.toLowerCase();
  const schemaOpts = options.timestamps ? ', { timestamps: true }' : '';
  const code = [
    `export const ${entity.name}Schema = new Schema({`,
    fields.join('\n'),
    `}${schemaOpts});`,
    '',
    `export const ${entity.name}Model = model('${entity.name}', ${entity.name}Schema, '${collection}');`,
  ].join('\n');

  return { code, diagnostics };
}

export class MongooseProjection implements ProjectionTarget {
  readonly name = 'mongoose';
  readonly description =
    'Manifest IR → Mongoose schema/model projection for MongoDB-backed entities.';
  readonly surfaces = SURFACES;
  readonly descriptorMeta = MONGOOSE_DESCRIPTOR_META;

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
    for (const store of ir.stores) storeByEntity.set(store.entity, store.target);

    const schemas: string[] = [];
    for (const entity of ir.entities) {
      if ((entity as IREntity & { external?: boolean }).external === true) {
        diagnostics.push({
          severity: 'info',
          code: 'MONGOOSE_SKIPPED_EXTERNAL',
          entity: entity.name,
          message: `Entity '${entity.name}' is marked external; skipped.`,
        });
        continue;
      }

      const target = storeByEntity.get(entity.name);
      if (target === undefined) {
        diagnostics.push({
          severity: 'info',
          code: 'MONGOOSE_SKIPPED_NO_STORE',
          entity: entity.name,
          message: `Entity '${entity.name}' has no store declaration; skipped.`,
        });
        continue;
      }
      if (!MONGOOSE_COMPATIBLE_TARGETS.has(target)) {
        diagnostics.push({
          severity: 'info',
          code: 'MONGOOSE_SKIPPED_INCOMPATIBLE',
          entity: entity.name,
          message: `Entity '${entity.name}' has store target '${target}' (mongoose emits mongodb only); skipped.`,
        });
        continue;
      }

      // Never emit computed properties as persisted fields
      const { code, diagnostics: entityDiags } = emitEntitySchema(entity, ir, options);
      diagnostics.push(...entityDiags);
      schemas.push(code);
    }

    const header = [
      '// Auto-generated by @manifest/projection-mongoose',
      '// DO NOT EDIT — regenerate with the projection.',
      '',
      "import { Schema, model } from 'mongoose';",
      '',
    ].join('\n');

    const artifacts: ProjectionArtifact[] = [
      {
        id: 'mongoose.schema',
        pathHint: options.output,
        contentType: 'typescript',
        code: header + (schemas.length > 0 ? schemas.join('\n\n') + '\n' : ''),
      },
    ];

    return { artifacts, diagnostics };
  }
}
