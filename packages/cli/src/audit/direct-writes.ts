/**
 * Direct-writes detector.
 *
 * Direct ORM writes (Prisma `receiver.model.create`, Drizzle `db.insert`,
 * Kysely `db.insertInto`, raw SQL DML templates) in routes, server actions,
 * jobs, etc. bypass the governed runtime command path. They are flagged
 * unless the path is explicitly listed in the approved bypass registry.
 *
 * This detector only finds the direct writes; the bypass-violations
 * detector composes this output with a bypass registry to determine which
 * writes are violations vs. approved bypasses.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import type { AuditFinding, Detector, DetectorContext } from './types.js';
import { DEFAULT_WRITE_RECEIVER, DirectWriteScanner } from './write-receiver.js';

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
  return ALLOWLIST_SEGMENTS.some((segments) => segments.every((seg, i) => rel[i] === seg));
}

async function scanFile(
  filePath: string,
  root: string,
  scanner: DirectWriteScanner,
): Promise<AuditFinding[]> {
  if (isAllowlisted(filePath, root)) return [];
  const content = await fs.readFile(filePath, 'utf-8');
  const hits = scanner.scan(content);
  if (hits.length === 0) return [];
  const rel = path.relative(root, filePath).replace(/\\/g, '/');
  // One finding per distinct label so a file with create+update is reported
  // once per shape without flooding on repeated identical calls.
  const seen = new Set<string>();
  const findings: AuditFinding[] = [];
  for (const hit of hits) {
    if (seen.has(hit.label)) continue;
    seen.add(hit.label);
    findings.push({
      severity: 'error',
      code: 'DIRECT_WRITE',
      message: `Direct ${hit.label} call outside runtime adapters`,
      file: rel,
      detector: 'direct-writes',
    });
  }
  return findings;
}

export const directWritesDetector: Detector = {
  name: 'direct-writes',
  description: 'Flag direct ORM writes outside runtime adapters',
  async run(ctx: DetectorContext): Promise<AuditFinding[]> {
    const findings: AuditFinding[] = [];
    const receiver = ctx.writeReceiver ?? DEFAULT_WRITE_RECEIVER;
    const scanner = new DirectWriteScanner(receiver);
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
        findings.push(...(await scanFile(file, ctx.root, scanner)));
      }
    }
    return findings;
  },
};
