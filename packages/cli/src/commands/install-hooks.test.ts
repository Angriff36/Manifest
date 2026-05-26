/**
 * CLI install-hooks command tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { generatePreCommitHookScript, installHooksCommand } from './install-hooks.js';

describe('generatePreCommitHookScript', () => {
  it('includes fmt and validate commands by default', () => {
    const script = generatePreCommitHookScript({
      skipInCi: true,
      provider: 'husky',
      runFmt: true,
      runValidate: true,
    });

    expect(script).toContain('manifest fmt --check');
    expect(script).toContain('manifest validate');
    expect(script).toContain('git diff --cached --name-only');
  });

  it('skips hook execution in CI when configured', () => {
    const script = generatePreCommitHookScript({
      skipInCi: true,
      provider: 'husky',
      runFmt: true,
      runValidate: true,
    });

    expect(script).toContain('if [ -n "$CI" ]');
    expect(script).toContain('MANIFEST_SKIP_HOOKS');
  });

  it('omits validate when disabled', () => {
    const script = generatePreCommitHookScript({
      skipInCi: false,
      provider: 'husky',
      runFmt: true,
      runValidate: false,
    });

    expect(script).toContain('manifest fmt --check');
    expect(script).not.toContain('manifest validate');
  });
});

describe('installHooksCommand', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-install-hooks-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    process.exitCode = 0;
  });

  it('creates .husky/pre-commit by default', async () => {
    await installHooksCommand({ force: true });

    const hookPath = path.join(tempDir, '.husky', 'pre-commit');
    const content = await fs.readFile(hookPath, 'utf-8');
    expect(content).toContain('manifest fmt --check');
    expect(content.startsWith('#!/usr/bin/env sh')).toBe(true);
  });

  it('does not overwrite existing hook without --force', async () => {
    const huskyDir = path.join(tempDir, '.husky');
    await fs.mkdir(huskyDir, { recursive: true });
    await fs.writeFile(path.join(huskyDir, 'pre-commit'), 'existing', 'utf-8');

    await installHooksCommand();

    const content = await fs.readFile(path.join(huskyDir, 'pre-commit'), 'utf-8');
    expect(content).toBe('existing');
  });

  it('writes simple-git-hooks config into package.json', async () => {
    await fs.writeFile(path.join(tempDir, 'package.json'), '{}\n', 'utf-8');

    await installHooksCommand({ provider: 'simple-git-hooks', force: true });

    const pkg = JSON.parse(await fs.readFile(path.join(tempDir, 'package.json'), 'utf-8')) as {
      'simple-git-hooks'?: Record<string, string>;
    };
    expect(pkg['simple-git-hooks']?.['pre-commit']).toContain('manifest fmt --check');
  });
});
