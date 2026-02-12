#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { Command } from 'commander';
import { computeDiff } from './diff.js';
import { loadConfig } from './config.js';
import { formatSummaryJson } from './summary.js';
import { formatMarkdownReport } from './report.js';

async function loadJson(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

async function runDiff(options: {
  before: string;
  after: string;
  config?: string;
}) {
  const [before, after, config] = await Promise.all([
    loadJson(options.before),
    loadJson(options.after),
    loadConfig(options.config),
  ]);

  return computeDiff(before, after, config);
}

const program = new Command();

program
  .name('ir-diff')
  .description('Schema-agnostic JSON IR diff explainer')
  .version('1.0.0');

program
  .command('explain')
  .description('Generate a markdown diff report')
  .requiredOption('--before <path>', 'Path to the before JSON file')
  .requiredOption('--after <path>', 'Path to the after JSON file')
  .requiredOption('--out <path>', 'Output path for the markdown report')
  .option('--config <path>', 'Path to ir-diff config file')
  .action(async (opts) => {
    const summary = await runDiff(opts);
    const report = formatMarkdownReport(summary);
    await writeFile(opts.out, report, 'utf-8');
    console.log(`Report written to ${opts.out}`);
  });

program
  .command('summarize')
  .description('Generate a JSON diff summary')
  .requiredOption('--before <path>', 'Path to the before JSON file')
  .requiredOption('--after <path>', 'Path to the after JSON file')
  .requiredOption('--out <path>', 'Output path for the JSON summary')
  .option('--config <path>', 'Path to ir-diff config file')
  .action(async (opts) => {
    const summary = await runDiff(opts);
    const json = formatSummaryJson(summary);
    await writeFile(opts.out, json, 'utf-8');
    console.log(`Summary written to ${opts.out}`);
  });

program.parse();
