/**
 * Tests for the manifest pack / unpack commands.
 *
 * Validates:
 * - Command registration + help text for both `pack` and `unpack`
 * - Round-trip: JSON IR -> .mir (pack) -> JSON IR (unpack) is lossless
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { packCommand, unpackCommand } from './pack-unpack.js';
import { compileCommand } from './compile.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = path.resolve(__dirname, '..', 'index.ts');

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['tsx', CLI_ENTRY, ...args],
      { shell: process.platform === 'win32', timeout: 60_000 },
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
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-pack-test-'));
});

afterAll(async () => {
  process.chdir(originalCwd);
  if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('manifest pack / unpack', () => {
  it('registers pack with help text', async () => {
    const { stdout, code } = await runCli(['pack', '--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('binary MessagePack');
    expect(stdout).toContain('--output');
  }, 30_000);

  it('registers unpack with help text', async () => {
    const { stdout, code } = await runCli(['unpack', '--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('back to JSON IR');
    expect(stdout).toContain('--output');
  }, 30_000);

  it('round-trips a JSON IR through .mir losslessly', async () => {
    const manifestPath = path.join(tmpDir, 'counter.manifest');
    const irPath = path.join(tmpDir, 'counter.ir.json');
    const mirPath = path.join(tmpDir, 'counter.mir');
    const outPath = path.join(tmpDir, 'counter.out.ir.json');
    await fs.writeFile(manifestPath, SOURCE, 'utf-8');

    // Absolute paths throughout — cwd-independent, so no process.chdir needed.
    const originalLog = console.log;
    console.log = () => {};
    try {
      await compileCommand(manifestPath, {});
      await packCommand(irPath, { output: mirPath });
      await unpackCommand(mirPath, { output: outPath });
    } finally {
      console.log = originalLog;
    }

    const original = JSON.parse(await fs.readFile(irPath, 'utf-8'));

    // The .mir file exists and unpacking reproduces the original IR exactly.
    await expect(fs.access(mirPath)).resolves.toBeUndefined();
    const roundTripped = JSON.parse(await fs.readFile(outPath, 'utf-8'));
    expect(roundTripped).toEqual(original);
  }, 30_000);
});
