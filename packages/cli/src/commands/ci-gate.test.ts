/**
 * Integration tests for Config G10 — `manifest ci-gate`.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { CiGateRunner } from './ci-gate.js';

async function tempProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-ci-gate-'));
  await fs.writeFile(
    path.join(dir, 'manifest.config.yaml'),
    [
      'src: src/**/*.manifest',
      'output: ir/',
      'driftGates:',
      '  effectiveConfigSnapshot: .manifest/effective-config.snapshot.json',
      '  failOnConfigDrift: true',
      '  failOnGeneratedDrift: false',
      '',
    ].join('\n'),
    'utf-8',
  );
  return dir;
}

describe('manifest ci-gate (Config G10)', () => {
  it('writes and then passes the effective-config snapshot gate', async () => {
    const dir = await tempProject();
    const write = await new CiGateRunner(dir, { writeSnapshot: true }).run();
    expect(write.ok).toBe(true);
    const snap = path.join(dir, '.manifest', 'effective-config.snapshot.json');
    await expect(fs.access(snap)).resolves.toBeUndefined();

    const check = await new CiGateRunner(dir, {}).run();
    expect(check.ok).toBe(true);
    expect(check.failures).toEqual([]);

    await fs.rm(dir, { recursive: true, force: true });
  }, 30000);

  it('fails when the committed snapshot drifts from live effective config', async () => {
    const dir = await tempProject();
    await new CiGateRunner(dir, { writeSnapshot: true }).run();
    const snap = path.join(dir, '.manifest', 'effective-config.snapshot.json');
    await fs.writeFile(snap, '{"tampered":true}\n', 'utf-8');

    const check = await new CiGateRunner(dir, {}).run();
    expect(check.ok).toBe(false);
    expect(check.failures.some((f) => f.includes('drifted'))).toBe(true);

    await fs.rm(dir, { recursive: true, force: true });
  }, 30000);

  it('fails pinIrSchemaVersion when IR version mismatches', async () => {
    const dir = await tempProject();
    await fs.mkdir(path.join(dir, 'ir'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'ir', 'widget.ir.json'),
      JSON.stringify({ version: '0.9', entities: [] }),
      'utf-8',
    );
    await fs.writeFile(
      path.join(dir, 'manifest.config.yaml'),
      [
        'output: ir/',
        'driftGates:',
        '  failOnConfigDrift: false',
        '  pinIrSchemaVersion: "1.0"',
        '',
      ].join('\n'),
      'utf-8',
    );

    const check = await new CiGateRunner(dir, {}).run();
    expect(check.ok).toBe(false);
    expect(check.failures.some((f) => f.includes('schema version mismatch'))).toBe(true);

    await fs.rm(dir, { recursive: true, force: true });
  }, 30000);

  it('ciGateCommand exits 1 on failure', async () => {
    const dir = await tempProject();
    const { ciGateCommand } = await import('./ci-gate.js');
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(ciGateCommand({ cwd: dir })).rejects.toThrow('exit:1');
    exit.mockRestore();
    await fs.rm(dir, { recursive: true, force: true });
  }, 30000);
});
