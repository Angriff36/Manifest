#!/usr/bin/env node

/**
 * Standalone manifest init script
 * Run this directly without building the CLI: node packages/cli/scripts/init.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

const CONFIG_FILE = 'manifest.config.yaml';

async function main() {
  const cwd = process.cwd();
  const configPath = path.resolve(cwd, CONFIG_FILE);

  // Check if config exists
  try {
    await fs.access(configPath);
    console.log(`✓ ${CONFIG_FILE} already exists`);
    console.log('');
    console.log('Use --force to overwrite:');
    console.log('  node packages/cli/scripts/init.mjs --force');
    process.exit(0);
  } catch {
    // File doesn't exist, continue
  }

  // Simple questions (non-interactive for now)
  const config = {
    $schema: 'https://manifest.dev/config.schema.json',
    src: '**/*.manifest',
    output: 'ir/',
  };

  // Write config
  const yamlContent = yaml.dump(config, {
    indent: 2,
    lineWidth: 120,
  });
  await fs.writeFile(configPath, yamlContent, 'utf-8');

  console.log('✓ Manifest initialized!');
  console.log('');
  console.log(`Created ${CONFIG_FILE}:`);
  console.log('');
  console.log(yamlContent);
  console.log('Quick start:');
  console.log("  echo 'entity User { name: string }' > User.manifest");
  console.log('  node packages/cli/scripts/compile.mjs User.manifest');
  console.log('');
  console.log('Edit manifest.config.yaml to customize paths.');
}

main().catch(err => {
  console.error('Init failed:', err.message);
  process.exit(1);
});
