/**
 * Event fabrication detector.
 *
 * Semantic events should originate from runtime execution. Routes, jobs,
 * UI handlers, and tests should not fabricate domain events.
 *
 * This detector scans Next.js route files (and equivalents) for patterns
 * that suggest event creation outside the runtime, e.g.:
 *   - eventBus.publish(...)
 *   - emit('Something.happened', ...)
 *   - new ManifestEvent(...)
 *
 * Files under approved runtime/adapter paths are exempted.
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

// Files under these directory segments are allowed to fabricate events —
// they ARE the runtime/adapter implementation.
const ALLOWLIST_SEGMENTS = [
  ['src', 'manifest', 'runtime'],
  ['src', 'manifest', 'adapters'],
  ['packages', 'manifest', 'src', 'runtime'],
  ['src', 'manifest', 'runtime-engine.ts'],
];

// Patterns indicating fabricated semantic events. Each entry pairs a regex
// with the diagnostic code emitted on a match.
const PATTERNS: ReadonlyArray<{ regex: RegExp; code: string; reason: string }> = [
  {
    regex: /\beventBus\s*\.\s*publish\s*\(/,
    code: 'EVENT_FABRICATION_PUBLISH',
    reason: 'eventBus.publish outside runtime — semantic events must come from runCommand',
  },
  {
    regex: /\bnew\s+ManifestEvent\s*\(/,
    code: 'EVENT_FABRICATION_CTOR',
    reason: 'Direct ManifestEvent construction outside runtime',
  },
  {
    regex: /\bemit\s*\(\s*['"][A-Z][A-Za-z0-9_]+\.\w+['"]/,
    code: 'EVENT_FABRICATION_EMIT_LITERAL',
    reason: 'emit("EntityName.eventName", ...) literal pattern outside runtime',
  },
];

function isAllowlisted(filePath: string, root: string): boolean {
  const rel = path.relative(root, filePath).split(/[\\/]/);
  return ALLOWLIST_SEGMENTS.some((segments) =>
    segments.every((seg, i) => rel[i] === seg)
  );
}

async function scanFile(filePath: string, root: string): Promise<AuditFinding[]> {
  if (isAllowlisted(filePath, root)) return [];
  const findings: AuditFinding[] = [];
  const content = await fs.readFile(filePath, 'utf-8');
  for (const { regex, code, reason } of PATTERNS) {
    if (regex.test(content)) {
      findings.push({
        severity: 'error',
        code,
        message: reason,
        file: path.relative(root, filePath).replace(/\\/g, '/'),
        detector: 'event-fabrication',
      });
    }
  }
  return findings;
}

export const eventFabricationDetector: Detector = {
  name: 'event-fabrication',
  description: 'Flag semantic event creation outside runtime adapters',
  async run(ctx: DetectorContext): Promise<AuditFinding[]> {
    const findings: AuditFinding[] = [];
    const scanPatterns = [...ROUTE_GLOBS, ...(ctx.includeGlobs ?? [])];
    const ignorePatterns = ctx.excludeGlobs;
    for (const pattern of scanPatterns) {
      const matches = await glob(pattern, {
        cwd: ctx.root,
        absolute: true,
        ignore: ignorePatterns,
      });
      for (const file of matches) {
        findings.push(...(await scanFile(file, ctx.root)));
      }
    }
    return findings;
  },
};
