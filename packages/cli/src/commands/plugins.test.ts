/**
 * Tests for plugin activation in the CLI (Workstream 2C task 4).
 *
 * Before activation, `plugins:` declarations were schema-valid but inert —
 * nothing loaded them. Now the CLI, at startup, loads declared plugins and
 * registers their CLI commands, and `manifest plugins list` reports real load
 * status. Failures degrade gracefully (diagnostics, never a bricked CLI).
 *
 * These are end-to-end child-process tests through the real index.ts startup
 * path (the CLI suite's established pattern — see single-run-config.test.ts).
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
const FIXTURE_PLUGIN = path.resolve(
  __dirname,
  '../../../../src/manifest/__fixtures__/manifest-plugin-fixture.mjs',
);

async function runCli(
  args: string[],
  cwd: string,
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

async function makeProject(config: string, files: Record<string, string> = {}): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-plugins-'));
  await fs.writeFile(path.join(dir, 'manifest.config.yaml'), config, 'utf-8');
  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(path.join(dir, name), content, 'utf-8');
  }
  return dir;
}

describe('CLI plugin activation — a declared plugin contributes a command', () => {
  it('registers the plugin command in --help and executes it', async () => {
    const dir = await makeProject('plugins:\n  - module: "./plugin.mjs"\n');
    await fs.copyFile(FIXTURE_PLUGIN, path.join(dir, 'plugin.mjs'));
    try {
      const help = await runCli(['--help'], dir);
      expect(help.code, help.stderr).toBe(0);
      expect(help.stdout).toContain('greet');

      const greet = await runCli(['greet'], dir);
      expect(greet.code, greet.stderr).toBe(0);
      expect(greet.stdout).toContain('hello from fixture plugin');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 90_000);

  it('reports real load status via `plugins list --json`', async () => {
    const dir = await makeProject('plugins:\n  - module: "./plugin.mjs"\n');
    await fs.copyFile(FIXTURE_PLUGIN, path.join(dir, 'plugin.mjs'));
    try {
      const res = await runCli(['plugins', 'list', '--json'], dir);
      expect(res.code, res.stderr).toBe(0);
      const report = JSON.parse(res.stdout);
      expect(report.loaded).toHaveLength(1);
      expect(report.loaded[0].name).toBe('manifest-plugin-fixture');
      expect(report.loaded[0].builtins).toContain('double');
      expect(report.loaded[0].storeAdapters).toContain('redis');
      expect(report.loaded[0].cliCommands).toContain('greet');
      expect(report.diagnostics.some((d: { severity: string }) => d.severity === 'error')).toBe(false);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe('CLI plugin activation — a failing plugin degrades gracefully', () => {
  it('surfaces a diagnostic and keeps the CLI usable', async () => {
    const dir = await makeProject('plugins:\n  - module: "./broken.mjs"\n', {
      'broken.mjs': "throw new Error('boom on import');\n",
    });
    try {
      // `plugins list` reports the error but exits 0.
      const list = await runCli(['plugins', 'list', '--json'], dir);
      expect(list.code, list.stderr).toBe(0);
      const report = JSON.parse(list.stdout);
      expect(report.loaded).toHaveLength(0);
      const errors = report.diagnostics.filter((d: { severity: string }) => d.severity === 'error');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toMatch(/Failed to load plugin/);

      // A broken plugin must not brick unrelated commands.
      const help = await runCli(['--help'], dir);
      expect(help.code).toBe(0);
      expect(help.stdout).toContain('Usage:');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 90_000);
});
