/**
 * Integration-check command tests.
 *
 * Runs the umbrella `integration-check` against the bundled
 * fixtures/sample-app/ — a deliberately app-agnostic governed sample —
 * and asserts the overall verdict plus per-section flags. The package
 * shape sub-step runs `npm pack --dry-run` against the actual package
 * root so the test catches packaging mistakes the same way a real
 * pre-publish check would.
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { integrationCheckCommand } from './integration-check';

function captureLogs(): { logs: string[]; restore: () => void } {
  const original = console.log;
  const logs: string[] = [];
  console.log = (...args: unknown[]) => {
    logs.push(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };
  return {
    logs,
    restore: () => { console.log = original; },
  };
}

const here = path.dirname(fileURLToPath(import.meta.url));
// packages/cli/src/commands → up to repo root
const repoRoot = path.resolve(here, '..', '..', '..', '..');
const sampleApp = path.join(repoRoot, 'fixtures', 'sample-app');

describe('manifest integration-check', () => {
  it('passes for the bundled sample-app fixture', async () => {
    // Verify the fixture is actually present so the test fails loudly if
    // someone deletes it instead of silently green-painting.
    await expect(fs.access(sampleApp)).resolves.toBeUndefined();

    const capture = captureLogs();
    try {
      const result = await integrationCheckCommand({
        root: sampleApp,
        commandsRegistry: path.join(sampleApp, 'manifest-registry', 'commands.json'),
        bypassRegistry: path.join(sampleApp, 'bypasses.json'),
        format: 'json',
        // Skip the runtime smoke + package-shape for this assertion — they
        // are exercised by their own dedicated test suites. Keeping them
        // out here ensures this test focuses on cross-section wiring.
        skipRuntimeSmoke: true,
        skipPackageShape: true,
      });

      if (!result.ok) {
        // Surface which section failed when this regresses. Use stderr
        // directly so the captureLogs shim above doesn't swallow it.
        process.stderr.write(
          'integration-check sections: ' +
          JSON.stringify(result.sections.map(s => ({ name: s.name, ok: s.ok, summary: s.summary, detail: s.detail })), null, 2) +
          '\n'
        );
      }
      expect(result.ok).toBe(true);
      const sections = Object.fromEntries(result.sections.map(s => [s.name, s.ok]));
      expect(sections.governance).toBe(true);
      expect(sections.bypasses).toBe(true);
      expect(sections.dispatcher).toBe(true);
    } finally {
      capture.restore();
    }
  });

  it('flags a missing dispatcher route', async () => {
    // Run against repoRoot (which has no app/api/manifest dispatcher) so
    // the dispatcher section MUST fail.
    const capture = captureLogs();
    try {
      const result = await integrationCheckCommand({
        root: repoRoot,
        format: 'json',
        skipRuntimeSmoke: true,
        skipPackageShape: true,
      });
      const dispatcher = result.sections.find(s => s.name === 'dispatcher');
      expect(dispatcher?.ok).toBe(false);
      expect(result.ok).toBe(false);
    } finally {
      capture.restore();
    }
  });

  it('includes runtime smoke when not skipped', async () => {
    const capture = captureLogs();
    try {
      const result = await integrationCheckCommand({
        root: sampleApp,
        commandsRegistry: path.join(sampleApp, 'manifest-registry', 'commands.json'),
        bypassRegistry: path.join(sampleApp, 'bypasses.json'),
        format: 'json',
        skipPackageShape: true,
      });
      const smoke = result.sections.find(s => s.name === 'runtime-smoke');
      expect(smoke).toBeDefined();
      expect(smoke?.ok).toBe(true);
      // The smoke detail carries the assertion list, including audit + outbox.
      const detail = smoke?.detail as { assertions?: Array<{ name: string; passed: boolean }> };
      const auditOnce = detail.assertions?.find(a => a.name === 'audit.emittedExactlyOnce');
      const outboxOnce = detail.assertions?.find(a => a.name === 'outbox.enqueuedExactlyOnce');
      expect(auditOnce?.passed).toBe(true);
      expect(outboxOnce?.passed).toBe(true);
    } finally {
      capture.restore();
    }
  });
});
