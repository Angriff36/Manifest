/**
 * CLI-side projection registrations.
 *
 * The core package's built-in registry (src/manifest/projections/builtins.ts)
 * holds projections that ship inside `@angriff36/manifest`: nextjs and routes.
 * Projections that live in their own workspace packages — currently Prisma at
 * `@manifest/projection-prisma` — are registered HERE, at the CLI integration
 * layer, so the core package never has to take a dependency on them.
 *
 * The CLI is the integration point that knows about both worlds. Wiring
 * external projections here keeps the core package boundary intact (no Prisma
 * in core) and gives the CLI a single, idempotent registration point.
 *
 * Adding another out-of-core projection later:
 *   1. Add the workspace dep to packages/cli/package.json.
 *   2. Import its `ProjectionTarget` here.
 *   3. Register it in `registerCliExtraProjections()`.
 *   4. No core changes required.
 */

import {
  hasProjection,
  registerProjection,
} from '@angriff36/manifest/projections';
import { PrismaProjection } from '@manifest/projection-prisma';

let registered = false;

/**
 * Register the CLI's bundled extra projections. Idempotent — safe to call
 * from multiple entry points (CLI bootstrap, dispatch helper, tests). Uses
 * `hasProjection` to no-op if a name is already registered, because the core
 * registry's `registerProjection` throws on duplicate.
 */
export function registerCliExtraProjections(): void {
  if (registered) return;
  if (!hasProjection('prisma')) {
    registerProjection(new PrismaProjection());
  }
  registered = true;
}
