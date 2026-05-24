/**
 * Generic projection dispatch.
 *
 * Looks up a projection by name via the core registry and invokes it.
 * No name special-casing — adding a new projection means registering it
 * (see ./register-extras.ts), not editing this file.
 *
 * Why a separate module: the CLI's `generate` command has historical
 * nextjs-specific orchestration (multi-surface fan-out, flag overlays).
 * That orchestration stays in commands/generate.ts. Everything else
 * (single-call projections like Prisma, plus any future ones) goes
 * through this generic path. Keeping the generic logic in its own
 * file makes the test surface small and keeps generate.ts focused on
 * the nextjs ergonomics it already owns.
 */

import type { IR } from '@angriff36/manifest/ir';
import {
  getProjection,
  listProjections,
  type ProjectionResult,
  type ProjectionTarget,
} from '@angriff36/manifest/projections';

import { registerCliExtraProjections } from './register-extras.js';

export interface DispatchRequest {
  /** IR loaded from disk (or constructed in tests). */
  ir: IR;
  /** Registered projection name, e.g. 'prisma', 'nextjs', 'routes'. */
  projectionName: string;
  /**
   * Projection-specific surface identifier (e.g. 'prisma.schema').
   * When omitted, defaults to the projection's first declared surface.
   */
  surface?: string;
  /** Projection-specific options (`projections.<name>.options` from config). */
  options?: Record<string, unknown>;
  /** Optional entity name when the surface is entity-scoped. */
  entity?: string;
  /** Optional command name when the surface is command-scoped. */
  command?: string;
}

/**
 * Resolve a projection by name. Triggers the lazy CLI-extras registration
 * first so projections shipped from workspace packages (Prisma today) are
 * discoverable on every lookup.
 *
 * Throws on lookup miss with the list of registered names — the failure
 * message tells the operator exactly what they can run instead of just
 * "not found".
 */
export function resolveProjection(name: string): ProjectionTarget {
  registerCliExtraProjections();
  const projection = getProjection(name);
  if (!projection) {
    const available = listProjections().map((p) => p.name).sort().join(', ') || '(none)';
    throw new Error(
      `Unknown projection: '${name}'. Registered projections: ${available}. ` +
      `Verify the --projection flag, or check that the projection's package is installed.`,
    );
  }
  return projection;
}

/**
 * Run a single projection surface and return its ProjectionResult.
 *
 * Generic by design: this function does NOT know which projection it is
 * calling. It looks the projection up by name, picks a default surface if
 * none was supplied, and hands the request off. The projection is the
 * source of truth for its own surfaces and options shape.
 */
export function dispatch(request: DispatchRequest): ProjectionResult {
  const projection = resolveProjection(request.projectionName);

  const surface = request.surface ?? projection.surfaces[0];
  if (!surface) {
    throw new Error(
      `Projection '${request.projectionName}' declares no surfaces; nothing to generate.`,
    );
  }

  return projection.generate(request.ir, {
    surface,
    entity: request.entity,
    command: request.command,
    options: request.options,
  });
}
