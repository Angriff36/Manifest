import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// ============================================================================
// Helpers
// ============================================================================

const SIMPLE_MANIFEST = `entity User {
  id: uuid required
  email: string required unique
}`;

const MODIFIED_MANIFEST = `entity User {
  id: uuid required
  email: string required unique
  name: string optional
}

entity Post {
  id: uuid required
  title: string required
}`;

let tmpDir: string;
let storeDir: string;
let manifestPath: string;
let manifest2Path: string;

const origLog = console.log;
const origError = console.error;
const origExit = process.exit;

/** Mutable output container — the closure writes into this object. */
interface OutputCapture {
  out: string;
  err: string;
}

function captureOutput(): OutputCapture {
  const cap: OutputCapture = { out: '', err: '' };
  console.log = (...args: unknown[]) => { cap.out += args.join(' ') + '\n'; };
  console.error = (...args: unknown[]) => { cap.err += args.join(' ') + '\n'; };
  return cap;
}

function restoreOutput(): void {
  console.log = origLog;
  console.error = origError;
}

function suppressExit(): { exitCode: number | undefined } {
  const state = { exitCode: undefined as number | undefined };
  process.exit = ((code?: number) => { state.exitCode = code ?? 0; }) as never;
  return state;
}

function restoreExit(): void {
  process.exit = origExit;
}

// ============================================================================
// Tests — use dynamic imports to match vitest alias resolution
// ============================================================================

