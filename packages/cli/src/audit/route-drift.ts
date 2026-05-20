/**
 * Route drift detector.
 *
 * Constitution §6: per-command concrete routes are not authoritative. They
 * may exist as thin compatibility aliases that immediately delegate to the
 * canonical dispatcher. They MUST NOT define alternative semantics.
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
import type { AuditFinding, Detector, DetectorContext } from './types';

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
  description: 'Flag per-command routes that drift from the canonical dispatcher (constitution §6)',
  async run(ctx: DetectorContext): Promise<AuditFinding[]> {
    const findings: AuditFinding[] = [];
    for (const pattern of ROUTE_GLOBS) {
      const matches = await glob(pattern, { cwd: ctx.root, absolute: true });
      for (const file of matches) {
        findings.push(...(await scanFile(file, ctx.root)));
      }
    }
    return findings;
  },
};
