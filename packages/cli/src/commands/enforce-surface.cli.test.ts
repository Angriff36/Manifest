import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

/**
 * Invokes the built CLI to confirm the `enforce-surface` command is wired
 * into commander with all spec-required flags and that `--help` succeeds.
 */
const CLI_BIN = path.resolve(__dirname, '../../dist/index.js');

describe('manifest enforce-surface CLI registration', () => {
  it('exposes the command with the documented flags via --help', () => {
    const out = spawnSync(process.execPath, [CLI_BIN, 'enforce-surface', '--help'], {
      encoding: 'utf-8',
    });
    expect(out.status).toBe(0);
    const help = `${out.stdout}\n${out.stderr}`;
    expect(help).toMatch(/enforce-surface/);
    expect(help).toMatch(/--root/);
    expect(help).toMatch(/--commands-registry/);
    expect(help).toMatch(/--entities-registry/);
    expect(help).toMatch(/--bypass-registry/);
    expect(help).toMatch(/--format/);
    expect(help).toMatch(/--strict/);
    expect(help).toMatch(/--include/);
    expect(help).toMatch(/--exclude/);
  });
});
