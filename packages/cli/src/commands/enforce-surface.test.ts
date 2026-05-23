import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { enforceSurfaceCommand } from './enforce-surface.js';

async function tempDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'es-'));
}

async function writeRegistry(root: string, commands: Array<{ entity: string; command: string }>) {
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

async function writeRoute(root: string, rel: string, body: string) {
  const dir = path.join(root, path.dirname(rel));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(root, rel), body);
}

let exitCodeBefore: number | undefined;
beforeEach(() => {
  exitCodeBefore = process.exitCode;
  process.exitCode = 0;
});
afterEach(() => {
  process.exitCode = exitCodeBefore;
});

describe('enforceSurfaceCommand', () => {
  it('emits ok:true when surface aligns with registry', async () => {
    const root = await tempDir();
    const reg = await writeRegistry(root, [{ entity: 'User', command: 'create' }]);
    // Server action (not matched by route-drift globs) with a single-token
    // function name (not matched by existing-command-available).
    await writeRoute(
      root,
      'app/actions/createUserAction.ts',
      `export async function POST(input){ return await runtime.runCommand('User.create', input); }`
    );
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await enforceSurfaceCommand({
      root,
      commandsRegistry: reg,
      format: 'json',
      strict: true,
    });
    spy.mockRestore();
    expect(res.ok).toBe(true);
    expect(res.summary.errors).toBe(0);
    expect(process.exitCode).toBe(0);
  });

  it('reports UNREGISTERED_COMMAND_CALL and sets exitCode 1 in strict mode', async () => {
    const root = await tempDir();
    const reg = await writeRegistry(root, []);
    await writeRoute(
      root,
      'app/api/x/route.ts',
      `export async function POST(){ return await runtime.runCommand('Foo.bar', {}); }`
    );
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await enforceSurfaceCommand({
      root,
      commandsRegistry: reg,
      format: 'json',
      strict: true,
    });
    spy.mockRestore();
    expect(res.ok).toBe(false);
    expect(res.findings.some((f) => f.code === 'UNREGISTERED_COMMAND_CALL')).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('non-strict does not set exitCode 1 even on errors', async () => {
    const root = await tempDir();
    const reg = await writeRegistry(root, []);
    await writeRoute(
      root,
      'app/api/x/route.ts',
      `export async function POST(){ return await runtime.runCommand('Foo.bar', {}); }`
    );
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await enforceSurfaceCommand({
      root,
      commandsRegistry: reg,
      format: 'json',
    });
    spy.mockRestore();
    expect(res.findings.some((f) => f.code === 'UNREGISTERED_COMMAND_CALL')).toBe(true);
    expect(process.exitCode).toBe(0);
  });

  it('maps DIRECT_WRITE detector code to DIRECT_WRITE_BYPASS', async () => {
    const root = await tempDir();
    const reg = await writeRegistry(root, []);
    await writeRoute(
      root,
      'app/api/audit/route.ts',
      `export async function POST(){ return prisma.user.create({ data: {} }); }`
    );
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await enforceSurfaceCommand({
      root,
      commandsRegistry: reg,
      format: 'json',
      strict: true,
    });
    spy.mockRestore();
    expect(res.findings.some((f) => f.code === 'DIRECT_WRITE_BYPASS')).toBe(true);
  });

  it('downgrades DYNAMIC_COMMAND_UNVERIFIABLE to warning in non-strict mode', async () => {
    const root = await tempDir();
    const reg = await writeRegistry(root, []);
    await writeRoute(
      root,
      'app/api/x/route.ts',
      `export async function POST(name){ return runtime.runCommand(name, {}); }`
    );
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await enforceSurfaceCommand({
      root,
      commandsRegistry: reg,
      format: 'json',
    });
    spy.mockRestore();
    const dyn = res.findings.find((f) => f.code === 'DYNAMIC_COMMAND_UNVERIFIABLE');
    expect(dyn).toBeDefined();
    expect(dyn!.severity).toBe('warning');
    expect(process.exitCode).toBe(0);
  });

  it('escalates DYNAMIC_COMMAND_UNVERIFIABLE to error in --strict and fails', async () => {
    const root = await tempDir();
    const reg = await writeRegistry(root, []);
    await writeRoute(
      root,
      'app/api/x/route.ts',
      `export async function POST(name){ return runtime.runCommand(name, {}); }`
    );
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await enforceSurfaceCommand({
      root,
      commandsRegistry: reg,
      format: 'json',
      strict: true,
    });
    spy.mockRestore();
    const dyn = res.findings.find((f) => f.code === 'DYNAMIC_COMMAND_UNVERIFIABLE');
    expect(dyn!.severity).toBe('error');
    expect(res.ok).toBe(false);
    expect(process.exitCode).toBe(1);
  });

  it('produces JSON shape matching the spec output_contract', async () => {
    const root = await tempDir();
    const reg = await writeRegistry(root, []);
    let captured = '';
    const spy = vi.spyOn(console, 'log').mockImplementation((s) => {
      captured = String(s);
    });
    await enforceSurfaceCommand({ root, commandsRegistry: reg, format: 'json' });
    spy.mockRestore();
    const j = JSON.parse(captured);
    expect(j).toHaveProperty('ok');
    expect(j).toHaveProperty('root');
    expect(j.registry).toHaveProperty('commandsRegistry');
    expect(j.registry).toHaveProperty('entitiesRegistry');
    expect(j.summary).toHaveProperty('errors');
    expect(j.summary).toHaveProperty('warnings');
    expect(j.summary).toHaveProperty('byCode');
    expect(Array.isArray(j.findings)).toBe(true);
  });

  it('honors --include by widening the scan surface', async () => {
    const root = await tempDir();
    const reg = await writeRegistry(root, []);
    // File lives outside the default scan globs (no app/, no api/).
    await writeRoute(
      root,
      'lib/server/legacy.ts',
      `export async function POST(){ return runtime.runCommand('Foo.bar', {}); }`
    );
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const without = await enforceSurfaceCommand({
      root,
      commandsRegistry: reg,
      format: 'json',
    });
    const withInclude = await enforceSurfaceCommand({
      root,
      commandsRegistry: reg,
      format: 'json',
      include: ['lib/**/*.{ts,js}'],
    });
    spy.mockRestore();
    expect(without.findings.find(f => f.code === 'UNREGISTERED_COMMAND_CALL')).toBeUndefined();
    expect(withInclude.findings.find(f => f.code === 'UNREGISTERED_COMMAND_CALL')).toBeDefined();
  });

  it('honors --exclude by suppressing a path that would otherwise be flagged', async () => {
    const root = await tempDir();
    const reg = await writeRegistry(root, []);
    await writeRoute(
      root,
      'app/api/legacy/route.ts',
      `export async function POST(){ return runtime.runCommand('Foo.bar', {}); }`
    );
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const without = await enforceSurfaceCommand({
      root,
      commandsRegistry: reg,
      format: 'json',
    });
    const withExclude = await enforceSurfaceCommand({
      root,
      commandsRegistry: reg,
      format: 'json',
      exclude: ['app/api/legacy/**'],
    });
    spy.mockRestore();
    expect(without.findings.find(f => f.code === 'UNREGISTERED_COMMAND_CALL')).toBeDefined();
    expect(withExclude.findings.find(f => f.code === 'UNREGISTERED_COMMAND_CALL')).toBeUndefined();
  });

  it('renders text output with summary counts when format is text', async () => {
    const root = await tempDir();
    const reg = await writeRegistry(root, []);
    await writeRoute(
      root,
      'app/api/x/route.ts',
      `export async function POST(){ return runtime.runCommand('Foo.bar', {}); }`
    );
    const captures: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      captures.push(args.map(String).join(' '));
    });
    await enforceSurfaceCommand({ root, commandsRegistry: reg, format: 'text' });
    spy.mockRestore();
    const joined = captures.join('\n');
    expect(joined).toMatch(/enforce-surface/);
    expect(joined).toMatch(/UNREGISTERED_COMMAND_CALL/);
  });
});
