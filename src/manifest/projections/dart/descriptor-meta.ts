import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import { aggregateSurface } from '../descriptor-helpers.js';

export const DART_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'Dart',
  surfaces: [
    aggregateSurface('dart.entity'),
    aggregateSurface('dart.command'),
    aggregateSurface('dart.models'),
    aggregateSurface('dart.client'),
    aggregateSurface('dart.providers'),
    aggregateSurface('dart.package'),
  ],
  options: [],
  artifactCategories: ['models', 'client'],
  packageDependencies: [],
  runtimeDependencies: [],
  compatibleCompanions: [],
  incompatibleWith: [],
  resolved: false,
};
