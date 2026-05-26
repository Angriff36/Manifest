/**
 * Configuration options for the Zod schema projection.
 */

export interface ZodProjectionOptions {
  /** Emit `export type X = z.infer<typeof XSchema>` for each schema (default: true) */
  emitTypes?: boolean;

  /** Emit `<Entity>ComputedSchema` extending base schemas with computed properties (default: true) */
  emitComputedSchemas?: boolean;

  /** Custom Zod import path (default: 'zod') */
  zodImportPath?: string;

  /** Emit header comment with generation metadata (default: true) */
  emitHeader?: boolean;
}
