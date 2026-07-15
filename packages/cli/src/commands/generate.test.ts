/**
 * CLI Generate Command Tests — --check drift mode.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const SOURCE =
  'entity Counter {\n  property required id: string\n  property count: number = 0\n}\n';

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

describe('Generate Command - --all (config-driven batch)', () => {
  it('runs every projection declared in manifest.config.yaml from one call', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-generate-all-'));
    await fs.mkdir(path.join(tempDir, 'src'));
    await fs.writeFile(path.join(tempDir, 'src', 'widget.manifest'), SOURCE, 'utf-8');
    await fs.writeFile(
      path.join(tempDir, 'manifest.config.yaml'),
      [
        'src: src/**/*.manifest',
        'output: ir/',
        'projections:',
        '  nextjs:',
        '    output: apps/api/',
        '    options:',
        '      appDir: app/api',
        '      generatedDir: app',
        '  zod:',
        '    output: schemas/',
        '',
      ].join('\n'),
      'utf-8',
    );

    const { compileCommand } = await import('./compile.js');
    const { generateAllFromConfig } = await import('./generate.js');

    const origCwd = process.cwd();
    try {
      process.chdir(tempDir);
      await compileCommand('src', { output: 'ir/' });
      await generateAllFromConfig({});

      const rel = (await findGeneratedFiles(tempDir)).map((f) =>
        path.relative(tempDir, f).replace(/\\/g, '/'),
      );
      // Both projections wrote to their own configured outputs from one call.
      expect(rel.some((f) => f.startsWith('apps/api/'))).toBe(true);
      expect(rel.some((f) => f.startsWith('schemas/'))).toBe(true);
      // No path doubling crept in.
      expect(
        rel.some((f) => f.includes('apps/api/apps/api') || f.includes('schemas/schemas')),
      ).toBe(false);
    } finally {
      process.chdir(origCwd);
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }, 30000);

  it('irOverride uses a single explicit IR, not the output dir glob', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-generate-iroverride-'));
    await fs.mkdir(path.join(tempDir, 'src'));
    await fs.writeFile(path.join(tempDir, 'src', 'widget.manifest'), SOURCE, 'utf-8');
    await fs.writeFile(
      path.join(tempDir, 'manifest.config.yaml'),
      [
        'src: src/**/*.manifest',
        'output: ir/',
        'projections:',
        '  zod:',
        '    output: schemas/',
        '',
      ].join('\n'),
      'utf-8',
    );

    const { compileCommand } = await import('./compile.js');
    const { generateAllFromConfig } = await import('./generate.js');

    const origCwd = process.cwd();
    try {
      process.chdir(tempDir);
      await compileCommand('src', { output: 'ir/' });
      // A decoy IR in the output dir that must be IGNORED when irOverride is set.
      await fs.writeFile(path.join(tempDir, 'ir', 'decoy.ir.json'), '{"not":"valid ir"}', 'utf-8');

      // Should succeed by reading only the explicit widget IR, not glob the dir
      // (which would hit the decoy and throw).
      await generateAllFromConfig({ irOverride: 'ir/widget.ir.json' });

      const rel = (await findGeneratedFiles(tempDir)).map((f) =>
        path.relative(tempDir, f).replace(/\\/g, '/'),
      );
      expect(rel.some((f) => f.startsWith('schemas/'))).toBe(true);
    } finally {
      process.chdir(origCwd);
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }, 30000);

  it('honors projections.enabled — skips projections not in the list', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-generate-enabled-'));
    await fs.mkdir(path.join(tempDir, 'src'));
    await fs.writeFile(path.join(tempDir, 'src', 'widget.manifest'), SOURCE, 'utf-8');
    await fs.writeFile(
      path.join(tempDir, 'manifest.config.yaml'),
      [
        'src: src/**/*.manifest',
        'output: ir/',
        'projections:',
        '  enabled:',
        '    - zod',
        '  nextjs:',
        '    output: apps/api/',
        '    options:',
        '      appDir: app/api',
        '      generatedDir: app',
        '  zod:',
        '    output: schemas/',
        '',
      ].join('\n'),
      'utf-8',
    );

    const { compileCommand } = await import('./compile.js');
    const { generateAllFromConfig } = await import('./generate.js');

    const origCwd = process.cwd();
    try {
      process.chdir(tempDir);
      await compileCommand('src', { output: 'ir/' });
      await generateAllFromConfig({});

      const rel = (await findGeneratedFiles(tempDir)).map((f) =>
        path.relative(tempDir, f).replace(/\\/g, '/'),
      );
      expect(rel.some((f) => f.startsWith('schemas/'))).toBe(true);
      expect(rel.some((f) => f.startsWith('apps/api/'))).toBe(false);
    } finally {
      process.chdir(origCwd);
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }, 30000);

  it('merges projections.defaults into each projection options bag', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-generate-defaults-'));
    await fs.mkdir(path.join(tempDir, 'src'));
    await fs.writeFile(path.join(tempDir, 'src', 'widget.manifest'), SOURCE, 'utf-8');
    await fs.writeFile(
      path.join(tempDir, 'manifest.config.yaml'),
      [
        'src: src/**/*.manifest',
        'output: ir/',
        'projections:',
        '  defaults:',
        '    includeComments: true',
        '  zod:',
        '    output: schemas/',
        '    options:',
        '      strict: true',
        '',
      ].join('\n'),
      'utf-8',
    );

    const { loadAllConfigs, layerProjectionOptions } = await import('../utils/config.js');
    const origCwd = process.cwd();
    try {
      process.chdir(tempDir);
      const { build } = await loadAllConfigs(tempDir);
      expect(layerProjectionOptions(build, 'zod')).toEqual({
        includeComments: true,
        strict: true,
      });
    } finally {
      process.chdir(origCwd);
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }, 30000);
});

