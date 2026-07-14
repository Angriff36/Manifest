import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import {
  aggregateSurface,
  optionalEntitySurface,
} from '../descriptor-helpers.js';

export const JSONSCHEMA_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'JSON Schema',
  surfaces: [
    optionalEntitySurface('jsonschema.entity'),
    aggregateSurface('jsonschema.schemas'),
  ],
  options: [],
  artifactCategories: ["schemas"],
  packageDependencies: [],
  runtimeDependencies: [],
  compatibleCompanions: [],
  incompatibleWith: [],
  resolved: true,
};
