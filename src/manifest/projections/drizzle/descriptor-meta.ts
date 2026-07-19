import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import { aggregateSurface } from '../descriptor-helpers.js';

export const DRIZZLE_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'Drizzle',
  surfaces: [aggregateSurface('drizzle.schema')],
  options: [],
  artifactCategories: ['schema'],
  packageDependencies: ['drizzle-orm'],
  runtimeDependencies: [],
  compatibleCompanions: [],
  incompatibleWith: [],
  resolved: true,
};
