/**
 * Mongoose projection options.
 *
 * ALL relational concepts (collection names, field names, types) come from
 * projection options, NOT from IR. This keeps IR backend-neutral.
 */

export interface MongooseProjectionOptions {
  /** Per-entity collection name mapping. Key is IR entity name, value is MongoDB collection name. */
  collectionMappings?: Record<string, string>;
  /** Per-entity, per-property field name mapping. */
  fieldMappings?: Record<string, Record<string, string>>;
  /** Per-entity, per-property type override. Value is a Mongoose SchemaType string. */
  typeMappings?: Record<string, Record<string, string>>;
  /** Whether to include Mongoose validators derived from IR modifiers (default: true). */
  includeValidation?: boolean;
  /** Whether to add `{ timestamps: true }` schema option (default: false). */
  timestamps?: boolean;
  /** Suggested output path for the generated artifact (default: 'schema.ts'). */
  output?: string;
}

export interface NormalizedMongooseOptions {
  collectionMappings: Record<string, string>;
  fieldMappings: Record<string, Record<string, string>>;
  typeMappings: Record<string, Record<string, string>>;
  includeValidation: boolean;
  timestamps: boolean;
  output: string;
}

export function normalizeOptions(opts?: Record<string, unknown>): NormalizedMongooseOptions {
  const o = (opts ?? {}) as MongooseProjectionOptions;
  return {
    collectionMappings: o.collectionMappings ?? {},
    fieldMappings: o.fieldMappings ?? {},
    typeMappings: o.typeMappings ?? {},
    includeValidation: o.includeValidation ?? true,
    timestamps: o.timestamps ?? false,
    output: o.output ?? 'schema.ts',
  };
}
