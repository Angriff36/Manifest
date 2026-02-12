#!/usr/bin/env node
import { Command } from 'commander';
import { runCommand } from './commands/run.js';
import { fixturesCommand } from './commands/fixtures.js';
const program = new Command();
program
    .name('harness')
    .description('Manifest IR Consumer Test Harness')
    .version('1.0.0');
program.addCommand(runCommand);
program.addCommand(fixturesCommand);
program.parse();
//# sourceMappingURL=index.js.map