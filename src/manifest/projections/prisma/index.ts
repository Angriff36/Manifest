/**
 * Public surface of the @manifest/projection-prisma package.
 *
 * Consumers:
 *   import { PrismaProjection } from '@manifest/projection-prisma';
 *   const projection = new PrismaProjection();
 *   const result = projection.generate(ir, { surface: 'prisma.schema', options: {...} });
 */

export { PrismaProjection } from './generator.js';
export {
  normalizeOptions,
  PRISMA_PROJECTION_DEFAULTS,
  type PrismaProjectionOptions,
  type PrismaProvider,
  type IndexEntry,
  type EntityName,
  type PropertyName,
} from './options.js';
export {
  DEFAULT_TYPE_MAPPING,
  resolvePrismaScalar,
} from './type-mapping.js';
