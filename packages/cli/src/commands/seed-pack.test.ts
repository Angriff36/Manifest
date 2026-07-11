/**
 * Tests for seed pack CLI (template / fill / validate).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { seedTemplateCommand, seedFillCommand, seedValidateCommand } from './seed-pack-cli.js';
import type { IR } from '@angriff36/manifest/ir';

function buildIR(): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'test',
      compilerVersion: '1.0.0',
      schemaVersion: '1.0',
      compiledAt: '2024-01-01T00:00:00.000Z',
    },
    modules: [],
    values: [],
    entities: [
      {
        name: 'Vendor',
        properties: [
          { name: 'name', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        ],
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [],
        policies: [],
      },
    ],
    enums: [],
    stores: [],
    events: [],
    commands: [],
    policies: [],
  };
}

describe('seed pack CLI', () => {
  let tmpDir: string;
  let irPath: string;
  let packDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'seed-pack-cli-'));
    irPath = path.join(tmpDir, 'demo.ir.json');
    packDir = path.join(tmpDir, 'pack');
    await fs.writeFile(irPath, JSON.stringify(buildIR()), 'utf8');
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('template → fill → validate', async () => {
    await seedTemplateCommand({
      source: irPath,
      output: packDir,
      packId: 'cli-demo',
      version: '1.0.0',
      count: 1,
    });
    const meta = JSON.parse(await fs.readFile(path.join(packDir, 'manifest.seed.json'), 'utf8'));
    expect(meta.packId).toBe('cli-demo');

    await seedFillCommand({
      packDir,
      source: irPath,
      provider: 'heuristic',
    });

    process.exitCode = 0;
    await seedValidateCommand({
      packDir,
      source: irPath,
      requireFilled: true,
    });
    expect(process.exitCode ?? 0).toBe(0);
  });
});
