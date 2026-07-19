import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import { aggregateSurface } from '../descriptor-helpers.js';

export const PRISMA_STORE_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'Prisma Store',
  surfaces: [aggregateSurface('prisma-store.metadata'), aggregateSurface('prisma-store.registry')],
  options: [],
  artifactCategories: ['metadata', 'registry'],
  packageDependencies: [],
  runtimeDependencies: [],
  compatibleCompanions: [],
  incompatibleWith: [],
  resolved: true,
};
