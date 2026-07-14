import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import {
  aggregateSurface,
  optionalCommandSurface,
  optionalEntitySurface,
  optionalOption,
} from '../descriptor-helpers.js';

export const ZOD_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'Zod',
  surfaces: [
    optionalEntitySurface('zod.entity'),
    optionalCommandSurface('zod.command'),
    aggregateSurface('zod.schemas'),
  ],
  options: [
    optionalOption('exportName', 'string'),
    optionalOption('includeComments', 'boolean'),
  ],
  artifactCategories: ['validation', 'schemas'],
  packageDependencies: ['zod'],
  runtimeDependencies: [],
  compatibleCompanions: ['convex'],
  incompatibleWith: [],
  resolved: true,
};
