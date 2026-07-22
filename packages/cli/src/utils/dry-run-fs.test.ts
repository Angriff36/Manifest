import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  writeTextFile,
  writeBinaryFile,
  ensureDir,
  writeTextFileSync,
  assertDryRunCheckExclusive,
} from './dry-run-fs.js';

describe('dry-run-fs', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-dry-run-'));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('dry-run writeTextFile does not create files', async () => {
    const target = path.join(tmp, 'out', 'a.txt');
    await writeTextFile(target, 'hello', { dryRun: true, cwd: tmp });
    await expect(fs.access(target)).rejects.toThrow();
  });

  it('live writeTextFile creates files', async () => {
    const target = path.join(tmp, 'out', 'a.txt');
    await writeTextFile(target, 'hello', { dryRun: false, cwd: tmp });
    expect(await fs.readFile(target, 'utf-8')).toBe('hello');
  });

  it('dry-run writeBinaryFile does not create files', async () => {
    const target = path.join(tmp, 'bin.dat');
    await writeBinaryFile(target, Buffer.from([1, 2, 3]), { dryRun: true, cwd: tmp });
    await expect(fs.access(target)).rejects.toThrow();
  });

  it('dry-run ensureDir does not create directories', async () => {
    const dir = path.join(tmp, 'nested');
    await ensureDir(dir, { dryRun: true, cwd: tmp });
    await expect(fs.access(dir)).rejects.toThrow();
  });

  it('dry-run writeTextFileSync does not create files', () => {
    const target = path.join(tmp, 'sync.txt');
    writeTextFileSync(target, 'sync', { dryRun: true, cwd: tmp });
    expect(existsSync(target)).toBe(false);
  });

  it('rejects --dry-run with --check', () => {
    expect(() => assertDryRunCheckExclusive({ dryRun: true, check: true })).toThrow(
      /Cannot combine --dry-run with --check/,
    );
  });
});
