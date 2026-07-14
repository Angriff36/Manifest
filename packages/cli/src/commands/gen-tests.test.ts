import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { genTestsCommand } from './gen-tests.js';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = path.resolve(__dirname, '..', 'index.ts');

/**
 * Run the CLI via tsx in a child process. Used only for registration-level
 * assertions (help text, alias) — no live API calls.
 */
async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['tsx', CLI_ENTRY, ...args],
      { shell: process.platform === 'win32', timeout: 60_000 },
    );
    return { stdout, stderr, code: 0 };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', code: e.code ?? 1 };
  }
}

describe('manifest generate-tests', () => {
  let savedApiKey: string | undefined;

  beforeEach(() => {
    savedApiKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (savedApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = savedApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it('is registered with help text and expected options', async () => {
    const { stdout, code } = await runCli(['generate-tests', '--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('Generate conformance test fixtures');
    expect(stdout).toContain('--feature');
    expect(stdout).toContain('--category');
    expect(stdout).toContain('--count');
    expect(stdout).toContain('--dry-run');
  }, 30_000);

  it('is reachable via the gen-tests alias', async () => {
    const { stdout, code } = await runCli(['gen-tests', '--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('Generate conformance test fixtures');
  }, 30_000);

  it('fails fast without an API key (rejects, nothing written)', async () => {
    // The command throws instead of exiting so programmatic consumers
    // (the '@angriff36/manifest/generate-tests' subpath) keep their process.
    await expect(genTestsCommand(undefined, { dryRun: true, count: 1 })).rejects.toThrow(
      'ANTHROPIC_API_KEY',
    );
  });
});
