/**
 * Seed pack CLI: template / fill / validate.
 *
 * Apply/clear live in `@angriff36/manifest/seed-pack` for runtime middleware.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { glob } from 'glob';
import type { IR } from '@angriff36/manifest/ir';
import {
  buildSeedTemplate,
  fillSeedPack,
  createHeuristicFillProvider,
  createOllamaFillProvider,
  readSeedPack,
  writeSeedPack,
  validateSeedPack,
} from '@angriff36/manifest/seed-pack';

async function loadIR(source: string | undefined): Promise<IR> {
  if (!source) {
    throw new Error('No source specified. Provide a .manifest or .ir.json file.');
  }
  const resolved = path.resolve(process.cwd(), source);
  const stat = await fs.stat(resolved).catch(() => null);
  if (!stat) throw new Error(`Source not found: ${source}`);

  if (stat.isFile()) {
    if (resolved.endsWith('.ir.json')) {
      return JSON.parse(await fs.readFile(resolved, 'utf-8')) as IR;
    }
    const { compileToIR } = await import('@angriff36/manifest/ir-compiler');
    const fileContent = await fs.readFile(resolved, 'utf-8');
    const result = await compileToIR(fileContent, { sourcePath: resolved });
    if (!result.ir) {
      const errors = (result.diagnostics || [])
        .filter((d) => d.severity === 'error')
        .map((d) => d.message)
        .join('; ');
      throw new Error(`Compilation failed: ${errors || 'unknown error'}`);
    }
    return result.ir;
  }

  const irFiles = await glob('**/*.ir.json', { cwd: resolved });
  if (irFiles.length === 0) {
    throw new Error(`No .ir.json files found in directory: ${source}`);
  }
  const first = path.join(resolved, irFiles[0]!);
  return JSON.parse(await fs.readFile(first, 'utf-8')) as IR;
}

export interface SeedTemplateCliOptions {
  source?: string;
  output: string;
  packId?: string;
  version?: string;
  profile?: 'dev' | 'staging' | 'demo';
  count?: number;
  entity?: string[];
}

export async function seedTemplateCommand(options: SeedTemplateCliOptions): Promise<void> {
  const spinner = ora('Building seed pack template').start();
  try {
    const ir = await loadIR(options.source);
    const pack = buildSeedTemplate(ir, {
      packId: options.packId ?? 'demo',
      // eslint-disable-next-line manifest/no-hardcoded-versions -- default seed-pack version (user data), not the CLI version
      version: options.version ?? '1.0.0',
      profile: options.profile ?? 'demo',
      count: options.count ?? 2,
      entity: options.entity,
    });
    await writeSeedPack(path.resolve(options.output), pack);
    spinner.succeed(
      chalk.green(
        `Wrote seed pack template (${pack.tables.length} entities) → ${options.output}`
      )
    );
  } catch (err) {
    spinner.fail(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

export interface SeedFillCliOptions {
  packDir: string;
  source?: string;
  provider?: 'heuristic' | 'ollama';
  model?: string;
  overwrite?: boolean;
  requireFilled?: boolean;
}

export async function seedFillCommand(options: SeedFillCliOptions): Promise<void> {
  const spinner = ora('Filling seed pack').start();
  try {
    const dir = path.resolve(options.packDir);
    const pack = await readSeedPack(dir);
    const ir = options.source
      ? await loadIR(options.source)
      : await loadIRNearPack(dir);

    const providerName = options.provider ?? 'heuristic';
    const provider =
      providerName === 'ollama'
        ? createOllamaFillProvider({ model: options.model })
        : createHeuristicFillProvider();

    const filled = await fillSeedPack(ir, pack, {
      provider,
      overwrite: options.overwrite === true,
    });
    await writeSeedPack(dir, filled);

    const validation = validateSeedPack(ir, filled, {
      requireFilled: options.requireFilled !== false,
    });
    if (!validation.ok) {
      spinner.warn('Filled pack written but validation failed:');
      for (const e of validation.errors) {
        console.error(chalk.red(`  ${e.code}: ${e.message}`));
      }
      process.exitCode = 1;
      return;
    }
    spinner.succeed(chalk.green(`Filled seed pack → ${dir}`));
  } catch (err) {
    spinner.fail(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

export interface SeedValidateCliOptions {
  packDir: string;
  source?: string;
  requireFilled?: boolean;
}

export async function seedValidateCommand(options: SeedValidateCliOptions): Promise<void> {
  const spinner = ora('Validating seed pack').start();
  try {
    const dir = path.resolve(options.packDir);
    const pack = await readSeedPack(dir);
    const ir = options.source
      ? await loadIR(options.source)
      : await loadIRNearPack(dir);
    const validation = validateSeedPack(ir, pack, {
      requireFilled: options.requireFilled === true,
    });
    if (!validation.ok) {
      spinner.fail('Seed pack invalid');
      for (const e of validation.errors) {
        console.error(chalk.red(`  ${e.code}: ${e.message}`));
      }
      process.exitCode = 1;
      return;
    }
    for (const w of validation.warnings.slice(0, 20)) {
      console.log(chalk.yellow(`  warn ${w.code}: ${w.message}`));
    }
    spinner.succeed(chalk.green('Seed pack valid'));
  } catch (err) {
    spinner.fail(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

async function loadIRNearPack(packDir: string): Promise<IR> {
  const candidates = [
    path.join(packDir, '..', 'ir', 'kitchen.ir.json'),
    path.join(packDir, '..', '*.ir.json'),
    path.join(packDir, '..', '..', 'ir', 'kitchen.ir.json'),
  ];
  for (const c of candidates) {
    if (c.includes('*')) {
      const matches = await glob(c);
      if (matches[0]) return loadIR(matches[0]);
      continue;
    }
    const ok = await fs.stat(c).catch(() => null);
    if (ok?.isFile()) return loadIR(c);
  }
  throw new Error(
    'Could not locate IR near pack. Pass --source <file.ir.json|.manifest>.'
  );
}
