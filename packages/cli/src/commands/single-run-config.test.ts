/**
 * Tests for single-run per-projection config resolution (Workstream 2C task 3).
 *
 * Before the fix, `generate -p <name>` / `build -p <name>` fed every projection
 * the nextjs-resolved options. Now they resolve the SELECTED projection's own
 * options block and layer the global `naming` convention under it — the same
 * contract the `--all` batch path uses.
 *
 * Coverage:
 * - layerProjectionOptions: the pure merge seam (per-projection naming wins).
 * - generateCommand e2e: a non-Next projection (prisma) receives its own
 *   config options and reflects them in generated output.
 * - CLI e2e: `manifest generate -p prisma` resolves the global `naming` from
 *   manifest.config.yaml through the real index.ts single-run path.
 */

import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { layerProjectionOptions, type ManifestConfig } from '../utils/config.js';
import { compileCommand } from './compile.js';
import { generateCommand } from './generate.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = path.resolve(__dirname, '..', 'index.ts');

async function runCli(
  args: string[],
  cwd?: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['tsx', CLI_ENTRY, ...args],
      { shell: process.platform === 'win32', timeout: 60_000, cwd },
    );
    return { stdout, stderr, code: 0 };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', code: e.code ?? 1 };
  }
}

// A persistent store target (postgres) makes Widget eligible for a Prisma model.
const WIDGET =
  'entity Widget {\n  property required id: string\n  property displayName: string\n}\n\nstore Widget in postgres\n';

describe('layerProjectionOptions (per-projection + global naming merge)', () => {
  const build: ManifestConfig = {
    naming: 'snake_case',
    projections: {
      prisma: { output: 'prisma/', options: { provider: 'postgresql' } },
      zod: { output: 'schemas/', options: { naming: 'camelCase' } },
    },
  };

  it('layers the global naming under a projection that did not set its own', () => {
    expect(layerProjectionOptions(build, 'prisma')).toEqual({
      provider: 'postgresql',
      naming: 'snake_case',
    });
  });

  it('lets a per-projection naming override the global default', () => {
    expect(layerProjectionOptions(build, 'zod')).toEqual({ naming: 'camelCase' });
  });

  it('returns just the global naming for an unconfigured projection', () => {
    expect(layerProjectionOptions(build, 'kysely')).toEqual({ naming: 'snake_case' });
  });

  it('is a no-op (no naming key) when no global naming is set', () => {
    const noNaming: ManifestConfig = { projections: { prisma: { options: { provider: 'sqlite' } } } };
    expect(layerProjectionOptions(noNaming, 'prisma')).toEqual({ provider: 'sqlite' });
  });
});

describe('generateCommand — non-Next projection receives its own config options', () => {
  it('applies the prisma naming convention passed via projectionOptionsFromConfig', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-prisma-opts-'));
    const manifestPath = path.join(tempDir, 'widget.manifest');
    const irPath = path.join(tempDir, 'widget.ir.json');
    const outDir = path.join(tempDir, 'prisma');
    await fs.writeFile(manifestPath, WIDGET, 'utf-8');

    // Absolute paths throughout — no process.chdir, so this is immune to
    // cross-file cwd races when the suite runs test files in parallel.
    const originalLog = console.log;
    console.log = () => {};
    try {
      await compileCommand(manifestPath, {});
      await generateCommand(irPath, {
        projection: 'prisma',
        surface: 'all',
        output: outDir,
        auth: undefined as unknown as string,
        database: undefined as unknown as string,
        runtime: undefined as unknown as string,
        response: undefined as unknown as string,
        projectionOptionsFromConfig: { naming: 'snake_case' },
      });

      const schema = await fs.readFile(path.join(outDir, 'schema.prisma'), 'utf-8');
      // snake_case naming pluralizes the table and @map()s the camelCase column.
      expect(schema).toMatch(/@@map\("widgets"\)/);
      expect(schema).toMatch(/@map\("display_name"\)/);
    } finally {
      console.log = originalLog;
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('CLI single-run — generate -p prisma resolves global naming from config', () => {
  it('reflects the config global `naming` in the generated prisma schema', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-single-run-'));
    await fs.mkdir(path.join(tempDir, 'src'));
    await fs.writeFile(path.join(tempDir, 'src', 'widget.manifest'), WIDGET, 'utf-8');
    // Global naming, and a prisma projection block that sets NO naming of its own.
    await fs.writeFile(
      path.join(tempDir, 'manifest.config.yaml'),
      ['src: src/**/*.manifest', 'output: ir/', 'naming: snake_case', 'projections:', '  prisma:', '    output: prisma/', ''].join('\n'),
      'utf-8',
    );

    const originalLog = console.log;
    console.log = () => {};
    try {
      // Absolute paths keep the in-process compile cwd-independent.
      await compileCommand(path.join(tempDir, 'src', 'widget.manifest'), { output: path.join(tempDir, 'ir') });
    } finally {
      console.log = originalLog;
    }

    try {
      // Real index.ts single-run path: resolves prisma's block + global naming.
      const { code, stderr } = await runCli(['generate', 'ir/widget.ir.json', '-p', 'prisma', '-o', 'prisma'], tempDir);
      expect(code, stderr).toBe(0);
      const schema = await fs.readFile(path.join(tempDir, 'prisma', 'schema.prisma'), 'utf-8');
      expect(schema).toMatch(/@@map\("widgets"\)/);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }, 60_000);
});
