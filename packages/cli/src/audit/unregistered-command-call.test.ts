import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadCommandSet, extractRunCommandCalls } from './unregistered-command-call.js';

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

describe('extractRunCommandCalls', () => {
  it('detects static-string runtime.runCommand calls', () => {
    const src = `
      export async function POST(req) {
        return await runtime.runCommand('User.create', payload);
      }
    `;
    const calls = extractRunCommandCalls(src, 'route.ts');
    expect(calls).toHaveLength(1);
    expect(calls[0].commandId).toBe('User.create');
    expect(calls[0].dynamic).toBe(false);
    expect(calls[0].line).toBeGreaterThan(0);
    expect(calls[0].column).toBeGreaterThan(0);
  });

  it('detects this.runtime.runCommand calls', () => {
    const src = `class Handler { async run() { await this.runtime.runCommand('Order.place', p); } }`;
    const calls = extractRunCommandCalls(src, 'h.ts');
    expect(calls).toHaveLength(1);
    expect(calls[0].commandId).toBe('Order.place');
  });

  it('marks dynamic command names as unverifiable', () => {
    const src = `function go(name) { return runtime.runCommand(name, payload); }`;
    const calls = extractRunCommandCalls(src, 'd.ts');
    expect(calls).toHaveLength(1);
    expect(calls[0].dynamic).toBe(true);
    expect(calls[0].commandId).toBeNull();
  });

  it('returns empty for files without runCommand', () => {
    expect(extractRunCommandCalls('const x = 1; function f() { return 2; }', 'x.ts')).toEqual([]);
  });

  it('does not match unrelated runCommand-like properties', () => {
    const src = `something.notRuntime.runCommand('x', y);`;
    const calls = extractRunCommandCalls(src, 'x.ts');
    expect(calls).toEqual([]);
  });
});
