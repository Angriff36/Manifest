#!/usr/bin/env node

/**
 * Manifest CLI Entry Point
 *
 * Loads the CLI straight from TypeScript source via jiti — no build step,
 * no dist/ to drift out of sync. src/ is the single source of truth.
 */

import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url);
const { runCli } = await jiti.import('../src/index.ts');

runCli().catch((error) => {
  console.error('Manifest CLI error:', error);
  process.exit(1);
});
