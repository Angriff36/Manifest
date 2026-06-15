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
import { buildDirectWriteRegex, DEFAULT_WRITE_RECEIVER } from './write-receiver.js';

const ROUTE_GLOBS = [
  'app/api/**/route.{ts,js,mjs,cjs}',
  'src/app/api/**/route.{ts,js,mjs,cjs}',
  'apps/*/app/api/**/route.{ts,js,mjs,cjs}',
  'app/actions/**/*.{ts,js,mjs,cjs}',
  'src/app/actions/**/*.{ts,js,mjs,cjs}',
  'apps/*/app/actions/**/*.{ts,js,mjs,cjs}',
  'jobs/**/*.{ts,js,mjs,cjs}',
  'src/jobs/**/*.{ts,js,mjs,cjs}',
  'apps/*/jobs/**/*.{ts,js,mjs,cjs}',
];

const ALLOWLIST_SEGMENTS = [
  ['src', 'manifest', 'runtime'],
  ['src', 'manifest', 'adapters'],
  ['src', 'manifest', 'stores.node.ts'],
];

function isAllowlisted(filePath: string, root: string): boolean {
  const rel = path.relative(root, filePath).split(/[\\/]/);
  return ALLOWLIST_SEGMENTS.some((segments) =>
    segments.every((seg, i) => rel[i] === seg)
  );
}

async function scanFile(
  filePath: string,
  root: string,
  re: RegExp,
  receiver: string
): Promise<AuditFinding[]> {
  if (isAllowlisted(filePath, root)) return [];
  const content = await fs.readFile(filePath, 'utf-8');
  const match = re.exec(content);
  if (!match) return [];
  return [
    {
      severity: 'error',
      code: 'DIRECT_WRITE',
      message: `Direct ${receiver}.${match[1]} call outside runtime adapters`,
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
    const receiver = ctx.writeReceiver ?? DEFAULT_WRITE_RECEIVER;
    const directWriteRe = buildDirectWriteRegex(receiver);
    const scanPatterns = [...ROUTE_GLOBS, ...(ctx.includeGlobs ?? [])];
    const ignorePatterns = ctx.excludeGlobs;
    // Default globs and user --include patterns may overlap (e.g. defaults
    // already include `app/api/**/route.ts` and a user passes
    // `--include 'app/api/**/*.ts'`). Without dedup, the same file gets
    // scanned multiple times and emits duplicate findings — which then
    // cascade into duplicate BYPASS_VIOLATION entries via
    // bypass-violations.
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
        findings.push(...(await scanFile(file, ctx.root, directWriteRe, receiver)));
      }
    }
    return findings;
  },
};
