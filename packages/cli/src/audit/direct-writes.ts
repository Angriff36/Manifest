/**
 * Direct-writes detector.
 *
 * Direct ORM writes (e.g. `prisma.X.create/update/delete/upsert/*Many`) in
 * routes, server actions, jobs, etc. bypass the governed runtime command
 * path. They are flagged unless the path is explicitly listed in the
 * approved bypass registry.
 *
 * This detector only finds the direct writes; the bypass-violations
 * detector composes this output with a bypass registry to determine which
 * writes are violations vs. approved bypasses.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import type { AuditFinding, Detector, DetectorContext } from './types.js';

const ROUTE_GLOBS = [
  'app/api/**/route.ts',
  'src/app/api/**/route.ts',
  'apps/*/app/api/**/route.ts',
  'app/actions/**/*.ts',
  'src/app/actions/**/*.ts',
  'apps/*/app/actions/**/*.ts',
  'jobs/**/*.ts',
  'src/jobs/**/*.ts',
  'apps/*/jobs/**/*.ts',
];

const ALLOWLIST_SEGMENTS = [
  ['src', 'manifest', 'runtime'],
  ['src', 'manifest', 'adapters'],
  ['src', 'manifest', 'stores.node.ts'],
];

const DIRECT_WRITE_RE =
  /\bprisma\s*\.\s*\w+\s*\.\s*(create|update|delete|upsert|createMany|updateMany|deleteMany)\s*\(/;

function isAllowlisted(filePath: string, root: string): boolean {
  const rel = path.relative(root, filePath).split(/[\\/]/);
  return ALLOWLIST_SEGMENTS.some((segments) =>
    segments.every((seg, i) => rel[i] === seg)
  );
}

async function scanFile(filePath: string, root: string): Promise<AuditFinding[]> {
  if (isAllowlisted(filePath, root)) return [];
  const content = await fs.readFile(filePath, 'utf-8');
  const match = DIRECT_WRITE_RE.exec(content);
  if (!match) return [];
  return [
    {
      severity: 'error',
      code: 'DIRECT_WRITE',
      message: `Direct prisma.${match[1]} call outside runtime adapters`,
      file: path.relative(root, filePath).replace(/\\/g, '/'),
      detector: 'direct-writes',
    },
  ];
}

export const directWritesDetector: Detector = {
  name: 'direct-writes',
  description: 'Flag direct ORM writes outside runtime adapters',
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
