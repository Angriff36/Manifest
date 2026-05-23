import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadCommandSet } from './unregistered-command-call.js';

async function tempDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'enforce-surface-'));
}

describe('loadCommandSet', () => {
  it('returns a Set of "entity.command" identities', async () => {
    const dir = await tempDir();
    const reg = path.join(dir, 'commands.json');
    await fs.writeFile(
      reg,
      JSON.stringify({
        irHash: 'x',
        compilerVersion: 'y',
        commands: [
          {
            entity: 'User',
            command: 'create',
            commandId: 'User.create',
            policies: [],
            guardCount: 0,
            emits: [],
            effects: [],
          },
          {
            entity: 'Order',
            command: 'place',
            commandId: 'Order.place',
            policies: [],
            guardCount: 0,
            emits: [],
            effects: [],
          },
        ],
      })
    );
    const set = await loadCommandSet(reg);
    expect(set.has('User.create')).toBe(true);
    expect(set.has('Order.place')).toBe(true);
    expect(set.has('User.delete')).toBe(false);
  });

  it('falls back to entity.command when commandId is missing', async () => {
    const dir = await tempDir();
    const reg = path.join(dir, 'commands.json');
    await fs.writeFile(
      reg,
      JSON.stringify({
        irHash: 'x',
        compilerVersion: 'y',
        commands: [{ entity: 'User', command: 'create' }],
      })
    );
    const set = await loadCommandSet(reg);
    expect(set.has('User.create')).toBe(true);
  });

  it('throws a clear error when registry file is missing', async () => {
    await expect(
      loadCommandSet(path.join('/nope/missing', 'no.json'))
    ).rejects.toThrow(/commands registry/i);
  });
});
