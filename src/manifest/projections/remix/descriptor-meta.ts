import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import {
  aggregateSurface,
  commandSurface,
  entitySurface,
  optionalOption,
} from '../descriptor-helpers.js';

export const REMIX_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'Remix',
  surfaces: [
    entitySurface('remix.list'),
    entitySurface('remix.detail'),
    commandSurface('remix.command'),
    aggregateSurface('remix.types'),
    aggregateSurface('remix.client'),
    aggregateSurface('remix.companions'),
  ],
  options: [
    optionalOption('authProvider', 'enum', {
      enumValues: ['clerk', 'remix-auth', 'custom', 'none'],
    }),
    optionalOption('authImportPath', 'string'),
    optionalOption('databaseImportPath', 'string'),
    optionalOption('runtimeImportPath', 'string'),
    optionalOption('routesDir', 'string'),
    optionalOption('emitCompanions', 'boolean', { default: true }),
    optionalOption('remixVersion', 'enum', { enumValues: ['v2', 'v7'] }),
  ],
  artifactCategories: ['routes', 'types', 'client', 'companions'],
  packageDependencies: ['@remix-run/node', '@remix-run/react'],
  runtimeDependencies: [],
  compatibleCompanions: ['prisma', 'zod'],
  incompatibleWith: [],
  resolved: true,
};
