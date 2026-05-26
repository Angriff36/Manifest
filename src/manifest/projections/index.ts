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
export { OpenApiProjection } from './openapi/generator.js';
export { ReactQueryProjection } from './react-query/generator.js';
export { ZodProjection } from './zod/generator.js';
export { DrizzleProjection } from './drizzle/generator.js';
export { registerBuiltinProjections, listBuiltinProjections } from './builtins.js';

export type { OpenApiProjectionOptions, OpenApiSecurityScheme } from './openapi/types.js';
export type { ReactQueryProjectionOptions } from './react-query/generator.js';
export type { ZodProjectionOptions } from './zod/types.js';
export type { DrizzleProjectionOptions } from './drizzle/options.js';

// Re-export route surface types
export type {
  RouteEntry,
  RouteManifest,
  RouteParam,
  RoutesProjectionOptions,
  ManualRouteDeclaration,
} from './routes/types.js';
