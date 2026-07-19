/**
 * Reusable Manifest integration guard engine.
 * Inventories (tables, lifecycle symbols) come from generated config — not app hardcoding.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { GuardViolation, IntegrationGuardConfig } from '../types.js';

function normalized(relativePath: string): string {
  return relativePath.replace(/\\/g, '/');
}

function walkTsFiles(root: string, relativeDir: string): string[] {
  const abs = path.join(root, relativeDir);
  let entries;
  try {
    entries = readdirSync(abs, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const rel = normalized(path.join(relativeDir, entry.name));
    if (entry.isDirectory()) return walkTsFiles(root, rel);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [rel] : [];
  });
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split(/\r?\n/).length;
}

function isExcepted(file: string, rule: string, config: IntegrationGuardConfig): boolean {
  return config.exceptions.some((ex) => {
    if (!file.includes(ex.pathIncludes)) return false;
    return !ex.rule || ex.rule === rule;
  });
}

function push(
  out: GuardViolation[],
  file: string,
  rule: string,
  detail: string,
  line?: number,
  config?: IntegrationGuardConfig,
): void {
  if (config && isExcepted(file, rule, config)) return;
  out.push({ file: normalized(file), rule, detail, ...(line ? { line } : {}) });
}

function inspectFeatureFile(
  relativePath: string,
  source: string,
  config: IntegrationGuardConfig,
): GuardViolation[] {
  const violations: GuardViolation[] = [];
  const file = normalized(relativePath);

  for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
    const imported = match[1]!;
    for (const pattern of config.forbiddenImportPatterns) {
      if (new RegExp(pattern).test(imported)) {
        push(
          violations,
          file,
          'approved-api-path',
          `Forbidden import '${imported}' (use generated hooks / governed commands).`,
          lineOf(source, match.index ?? 0),
          config,
        );
      }
    }
  }

  if (config.forbidDirectConvexHooks) {
    const hook = source.match(/\b(?:useMutation|useQuery|useAction)\s*\(/);
    if (hook) {
      push(
        violations,
        file,
        'approved-api-path',
        'Direct Convex hooks are forbidden; use generated Manifest hooks.',
        lineOf(source, hook.index ?? 0),
        config,
      );
    }
  }

  if (config.lifecycleLiteralPattern) {
    const lit = source.match(new RegExp(config.lifecycleLiteralPattern));
    if (lit) {
      push(
        violations,
        file,
        'generated-lifecycle',
        'Lifecycle transition literals must come from generated metadata.',
        lineOf(source, lit.index ?? 0),
        config,
      );
    }
  }

  for (const policy of config.lifecyclePolicies) {
    if (!file.endsWith(policy.pathSuffix)) continue;
    if (!source.includes(policy.bindingsImport)) {
      push(
        violations,
        file,
        'generated-lifecycle',
        `Lifecycle policy must import '${policy.bindingsImport}'.`,
        undefined,
        config,
      );
    }
    for (const symbol of policy.requiredSymbols) {
      if (!source.includes(symbol)) {
        push(
          violations,
          file,
          'generated-lifecycle',
          `Lifecycle policy must reference generated symbol '${symbol}'.`,
          undefined,
          config,
        );
      }
    }
  }

  return violations;
}

function inspectConvexLibFile(
  relativePath: string,
  source: string,
  config: IntegrationGuardConfig,
): GuardViolation[] {
  if (config.ownedTables.length === 0) return [];
  const tablePattern = config.ownedTables.map(escapeRegExp).join('|');
  const file = normalized(relativePath);
  const violations: GuardViolation[] = [];

  const insert = source.match(new RegExp(`ctx\\.db\\.insert\\(\\s*["'](?:${tablePattern})["']`));
  if (insert) {
    push(
      violations,
      file,
      'generated-writes-only',
      'Authored Convex modules must not insert owned tables directly.',
      lineOf(source, insert.index ?? 0),
      config,
    );
  }

  const mutates =
    /ctx\.db\.(?:patch|replace|delete)\s*\(/.test(source) &&
    new RegExp(
      `(?:v\\.id\\(\\s*["'](?:${tablePattern})["']|Id<\\s*["'](?:${tablePattern})["']|ctx\\.db\\.(?:get|query|insert)\\(\\s*["'](?:${tablePattern})["'])`,
    ).test(source);
  if (mutates) {
    push(
      violations,
      file,
      'generated-writes-only',
      'Authored Convex modules must write owned documents through generated commands.',
      undefined,
      config,
    );
  }

  return violations;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Run the guard engine against an application root. */
export function runManifestIntegrationGuard(
  rootDir: string,
  config: IntegrationGuardConfig,
): GuardViolation[] {
  const violations: GuardViolation[] = [];

  for (const featureRoot of config.featureRoots) {
    for (const rel of walkTsFiles(rootDir, featureRoot)) {
      const source = readFileSync(path.join(rootDir, rel), 'utf8');
      violations.push(...inspectFeatureFile(rel, source, config));
    }
  }

  if (config.convexLibRoot) {
    try {
      if (statSync(path.join(rootDir, config.convexLibRoot)).isDirectory()) {
        for (const rel of walkTsFiles(rootDir, config.convexLibRoot)) {
          const source = readFileSync(path.join(rootDir, rel), 'utf8');
          violations.push(...inspectConvexLibFile(rel, source, config));
        }
      }
    } catch {
      // missing lib root is fine
    }
  }

  return violations;
}
