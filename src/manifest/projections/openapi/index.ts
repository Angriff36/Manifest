/**
 * Public surface of the OpenAPI 3.1 projection module.
 *
 * Consumers:
 *   import { OpenApiProjection } from '@manifest/projection-openapi';
 *   const projection = new OpenApiProjection();
 *   const result = projection.generate(ir, { surface: 'openapi.spec', options: {...} });
 */

export { OpenApiProjection } from './generator.js';
export type { OpenApiProjectionOptions, OpenApiSecurityScheme } from './types.js';
