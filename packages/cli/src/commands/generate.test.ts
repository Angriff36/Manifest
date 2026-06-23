/**
 * CLI Generate Command Tests — --check drift mode.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const SOURCE = 'entity Counter {\n  property required id: string\n  property count: number = 0\n}\n';

async function findGeneratedFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string): Promise<void> {
    for (const entry of await fs.readdir(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (!entry.name.endsWith('.ir.json') && !entry.name.endsWith('.manifest')) {
        out.push(full);
      }
    }
  }
  await walk(dir);
  return out;
}

describe('Generate Command - --check drift mode', () => {
  it('exits clean (no drift) when generated code matches, exits 1 on drift', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-generate-check-'));
    const manifestPath = path.join(tempDir, 'counter.manifest');
    const irPath = path.join(tempDir, 'counter.ir.json');
    await fs.writeFile(manifestPath, SOURCE, 'utf-8');

    const { compileCommand } = await import('./compile.js');
    const { generateCommand } = await import('./generate.js');

    // Produce IR, then generate the types surface for real.
    await compileCommand(manifestPath, {});
    await generateCommand(irPath, { projection: 'nextjs', surface: 'types', output: tempDir });

    const files = await findGeneratedFiles(tempDir);
    expect(files.length).toBeGreaterThan(0);

    const originalExit = process.exit;
    const exitMock = vi.fn().mockImplementation(() => {
      throw new Error('exit');
    });
    process.exit = exitMock as unknown as typeof process.exit;

    try {
      // Clean: --check must NOT exit non-zero.
      await generateCommand(irPath, { projection: 'nextjs', surface: 'types', output: tempDir, check: true });
      expect(exitMock).not.toHaveBeenCalledWith(1);

      // Tamper with a committed file → --check must exit 1.
      const tampered = (await fs.readFile(files[0], 'utf-8')) + '\n// tampered\n';
      await fs.writeFile(files[0], tampered, 'utf-8');
      await expect(
        generateCommand(irPath, { projection: 'nextjs', surface: 'types', output: tempDir, check: true }),
      ).rejects.toThrow('exit');
      expect(exitMock).toHaveBeenCalledWith(1);
    } finally {
      process.exit = originalExit;
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }, 30000);
});
