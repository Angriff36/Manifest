/**
 * manifest fmt command
 *
 * Deterministic whitespace formatter for .manifest source files.
 * Idempotent: formatting an already-formatted file produces no diff.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import chalk from 'chalk';
import ora from 'ora';
import { getConfig } from '../utils/config.js';

export interface FmtOptions {
  check?: boolean;
  write?: boolean;
  glob?: string;
}

async function loadParser() {
  const module = await import('@angriff36/manifest/parser');
  return module.Parser;
}

/**
 * Normalize whitespace in Manifest source deterministically.
 */
export function formatManifestSource(source: string): string {
  const normalized = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized
    .split('\n')
    .map((line) => line.replace(/\t/g, '  ').replace(/[ \t]+$/u, ''));

  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  if (lines.length === 0) {
    return '\n';
  }

  return `${lines.join('\n')}\n`;
}

async function getManifestFiles(
  source: string | undefined,
  options: FmtOptions,
): Promise<string[]> {
  if (source) {
    const resolved = path.resolve(process.cwd(), source);
    const stat = await fs.stat(resolved).catch(() => null);
    if (!stat) {
      throw new Error(`Source not found: ${source}`);
    }
    if (stat.isFile()) {
      return [resolved];
    }
    const pattern = options.glob ?? '**/*.manifest';
    const files = await glob(pattern, { cwd: resolved, ignore: ['node_modules/**', 'dist/**'] });
    return files.map((file) => path.resolve(resolved, file));
  }

  const config = await getConfig();
  const pattern = options.glob ?? config?.src ?? '**/*.manifest';
  const files = await glob(pattern, {
    cwd: process.cwd(),
    ignore: ['node_modules/**', 'dist/**', '.next/**'],
  });
  return files.map((file) => path.resolve(process.cwd(), file));
}

/**
 * Whitespace normalization must not break SYNTAX — that is the only invariant
 * fmt can violate, so only parser errors are checked. Semantic resolution
 * (cross-file mixins, event references) is deliberately NOT run: a single
 * file using `mixes TenantScoped` from another file is perfectly formattable
 * even though it cannot compile standalone (fixed 2026-07-19; previously fmt
 * ran the full IR compiler per file and refused 33/36 files in multi-file
 * projects).
 */
async function verifyParses(filePath: string, source: string): Promise<string[]> {
  const Parser = await loadParser();
  const { errors } = new Parser().parse(source);
  return errors.map(
    (error: { message: string; position?: { line?: number; column?: number } }) => {
      const location =
        error.position?.line !== undefined
          ? `${path.relative(process.cwd(), filePath)}:${error.position.line}:${error.position.column ?? 1}`
          : path.relative(process.cwd(), filePath);
      return `${location}: ${error.message}`;
    },
  );
}

export async function fmtCommand(
  source: string | undefined,
  options: FmtOptions = {},
): Promise<void> {
  const check = options.check ?? false;
  const write = options.write ?? !check;
  const spinner = ora('Finding .manifest files').start();

  try {
    const files = await getManifestFiles(source, options);
    if (files.length === 0) {
      spinner.warn('No .manifest files found');
      return;
    }

    spinner.info(`Formatting ${files.length} file(s)`);
    console.log('');

    let changedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const filePath of files) {
      const relativePath = path.relative(process.cwd(), filePath);
      const original = await fs.readFile(filePath, 'utf-8');
      const formatted = formatManifestSource(original);
      const parseErrors = await verifyParses(filePath, formatted);

      if (parseErrors.length > 0) {
        errorCount++;
        errors.push(...parseErrors);
        console.error(chalk.red(`✗ ${relativePath}`));
        parseErrors.forEach((message) => console.error(chalk.red(`  • ${message}`)));
        continue;
      }

      if (formatted === original) {
        console.log(chalk.green(`✓ ${relativePath}`));
        continue;
      }

      changedCount++;
      if (check) {
        console.error(chalk.red(`✗ ${relativePath} (would reformat)`));
        continue;
      }

      if (write) {
        await fs.writeFile(filePath, formatted, 'utf-8');
        console.log(chalk.yellow(`↻ ${relativePath}`));
      }
    }

    console.log('');
    if (errorCount > 0) {
      console.error(chalk.bold.red(`${errorCount} file(s) failed to parse`));
      process.exitCode = 1;
      return;
    }

    if (check && changedCount > 0) {
      console.error(chalk.bold.red(`${changedCount} file(s) need formatting`));
      console.error(chalk.dim('Run: manifest fmt --write'));
      process.exitCode = 1;
      return;
    }

    if (write && changedCount > 0) {
      console.log(chalk.bold.green(`Formatted ${changedCount} file(s)`));
      return;
    }

    console.log(chalk.bold.green('All files already formatted'));
  } catch (error) {
    spinner.fail(`Format failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