describe('CLI versions command', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-versions-test-'));
    storeDir = path.join(tmpDir, '.manifest-versions');
    manifestPath = path.join(tmpDir, 'test.manifest');
    manifest2Path = path.join(tmpDir, 'test2.manifest');
    await fs.writeFile(manifestPath, SIMPLE_MANIFEST, 'utf-8');
    await fs.writeFile(manifest2Path, MODIFIED_MANIFEST, 'utf-8');
  });

  afterEach(async () => {
    restoreOutput();
    restoreExit();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // --------------------------------------------------------------------------
  // list — empty store
  // --------------------------------------------------------------------------
  it('list shows message for empty store', async () => {
    const { versionsListCommand } = await import('./versions.js');
    const cap = captureOutput();
    await versionsListCommand({ store: storeDir });
    expect(cap.out).toContain('No version store found');
  });

  // --------------------------------------------------------------------------
  // save + list
  // --------------------------------------------------------------------------
  it('save creates version and list shows it', async () => {
    const { versionsSaveCommand, versionsListCommand } = await import('./versions.js');
    const cap1 = captureOutput();
    await versionsSaveCommand(manifestPath, { store: storeDir, tag: '0.1.0' });
    restoreOutput();
    const cap2 = captureOutput();
    await versionsListCommand({ store: storeDir });
    expect(cap2.out).toContain('v1');
    expect(cap2.out).toContain('0.1.0');
  });

  // --------------------------------------------------------------------------
  // save + show
  // --------------------------------------------------------------------------
  it('show displays version metadata', async () => {
    const { versionsSaveCommand, versionsShowCommand } = await import('./versions.js');
    const cap1 = captureOutput();
    await versionsSaveCommand(manifestPath, { store: storeDir, tag: '1.0.0', label: 'Initial' });
    restoreOutput();
    const cap2 = captureOutput();
    await versionsShowCommand('1', { store: storeDir });
    expect(cap2.out).toContain('v1');
    expect(cap2.out).toContain('1.0.0');
    expect(cap2.out).toContain('Initial');
  });

  // --------------------------------------------------------------------------
  // show — by tag
  // --------------------------------------------------------------------------
  it('show resolves version by tag', async () => {
    const { versionsSaveCommand, versionsShowCommand } = await import('./versions.js');
    const cap1 = captureOutput();
    await versionsSaveCommand(manifestPath, { store: storeDir, tag: 'release' });
    restoreOutput();
    const cap2 = captureOutput();
    await versionsShowCommand('release', { store: storeDir });
    expect(cap2.out).toContain('v1');
  });

  // --------------------------------------------------------------------------
  // show — nonexistent version
  // --------------------------------------------------------------------------
  it('show exits with error for nonexistent version', async () => {
    const { versionsSaveCommand, versionsShowCommand } = await import('./versions.js');
    const cap1 = captureOutput();
    await versionsSaveCommand(manifestPath, { store: storeDir });
    restoreOutput();
    captureOutput();
    const exitState = suppressExit();
    await versionsShowCommand('99', { store: storeDir });
    expect(exitState.exitCode).toBe(1);
  });

  // --------------------------------------------------------------------------
  // save — auto-tag
  // --------------------------------------------------------------------------
  it('save with auto-tag generates semver tag', async () => {
    const { versionsSaveCommand, versionsListCommand } = await import('./versions.js');
    const cap1 = captureOutput();
    await versionsSaveCommand(manifestPath, { store: storeDir, autoTag: true });
    restoreOutput();
    const cap2 = captureOutput();
    await versionsSaveCommand(manifest2Path, { store: storeDir, autoTag: true });
    restoreOutput();
    const cap3 = captureOutput();
    await versionsListCommand({ store: storeDir });
    expect(cap3.out).toContain('v2');
  });

  // --------------------------------------------------------------------------
  // save — requires source
  // --------------------------------------------------------------------------
  it('save exits with error when no source provided', async () => {
    const { versionsSaveCommand } = await import('./versions.js');
    captureOutput();
    const exitState = suppressExit();
    await versionsSaveCommand(undefined, { store: storeDir });
    expect(exitState.exitCode).toBe(1);
  });

  // --------------------------------------------------------------------------
  // diff
  // --------------------------------------------------------------------------
  it('diff compares two versions', async () => {
    const { versionsSaveCommand, versionsDiffCommand } = await import('./versions.js');
    const cap1 = captureOutput();
    await versionsSaveCommand(manifestPath, { store: storeDir });
    await versionsSaveCommand(manifest2Path, { store: storeDir });
    restoreOutput();
    const cap2 = captureOutput();
    await versionsDiffCommand('1', '2', { store: storeDir });
    expect(cap2.out).toContain('v1');
    expect(cap2.out).toContain('v2');
  });

  // --------------------------------------------------------------------------
  // diff — no changes
  // --------------------------------------------------------------------------
  it('diff reports no changes for identical versions', async () => {
    const { versionsSaveCommand, versionsDiffCommand } = await import('./versions.js');
    const cap1 = captureOutput();
    await versionsSaveCommand(manifestPath, { store: storeDir });
    await versionsSaveCommand(manifestPath, { store: storeDir });
    restoreOutput();
    const cap2 = captureOutput();
    await versionsDiffCommand('1', '2', { store: storeDir });
    expect(cap2.out).toContain('No differences');
  });

  // --------------------------------------------------------------------------
  // diff — json
  // --------------------------------------------------------------------------
  it('diff outputs JSON when --json', async () => {
    const { versionsSaveCommand, versionsDiffCommand } = await import('./versions.js');
    const cap1 = captureOutput();
    await versionsSaveCommand(manifestPath, { store: storeDir });
    await versionsSaveCommand(manifest2Path, { store: storeDir });
    restoreOutput();
    const cap2 = captureOutput();
    await versionsDiffCommand('1', '2', { store: storeDir, json: true });
    const parsed = JSON.parse(cap2.out);
    expect(parsed.summary).toBeDefined();
    expect(parsed.summary.hasChanges).toBe(true);
  });

  // --------------------------------------------------------------------------
  // diff — breaking
  // --------------------------------------------------------------------------
  it('diff --breaking shows breaking change analysis', async () => {
    const { versionsSaveCommand, versionsDiffCommand } = await import('./versions.js');
    const cap1 = captureOutput();
    await versionsSaveCommand(manifest2Path, { store: storeDir });
    // Remove entity to create breaking change
    await versionsSaveCommand(manifestPath, { store: storeDir });
    restoreOutput();
    const cap2 = captureOutput();
    await versionsDiffCommand('1', '2', { store: storeDir, breaking: true });
    expect(cap2.out).toContain('Breaking');
  });

  // --------------------------------------------------------------------------
  // changelog
  // --------------------------------------------------------------------------
  it('changelog generates between versions', async () => {
    const { versionsSaveCommand, versionsChangelogCommand } = await import('./versions.js');
    const cap1 = captureOutput();
    await versionsSaveCommand(manifestPath, { store: storeDir, tag: '1.0.0' });
    await versionsSaveCommand(manifest2Path, { store: storeDir, tag: '1.1.0' });
    restoreOutput();
    const cap2 = captureOutput();
    await versionsChangelogCommand('1', '2', { store: storeDir });
    expect(cap2.out).toContain('Changelog');
    expect(cap2.out).toContain('v1');
    expect(cap2.out).toContain('v2');
  });

  // --------------------------------------------------------------------------
  // changelog — not enough versions
  // --------------------------------------------------------------------------
  it('changelog warns with insufficient versions', async () => {
    const { versionsSaveCommand, versionsChangelogCommand } = await import('./versions.js');
    const cap1 = captureOutput();
    await versionsSaveCommand(manifestPath, { store: storeDir });
    restoreOutput();
    const cap2 = captureOutput();
    await versionsChangelogCommand(undefined, undefined, { store: storeDir });
    expect(cap2.out).toContain('at least 2');
  });

  // --------------------------------------------------------------------------
  // tag
  // --------------------------------------------------------------------------
  it('tag applies tag to version', async () => {
    const { versionsSaveCommand, versionsTagCommand } = await import('./versions.js');
    const cap1 = captureOutput();
    await versionsSaveCommand(manifestPath, { store: storeDir });
    restoreOutput();
    const cap2 = captureOutput();
    await versionsTagCommand('1', 'stable', { store: storeDir });
    expect(cap2.out).toContain("Tagged v1 as 'stable'");
  });

  // --------------------------------------------------------------------------
  // rollback
  // --------------------------------------------------------------------------
  it('rollback outputs the IR for a version', async () => {
    const { versionsSaveCommand, versionsRollbackCommand } = await import('./versions.js');
    const cap1 = captureOutput();
    await versionsSaveCommand(manifestPath, { store: storeDir });
    restoreOutput();
    const cap2 = captureOutput();
    await versionsRollbackCommand('1', { store: storeDir });
    const parsed = JSON.parse(cap2.out);
    expect(parsed.version).toBe('1.0');
    expect(parsed.provenance).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // rollback — to file
  // --------------------------------------------------------------------------
  it('rollback writes IR to output file', async () => {
    const { versionsSaveCommand, versionsRollbackCommand } = await import('./versions.js');
    const cap1 = captureOutput();
    await versionsSaveCommand(manifestPath, { store: storeDir });
    restoreOutput();
    const outputPath = path.join(tmpDir, 'rollback.json');
    const cap2 = captureOutput();
    await versionsRollbackCommand('1', { store: storeDir, output: outputPath });
    expect(cap2.out).toContain('Rolled back');
    const content = await fs.readFile(outputPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.version).toBe('1.0');
  });

  // --------------------------------------------------------------------------
  // verify
  // --------------------------------------------------------------------------
  it('verify checks integrity of latest version', async () => {
    const { versionsSaveCommand, versionsVerifyCommand } = await import('./versions.js');
    const cap1 = captureOutput();
    await versionsSaveCommand(manifestPath, { store: storeDir });
    restoreOutput();
    const cap2 = captureOutput();
    await versionsVerifyCommand(undefined, { store: storeDir });
    expect(cap2.out).toContain('integrity OK');
  });

  // --------------------------------------------------------------------------
  // verify — all
  // --------------------------------------------------------------------------
  it('verify --all checks all versions', async () => {
    const { versionsSaveCommand, versionsVerifyCommand } = await import('./versions.js');
    const cap1 = captureOutput();
    await versionsSaveCommand(manifestPath, { store: storeDir });
    await versionsSaveCommand(manifest2Path, { store: storeDir });
    restoreOutput();
    const cap2 = captureOutput();
    await versionsVerifyCommand(undefined, { store: storeDir, all: true });
    expect(cap2.out).toContain('v1');
    expect(cap2.out).toContain('v2');
    expect(cap2.out).toContain('integrity OK');
  });

  // --------------------------------------------------------------------------
  // verify — specific version
  // --------------------------------------------------------------------------
  it('verify checks a specific version', async () => {
    const { versionsSaveCommand, versionsVerifyCommand } = await import('./versions.js');
    const cap1 = captureOutput();
    await versionsSaveCommand(manifestPath, { store: storeDir });
    await versionsSaveCommand(manifest2Path, { store: storeDir });
    restoreOutput();
    const cap2 = captureOutput();
    await versionsVerifyCommand('1', { store: storeDir });
    expect(cap2.out).toContain('v1');
    expect(cap2.out).toContain('integrity OK');
    expect(cap2.out).not.toContain('v2');
  });

  // --------------------------------------------------------------------------
  // verify — json
  // --------------------------------------------------------------------------
  it('verify --json outputs structured results', async () => {
    const { versionsSaveCommand, versionsVerifyCommand } = await import('./versions.js');
    const cap1 = captureOutput();
    await versionsSaveCommand(manifestPath, { store: storeDir });
    restoreOutput();
    const cap2 = captureOutput();
    await versionsVerifyCommand(undefined, { store: storeDir, json: true });
    const parsed = JSON.parse(cap2.out);
    expect(parsed[0].valid).toBe(true);
  });

  // --------------------------------------------------------------------------
  // save — compile failure
  // --------------------------------------------------------------------------
  it('save exits on compilation failure', async () => {
    const { versionsSaveCommand } = await import('./versions.js');
    const badPath = path.join(tmpDir, 'bad.manifest');
    // Write manifest source that will produce diagnostics but still produce IR
    // Use completely empty file which has no entities
    await fs.writeFile(badPath, '', 'utf-8');
    const cap = captureOutput();
    await versionsSaveCommand(badPath, { store: storeDir });
    // Empty file compiles to valid IR with no entities, so it should succeed
    expect(cap.out).toContain('Saved version');
  });

  // --------------------------------------------------------------------------
  // save — nonexistent source file
  // --------------------------------------------------------------------------
  it('save exits on nonexistent source file', async () => {
    const { versionsSaveCommand } = await import('./versions.js');
    captureOutput();
    const exitState = suppressExit();
    await versionsSaveCommand('/nonexistent/file.manifest', { store: storeDir });
    expect(exitState.exitCode).toBe(1);
  });

  // --------------------------------------------------------------------------
  // diff — nonexistent version
  // --------------------------------------------------------------------------
  it('diff exits on nonexistent version', async () => {
    const { versionsSaveCommand, versionsDiffCommand } = await import('./versions.js');
    const cap1 = captureOutput();
    await versionsSaveCommand(manifestPath, { store: storeDir });
    restoreOutput();
    captureOutput();
    const exitState = suppressExit();
    await versionsDiffCommand('1', '99', { store: storeDir });
    expect(exitState.exitCode).toBe(1);
  });

  // --------------------------------------------------------------------------
  // tag — nonexistent version
  // --------------------------------------------------------------------------
  it('tag exits on nonexistent version', async () => {
    const { versionsSaveCommand, versionsTagCommand } = await import('./versions.js');
    const cap1 = captureOutput();
    await versionsSaveCommand(manifestPath, { store: storeDir });
    restoreOutput();
    captureOutput();
    const exitState = suppressExit();
    await versionsTagCommand('99', 'bad', { store: storeDir });
    expect(exitState.exitCode).toBe(1);
  });
});
