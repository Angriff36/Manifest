/**
 * Public surface of the GraphQL projection module.
 *
 * Consumers:
 *   import { GraphQLProjection } from '@manifest/projection-graphql';
 *   const projection = new GraphQLProjection();
 *   const result = projection.generate(ir, { surface: 'graphql.schema', options: {...} });
 */

export { GraphQLProjection } from './generator.js';
export type { GraphQLProjectionOptions } from './types.js';
