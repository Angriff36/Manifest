/**
 * Route drift detector.
 *
 * Per-command concrete routes are not authoritative for governed mutations.
 * They may exist as thin compatibility aliases that immediately delegate to
 * the canonical dispatcher. They MUST NOT define alternative semantics.
 *
 * This detector flags route files under app/api/**.../route.ts that:
 *   - live outside the canonical /api/manifest/[entity]/commands/[command]/
 *     dispatcher path, AND
 *   - call runtime.runCommand (i.e. write paths), AND
 *   - do NOT also carry a DEPRECATED ALIAS marker pointing at the dispatcher.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import type { AuditFinding, Detector, DetectorContext } from './types.js';

const ROUTE_GLOBS = [
  'app/api/**/route.ts',
  'app/api/**/route.js',
  'src/app/api/**/route.ts',
  'src/app/api/**/route.js',
  'apps/*/app/api/**/route.ts',
  'apps/*/app/api/**/route.js',
];

const CANONICAL_PATH_SEGMENT = '/api/manifest/[entity]/commands/[command]';
const RUNTIME_CALL_RE = /\brunCommand\s*\(/;
const DEPRECATED_BANNER_RE = /DEPRECATED ALIAS/;
// Route-drift only reasons about Next.js route files (basename
// `route.{ts,tsx,js,jsx,mjs,cjs}`). When `--include` widens the scan
// surface, those extra globs may match arbitrary helpers (e.g. a user
// asking to scan an entire `lib/` tree) which are not routes; we must
// NOT flag those as ROUTE_DRIFT, because the detector's whole concept
// (alternative semantics in a per-command route) does not apply to
// helpers.
const ROUTE_FILE_BASENAME_RE = /[\\/]route\.(?:ts|tsx|js|jsx|mjs|cjs)$/;

function isCanonicalDispatcher(filePath: string): boolean {
  // Both forward- and back-slash variants must be tolerated on Windows.
  return filePath.replace(/\\/g, '/').includes('/api/manifest/[entity]/commands/[command]/route.');
}

async function scanFile(filePath: string, root: string): Promise<AuditFinding[]> {
  if (isCanonicalDispatcher(filePath)) return [];
  const content = await fs.readFile(filePath, 'utf-8');
  if (!RUNTIME_CALL_RE.test(content)) return [];
  if (DEPRECATED_BANNER_RE.test(content)) return [];
  return [
    {
      severity: 'error',
      code: 'ROUTE_DRIFT',
      message: `Concrete command route calls runCommand without a DEPRECATED ALIAS banner pointing at ${CANONICAL_PATH_SEGMENT}`,
      file: path.relative(root, filePath).replace(/\\/g, '/'),
      detector: 'route-drift',
    },
  ];
}

export const routeDriftDetector: Detector = {
  name: 'route-drift',
  description: 'Flag per-command routes that drift from the canonical dispatcher',
  async run(ctx: DetectorContext): Promise<AuditFinding[]> {
    const findings: AuditFinding[] = [];
    const scanPatterns = [...ROUTE_GLOBS, ...(ctx.includeGlobs ?? [])];
    const ignorePatterns = ctx.excludeGlobs;
    const seen = new Set<string>();
    for (const pattern of scanPatterns) {
      const matches = await glob(pattern, {
        cwd: ctx.root,
        absolute: true,
        ignore: ignorePatterns,
      });
      for (const file of matches) {
        if (seen.has(file)) continue;
        seen.add(file);
        // --include can pull in non-route helpers; route-drift's diagnostic
        // only makes sense for files Next.js actually treats as routes.
        if (!ROUTE_FILE_BASENAME_RE.test(file)) continue;
        findings.push(...(await scanFile(file, ctx.root)));
      }
    }
    return findings;
  },
};
