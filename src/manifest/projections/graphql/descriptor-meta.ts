import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import { aggregateSurface } from '../descriptor-helpers.js';

export const GRAPHQL_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'GraphQL',
  surfaces: [
    aggregateSurface('graphql.schema'),
    aggregateSurface('graphql.resolvers'),
  ],
  options: [],
  artifactCategories: ["schema","resolvers"],
  packageDependencies: [],
  runtimeDependencies: [],
  compatibleCompanions: [],
  incompatibleWith: [],
  resolved: true,
};
