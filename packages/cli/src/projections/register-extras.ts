/**
 * CLI-side registration of extra projections.
 *
 * As of v0.9.2, the Prisma projection is a built-in in
 * `@angriff36/manifest`'s `src/manifest/projections/builtins.ts`, so the
 * CLI no longer needs to register it from here. This file is kept as the
 * single registration entry point in case future projections ship as
 * out-of-core workspace packages and need CLI-side wiring.
 *
 * Idempotent: safe to call from multiple entry points.
 */

let registered = false;

export function registerCliExtraProjections(): void {
  if (registered) return;
  // No extra projections at the moment — Prisma was folded into core's
  // builtins as part of the v0.9.2 packaging cleanup. Keeping this hook
  // available avoids re-introducing the call site if a new out-of-core
  // projection lands later.
  registered = true;
}
