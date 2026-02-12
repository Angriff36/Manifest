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

  // Future projections - ADD HERE:
  // import { HonoProjection } from './hono/generator';
  // registerProjection(new HonoProjection());
  //
  // import { ExpressProjection } from './express/generator';
  // registerProjection(new ExpressProjection());

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
    // Add new projections here as they're implemented
  ];
}
