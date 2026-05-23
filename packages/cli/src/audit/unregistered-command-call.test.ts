import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  loadCommandSet,
  extractRunCommandCalls,
  unregisteredCommandCallDetector,
} from './unregistered-command-call.js';

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

  it('accepts a flat-array registry (downstream consumer shape)', async () => {
    // Capsule-Pro and similar consumers emit a bare array rather than the
    // wrapped { commands: [...] } shape produced by `manifest emit`.
    const dir = await tempDir();
    const reg = path.join(dir, 'commands.json');
    await fs.writeFile(
      reg,
      JSON.stringify([
        { entity: 'User', command: 'create', commandId: 'User.create' },
        { entity: 'Order', command: 'place', commandId: 'Order.place' },
      ])
    );
    const set = await loadCommandSet(reg);
    expect(set.has('User.create')).toBe(true);
    expect(set.has('Order.place')).toBe(true);
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

  it('composes entity.command from the 3rd-arg options object', () => {
    // Capsule-Pro pattern: runCommand(command, payload, { entityName: 'X' })
    const src = `
      const result = await runtime.runCommand('create', body, {
        entityName: 'ScheduleShift',
      });
    `;
    const calls = extractRunCommandCalls(src, 'actions.ts');
    expect(calls).toHaveLength(1);
    expect(calls[0].commandId).toBe('ScheduleShift.create');
    expect(calls[0].dynamic).toBe(false);
  });

  it('keeps the literal commandId when it already contains a dot, even with entityName options', () => {
    const src = `runtime.runCommand('User.create', body, { entityName: 'Other' });`;
    const calls = extractRunCommandCalls(src, 'x.ts');
    expect(calls[0].commandId).toBe('User.create');
  });
});

describe('unregisteredCommandCallDetector', () => {
  async function writeRoute(root: string, rel: string, body: string) {
    const dir = path.join(root, path.dirname(rel));
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(root, rel), body);
  }
  async function writeRegistry(
    root: string,
    commands: Array<{ entity: string; command: string }>
  ) {
    const reg = path.join(root, 'commands.json');
    await fs.writeFile(
      reg,
      JSON.stringify({
        irHash: 'x',
        compilerVersion: 'y',
        commands: commands.map((c) => ({
          ...c,
          commandId: `${c.entity}.${c.command}`,
          policies: [],
          guardCount: 0,
          emits: [],
          effects: [],
        })),
      })
    );
    return reg;
  }

  it('flags runtime.runCommand calls for unregistered commands', async () => {
    const root = await tempDir();
    const reg = await writeRegistry(root, [{ entity: 'User', command: 'create' }]);
    await writeRoute(
      root,
      'app/api/orders/route.ts',
      `export async function POST(){ return runtime.runCommand('Order.place', {}); }`
    );
    const findings = await unregisteredCommandCallDetector.run({ root, commandsRegistry: reg });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('UNREGISTERED_COMMAND_CALL');
    expect(findings[0].severity).toBe('error');
    expect(findings[0].entity).toBe('Order');
    expect(findings[0].command).toBe('place');
    expect(findings[0].line).toBeGreaterThan(0);
    expect(findings[0].file).toMatch(/app\/api\/orders\/route\.ts$/);
  });

  it('passes when the command is registered', async () => {
    const root = await tempDir();
    const reg = await writeRegistry(root, [{ entity: 'User', command: 'create' }]);
    await writeRoute(
      root,
      'app/api/users/route.ts',
      `export async function POST(){ return runtime.runCommand('User.create', {}); }`
    );
    const findings = await unregisteredCommandCallDetector.run({ root, commandsRegistry: reg });
    expect(findings).toEqual([]);
  });

  it('warns on dynamic command names', async () => {
    const root = await tempDir();
    const reg = await writeRegistry(root, []);
    await writeRoute(
      root,
      'app/api/x/route.ts',
      `export async function POST(name){ return runtime.runCommand(name, {}); }`
    );
    const findings = await unregisteredCommandCallDetector.run({ root, commandsRegistry: reg });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('DYNAMIC_COMMAND_UNVERIFIABLE');
    expect(findings[0].severity).toBe('warning');
  });

  it('does nothing when no commands registry is provided', async () => {
    const root = await tempDir();
    await writeRoute(
      root,
      'app/api/x/route.ts',
      `export async function POST(){ return runtime.runCommand('X.y', {}); }`
    );
    const findings = await unregisteredCommandCallDetector.run({ root });
    expect(findings).toEqual([]);
  });

  it('scans .js files for runtime.runCommand calls', async () => {
    const root = await tempDir();
    const reg = await writeRegistry(root, [{ entity: 'User', command: 'create' }]);
    await writeRoute(
      root,
      'app/api/legacy/route.js',
      `exports.POST = async function(){ return runtime.runCommand('Foo.bar', {}); };`
    );
    const findings = await unregisteredCommandCallDetector.run({ root, commandsRegistry: reg });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('UNREGISTERED_COMMAND_CALL');
    expect(findings[0].file).toMatch(/\.js$/);
  });

  it('scans .mjs and .cjs files as well', async () => {
    const root = await tempDir();
    const reg = await writeRegistry(root, []);
    await writeRoute(
      root,
      'app/actions/m.mjs',
      `export const f = () => runtime.runCommand('Foo.bar', {});`
    );
    await writeRoute(
      root,
      'app/actions/c.cjs',
      `module.exports.f = () => runtime.runCommand('Baz.qux', {});`
    );
    const findings = await unregisteredCommandCallDetector.run({ root, commandsRegistry: reg });
    expect(findings).toHaveLength(2);
    expect(findings.map(f => f.file).sort()).toEqual(
      ['app/actions/c.cjs', 'app/actions/m.mjs']
    );
  });

  it('ignores test files via exclude globs', async () => {
    const root = await tempDir();
    const reg = await writeRegistry(root, []);
    await writeRoute(
      root,
      'app/api/users/route.test.ts',
      `it('x', () => runtime.runCommand('Bogus.x', {}));`
    );
    const findings = await unregisteredCommandCallDetector.run({ root, commandsRegistry: reg });
    expect(findings).toEqual([]);
  });
});
