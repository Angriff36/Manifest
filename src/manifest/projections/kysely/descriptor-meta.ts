import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import { aggregateSurface } from '../descriptor-helpers.js';

export const KYSELY_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'Kysely',
  surfaces: [
    aggregateSurface('kysely.types'),
  ],
  options: [],
  artifactCategories: ["types"],
  packageDependencies: ['kysely'],
  runtimeDependencies: [],
  compatibleCompanions: [],
  incompatibleWith: [],
  resolved: true,
};
