/**
 * Missing-tests detector.
 *
 * Constitution §13: every governed command must produce or connect to
 * conformance evidence. This detector loads commands.json (from
 * `manifest emit registries`) and verifies that each governed command's
 * commandId is referenced by at least one test or fixture file under the
 * audited root.
 *
 * A "reference" is a substring match of the commandId (e.g. `Recipe.create`)
 * in any *.test.ts, *.test.js, *.conformance.json, *.fixture.json,
 * conformance fixture, or harness script file. The detector deliberately
 * uses substring matching rather than runtime introspection so it works
 * across testing frameworks.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import type { AuditFinding, Detector, DetectorContext } from './types';

const TEST_GLOBS = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.test.js',
  '**/*.conformance.json',
  '**/*.fixture.json',
  '**/conformance/**/*.json',
  '**/harness/**/*.json',
];

const IGNORED_DIRS = [
  'node_modules/**',
  'dist/**',
  'dist-app/**',
  '.next/**',
  '.turbo/**',
  '.tmp/**',
];

interface CommandRegistry {
  irHash?: string;
  commands?: { commandId: string; entity: string; command: string }[];
}

async function loadRegistry(registryPath: string): Promise<CommandRegistry> {
  const raw = await fs.readFile(registryPath, 'utf-8');
  return JSON.parse(raw) as CommandRegistry;
}

function isGoverned(entry: { entity: string }): boolean {
  // Module-level commands (entity === '__unowned__') are infrastructure and
  // excluded from the coverage requirement.
  return entry.entity !== '__unowned__';
}

async function collectTestCorpus(root: string): Promise<string> {
  const files = new Set<string>();
  for (const pattern of TEST_GLOBS) {
    const matches = await glob(pattern, { cwd: root, absolute: true, ignore: IGNORED_DIRS });
    for (const f of matches) files.add(f);
  }
  const buffers: string[] = [];
  for (const file of files) {
    try {
      buffers.push(await fs.readFile(file, 'utf-8'));
    } catch {
      // skip unreadable
    }
  }
  return buffers.join('\n');
}

export const missingTestsDetector: Detector = {
  name: 'missing-tests',
  description: 'Flag governed commands without conformance/test references (constitution §13)',
  async run(ctx: DetectorContext): Promise<AuditFinding[]> {
    if (!ctx.commandsRegistry) {
      return [
        {
          severity: 'warning',
          code: 'MISSING_TESTS_NO_REGISTRY',
          message: '--commands-registry not supplied; cannot run missing-tests detector',
          detector: 'missing-tests',
        },
      ];
    }

    let registry: CommandRegistry;
    try {
      registry = await loadRegistry(path.resolve(ctx.root, ctx.commandsRegistry));
    } catch (err) {
      return [
        {
          severity: 'error',
          code: 'MISSING_TESTS_REGISTRY_UNREADABLE',
          message: `Cannot read commands registry: ${(err as Error).message}`,
          detector: 'missing-tests',
        },
      ];
    }

    const commands = (registry.commands ?? []).filter(isGoverned);
    if (commands.length === 0) return [];

    const corpus = await collectTestCorpus(ctx.root);

    const findings: AuditFinding[] = [];
    for (const entry of commands) {
      if (!corpus.includes(entry.commandId)) {
        findings.push({
          severity: 'error',
          code: 'MISSING_CONFORMANCE_TEST',
          message: `No test or conformance fixture references ${entry.commandId}`,
          detector: 'missing-tests',
        });
      }
    }
    return findings;
  },
};
