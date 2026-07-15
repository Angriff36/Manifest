import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import {
  aggregateSurface,
  entitySurface,
  optionalOption,
} from '../descriptor-helpers.js';

export const HONO_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'Hono',
  surfaces: [
    aggregateSurface('hono.router'),
    entitySurface('hono.entity'),
    aggregateSurface('hono.types'),
    aggregateSurface('hono.companions'),
    aggregateSurface('hono.webhooks'),
    aggregateSurface('hono.all'),
  ],
  options: [
    optionalOption('authProvider', 'enum', {
      enumValues: ['clerk', 'custom', 'none'],
      default: 'custom',
    }),
    optionalOption('authImportPath', 'string'),
    optionalOption('authMiddlewareName', 'string'),
    optionalOption('emitCompanions', 'boolean', { default: true }),
  ],
  artifactCategories: ["routes","types","companions"],
  packageDependencies: ['hono'],
  runtimeDependencies: [],
  compatibleCompanions: [],
  incompatibleWith: [],
  resolved: true,
};