describe('Generate Command - appDir/output overlap', () => {
  it('does not double the output prefix when appDir already contains it', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-generate-overlap-'));
    const manifestPath = path.join(tempDir, 'counter.manifest');
    const irPath = path.join(tempDir, 'counter.ir.json');
    const outputDir = path.join(tempDir, 'apps', 'api');
    await fs.writeFile(manifestPath, SOURCE, 'utf-8');

    const { compileCommand } = await import('./compile.js');
    const { generateCommand } = await import('./generate.js');

    await compileCommand(manifestPath, {});
    // appDir carries the full 'apps/api/app/api' while output is 'apps/api' —
    // the exact config shape that produced 'apps/api/apps/api/app/api'.
    await generateCommand(irPath, {
      projection: 'nextjs',
      surface: 'all',
      output: outputDir,
      projectionOptionsFromConfig: { appDir: 'apps/api/app/api' },
    });

    const files = (await findGeneratedFiles(tempDir)).map((f) => f.replace(/\\/g, '/'));
    expect(files.length).toBeGreaterThan(0);
    // No file may contain the doubled 'apps/api/apps/api' segment.
    expect(files.some((f) => f.includes('apps/api/apps/api'))).toBe(false);
    // Routes land under the single, correct 'apps/api/app/api' prefix.
    expect(files.some((f) => f.includes('apps/api/app/api/'))).toBe(true);

    await fs.rm(tempDir, { recursive: true, force: true });
  }, 30000);
});

describe('Generate Command - webhook surface', () => {
  const WEBHOOK_SOURCE = [
    'entity Order {',
    '  property amount: number',
    '  command UpdatePayment(amountPaid: number) {',
    '    mutate amount = amountPaid',
    '  }',
    '}',
    'webhook StripePayment "/webhooks/stripe" run Order.UpdatePayment',
    '  transform: {',
    '    amountPaid: payload.amount',
    '  }',
    '',
  ].join('\n');

  it('emits one route per declared webhook at its declared path', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-generate-webhook-'));
    const manifestPath = path.join(tempDir, 'order.manifest');
    const irPath = path.join(tempDir, 'order.ir.json');
    await fs.writeFile(manifestPath, WEBHOOK_SOURCE, 'utf-8');

    const { compileCommand } = await import('./compile.js');
    const { generateCommand } = await import('./generate.js');

    await compileCommand(manifestPath, {});
    await generateCommand(irPath, { projection: 'nextjs', surface: 'webhook', output: tempDir });

    const files = (await findGeneratedFiles(tempDir)).map((f) => f.replace(/\\/g, '/'));
    // appDir default 'app/api' → app root 'app'; served at /webhooks/stripe.
    const route = files.find((f) => f.endsWith('app/webhooks/stripe/route.ts'));
    expect(route, `webhook route not found in ${JSON.stringify(files)}`).toBeDefined();
    const code = await fs.readFile(route!, 'utf-8');
    expect(code).toContain('handleWebhookRequest');
    expect(code).toContain('export async function POST');

    await fs.rm(tempDir, { recursive: true, force: true });
  }, 30000);

  it('emits nothing for the webhook surface when no webhooks are declared', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-generate-webhook-none-'));
    const manifestPath = path.join(tempDir, 'counter.manifest');
    const irPath = path.join(tempDir, 'counter.ir.json');
    await fs.writeFile(manifestPath, SOURCE, 'utf-8');

    const { compileCommand } = await import('./compile.js');
    const { generateCommand } = await import('./generate.js');

    await compileCommand(manifestPath, {});
    await generateCommand(irPath, { projection: 'nextjs', surface: 'webhook', output: tempDir });

    const files = (await findGeneratedFiles(tempDir)).map((f) => f.replace(/\\/g, '/'));
    // No webhooks → the webhook surface writes no route files.
    expect(files.some((f) => f.includes('/webhooks/'))).toBe(false);

    await fs.rm(tempDir, { recursive: true, force: true });
  }, 30000);
});

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
      await generateCommand(irPath, {
        projection: 'nextjs',
        surface: 'types',
        output: tempDir,
        check: true,
      });
      expect(exitMock).not.toHaveBeenCalledWith(1);

      // Tamper with a committed file → --check must exit 1.
      const tampered = (await fs.readFile(files[0], 'utf-8')) + '\n// tampered\n';
      await fs.writeFile(files[0], tampered, 'utf-8');
      await expect(
        generateCommand(irPath, {
          projection: 'nextjs',
          surface: 'types',
          output: tempDir,
          check: true,
        }),
      ).rejects.toThrow('exit');
      expect(exitMock).toHaveBeenCalledWith(1);
    } finally {
      process.exit = originalExit;
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }, 30000);
});
