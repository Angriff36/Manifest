/**
 * Unit tests for Config G8 lifecycle hook runner.
 */

import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runLifecycleHooks } from './lifecycle-hooks.js';

describe('runLifecycleHooks', () => {
  it('is a no-op when lifecycle is unset', async () => {
    const runScript = vi.fn();
    const ran = await runLifecycleHooks('beforeCompile', {}, {
      cwd: process.cwd(),
      runScript,
    });
    expect(ran).toEqual([]);
    expect(runScript).not.toHaveBeenCalled();
  });

  it('runs beforeCompile scripts in order', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'manifest-lifecycle-'));
    try {
      const a = path.join(dir, 'a.mjs');
      const b = path.join(dir, 'b.mjs');
      await writeFile(a, 'export {};\n');
      await writeFile(b, 'export {};\n');
      const order: string[] = [];
      const ran = await runLifecycleHooks(
        'beforeCompile',
        { lifecycle: { beforeCompile: ['a.mjs', 'b.mjs'] } },
        {
          cwd: dir,
          runScript: async (scriptPath) => {
            order.push(path.basename(scriptPath));
          },
        },
      );
      expect(order).toEqual(['a.mjs', 'b.mjs']);
      expect(ran.map((p) => path.basename(p))).toEqual(['a.mjs', 'b.mjs']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws LIFECYCLE_HOOK_MISSING for absent scripts', async () => {
    await expect(
      runLifecycleHooks(
        'afterGenerate',
        { lifecycle: { afterGenerate: ['./nope.mjs'] } },
        { cwd: process.cwd(), runScript: async () => {} },
      ),
    ).rejects.toThrow(/LIFECYCLE_HOOK_MISSING/);
  });

  it('dryRun lists scripts without executing', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'manifest-lifecycle-dry-'));
    try {
      const script = path.join(dir, 'hook.mjs');
      await writeFile(script, 'export {};\n');
      const runScript = vi.fn();
      const ran = await runLifecycleHooks(
        'afterGenerate',
        { lifecycle: { afterGenerate: ['hook.mjs'] } },
        { cwd: dir, dryRun: true, runScript },
      );
      expect(runScript).not.toHaveBeenCalled();
      expect(ran).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
