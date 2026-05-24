/**
 * Generic-dispatch failure-propagation regression test (Codex v0.9.x review).
 *
 * The previous implementation of `manifest generate` (the post-Step-2b
 * generic dispatch path) treated projection diagnostics as log-only, so a
 * projection that returned `severity: 'error'` diagnostics (e.g.
 * PRISMA_UNKNOWN_TYPE, PRISMA_AMBIGUOUS_NUMBER, UNKNOWN_SURFACE) still
 * caused the CLI to exit 0. CI couldn't tell a partial-failure generation
 * from a clean one.
 *
 * This test exercises the actual built CLI binary (same pattern as
 * enforce-surface.cli.test.ts): construct an IR file whose Prisma
 * emission MUST error, run `manifest generate -p prisma` against it,
 * and assert non-zero exit.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CLI_BIN = path.resolve(__dirname, '../../dist/index.js');

describe('manifest generate — error diagnostics propagate exit code (Codex v0.9.x fix)', () => {
  it('exits non-zero when the Prisma projection returns PRISMA_AMBIGUOUS_NUMBER for a bare `number` property', () => {
    // Build a minimal IR with a bare `number` property — the Prisma
    // projection MUST return PRISMA_AMBIGUOUS_NUMBER (severity: error)
    // for this shape. With the fix, the CLI now throws on any error-
    // severity diagnostic; without the fix it would log-and-succeed.
    const ir = {
      version: '1.0',
      provenance: {
        contentHash: 'test-fixture',
        compilerVersion: 'test',
        schemaVersion: '1.0',
        compiledAt: '2025-01-01T00:00:00.000Z',
      },
      modules: [],
      entities: [
        {
          name: 'BadEntity',
          properties: [
            { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
            // Bare `number` → PRISMA_AMBIGUOUS_NUMBER error.
            { name: 'amount', type: { name: 'number', nullable: false }, modifiers: ['required'] },
          ],
          computedProperties: [],
          relationships: [],
          commands: [],
          constraints: [],
          policies: [],
        },
      ],
      stores: [{ entity: 'BadEntity', target: 'durable', config: {} }],
      events: [],
      commands: [],
      policies: [],
    };

    const scratchDir = mkdtempSync(path.join(tmpdir(), 'manifest-generate-dispatch-'));
    const irDir = path.join(scratchDir, 'ir');
    const outDir = path.join(scratchDir, 'generated');
    mkdirSync(irDir);
    writeFileSync(path.join(irDir, 'bad.ir.json'), JSON.stringify(ir), 'utf8');

    const result = spawnSync(
      process.execPath,
      [CLI_BIN, 'generate', irDir, '-p', 'prisma', '-s', 'prisma.schema', '-o', outDir],
      { encoding: 'utf-8' },
    );

    // The fix asserts non-zero exit. Without it, this was 0 (silent success).
    expect(result.status).not.toBe(0);
    // Failure message must surface the diagnostic code so CI logs are actionable.
    const combined = `${result.stdout}\n${result.stderr}`;
    expect(combined).toMatch(/PRISMA_AMBIGUOUS_NUMBER/);
  });
});
