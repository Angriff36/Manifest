import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeSeedPack, readSeedPack, serializeCsv, parseCsv } from './pack-io.js';
import type { SeedPack } from './types.js';

describe('seed-pack pack-io', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'seed-pack-io-'));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('round-trips CSV escape', () => {
    const csv = serializeCsv(['seedKey', 'name'], [
      { seedKey: 'vendor-1', name: 'Acme, Inc.' },
    ]);
    const parsed = parseCsv(csv);
    expect(parsed.columns).toEqual(['seedKey', 'name']);
    expect(parsed.rows[0]).toEqual({ seedKey: 'vendor-1', name: 'Acme, Inc.' });
  });

  it('writes and reads a pack directory', async () => {
    const pack: SeedPack = {
      meta: {
        packId: 'demo',
        version: '1.0.0',
        profile: 'demo',
        entities: ['Vendor'],
      },
      tables: [
        {
          entity: 'Vendor',
          columns: ['seedKey', 'name'],
          rows: [{ seedKey: 'vendor-1', name: 'Acme' }],
        },
      ],
    };
    const dir = path.join(tmpDir, 'pack');
    await writeSeedPack(dir, pack);
    const loaded = await readSeedPack(dir);
    expect(loaded.meta.packId).toBe('demo');
    expect(loaded.tables[0]!.rows[0]!.name).toBe('Acme');
  });
});
