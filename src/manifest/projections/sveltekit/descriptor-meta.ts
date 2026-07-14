import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import {
  aggregateSurface,
  commandSurface,
  entitySurface,
  optionalOption,
} from '../descriptor-helpers.js';

export const SVELTEKIT_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'SvelteKit',
  surfaces: [
    entitySurface('sveltekit.server'),
    entitySurface('sveltekit.load'),
    commandSurface('sveltekit.command'),
    aggregateSurface('sveltekit.types'),
    aggregateSurface('sveltekit.client'),
    aggregateSurface('sveltekit.companions'),
  ],
  options: [
    optionalOption('authProvider', 'enum', {
      enumValues: ['lucia', 'auth-js', 'custom', 'none'],
    }),
    optionalOption('authImportPath', 'string'),
    optionalOption('runtimeImportPath', 'string'),
    optionalOption('databaseImportPath', 'string'),
    optionalOption('routesDir', 'string'),
    optionalOption('emitCompanions', 'boolean', { default: true }),
  ],
  artifactCategories: ['routes', 'types', 'client', 'companions'],
  packageDependencies: ['@sveltejs/kit'],
  runtimeDependencies: [],
  compatibleCompanions: ['prisma', 'zod'],
  incompatibleWith: [],
  resolved: true,
};
