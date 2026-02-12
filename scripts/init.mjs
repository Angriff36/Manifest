#!/usr/bin/env node

/**
 * Standalone manifest init script
 * Run: node scripts/init.mjs
 */

import fs from 'fs/promises';
import path from 'path';

const CONFIG_FILE = 'manifest.config.yaml';

async function main() {
  const cwd = process.cwd();
  const configPath = path.resolve(cwd, CONFIG_FILE);

  // Check if config exists
  try {
    await fs.access(configPath);
    console.log(`✓ ${CONFIG_FILE} already exists`);
    console.log('');
    console.log('Edit it directly or delete and run again.');
    process.exit(0);
  } catch {
    // File doesn't exist, continue
  }

  // Default config as YAML string
  const yamlContent = `$schema: https://manifest.dev/config.schema.json
src: '**/*.manifest'
output: ir/
`;

  // Write config
  await fs.writeFile(configPath, yamlContent, 'utf-8');

  console.log('✓ Manifest initialized!');
  console.log('');
  console.log(`Created ${CONFIG_FILE}:`);
  console.log(yamlContent);
  console.log('Quick start:');
  console.log("  1. echo 'entity User { name: string }' > User.manifest");
  console.log("  2. npm run build:lib  # Build the compiler");
  console.log("  3. npm run manifest:compile User.manifest");
  console.log('');
  console.log('Edit manifest.config.yaml to customize paths.');
}

main().catch(err => {
  console.error('Init failed:', err.message);
  process.exit(1);
});
