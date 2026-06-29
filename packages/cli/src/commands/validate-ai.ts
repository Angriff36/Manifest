/**
 * manifest validate-ai command
 *
 * Runs structured validation against LLM-generated .manifest source or IR JSON,
 * producing scored diagnostic reports with correction suggestions.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import type { AnySchema } from 'ajv';
import { averageScore, formatReportText } from './validate-ai-report.js';
import { resolveInputs } from './validate-ai-resolve-inputs.js';
import { validateIRFile, validateManifestSource } from './validate-ai-validate-file.js';
import type { ValidateAIOptions, ValidationReport } from './validate-ai-types.js';

export type { ValidationDiagnostic, ValidationReport, ValidateAIOptions } from './validate-ai-types.js';
export { loadCompiler } from './validate-ai-compiler.js';
export { runSemanticChecks } from './validate-ai-semantic-checks.js';

function bundledSchemaPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, '..', '..', '..', '..', 'docs', 'spec', 'ir', 'ir-v1.schema.json');
}

async function loadSchema(schemaPath?: string): Promise<AnySchema> {
  const target = schemaPath ?? bundledSchemaPath();
  const content = await fs.readFile(path.resolve(process.cwd(), target), 'utf-8');
  return JSON.parse(content) as AnySchema;
}

function printJsonOutput(reports: ValidationReport[], minScore: number): { passed: boolean } {
  const overallScore = averageScore(reports);
  const passed = reports.every(r => r.score >= minScore);
  console.log(JSON.stringify({
    version: '1.0',
    overallScore,
    passed,
    minScore,
    reportCount: reports.length,
    reports,
  }, null, 2));
  if (!passed) process.exit(1);
  return { passed };
}

function printTextSummary(reports: ValidationReport[], minScore: number, verbose: boolean): { passed: boolean } {
  for (const report of reports) {
    console.log(formatReportText(report, verbose));
  }
  const overallScore = averageScore(reports);
  const passed = reports.every(r => r.score >= minScore);
  console.log(chalk.bold('SUMMARY:'));
  console.log(`  Files validated: ${reports.length}`);
  console.log(`  Overall score:   ${overallScore}/100`);
  console.log(`  Minimum score:   ${minScore}/100`);
  console.log(`  Result:          ${passed ? chalk.green('PASS') : chalk.red('FAIL')}`);
  if (!passed) process.exit(1);
  return { passed };
}

async function validateInput(
  input: { filePath: string; type: 'manifest-source' | 'ir-json' },
  schema: AnySchema,
  spinner: Ora | null,
): Promise<ValidationReport> {
  if (spinner) {
    spinner.text = `Validating ${path.relative(process.cwd(), input.filePath)}`;
  }

  const report = input.type === 'ir-json'
    ? await validateIRFile(input.filePath, schema)
    : await validateManifestSource(input.filePath, schema);

  if (spinner) {
    const relPath = path.relative(process.cwd(), input.filePath);
    if (report.valid) {
      spinner.succeed(chalk.green(`${relPath} — score: ${report.score}/100`));
    } else {
      spinner.fail(chalk.red(`${relPath} — score: ${report.score}/100 (${report.summary.errors} errors)`));
    }
    spinner.start();
  }

  return report;
}

export async function validateAICommand(
  source: string | undefined,
  options: ValidateAIOptions = {},
): Promise<{ reports: ValidationReport[]; passed: boolean }> {
  const format = options.format ?? 'text';
  const minScore = options.minScore ?? 100;
  const verbose = options.verbose ?? false;
  const spinner = format === 'text' ? ora('Loading schema').start() : null;

  try {
    const schema = await loadSchema(options.schema);
    if (spinner) spinner.text = 'Resolving input files...';

    const inputs = await resolveInputs(source);
    if (inputs.length === 0) {
      if (spinner) spinner.warn('No .manifest or .ir.json files found');
      if (format === 'json') {
        console.log(JSON.stringify({ reports: [], passed: false, message: 'No input files found' }, null, 2));
      } else {
        console.log('  Provide a .manifest file or .ir.json file, or run from a directory containing them.');
      }
      return { reports: [], passed: false };
    }

    if (spinner) spinner.info(`Validating ${inputs.length} file(s)`);

    const reports: ValidationReport[] = [];
    for (const input of inputs) {
      reports.push(await validateInput(input, schema, spinner));
    }
    if (spinner) spinner.stop();

    if (format === 'json') {
      const { passed } = printJsonOutput(reports, minScore);
      return { reports, passed };
    }

    const { passed } = printTextSummary(reports, minScore, verbose);
    return { reports, passed };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (spinner) spinner.fail(`Validation failed: ${msg}`);
    if (format === 'json') {
      console.log(JSON.stringify({ reports: [], passed: false, error: msg }, null, 2));
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}
