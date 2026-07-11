import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  existingCommandAvailableDetector,
  tokenize,
  multisetMatch,
} from './existing-command-available.js';

async function tempDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'eca-'));
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
    }),
  );
  return reg;
}

async function writeFile(root: string, rel: string, body: string) {
  const dir = path.join(root, path.dirname(rel));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(root, rel), body);
}

describe('tokenize', () => {
  it('splits camelCase', () => {
    expect(tokenize('createUser')).toEqual(['create', 'user']);
  });
  it('splits PascalCase', () => {
    expect(tokenize('CreateUser')).toEqual(['create', 'user']);
  });
  it('splits snake_case', () => {
    expect(tokenize('create_user')).toEqual(['create', 'user']);
  });
  it('splits kebab-case', () => {
    expect(tokenize('create-user')).toEqual(['create', 'user']);
  });
});

describe('multisetMatch', () => {
  it('matches identical tokens in any order', () => {
    expect(multisetMatch(['create', 'user'], ['user', 'create'])).toBe(true);
  });
  it('rejects on extra token', () => {
    expect(multisetMatch(['create', 'user'], ['create', 'user', 'admin'])).toBe(false);
  });
  it('rejects on missing token', () => {
    expect(multisetMatch(['create'], ['create', 'user'])).toBe(false);
  });
});

describe('existingCommandAvailableDetector', () => {
  it('flags a helper named like a registered command that bypasses runtime', async () => {
    const root = await tempDir();
    const reg = await writeRegistry(root, [{ entity: 'User', command: 'create' }]);
    await writeFile(
      root,
      'app/api/helpers/route.ts',
      `export async function createUser(input){ return await db.user.insert(input); }`,
    );
    const findings = await existingCommandAvailableDetector.run({
      root,
      commandsRegistry: reg,
    });
    const hit = findings.find((f) => f.code === 'EXISTING_COMMAND_AVAILABLE');
    expect(hit).toBeDefined();
    expect(hit!.entity).toBe('User');
    expect(hit!.command).toBe('create');
  });

  it('does NOT flag a helper that dispatches through runtime.runCommand for the same command', async () => {
    const root = await tempDir();
    const reg = await writeRegistry(root, [{ entity: 'User', command: 'create' }]);
    await writeFile(
      root,
      'app/api/users/route.ts',
      `export async function createUser(input){ return await runtime.runCommand('User.create', input); }`,
    );
    const findings = await existingCommandAvailableDetector.run({
      root,
      commandsRegistry: reg,
    });
    expect(findings).toEqual([]);
  });

  it('does NOT flag a single-token name (avoids noise from generic helpers)', async () => {
    const root = await tempDir();
    const reg = await writeRegistry(root, [{ entity: 'User', command: 'create' }]);
    await writeFile(root, 'app/api/x/route.ts', `export function create(){ return 1; }`);
    const findings = await existingCommandAvailableDetector.run({
      root,
      commandsRegistry: reg,
    });
    expect(findings).toEqual([]);
  });

  it('does nothing when no commands registry is provided', async () => {
    const root = await tempDir();
    await writeFile(root, 'app/api/x/route.ts', `export function createUser(){ return 1; }`);
    const findings = await existingCommandAvailableDetector.run({ root });
    expect(findings).toEqual([]);
  });
});
