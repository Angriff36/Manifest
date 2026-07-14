import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import { aggregateSurface } from '../descriptor-helpers.js';

export const PYDANTIC_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'Pydantic',
  surfaces: [
    aggregateSurface('pydantic.entity'),
    aggregateSurface('pydantic.command'),
    aggregateSurface('pydantic.models'),
    aggregateSurface('pydantic.client'),
  ],
  options: [],
  artifactCategories: ["models","client"],
  packageDependencies: [],
  runtimeDependencies: [],
  compatibleCompanions: [],
  incompatibleWith: [],
  resolved: false,
};
