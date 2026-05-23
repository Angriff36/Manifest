/**
 * unregistered-entity-write detector.
 *
 * Flags direct ORM writes against models that have no corresponding entity
 * in the Manifest entity registry. A governed application surface should
 * either expose those models as Manifest entities (so commands and policies
 * can be enforced) or route the write through a registered command.
 *
 * The detector deliberately does NOT pluralize entity names — irregular
 * plurals (Category → categories, Person → people) would produce false
 * positives. Match shape: Prisma's default model-to-client mapping, i.e.
 * model `User` → `prisma.user`, `Category` → `prisma.category`.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import type { AuditFinding, Detector, DetectorContext } from './types.js';

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

const EXCLUDE_GLOBS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/build/**',
  '**/generated/**',
];

const WRITE_RE =
  /\bprisma\s*\.\s*(\w+)\s*\.\s*(create|update|delete|upsert|createMany|updateMany|deleteMany)\s*\(/g;

interface EntitiesRegistry {
  entities: Array<{ name: string }>;
}

async function loadEntityNames(p: string): Promise<Set<string>> {
  const raw = await fs.readFile(p, 'utf-8');
  const parsed = JSON.parse(raw) as EntitiesRegistry;
  const out = new Set<string>();
  for (const e of parsed.entities ?? []) {
    out.add(e.name);
    out.add(e.name.charAt(0).toLowerCase() + e.name.slice(1));
  }
  return out;
}

export const unregisteredEntityWriteDetector: Detector = {
  name: 'unregistered-entity-write',
  description: 'Flag direct ORM writes against models with no Manifest entity registered',
  async run(ctx: DetectorContext): Promise<AuditFinding[]> {
    if (!ctx.entitiesRegistry) return [];
    const known = await loadEntityNames(ctx.entitiesRegistry);
    const findings: AuditFinding[] = [];
    const seen = new Set<string>();
    const scanPatterns = [...ROUTE_GLOBS, ...(ctx.includeGlobs ?? [])];
    const ignorePatterns = [...EXCLUDE_GLOBS, ...(ctx.excludeGlobs ?? [])];
    for (const pattern of scanPatterns) {
      const files = await glob(pattern, {
        cwd: ctx.root,
        absolute: true,
        ignore: ignorePatterns,
      });
      for (const file of files) {
        if (seen.has(file)) continue;
        seen.add(file);
        const src = await fs.readFile(file, 'utf-8');
        WRITE_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = WRITE_RE.exec(src))) {
          const model = m[1];
          if (known.has(model)) continue;
          findings.push({
            severity: 'error',
            code: 'UNREGISTERED_ENTITY_WRITE',
            message: `Direct write prisma.${model}.${m[2]} against model with no Manifest entity registered`,
            file: path.relative(ctx.root, file).replace(/\\/g, '/'),
            detector: 'unregistered-entity-write',
            entity: model,
            suggestion: `Register '${model}' as a Manifest entity, or route the write through an existing registered runtime.runCommand`,
          });
        }
      }
    }
    return findings;
  },
};
