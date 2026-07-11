/**
 * Tests for the manifest profile command.
 *
 * Validates:
 * - Command registration + help text
 * - Safe-path execution: profiling a compiled IR with no target command
 *   initializes the runtime and returns cleanly (no throw, no exit).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { compileCommand } from './compile.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = path.resolve(__dirname, '..', 'index.ts');

async function runCli(
  args: string[],
  cwd?: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['tsx', CLI_ENTRY, ...args],
      { shell: process.platform === 'win32', timeout: 60_000, cwd },
    );
    return { stdout, stderr, code: 0 };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', code: e.code ?? 1 };
  }
}

const SOURCE =
  'entity Counter {\n  property required id: string\n  property count: number = 0\n}\n';

let tmpDir: string;
const originalCwd = process.cwd();

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-profile-test-'));
});

afterAll(async () => {
  process.chdir(originalCwd);
  if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('manifest profile', () => {
  it('is registered with help text and expected options', async () => {
    const { stdout, code } = await runCli(['profile', '--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('Profile command execution timing');
    expect(stdout).toContain('--ir');
    expect(stdout).toContain('--command');
    expect(stdout).toContain('--iterations');
  }, 30_000);

  it('profiles a compiled IR with no target command and exits cleanly', async () => {
    const manifestPath = path.join(tmpDir, 'counter.manifest');
    const irPath = path.join(tmpDir, 'counter.ir.json');
    await fs.writeFile(manifestPath, SOURCE, 'utf-8');

    // Compile in-process (ir-compiler is aliased under vitest; absolute paths
    // keep this cwd-independent). Run profile via the real CLI so its runtime
    // engine import resolves via Node, isolated from the vitest worker.
    const originalLog = console.log;
    console.log = () => {};
    try {
      await compileCommand(manifestPath, {});
    } finally {
      console.log = originalLog;
    }

    const { code, stdout, stderr } = await runCli(['profile', '--ir', irPath], tmpDir);
    expect(code, stderr).toBe(0);
    expect(stdout).toContain('No command specified');
  }, 60_000);
});
