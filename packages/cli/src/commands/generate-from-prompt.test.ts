import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateFromPromptCommand } from './generate-from-prompt.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = path.resolve(__dirname, '..', 'index.ts');

/** Run the CLI via tsx for registration-level assertions (no live API calls). */
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

describe('manifest generate-from-prompt', () => {
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
    const { stdout, code } = await runCli(['generate-from-prompt', '--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('natural-language prompt');
    expect(stdout).toContain('--model');
    expect(stdout).toContain('--api-key');
    expect(stdout).toContain('--max-retries');
  }, 30_000);

  it('fails fast with a clear error and no network call when no API key is set', async () => {
    // The command handler calls process.exit(1) on the missing-key guard.
    // Intercept the exit so the failure path is observable in-process (and no
    // fetch to the Anthropic API is attempted).
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(((code?: number) => {
        throw new Error(`__exit_${code}__`);
      }) as never);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(
        generateFromPromptCommand('Create a blog with posts and comments', {}),
      ).rejects.toThrow('__exit_1__');
      const messages = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(messages).toContain('requires an Anthropic API key');
    } finally {
      errSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });
});
