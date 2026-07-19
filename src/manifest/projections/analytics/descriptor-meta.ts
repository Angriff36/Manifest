import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import { aggregateSurface } from '../descriptor-helpers.js';

export const ANALYTICS_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'Analytics',
  surfaces: [
    aggregateSurface('analytics.tracking-plan'),
    aggregateSurface('analytics.events'),
    aggregateSurface('analytics.handlers'),
  ],
  options: [],
  artifactCategories: ['analytics'],
  packageDependencies: [],
  runtimeDependencies: [],
  compatibleCompanions: [],
  incompatibleWith: [],
  resolved: false,
};
