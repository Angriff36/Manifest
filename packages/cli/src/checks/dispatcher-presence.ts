/**
 * Dispatcher-presence check.
 *
 * The canonical Next.js dispatcher route emitted by the
 * `@angriff36/manifest/projections/nextjs` projection lives at:
 *
 *   app/api/manifest/[entity]/commands/[command]/route.ts
 *
 * (or any of the legal Next.js variants under `src/app/...`.)
 *
 * Downstream apps that adopt Manifest's governance contract MUST host the
 * dispatcher there. The `route-drift` detector flags routes that bypass
 * the dispatcher; this check is the complement — it verifies the canonical
 * dispatcher actually exists. Without it, the rest of the governance
 * stack has nowhere to route writes through.
 *
 * Pure static check, no runtime, no IR compilation.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface DispatcherPresenceResult {
  found: boolean;
  /** Repo-root-relative path of the dispatcher route, if found. */
  path?: string;
  /** All candidate paths the check looked at, in priority order. */
  candidatesSearched: string[];
}

const CANDIDATES = [
  'app/api/manifest/[entity]/commands/[command]/route.ts',
  'app/api/manifest/[entity]/commands/[command]/route.js',
  'src/app/api/manifest/[entity]/commands/[command]/route.ts',
  'src/app/api/manifest/[entity]/commands/[command]/route.js',
];

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Look for the canonical dispatcher route under `root`. Returns the first
 * matching candidate path (relative to `root`), or `found: false` if none
 * of the candidates exist.
 *
 * The check does NOT look inside `apps/<name>/` subdirectories — multi-app
 * monorepos have to opt in explicitly through configuration, since
 * deciding which app should host the dispatcher is project-specific.
 * Pass the specific app's root as `root` to scope the check.
 */
export async function checkDispatcherPresence(root: string): Promise<DispatcherPresenceResult> {
  const candidatesSearched: string[] = [];
  for (const rel of CANDIDATES) {
    const abs = path.resolve(root, rel);
    candidatesSearched.push(rel);
    if (await exists(abs)) {
      return { found: true, path: rel, candidatesSearched };
    }
  }
  return { found: false, candidatesSearched };
}
