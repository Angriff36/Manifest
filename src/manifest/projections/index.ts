/**
 * Projections module entry point.
 *
 * Projections consume IR and emit platform-specific code.
 * They are NOT part of runtime semantics.
 *
 * The registry auto-registers builtins on first access, so consumers
 * can simply call getProjection(name) without manual initialization.
 *
 * See docs/patterns/external-projections.md for detailed rationale.
 */

export * from './interface.js';
export * from './registry.js';

// Re-export built-in projections for convenience
export { NextJsProjection } from './nextjs/generator.js';
export { RoutesProjection } from './routes/generator.js';
export { PrismaProjection } from './prisma/generator.js';
export { registerBuiltinProjections, listBuiltinProjections } from './builtins.js';

// Re-export route surface types
export type {
  RouteEntry,
  RouteManifest,
  RouteParam,
  RoutesProjectionOptions,
  ManualRouteDeclaration,
} from './routes/types.js';

// Re-export Prisma projection types (folded into main package as of v0.9.2)
export type {
  PrismaProjectionOptions,
  PrismaProvider,
  IndexEntry as PrismaIndexEntry,
} from './prisma/options.js';
export { PRISMA_PROJECTION_DEFAULTS, normalizeOptions as normalizePrismaOptions } from './prisma/options.js';
export { DEFAULT_TYPE_MAPPING as PRISMA_DEFAULT_TYPE_MAPPING } from './prisma/type-mapping.js';
