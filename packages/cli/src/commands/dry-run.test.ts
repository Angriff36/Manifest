/**
 * Focused CLI --dry-run tests for write commands.
 * Asserts no files are created and stdout contains `dry-run: would write`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SOURCE = `
entity Counter {
  property required id: string
  property count: number = 0
}
`;

function captureLogs() {
  const lines: string[] = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  return {
    joined: () => lines.join('\n'),
    restore: () => {
      logSpy.mockRestore();
    },
  };
}

describe('CLI writers --dry-run', () => {
  let tempDir: string;
  let originalCwd: string;
  let manifestPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-cli-dry-run-'));
    originalCwd = process.cwd();
    manifestPath = path.join(tempDir, 'app.manifest');
    await fs.writeFile(manifestPath, SOURCE, 'utf-8');
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('compile --dry-run does not write IR and logs would-write', async () => {
    process.chdir(tempDir);
    const { compileCommand } = await import('./compile.js');
    const cap = captureLogs();
    await compileCommand('app.manifest', {
      output: 'ir/',
      pretty: true,
      dryRun: true,
    });
    cap.restore();

    expect(existsSync(path.join(tempDir, 'ir'))).toBe(false);
    expect(cap.joined()).toMatch(/dry-run: would write/);
  });

  it('generate --dry-run does not write artifacts and logs would-write', async () => {
    process.chdir(tempDir);
    const { compileCommand } = await import('./compile.js');
    const { generateCommand } = await import('./generate.js');

    await compileCommand('app.manifest', { output: 'ir/', pretty: true });

    const outDir = path.join(tempDir, 'generated');
    const cap = captureLogs();
    await generateCommand('ir/', {
      projection: 'nextjs',
      surface: 'types',
      output: outDir,
      auth: undefined as unknown as string,
      database: undefined as unknown as string,
      runtime: undefined as unknown as string,
      response: undefined as unknown as string,
      dryRun: true,
    });
    cap.restore();

    expect(existsSync(outDir)).toBe(false);
    expect(cap.joined()).toMatch(/dry-run: would write/);
  });

  it('generate rejects --dry-run with --check', async () => {
    const { generateCommand } = await import('./generate.js');
    await expect(
      generateCommand(path.join(tempDir, 'missing.ir.json'), {
        projection: 'nextjs',
        surface: 'types',
        output: path.join(tempDir, 'generated'),
        auth: undefined as unknown as string,
        database: undefined as unknown as string,
        runtime: undefined as unknown as string,
        response: undefined as unknown as string,
        dryRun: true,
        check: true,
      }),
    ).rejects.toThrow(/Cannot combine --dry-run with --check/);
  });

  it('diagram --dry-run does not write diagrams and logs would-write', async () => {
    // Keep cwd at Manifest package root so projection package resolution works.
    const outDir = path.join(tempDir, 'diagrams');
    const { diagramCommand } = await import('./diagram.js');
    const cap = captureLogs();
    await diagramCommand(manifestPath, { output: outDir, dryRun: true });
    cap.restore();

    expect(existsSync(outDir)).toBe(false);
    expect(cap.joined()).toMatch(/dry-run: would write/);
  });

  it('install-hooks --dry-run does not create .husky and logs would-write', async () => {
    process.chdir(tempDir);
    const { installHooksCommand } = await import('./install-hooks.js');
    const cap = captureLogs();
    await installHooksCommand({ force: true, dryRun: true });
    cap.restore();

    expect(existsSync(path.join(tempDir, '.husky'))).toBe(false);
    expect(cap.joined()).toMatch(/dry-run: would write/);
  });
});
