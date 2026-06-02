/**
 * Configuration options for the Pydantic v2 projection.
 */

export interface PydanticProjectionOptions {
  /** Emit type annotations for BaseModel classes (default: true) */
  emitTypes?: boolean;

  /** Emit computed properties with @computed_field decorator (default: true) */
  emitComputedFields?: boolean;

  /** Custom pydantic import path (default: 'pydantic') */
  pydanticImportPath?: string;

  /** Emit datetime imports for date/datetime types (default: true) */
  emitDatetimeImports?: boolean;

  /** Emit typing imports for List/Dict/Optional (default: true) */
  emitTypingImports?: boolean;

  /** Emit UUID import for uuid types (default: true) */
  emitUuidImport?: boolean;

  /** Emit decimal import for decimal/money types (default: true) */
  emitDecimalImport?: boolean;

  /** Emit header comment with generation metadata (default: true) */
  emitHeader?: boolean;

  /** Use field() function for all properties (enables default values and aliases) (default: false) */
  useFieldFunction?: boolean;

  /** Emit JSON Schema export for each model (default: false) */
  emitJsonSchema?: boolean;

  /** Base URL for the generated client (default: 'http://localhost:3000') */
  clientBaseUrl?: string;

  /** Client class name (default: 'ManifestClient') */
  clientClassName?: boolean;

  /** Generate convenience functions alongside client class (default: true) */
  emitConvenienceFunctions?: boolean;
}
