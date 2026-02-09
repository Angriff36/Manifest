#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runGuard } from './runner.js';
import { AllowlistMatcher } from './allowlist.js';

interface CliArgs {
  command: 'run' | 'init';
  input: string;
  generator: string;
  allowlist?: string;
  out: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const command = args[0];

  if (command !== 'run' && command !== 'init') {
    printUsage();
    process.exit(1);
  }

  const flags: Record<string, string> = {};
  for (let i = 1; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '');
    const value = args[i + 1];
    if (key && value) {
      flags[key] = value;
    }
  }

  if (!flags.input || !flags.generator || !flags.out) {
    printUsage();
    process.exit(1);
  }

  return {
    command,
    input: resolve(flags.input),
    generator: resolve(flags.generator),
    allowlist: flags.allowlist ? resolve(flags.allowlist) : undefined,
    out: resolve(flags.out),
  };
}

function printUsage(): void {
  const usage = `
Usage:
  field-guard run  --input <ir.json> --generator <path> --allowlist <allow.json> --out <report.json>
  field-guard init --input <ir.json> --generator <path> --out <allow.json>
`.trim();
  console.error(usage);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  const inputData = JSON.parse(await readFile(args.input, 'utf-8'));

  if (args.command === 'run') {
    if (!args.allowlist) {
      console.error('Error: --allowlist is required for "run" command');
      process.exit(1);
    }

    const allowPatterns: string[] = JSON.parse(await readFile(args.allowlist, 'utf-8'));
    const matcher = new AllowlistMatcher(allowPatterns);
    const report = await runGuard({
      input: inputData,
      generatorPath: args.generator,
      allowlist: matcher,
    });

    await writeFile(args.out, JSON.stringify(report, null, 2) + '\n');
    console.log(`Report written to ${args.out}`);
    console.log(`Observed: ${report.summary.totalObserved}, Forbidden: ${report.summary.totalForbidden}, Allowed: ${report.summary.totalAllowed}`);

    if (report.forbiddenPaths.length > 0) {
      console.error(`\nForbidden paths detected:`);
      for (const p of report.forbiddenPaths) {
        console.error(`  - ${p}`);
      }
      process.exit(1);
    }
  }

  if (args.command === 'init') {
    const report = await runGuard({
      input: inputData,
      generatorPath: args.generator,
    });

    await writeFile(args.out, JSON.stringify(report.observedPaths, null, 2) + '\n');
    console.log(`Baseline allowlist written to ${args.out}`);
    console.log(`Recorded ${report.observedPaths.length} observed paths`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
