import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import { aggregateSurface } from '../descriptor-helpers.js';

export const REACT_QUERY_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'React Query',
  surfaces: [
    aggregateSurface('react-query.hooks'),
    aggregateSurface('react-query.provider'),
  ],
  options: [],
  artifactCategories: ["hooks"],
  packageDependencies: ['@tanstack/react-query'],
  runtimeDependencies: [],
  compatibleCompanions: [],
  incompatibleWith: [],
  resolved: true,
};
