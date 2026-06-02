/**
 * Configuration surface for the Kysely projection.
 *
 * Every relational concept (table name, column name) is supplied here at
 * projection time. NONE of these enter Manifest core grammar or IR.
 * The projection translates IR + this options bag into a Kysely types artifact.
 */

/** Entity name as it appears in IR (`IREntity.name`). */
export type EntityName = string;
/** Property name as it appears in IR (`IRProperty.name`). */
export type PropertyName = string;

export interface KyselyProjectionOptions {
  /**
   * Kysely dialect. Controls which dialect import and factory function are emitted.
   * Default: 'postgresql'.
   */
  dialect?: 'postgresql' | 'mysql' | 'sqlite';

  /**
   * Per-entity table-name override.
   *   tableMappings: { Widget: "widgets" }
   * → emits `task: TaskTable;` mapped to table "widgets" in the Database interface.
   */
  tableMappings?: Record<EntityName, string>;

  /**
   * Per-entity, per-property column-name override.
   *   columnMappings: { Widget: { createdAt: "created_at" } }
   * → emits `createdAt: Date;` in the interface with a comment noting the actual column name.
   */
  columnMappings?: Record<EntityName, Record<PropertyName, string>>;

  /**
   * Per-entity, per-property type override. Bypasses the default
   * IR-`type.name` → Kysely-type mapping. The value is the *literal* TypeScript
   * type expression (e.g. `"string"`, `"number"`, `"Date"`, `"MyCustomType"`).
   */
  typeMappings?: Record<EntityName, Record<PropertyName, string>>;

  /**
   * Whether to emit a `createDb()` factory function in the output.
   * Default: true.
   */
  emitFactory?: boolean;

  /**
   * Name of the generated Database interface.
   * Default: 'DB'.
   */
  databaseInterfaceName?: string;

  /**
   * Name of the generated factory function.
   * Default: 'createDb'.
   */
  factoryFunctionName?: string;

  /**
   * Output path hint for the emitted artifact. Default: 'kysely.types.ts'.
   */
  output?: string;
}

export const KYSELY_PROJECTION_DEFAULTS: Required<Pick<KyselyProjectionOptions,
  'dialect' | 'emitFactory' | 'databaseInterfaceName' | 'factoryFunctionName' | 'output'
>> = {
  dialect: 'postgresql',
  emitFactory: true,
  databaseInterfaceName: 'DB',
  factoryFunctionName: 'createDb',
  output: 'kysely.types.ts',
} as const;

/**
 * Normalize a raw `request.options` bag into a fully-typed options object.
 */
export function normalizeOptions(raw: Record<string, unknown> | undefined): KyselyProjectionOptions {
  const input = (raw ?? {}) as Partial<KyselyProjectionOptions>;
  return {
    dialect: input.dialect ?? KYSELY_PROJECTION_DEFAULTS.dialect,
    tableMappings: input.tableMappings ?? {},
    columnMappings: input.columnMappings ?? {},
    typeMappings: input.typeMappings ?? {},
    emitFactory: input.emitFactory ?? KYSELY_PROJECTION_DEFAULTS.emitFactory,
    databaseInterfaceName: input.databaseInterfaceName ?? KYSELY_PROJECTION_DEFAULTS.databaseInterfaceName,
    factoryFunctionName: input.factoryFunctionName ?? KYSELY_PROJECTION_DEFAULTS.factoryFunctionName,
    output: input.output ?? KYSELY_PROJECTION_DEFAULTS.output,
  };
}
