/**
 * Bypass-violations detector.
 *
 * Composes the direct-writes detector with the approved-bypass registry.
 *
 * For each direct write the underlying detector finds:
 *   - if the file is listed in the bypass registry → no finding
 *     (the violation is governed by `audit-bypasses` instead)
 *   - otherwise → BYPASS_VIOLATION error
 *
 * For each bypass registry entry whose path no longer contains a direct
 * write → STALE_BYPASS warning (so the registry is kept clean).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { AuditFinding, Detector, DetectorContext } from './types.js';
import { directWritesDetector } from './direct-writes.js';

interface BypassEntry {
  entity: string;
  path: string;
}

interface BypassRegistry {
  version: string;
  bypasses: BypassEntry[];
}

async function loadBypassRegistry(p: string): Promise<BypassRegistry | null> {
  try {
    const raw = await fs.readFile(p, 'utf-8');
    return JSON.parse(raw) as BypassRegistry;
  } catch {
    return null;
  }
}

export const bypassViolationsDetector: Detector = {
  name: 'bypass-violations',
  description: 'Cross-check direct writes against the approved-bypass registry',
  async run(ctx: DetectorContext): Promise<AuditFinding[]> {
    if (!ctx.bypassRegistry) {
      return [
        {
          severity: 'warning',
          code: 'BYPASS_VIOLATIONS_NO_REGISTRY',
          message: '--bypass-registry not supplied; cannot run bypass-violations detector',
          detector: 'bypass-violations',
        },
      ];
    }

    const registryPath = path.resolve(ctx.root, ctx.bypassRegistry);
    const registry = await loadBypassRegistry(registryPath);
    if (!registry) {
      return [
        {
          severity: 'error',
          code: 'BYPASS_VIOLATIONS_REGISTRY_UNREADABLE',
          message: `Cannot read bypass registry: ${registryPath}`,
          detector: 'bypass-violations',
        },
      ];
    }

    const approvedPaths = new Set(registry.bypasses.map((b) => b.path.replace(/\\/g, '/')));
    const findings: AuditFinding[] = [];

    // Run the underlying detector and re-classify each finding.
    const directWrites = await directWritesDetector.run(ctx);
    const seenPaths = new Set<string>();
    for (const dw of directWrites) {
      const file = dw.file?.replace(/\\/g, '/');
      if (!file) continue;
      seenPaths.add(file);
      if (approvedPaths.has(file)) continue;
      findings.push({
        severity: 'error',
        code: 'BYPASS_VIOLATION',
        message: `Direct write at ${file} is not in the approved-bypass registry`,
        file,
        detector: 'bypass-violations',
      });
    }

    // Stale-bypass detection: every registry entry that no longer
    // corresponds to a real direct write is a cleanup target.
    for (const entry of registry.bypasses) {
      const norm = entry.path.replace(/\\/g, '/');
      if (!seenPaths.has(norm)) {
        // Verify the file still exists; if it doesn't, the bypass-registry
        // audit (BYPASS_PATH_MISSING) handles that case. We only warn when
        // the file exists but no longer contains a direct write.
        try {
          await fs.access(path.resolve(ctx.root, entry.path));
        } catch {
          continue;
        }
        findings.push({
          severity: 'warning',
          code: 'STALE_BYPASS',
          message: `Bypass entry for ${entry.path} no longer matches any direct write — consider removing`,
          file: norm,
          detector: 'bypass-violations',
        });
      }
    }

    return findings;
  },
};
