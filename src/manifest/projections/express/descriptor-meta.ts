import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import {
  aggregateSurface,
  entitySurface,
} from '../descriptor-helpers.js';

export const EXPRESS_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'Express',
  surfaces: [
    aggregateSurface('express.router'),
    entitySurface('express.entity'),
    aggregateSurface('express.types'),
    aggregateSurface('express.companions'),
    aggregateSurface('express.webhooks'),
    aggregateSurface('express.all'),
  ],
  options: [],
  artifactCategories: ["routes","types","companions"],
  packageDependencies: ['express'],
  runtimeDependencies: [],
  compatibleCompanions: [],
  incompatibleWith: [],
  resolved: true,
};
