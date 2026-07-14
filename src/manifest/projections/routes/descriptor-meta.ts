import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import { aggregateSurface } from '../descriptor-helpers.js';

export const ROUTES_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'Routes',
  surfaces: [
    aggregateSurface('routes.manifest'),
    aggregateSurface('routes.ts'),
  ],
  options: [],
  artifactCategories: ["routes"],
  packageDependencies: [],
  runtimeDependencies: [],
  compatibleCompanions: [],
  incompatibleWith: [],
  resolved: true,
};
