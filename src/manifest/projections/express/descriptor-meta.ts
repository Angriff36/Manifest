import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import {
  aggregateSurface,
  entitySurface,
  optionalOption,
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
  options: [
    optionalOption('authProvider', 'enum', {
      enumValues: ['clerk', 'custom', 'none'],
      default: 'custom',
    }),
    optionalOption('authImportPath', 'string'),
    optionalOption('authMiddlewareName', 'string'),
    optionalOption('framework', 'enum', {
      enumValues: ['express', 'fastify'],
      default: 'express',
    }),
    optionalOption('emitCompanions', 'boolean', { default: true }),
  ],
  artifactCategories: ["routes","types","companions"],
  packageDependencies: ['express'],
  runtimeDependencies: [],
  compatibleCompanions: [],
  incompatibleWith: [],
  resolved: true,
};
