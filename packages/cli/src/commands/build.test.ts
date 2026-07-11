/**
 * Tests for `manifest build --all` (config-driven compile + generate).
 *
 * Validates:
 * - The happy path chains compile-all + generate-all from one call, writing
 *   the merged IR and every configured projection's output.
 * - Single-run flags that conflict with --all are rejected with a clear error.
 */

import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

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

const SOURCE = 'entity Widget {\n  property required id: string\n  property count: number = 0\n}\n';

async function findFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string): Promise<void> {
    for (const entry of await fs.readdir(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push(full);
    }
  }
  await walk(dir);
  return out;
}

describe('manifest build --all', () => {
  it('compiles all sources then generates every configured projection in one call', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-build-all-'));
    await fs.mkdir(path.join(tempDir, 'src'));
    await fs.writeFile(path.join(tempDir, 'src', 'widget.manifest'), SOURCE, 'utf-8');
    await fs.writeFile(
      path.join(tempDir, 'manifest.config.yaml'),
      [
        'src: src/**/*.manifest',
        'output: ir/',
        'projections:',
        '  nextjs:',
        '    output: apps/api/',
        '    options:',
        '      appDir: app/api',
        '  zod:',
        '    output: schemas/',
        '',
      ].join('\n'),
      'utf-8',
    );

    try {
      // Run the real CLI so the compile-all -> generate-all chain resolves its
      // dynamic imports (multi-compiler, projections) via Node, isolated from
      // the vitest worker's cwd and module graph.
      const { code, stderr } = await runCli(['build', '--all'], tempDir);
      expect(code, stderr).toBe(0);

      const rel = (await findFiles(tempDir)).map((f) =>
        path.relative(tempDir, f).replace(/\\/g, '/'),
      );
      // Compile-all wrote the merged IR, and both projections wrote their output.
      expect(rel.some((f) => f.startsWith('ir/') && f.endsWith('.ir.json'))).toBe(true);
      expect(rel.some((f) => f.startsWith('apps/api/'))).toBe(true);
      expect(rel.some((f) => f.startsWith('schemas/'))).toBe(true);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('rejects single-run flags combined with --all', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-build-all-conflict-'));
    try {
      const { code, stderr } = await runCli(['build', '--all', '-p', 'prisma'], tempDir);
      expect(code).toBe(1);
      expect(stderr).toContain('--all is config-driven');
      expect(stderr).toContain('-p/--projection');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }, 60_000);
});
