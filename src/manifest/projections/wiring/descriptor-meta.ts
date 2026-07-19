import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import { aggregateSurface } from '../descriptor-helpers.js';

export const WIRING_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'Wiring',
  surfaces: [
    aggregateSurface('wiring.contract'),
    aggregateSurface('wiring.bindings'),
    aggregateSurface('wiring.all'),
  ],
  options: [],
  artifactCategories: ['contract', 'bindings'],
  packageDependencies: [],
  runtimeDependencies: [],
  compatibleCompanions: [],
  incompatibleWith: [],
  resolved: true,
};
