import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import { aggregateSurface } from '../descriptor-helpers.js';

export const PRISMA_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'Prisma',
  surfaces: [
    aggregateSurface('prisma.schema'),
  ],
  options: [],
  artifactCategories: ["schema"],
  packageDependencies: ['@prisma/client'],
  runtimeDependencies: [],
  compatibleCompanions: [],
  incompatibleWith: [],
  resolved: true,
};
