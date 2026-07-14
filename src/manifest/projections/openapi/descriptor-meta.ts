import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import { aggregateSurface } from '../descriptor-helpers.js';

export const OPENAPI_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'OpenAPI',
  surfaces: [
    aggregateSurface('openapi.spec'),
  ],
  options: [],
  artifactCategories: ["openapi"],
  packageDependencies: [],
  runtimeDependencies: [],
  compatibleCompanions: [],
  incompatibleWith: [],
  resolved: true,
};
