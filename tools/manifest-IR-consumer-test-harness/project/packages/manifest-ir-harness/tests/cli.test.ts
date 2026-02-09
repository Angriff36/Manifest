import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const PKG_ROOT = join(import.meta.dirname, '..');
const CLI = `npx tsx ${join(PKG_ROOT, 'src/cli/index.ts')}`;
const FIXTURES_DIR = join(PKG_ROOT, 'fixtures');

function runCli(args: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`${CLI} ${args}`, {
      cwd: PKG_ROOT,
      encoding: 'utf-8',
      timeout: 30000,
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    const error = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: (error.stdout ?? '') + (error.stderr ?? ''),
      exitCode: error.status ?? 1,
    };
  }
}

describe('CLI: harness run', () => {
  it('runs a passing fixture with --ir and --script', () => {
    const irPath = join(FIXTURES_DIR, '01-simple-command/test.ir.json');
    const scriptPath = join(FIXTURES_DIR, '01-simple-command/script.json');

    const { stdout, exitCode } = runCli(`run --ir "${irPath}" --script "${scriptPath}"`);

    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout);
    expect(output.summary.passed).toBe(1);
    expect(output.summary.failed).toBe(0);
  });

  it('runs a guard denial fixture and exits with code 0 (assertions pass)', () => {
    const irPath = join(FIXTURES_DIR, '02-guard-denial/test.ir.json');
    const scriptPath = join(FIXTURES_DIR, '02-guard-denial/script.json');

    const { stdout, exitCode } = runCli(`run --ir "${irPath}" --script "${scriptPath}"`);

    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout);
    expect(output.summary.passed).toBe(1);
    expect(output.summary.failed).toBe(0);
    expect(output.execution.steps[0].result.guardFailures).toBeTruthy();
  });

  it('fails when neither --ir nor --manifest is specified', () => {
    const scriptPath = join(FIXTURES_DIR, '01-simple-command/script.json');
    const { exitCode, stdout } = runCli(`run --script "${scriptPath}"`);
    expect(exitCode).not.toBe(0);
    expect(stdout).toContain('--ir');
  });

  it('fails when script file does not exist', () => {
    const irPath = join(FIXTURES_DIR, '01-simple-command/test.ir.json');
    const { exitCode } = runCli(`run --ir "${irPath}" --script "/nonexistent/script.json"`);
    expect(exitCode).not.toBe(0);
  });
});

describe('CLI: harness fixtures', () => {
  it('discovers and runs all fixtures in a directory', () => {
    const { stdout, exitCode } = runCli(`fixtures --dir "${FIXTURES_DIR}"`);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Discovered');
    expect(stdout).toContain('PASS');
    expect(stdout).toContain('01-simple-command');
    expect(stdout).toContain('02-guard-denial');
    expect(stdout).toContain('03-events-ordering');
  });

  it('reports no fixtures for empty directory', () => {
    const { stdout, exitCode } = runCli(`fixtures --dir "/tmp"`);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('No fixtures discovered');
  });
});
