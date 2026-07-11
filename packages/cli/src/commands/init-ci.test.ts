/**
 * CLI init --ci command tests
 *
 * Tests the manifest init --ci github command for workflow generation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { generateGitHubWorkflow, initCiCommand } from './init-ci.js';

describe('generateGitHubWorkflow', () => {
  it('generates valid YAML with default node versions', () => {
    const workflow = generateGitHubWorkflow(['18', '20', '22']);

    expect(workflow).toContain('name: Manifest CI');
    expect(workflow).toContain("node-version: ['18', '20', '22']");
    expect(workflow).toContain('npx manifest validate');
    expect(workflow).toContain('npx manifest scan');
    expect(workflow).toContain('npm test');
  });

  it('includes matrix strategy with fail-fast disabled', () => {
    const workflow = generateGitHubWorkflow(['20']);

    expect(workflow).toContain('fail-fast: false');
    expect(workflow).toContain('matrix:');
  });

  it('includes conformance regen job on main branch pushes', () => {
    const workflow = generateGitHubWorkflow(['20']);

    expect(workflow).toContain('conformance-regen:');
    expect(workflow).toContain(
      "if: github.ref == 'refs/heads/main' && github.event_name == 'push'",
    );
    expect(workflow).toContain('npm run conformance:regen');
  });

  it('conformance regen job commits changes when detected', () => {
    const workflow = generateGitHubWorkflow(['20']);

    expect(workflow).toContain('git diff --quiet');
    expect(workflow).toContain('git commit -m "chore: regenerate conformance fixtures [skip ci]"');
    expect(workflow).toContain('git push');
  });

  it('respects custom node versions', () => {
    const workflow = generateGitHubWorkflow(['16', '18', '20', '22']);

    expect(workflow).toContain("node-version: ['16', '18', '20', '22']");
  });

  it('triggers on push to main and pull_request to main', () => {
    const workflow = generateGitHubWorkflow(['20']);

    expect(workflow).toContain('push:');
    expect(workflow).toContain('branches: [main]');
    expect(workflow).toContain('pull_request:');
  });

  it('conformance regen needs validate-and-test to pass first', () => {
    const workflow = generateGitHubWorkflow(['20']);

    expect(workflow).toContain('needs: [validate-and-test]');
  });
});

describe('initCiCommand', () => {
  let tempDir: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-init-ci-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    logSpy.mockRestore();
    errorSpy.mockRestore();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('creates .github/workflows/manifest-ci.yml', async () => {
    await initCiCommand('github');

    const workflowPath = path.join(tempDir, '.github', 'workflows', 'manifest-ci.yml');
    const content = await fs.readFile(workflowPath, 'utf-8');

    expect(content).toContain('name: Manifest CI');
    expect(content).toContain('npx manifest validate');
    expect(content).toContain('npx manifest scan');
    expect(content).toContain('npm test');
  });

  it('refuses unsupported providers', async () => {
    await initCiCommand('gitlab');

    const output = errorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Unsupported CI provider');
    expect(process.exitCode).toBe(1);

    // Reset
    process.exitCode = undefined as any;
  });

  it('refuses to overwrite existing file without --force', async () => {
    // Create the file first
    const dir = path.join(tempDir, '.github', 'workflows');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'manifest-ci.yml'), 'existing', 'utf-8');

    await initCiCommand('github');

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('already exists');
  });

  it('overwrites existing file with --force', async () => {
    // Create the file first
    const dir = path.join(tempDir, '.github', 'workflows');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'manifest-ci.yml'), 'existing', 'utf-8');

    await initCiCommand('github', { force: true });

    const content = await fs.readFile(path.join(dir, 'manifest-ci.yml'), 'utf-8');
    expect(content).toContain('name: Manifest CI');
  });

  it('respects custom --node-versions', async () => {
    await initCiCommand('github', { nodeVersions: '16,20' });

    const workflowPath = path.join(tempDir, '.github', 'workflows', 'manifest-ci.yml');
    const content = await fs.readFile(workflowPath, 'utf-8');

    expect(content).toContain("'16'");
    expect(content).toContain("'20'");
  });
});
