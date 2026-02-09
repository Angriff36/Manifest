#!/usr/bin/env node

/**
 * Manifest CLI Entry Point
 *
 * This file is executed when running the `manifest` command.
 * It simply loads and runs the main CLI module.
 */

import { runCli } from '../dist/index.js';

runCli().catch((error) => {
  console.error('Manifest CLI error:', error);
  process.exit(1);
});
