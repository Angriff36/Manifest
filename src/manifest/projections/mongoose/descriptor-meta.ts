import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import { aggregateSurface } from '../descriptor-helpers.js';

export const MONGOOSE_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'Mongoose',
  surfaces: [aggregateSurface('mongoose.schema')],
  options: [],
  artifactCategories: ['schema'],
  packageDependencies: ['mongoose'],
  runtimeDependencies: [],
  compatibleCompanions: [],
  incompatibleWith: [],
  resolved: true,
};
