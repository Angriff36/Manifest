/**
 * CLI entry proofs for previously CLAIMED §7 rows:
 * wiring-coverage, ir-diff, migrate (json / no-op paths).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { wiringCoverageCommand } from './wiring-coverage.js';
import { diffIRCommand } from './ir-diff.js';
import { migrateCommand } from './migrate.js';

const EMPTY_IR = {
  version: '1.0',
  provenance: {
    contentHash: 't',
    compilerVersion: '1.0.0',
    schemaVersion: '1.0',
    compiledAt: '2024-01-01T00:00:00.000Z',
  },
  modules: [],
  values: [],
  enums: [],
  entities: [],
  stores: [],
  events: [],
  commands: [],
  policies: [],
};

async function tempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'manifest-cli-gaps-'));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CLI claimed-gap entry proofs', () => {
  it('wiring-coverage reports ok for empty contract + empty consumers', async () => {
    const dir = await tempDir();
    const contractPath = path.join(dir, 'contract.json');
    const consumersPath = path.join(dir, 'consumers.json');
    await fs.writeFile(
      contractPath,
      JSON.stringify({
        $schema: 'manifest-wiring-contract/v1',
        meta: {
          compilerVersion: '1.0.0',
          schemaVersion: '1.0',
          contentHash: 't',
          projection: 'wiring',
        },
        capabilities: [],
      }),
    );
    await fs.writeFile(
      consumersPath,
      JSON.stringify({
        $schema: 'manifest-wiring-consumers/v1',
        consumers: [],
      }),
    );

    vi.spyOn(console, 'log').mockImplementation(() => {});
    const report = await wiringCoverageCommand({
      contract: contractPath,
      consumers: consumersPath,
      format: 'json',
    });
    expect(report.ok).toBe(true);
    expect(report.summary.totalCapabilities).toBe(0);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('ir-diff --json reports no changes for identical IR', async () => {
    const dir = await tempDir();
    const a = path.join(dir, 'old.json');
    const b = path.join(dir, 'new.json');
    await fs.writeFile(a, JSON.stringify(EMPTY_IR));
    await fs.writeFile(b, JSON.stringify(EMPTY_IR));

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });

    await diffIRCommand(a, b, { json: true });
    const body = JSON.parse(logs.join('\n'));
    expect(body.summary.hasChanges).toBe(false);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('migrate --json no-ops when IR is unchanged', async () => {
    const dir = await tempDir();
    const a = path.join(dir, 'old.json');
    const b = path.join(dir, 'new.json');
    await fs.writeFile(a, JSON.stringify(EMPTY_IR));
    await fs.writeFile(b, JSON.stringify(EMPTY_IR));

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });

    await migrateCommand({ oldIR: a, newIR: b, json: true });
    const body = JSON.parse(logs.join('\n'));
    expect(body.diff.summary.hasChanges).toBe(false);
    await fs.rm(dir, { recursive: true, force: true });
  });
});
