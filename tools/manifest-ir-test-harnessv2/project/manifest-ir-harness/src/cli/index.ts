#!/usr/bin/env node
import { Command } from 'commander';
import { runCommand } from './commands/run.js';
import { fixturesCommand } from './commands/fixtures.js';

const program = new Command();

program
  .name('manifest-harness')
  .description('Test harness for Manifest IR consumers')
  .version('1.0.0');

program
  .command('run')
  .description('Run a test script against Manifest IR')
  .option('--manifest <path>', 'Path to .manifest source file')
  .option('--ir <path>', 'Path to .ir.json file')
  .requiredOption('--script <path>', 'Path to test script JSON')
  .option('--output <path>', 'Output results to file (default: stdout)')
  .option('--snapshot', 'Use Vitest snapshot testing')
  .action(runCommand);

program
  .command('fixtures')
  .description('Auto-discover and run all fixtures in a directory')
  .requiredOption('--dir <path>', 'Directory containing fixtures')
  .option('--snapshot', 'Use Vitest snapshot testing')
  .action(fixturesCommand);

program.parse();
