import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import {
  aggregateSurface,
  entitySurface,
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
  options: [],
  artifactCategories: ["routes","types","companions"],
  packageDependencies: ['hono'],
  runtimeDependencies: [],
  compatibleCompanions: [],
  incompatibleWith: [],
  resolved: true,
};
