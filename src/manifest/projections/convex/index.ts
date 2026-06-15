/**
 * Convex projection — public entry point.
 *
 * Emits a `convex/schema.ts` artifact (`defineSchema`/`defineTable` +
 * `convex/values` validators) from Manifest IR.
 */
export { ConvexProjection } from './generator.js';
export {
  normalizeOptions,
  CONVEX_PROJECTION_DEFAULTS,
  CONVEX_DEFAULT_NAMING,
  type ConvexProjectionOptions,
  type IndexEntry,
  type ReferenceMode,
  type EntityName,
  type PropertyName,
} from './options.js';
export { DEFAULT_TYPE_MAPPING, resolveConvexValidator } from './type-mapping.js';
