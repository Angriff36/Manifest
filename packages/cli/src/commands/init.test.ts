/**
 * Guard tests for `manifest init` scaffolding.
 *
 * Manifest does not publish a resolvable config-schema URL, and
 * `manifest config validate` loads the schema bundled with the package
 * (never a URL). Generated config must therefore NOT carry a dead public
 * `$schema` URL — doing so implies remote validation that does not happen.
 *
 * These tests lock that in: the init scaffolding and the effective config
 * produced by the loader must never contain the historical dead URLs.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';
import yaml from 'js-yaml';

import { createConfigFromAnswers } from './init.js';
import { saveConfig, loadConfig, getConfig } from '../utils/config.js';

const DEAD_URLS = [
  'manifest.dev/config.schema.json',
  'manifest.lang',
];

function assertNoDeadUrl(text: string): void {
  for (const url of DEAD_URLS) {
    expect(text).not.toContain(url);
  }
}

describe('init scaffolding does not emit a dead $schema URL', () => {
  it('createConfigFromAnswers omits $schema entirely', () => {
    const config = createConfigFromAnswers({
      sourcePattern: '**/*.manifest',
      outputDir: 'ir/',
      enableCodegen: false,
    });

    expect(config.$schema).toBeUndefined();
    assertNoDeadUrl(yaml.dump(config));
  });

  it('createConfigFromAnswers with codegen still omits $schema', () => {
    const config = createConfigFromAnswers({
      sourcePattern: 'modules/**/*.manifest',
      outputDir: 'ir/',
      enableCodegen: true,
      projectionTarget: 'nextjs',
      codeOutputDir: 'app/api',
    });

    expect(config.$schema).toBeUndefined();
    assertNoDeadUrl(yaml.dump(config));
  });
});

describe('written + loaded config carries no dead $schema URL', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'manifest-init-schema-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('saveConfig writes a YAML file with no dead schema URL', async () => {
    const config = createConfigFromAnswers({
      sourcePattern: '**/*.manifest',
      outputDir: 'ir/',
      enableCodegen: false,
    });
    await saveConfig(config, tempDir);

    const written = await fs.readFile(
      path.join(tempDir, 'manifest.config.yaml'),
      'utf-8'
    );
    assertNoDeadUrl(written);
    expect(written).not.toContain('$schema');
  });

  it('round-trips through loadConfig without a $schema URL', async () => {
    const config = createConfigFromAnswers({
      sourcePattern: '**/*.manifest',
      outputDir: 'ir/',
      enableCodegen: false,
    });
    await saveConfig(config, tempDir);

    const loaded = await loadConfig(tempDir);
    assertNoDeadUrl(JSON.stringify(loaded));
  });

  it('effective config (defaults merged) injects no dead $schema URL', async () => {
    // Empty directory → loader falls back entirely to built-in defaults.
    const effective = await getConfig(tempDir);
    expect(effective.$schema).toBeUndefined();
    assertNoDeadUrl(JSON.stringify(effective));
  });
});
