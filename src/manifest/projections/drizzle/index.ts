/**
 * Public surface of the Drizzle projection.
 *
 * Consumers:
 *   import { DrizzleProjection } from '@manifest/projection-drizzle';
 *   const projection = new DrizzleProjection();
 *   const result = projection.generate(ir, { surface: 'drizzle.schema', options: {...} });
 */

export { DrizzleProjection } from './generator.js';
export {
  normalizeOptions,
  DRIZZLE_PROJECTION_DEFAULTS,
  type DrizzleProjectionOptions,
  type IndexEntry,
  type EntityName,
  type PropertyName,
  type ForeignKeyConfig,
} from './options.js';
export {
  DEFAULT_TYPE_MAPPING,
  resolveDrizzleColumnType,
  type DrizzleColumnType,
  type DrizzleDialect,
} from './type-mapping.js';
