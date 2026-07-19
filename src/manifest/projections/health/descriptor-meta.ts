import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import { aggregateSurface } from '../descriptor-helpers.js';

export const HEALTH_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'Health Check',
  surfaces: [
    aggregateSurface('health.handler'),
    aggregateSurface('health.nextjs'),
    aggregateSurface('health.express'),
  ],
  options: [],
  artifactCategories: ['health'],
  packageDependencies: [],
  runtimeDependencies: [],
  compatibleCompanions: [],
  incompatibleWith: [],
  resolved: true,
};
