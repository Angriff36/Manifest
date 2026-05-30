/**
 * Built-in projections for Manifest IR.
 *
 * This file statically imports and registers all bundled projections.
 * It provides a single registration point to prevent "silent failure theater."
 *
 * The registry calls this automatically on first access, so consumers
 * don't need to think about startup ordering.
 */

import type { ProjectionTarget } from './interface';
import { registerProjection } from './registry.js';
import { NextJsProjection } from './nextjs/generator.js';
import { RoutesProjection } from './routes/generator.js';
import { PrismaProjection } from './prisma/generator.js';
import { OpenApiProjection } from './openapi/generator.js';
import { ReactQueryProjection } from './react-query/generator.js';
import { ZodProjection } from './zod/generator.js';
import { DrizzleProjection } from './drizzle/generator.js';
import { GraphQLProjection } from './graphql/generator.js';
import { LlmContextProjection } from './llm-context/generator.js';
import { ExpressProjection } from './express/generator.js';
import { HonoProjection } from './hono/generator.js';
import { MermaidProjection } from './mermaid/generator.js';
import { JsonSchemaProjection } from './jsonschema/generator.js';

/**
 * Register all built-in projections.
 *
 * This function is called automatically by the registry's getProjection()
 * on first access. It can also be called explicitly for startup validation.
 *
 * IMPORTANT: Each new projection MUST be added here. This prevents the
 * "forgot to register" class of bug that leads to silent failures.
 */
export function registerBuiltinProjections(): void {
  // Next.js projection
  registerProjection(new NextJsProjection());

  // Canonical routes projection (route surface artifact)
  registerProjection(new RoutesProjection());

  // Prisma schema projection (composite PK/FK, referential actions, v1.0)
  registerProjection(new PrismaProjection());

  // OpenAPI 3.1.0 spec projection
  registerProjection(new OpenApiProjection());

  // TanStack Query (React Query) hooks projection
  registerProjection(new ReactQueryProjection());

  // Zod schema validation projection
  registerProjection(new ZodProjection());

  // Drizzle ORM schema projection (TypeScript-first, Drizzle Kit compatible)
  registerProjection(new DrizzleProjection());

  // GraphQL SDL + resolver stubs projection
  registerProjection(new GraphQLProjection());

  // LLM Context projection (manifest-context.json for AI agent consumption)
  registerProjection(new LlmContextProjection());

  // Express/Fastify route handler projection
  registerProjection(new ExpressProjection());

  // Hono edge-runtime route handler projection
  registerProjection(new HonoProjection());

  // Mermaid diagram projection (ER, state machine, sequence diagrams)
  registerProjection(new MermaidProjection());

  // JSON Schema projection (draft-07/2019-09/2020-12)
  registerProjection(new JsonSchemaProjection());

  // NOTE: When adding a new projection, add it to this list.
  // The registry will call this function automatically, so
  // consumers don't need to remember.
}

/**
 * List all built-in projection classes.
 *
 * Useful for documentation, testing, or introspection.
 *
 * @returns Array of built-in projection instances
 */
export function listBuiltinProjections(): ProjectionTarget[] {
  return [
    new NextJsProjection(),
    new RoutesProjection(),
    new PrismaProjection(),
    new OpenApiProjection(),
    new ReactQueryProjection(),
    new ZodProjection(),
    new DrizzleProjection(),
    new GraphQLProjection(),
    new LlmContextProjection(),
    new ExpressProjection(),
    new HonoProjection(),
    new MermaidProjection(),
    new JsonSchemaProjection(),
  ];
}
