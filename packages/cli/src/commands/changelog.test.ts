import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

// ============================================================================
// Manifest sources for testing
// ============================================================================

const MANIFEST_V1 = `entity User {
  id: uuid required
  email: string required unique
}`;

const MANIFEST_V2 = `entity User {
  id: uuid required
  email: string required unique
  name: string optional
}

entity Post {
  id: uuid required
  title: string required
}`;

// ============================================================================
// Console/process capture utilities (mirror versions.test.ts pattern)
// ============================================================================

let tmpDir: string;

const origLog = console.log;
const origError = console.error;
const origWarn = console.warn;
const origExit = process.exit;

interface OutputCapture {
  out: string;
  err: string;
}

function captureOutput(): OutputCapture {
  const cap: OutputCapture = { out: '', err: '' };
  console.log = (...args: unknown[]) => { cap.out += args.join(' ') + '\n'; };
  console.error = (...args: unknown[]) => { cap.err += args.join(' ') + '\n'; };
  console.warn = (...args: unknown[]) => { cap.err += args.join(' ') + '\n'; };
  return cap;
}

function restoreOutput(): void {
  console.log = origLog;
  console.error = origError;
  console.warn = origWarn;
}

function suppressExit(): { exitCode: number | undefined } {
  const state = { exitCode: undefined as number | undefined };
  process.exit = ((code?: number) => { state.exitCode = code ?? 0; }) as never;
  return state;
}

function restoreExit(): void {
  process.exit = origExit;
}

function git(cwd: string, cmd: string): string {
  return execSync(`git ${cmd}`, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
}

// ============================================================================
// Test suite
// ============================================================================

describe('CLI changelog command', () => {
  let origCwd: string;

  beforeEach(async () => {
    origCwd = process.cwd();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-changelog-test-'));

    // Set up a Git repo with two tags
    git(tmpDir, 'init');
    git(tmpDir, 'config user.email "test@test.com"');
    git(tmpDir, 'config user.name "Test"');

    // v1: simple manifest
    await fs.writeFile(path.join(tmpDir, 'app.manifest'), MANIFEST_V1, 'utf-8');
    git(tmpDir, 'add -A');
    git(tmpDir, 'commit -m "v1"');
    git(tmpDir, 'tag v1.0.0');

    // v2: modified manifest
    await fs.writeFile(path.join(tmpDir, 'app.manifest'), MANIFEST_V2, 'utf-8');
    git(tmpDir, 'add -A');
    git(tmpDir, 'commit -m "v2"');
    git(tmpDir, 'tag v1.1.0');

    process.chdir(tmpDir);
  });

  afterEach(async () => {
    restoreOutput();
    restoreExit();
    process.chdir(origCwd);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // --------------------------------------------------------------------------
  // Basic Markdown output
  // --------------------------------------------------------------------------
  it('generates Markdown changelog between two Git tags', async () => {
    const { changelogCommand } = await import('./changelog.js');
    const cap = captureOutput();
    await changelogCommand('v1.0.0', 'v1.1.0', {});
    restoreOutput();

    // Should contain Keep a Changelog sections
    expect(cap.out).toContain('## ');
    expect(cap.out).toContain('v1.0.0');
    expect(cap.out).toContain('v1.1.0');
    // Should report new entity Post
    expect(cap.out).toContain('Post');
    // Should be Markdown formatted
    expect(cap.out).toContain('### Added');
  });

  // --------------------------------------------------------------------------
  // JSON output
  // --------------------------------------------------------------------------
  it('generates JSON output with --json', async () => {
    const { changelogCommand } = await import('./changelog.js');
    const cap = captureOutput();
    await changelogCommand('v1.0.0', 'v1.1.0', { json: true });
    restoreOutput();

    const parsed = JSON.parse(cap.out);
    expect(parsed.fromRef).toBe('v1.0.0');
    expect(parsed.toRef).toBe('v1.1.0');
    expect(parsed.diff).toBeDefined();
    expect(parsed.diff.summary.hasChanges).toBe(true);
    expect(parsed.breaking).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // Output to file
  // --------------------------------------------------------------------------
  it('writes Markdown to file with --output', async () => {
    const { changelogCommand } = await import('./changelog.js');
    const outPath = path.join(tmpDir, 'CHANGELOG.md');
    const cap = captureOutput();
    await changelogCommand('v1.0.0', 'v1.1.0', { output: outPath });
    restoreOutput();

    expect(cap.out).toContain('Changelog written to');
    const content = await fs.readFile(outPath, 'utf-8');
    expect(content).toContain('### Added');
    expect(content).toContain('Post');
  });

  // --------------------------------------------------------------------------
  // Custom title
  // --------------------------------------------------------------------------
  it('uses custom title when provided', async () => {
    const { changelogCommand } = await import('./changelog.js');
    const cap = captureOutput();
    await changelogCommand('v1.0.0', 'v1.1.0', { title: 'Release 1.1.0' });
    restoreOutput();

    expect(cap.out).toContain('## Release 1.1.0');
  });

  // --------------------------------------------------------------------------
  // No changes between identical refs
  // --------------------------------------------------------------------------
  it('reports no changes for identical refs', async () => {
    const { changelogCommand } = await import('./changelog.js');
    const cap = captureOutput();
    await changelogCommand('v1.0.0', 'v1.0.0', {});
    restoreOutput();

    expect(cap.out).toContain('No changes detected');
  });

  // --------------------------------------------------------------------------
  // Invalid ref
  // --------------------------------------------------------------------------
  it('exits with error for nonexistent ref', async () => {
    const { changelogCommand } = await import('./changelog.js');
    captureOutput();
    const exitState = suppressExit();
    await changelogCommand('nonexistent-tag', 'v1.0.0', {});
    expect(exitState.exitCode).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Breaking changes are detected and shown
  // --------------------------------------------------------------------------
  it('shows removed entities as breaking changes or removed section', async () => {
    const { changelogCommand } = await import('./changelog.js');
    // Compare v2 → v1 (removing Post entity)
    const cap = captureOutput();
    await changelogCommand('v1.1.0', 'v1.0.0', {});
    restoreOutput();

    // Should show Post was removed
    expect(cap.out).toContain('Post');
    // Should have a Removed or Breaking section
    const hasRemoved = cap.out.includes('### Removed') || cap.out.includes('### Breaking');
    expect(hasRemoved).toBe(true);
  });

  // --------------------------------------------------------------------------
  // JSON output to file
  // --------------------------------------------------------------------------
  it('writes JSON to file with --json --output', async () => {
    const { changelogCommand } = await import('./changelog.js');
    const outPath = path.join(tmpDir, 'changelog.json');
    const cap = captureOutput();
    await changelogCommand('v1.0.0', 'v1.1.0', { json: true, output: outPath });
    restoreOutput();

    expect(cap.out).toContain('Changelog JSON written to');
    const content = await fs.readFile(outPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.diff.summary.hasChanges).toBe(true);
  });
});
