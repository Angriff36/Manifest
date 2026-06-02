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
export { GraphQLProjection } from './graphql/generator.js';
export { LlmContextProjection } from './llm-context/generator.js';
export { ExpressProjection } from './express/generator.js';
export { HonoProjection } from './hono/generator.js';
export { MermaidProjection } from './mermaid/generator.js';
export { JsonSchemaProjection } from './jsonschema/generator.js';
export { StorybookProjection } from './storybook/generator.js';
export { HealthCheckProjection } from './health/generator.js';
export { PydanticProjection } from './pydantic/generator.js';
export { SvelteKitProjection } from './sveltekit/generator.js';
export { registerBuiltinProjections, listBuiltinProjections } from './builtins.js';

export type { OpenApiProjectionOptions, OpenApiSecurityScheme } from './openapi/types.js';
export type { ReactQueryProjectionOptions } from './react-query/generator.js';
export type { ZodProjectionOptions } from './zod/types.js';
export type { DrizzleProjectionOptions } from './drizzle/options.js';
export type { GraphQLProjectionOptions } from './graphql/types.js';
export type { LlmContextProjectionOptions } from './llm-context/types.js';
export type { ExpressProjectionOptions } from './express/types.js';
export type { HonoProjectionOptions } from './hono/types.js';
export type { MermaidProjectionOptions } from './mermaid/generator.js';
export type { JsonSchemaProjectionOptions } from './jsonschema/types.js';
export type { StorybookProjectionOptions } from './storybook/generator.js';
export type { HealthCheckProjectionOptions } from './health/types.js';
export type { PydanticProjectionOptions } from './pydantic/types.js';
export type { SvelteKitProjectionOptions } from './sveltekit/types.js';

// Re-export route surface types
export type {
  RouteEntry,
  RouteManifest,
  RouteParam,
  RoutesProjectionOptions,
  ManualRouteDeclaration,
} from './routes/types.js';
