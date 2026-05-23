import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import {
  configValidateCommand,
  configPrintDefaultsCommand,
  configInspectCommand,
} from './config.js';

/**
 * Capture stdout/stderr around a function call. Helpful for asserting CLI
 * output without parsing chalk colour codes — we strip them via a regex.
 */
async function captureOutput<T>(fn: () => Promise<T>): Promise<{ stdout: string; stderr: string; result: T }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
    stdout.push(args.map(String).join(' '));
  });
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
    stderr.push(args.map(String).join(' '));
  });
  const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdout.push(String(chunk));
    return true;
  });
  try {
    const result = await fn();
    return {
      stdout: stripAnsi(stdout.join('\n')),
      stderr: stripAnsi(stderr.join('\n')),
      result,
    };
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
    writeSpy.mockRestore();
  }
}

// Lightweight ANSI stripper so chalk colours don't break assertions.
// The ESC escape is the entire point of the regex; the no-control-regex
// rule has no in-pattern opt-out beyond a localised disable.
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001b\[[0-9;]*m/g;
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

describe('manifest config validate', () => {
  let tempDir: string;
  const originalCwd = process.cwd();
  let originalExitCode: number | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'manifest-config-cli-'));
    process.chdir(tempDir);
    originalExitCode = process.exitCode;
    process.exitCode = 0;
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    process.exitCode = originalExitCode;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('reports OK when no config file exists (defaults apply)', async () => {
    const { stdout } = await captureOutput(() => configValidateCommand());
    expect(stdout).toContain('No manifest.config.* file found');
    expect(stdout).toContain('Config is valid');
    expect(process.exitCode).toBe(0);
  });

  it('reports OK for a valid config', async () => {
    await fs.writeFile(
      path.join(tempDir, 'manifest.config.yaml'),
      `src: src/**/*.manifest\noutput: ir/\nprojections:\n  nextjs:\n    options:\n      authProvider: nextauth\n`
    );
    const { stdout } = await captureOutput(() => configValidateCommand());
    expect(stdout).toContain('Config is valid');
    expect(process.exitCode).toBe(0);
  });

  it('reports diagnostics and sets non-zero exit for an invalid enum', async () => {
    await fs.writeFile(
      path.join(tempDir, 'manifest.config.yaml'),
      `projections:\n  nextjs:\n    options:\n      authProvider: not-a-real-provider\n`
    );
    const { stderr } = await captureOutput(() => configValidateCommand());
    expect(stderr).toContain('authProvider');
    expect(stderr).toMatch(/allowed:.*clerk/);
    expect(process.exitCode).toBe(1);
  });

  it('reports unknown-property violations with the offending key', async () => {
    await fs.writeFile(
      path.join(tempDir, 'manifest.config.yaml'),
      `projections:\n  nextjs:\n    options:\n      unknownThing: 42\n`
    );
    const { stderr } = await captureOutput(() => configValidateCommand());
    expect(stderr).toMatch(/unknown property "unknownThing"/);
    expect(process.exitCode).toBe(1);
  });

  it('--json emits structured output and the same non-zero exit on failure', async () => {
    await fs.writeFile(
      path.join(tempDir, 'manifest.config.yaml'),
      `projections:\n  nextjs:\n    options:\n      authProvider: bogus\n`
    );
    const { stdout } = await captureOutput(() => configValidateCommand({ json: true }));
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.ok).toBe(false);
    expect(parsed.diagnostics.length).toBeGreaterThan(0);
    expect(process.exitCode).toBe(1);
  });
});

describe('manifest config print-defaults', () => {
  it('emits the canonical defaults snapshot as stable JSON', async () => {
    const { stdout } = await captureOutput(() => configPrintDefaultsCommand({ json: true }));
    const trimmed = stdout.trim();
    const parsed = JSON.parse(trimmed);
    expect(parsed.nextjs.authProvider).toBe('clerk');
    expect(parsed.dispatcher.executionMode).toBe('inline');
    expect(parsed.concreteCommandRoutes.legacyAliasesOnly).toBe(true);
    expect(parsed.tenantProvider.lookupKey).toBe('orgId');
    expect(parsed.routes.basePath).toBe('/api');
  });

  it('is deterministic across runs (key order stable)', async () => {
    const a = await captureOutput(() => configPrintDefaultsCommand({ json: true }));
    const b = await captureOutput(() => configPrintDefaultsCommand({ json: true }));
    expect(a.stdout).toBe(b.stdout);
  });
});

describe('manifest config inspect (print-effective)', () => {
  let tempDir: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'manifest-config-inspect-'));
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('returns defaults-only effective config when no file exists', async () => {
    const { stdout } = await captureOutput(() => configInspectCommand({ json: true }));
    const parsed = JSON.parse(stdout.trim());

    expect(parsed.configPath).toBeNull();
    expect(parsed.build.src).toBe('**/*.manifest');
    expect(parsed.projections.nextjs.options.authProvider).toBe('clerk');
    expect(parsed.projections.nextjs.options.dispatcher.executionMode).toBe('inline');
  });

  it('reflects user overrides under defaults', async () => {
    await fs.writeFile(
      path.join(tempDir, 'manifest.config.yaml'),
      `projections:\n  nextjs:\n    options:\n      authProvider: nextauth\n      appDir: app/api\n      dispatcher:\n        executionMode: externalExecutor\n        executorImportPath: '@my-app/exec'\n`
    );
    const { stdout } = await captureOutput(() => configInspectCommand({ json: true }));
    const parsed = JSON.parse(stdout.trim());

    // user overrides applied
    expect(parsed.projections.nextjs.options.authProvider).toBe('nextauth');
    expect(parsed.projections.nextjs.options.appDir).toBe('app/api');
    expect(parsed.projections.nextjs.options.dispatcher.executionMode).toBe('externalExecutor');
    expect(parsed.projections.nextjs.options.dispatcher.executorImportPath).toBe('@my-app/exec');

    // unspecified dispatcher keys fall through to defaults
    expect(parsed.projections.nextjs.options.dispatcher.executorImportName).toBe('executeManifestCommand');
    // deriveInstanceId default flipped to true (goal step 4: extract for non-create)
    expect(parsed.projections.nextjs.options.dispatcher.deriveInstanceId).toBe(true);

    // unspecified top-level keys still default
    expect(parsed.projections.nextjs.options.tenantIdProperty).toBe('tenantId');
  });

  it('output is stable for CI snapshots', async () => {
    await fs.writeFile(
      path.join(tempDir, 'manifest.config.yaml'),
      `output: my-ir/\nprojections:\n  nextjs:\n    output: my-generated/\n    options:\n      strictMode: false\n`
    );
    const a = await captureOutput(() => configInspectCommand({ json: true }));
    const b = await captureOutput(() => configInspectCommand({ json: true }));
    expect(a.stdout).toBe(b.stdout);
  });

  it('records the active config path', async () => {
    const configPath = path.join(tempDir, 'manifest.config.yaml');
    await fs.writeFile(configPath, 'src: src/**/*.manifest\n');
    const { stdout } = await captureOutput(() => configInspectCommand({ json: true }));
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.configPath).toBe(configPath);
  });
});
