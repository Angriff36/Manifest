/**
 * CLI preflight command tests
 *
 * Tests the manifest preflight command for environment variable validation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';
import { preflightCommand } from './preflight.js';
import type { ManifestConfig } from '../utils/config.js';

describe('preflightCommand', () => {
  let tempDir: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-preflight-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true as any);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    logSpy.mockRestore();
    errorSpy.mockRestore();
    stdoutSpy.mockRestore();
    await fs.rm(tempDir, { recursive: true, force: true });
    process.exitCode = undefined as any;
  });

  async function writeConfig(config: Partial<ManifestConfig>): Promise<void> {
    const configPath = path.join(tempDir, 'manifest.config.yaml');
    const yamlContent = yaml.dump(config, { indent: 2 });
    await fs.writeFile(configPath, yamlContent, 'utf-8');
  }

  function getJsonOutput(): Record<string, unknown> {
    // stdout.write is called with a string + '\n'
    const calls = stdoutSpy.mock.calls;
    for (const call of calls) {
      const arg = call[0];
      if (typeof arg === 'string' && arg.startsWith('{')) {
        return JSON.parse(arg);
      }
    }
    throw new Error('No JSON output found in stdout');
  }

  describe('with no config file', () => {
    it('reports no environment variables configured', async () => {
      await preflightCommand({ format: 'json' });

      const result = getJsonOutput();

      expect(result.ok).toBe(true);
      expect(result.checked).toHaveLength(0);
      expect(result.configPath).toBeNull();
    });

    it('shows helpful message in text mode', async () => {
      await preflightCommand({ format: 'text' });

      const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');

      expect(output).toContain('No environment variables configured');
      expect(output).toContain('env:');
    });
  });

  describe('with env mapping configured', () => {
    it('validates all defined environment variables', async () => {
      // Set some env vars
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.CLERK_SECRET_KEY = 'sk_test_123';

      await writeConfig({
        env: {
          stores: {
            database: {
              name: 'DATABASE_URL',
              description: 'PostgreSQL connection string',
              required: true,
            },
          },
          auth: {
            clerk: {
              name: 'CLERK_SECRET_KEY',
              description: 'Clerk authentication secret',
              required: true,
            },
          },
        },
      });

      await preflightCommand({ format: 'json' });

      const result = getJsonOutput();

      expect(result.ok).toBe(true);
      expect(result.checked).toHaveLength(2);
      expect(result.present).toHaveLength(2);
      expect(result.missing).toHaveLength(0);

      // Clean up env vars
      delete process.env.DATABASE_URL;
      delete process.env.CLERK_SECRET_KEY;
    });

    it('reports missing required variables', async () => {
      // Don't set any env vars

      await writeConfig({
        env: {
          stores: {
            database: {
              name: 'DATABASE_URL',
              description: 'PostgreSQL connection string',
              required: true,
            },
          },
        },
      });

      await preflightCommand({ format: 'json' });

      const result = getJsonOutput();

      expect(result.ok).toBe(false);
      expect(result.missing).toHaveLength(1);
      expect(result.missing[0].name).toBe('DATABASE_URL');
      expect(process.exitCode).toBe(1);
    });

    it('treats variables with defaults as present', async () => {
      await writeConfig({
        env: {
          stores: {
            database: {
              name: 'DATABASE_URL',
              description: 'PostgreSQL connection string',
              required: true,
              default: 'postgresql://localhost:5432/dev',
            },
          },
        },
      });

      await preflightCommand({ format: 'json' });

      const result = getJsonOutput();

      expect(result.ok).toBe(true);
      expect(result.present).toHaveLength(0);
      expect(result.missing).toHaveLength(0);
      // Variable with default is neither in missing nor in present
      // but the check should pass
      expect(result.checked[0].hasDefault).toBe(true);
    });

    it('reports optional variables separately', async () => {
      await writeConfig({
        env: {
          adapters: {
            stripe: {
              name: 'STRIPE_SECRET_KEY',
              description: 'Stripe API key',
              required: false,
            },
          },
        },
      });

      await preflightCommand({ format: 'json' });

      const result = getJsonOutput();

      expect(result.ok).toBe(true);
      expect(result.optionalMissing).toHaveLength(1);
      expect(result.optionalMissing[0].name).toBe('STRIPE_SECRET_KEY');
    });

    it('handles all categories', async () => {
      process.env.DATABASE_URL = 'postgres://localhost/test';
      process.env.CLERK_SECRET_KEY = 'sk_test';
      process.env.SUPABASE_URL = 'https://supabase.com';
      process.env.CUSTOM_VAR = 'custom-value';

      await writeConfig({
        env: {
          stores: {
            database: { name: 'DATABASE_URL', required: true },
          },
          auth: {
            clerk: { name: 'CLERK_SECRET_KEY', required: true },
          },
          adapters: {
            supabase: { name: 'SUPABASE_URL', required: true },
          },
          custom: {
            customVar: { name: 'CUSTOM_VAR', required: true },
          },
        },
      });

      await preflightCommand({ format: 'json' });

      const result = getJsonOutput();

      expect(result.ok).toBe(true);
      expect(result.checked).toHaveLength(4);

      // Check categories
      const categories = result.checked.map((c: { category: string }) => c.category);
      expect(categories).toContain('stores');
      expect(categories).toContain('auth');
      expect(categories).toContain('adapters');
      expect(categories).toContain('custom');

      // Clean up
      delete process.env.DATABASE_URL;
      delete process.env.CLERK_SECRET_KEY;
      delete process.env.SUPABASE_URL;
      delete process.env.CUSTOM_VAR;
    });
  });

  describe('--generate-example', () => {
    it('generates .env.example file', async () => {
      await writeConfig({
        env: {
          stores: {
            database: {
              name: 'DATABASE_URL',
              description: 'PostgreSQL connection string',
              required: true,
              example: 'postgresql://localhost:5432/mydb',
            },
          },
          auth: {
            clerk: {
              name: 'CLERK_SECRET_KEY',
              description: 'Clerk authentication secret',
              required: true,
              example: 'sk_test_1234567890',
            },
          },
        },
      });

      await preflightCommand({ generateExample: true });

      const outputPath = path.join(tempDir, '.env.example');
      const content = await fs.readFile(outputPath, 'utf-8');

      expect(content).toContain('DATABASE_URL=');
      expect(content).toContain('CLERK_SECRET_KEY=');
      expect(content).toContain('PostgreSQL connection string');
      expect(content).toContain('Clerk authentication secret');
      expect(content).toContain('# Stores');
      expect(content).toContain('# Auth');
    });

    it('respects custom output path', async () => {
      await writeConfig({
        env: {
          stores: {
            database: {
              name: 'DATABASE_URL',
              required: true,
            },
          },
        },
      });

      // Use relative path to test path resolution
      const relativePath = 'custom/env.example';
      await preflightCommand({ generateExample: true, output: relativePath });

      const expectedPath = path.join(tempDir, 'custom', 'env.example');
      const content = await fs.readFile(expectedPath, 'utf-8');
      expect(content).toContain('DATABASE_URL=');
    });

    it('marks optional variables in comments', async () => {
      await writeConfig({
        env: {
          adapters: {
            stripe: {
              name: 'STRIPE_SECRET_KEY',
              description: 'Stripe API key',
              required: false,
            },
          },
        },
      });

      await preflightCommand({ generateExample: true });

      const outputPath = path.join(tempDir, '.env.example');
      const content = await fs.readFile(outputPath, 'utf-8');

      expect(content).toContain('STRIPE_SECRET_KEY=');
      expect(content).toContain('# Optional');
    });

    it('notes variables with defaults', async () => {
      await writeConfig({
        env: {
          stores: {
            database: {
              name: 'DATABASE_URL',
              required: true,
              default: 'postgresql://localhost:5432/dev',
            },
          },
        },
      });

      await preflightCommand({ generateExample: true });

      const outputPath = path.join(tempDir, '.env.example');
      const content = await fs.readFile(outputPath, 'utf-8');

      expect(content).toContain('DATABASE_URL=');
      expect(content).toContain('# Has a default value');
    });
  });

  describe('text output format', () => {
    it('shows colored output for present variables', async () => {
      process.env.DATABASE_URL = 'postgres://localhost/test';

      await writeConfig({
        env: {
          stores: {
            database: {
              name: 'DATABASE_URL',
              description: 'Database connection',
              required: true,
            },
          },
        },
      });

      await preflightCommand({ format: 'text' });

      const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');

      expect(output).toContain('✓');
      expect(output).toContain('DATABASE_URL');

      delete process.env.DATABASE_URL;
    });

    it('shows colored output for missing variables', async () => {
      await writeConfig({
        env: {
          stores: {
            database: {
              name: 'DATABASE_URL',
              description: 'Database connection',
              required: true,
            },
          },
        },
      });

      await preflightCommand({ format: 'text' });

      const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');

      expect(output).toContain('✗');
      expect(output).toContain('missing');
    });

    it('shows different symbol for optional variables', async () => {
      await writeConfig({
        env: {
          adapters: {
            stripe: {
              name: 'STRIPE_SECRET_KEY',
              description: 'Stripe API key',
              required: false,
            },
          },
        },
      });

      await preflightCommand({ format: 'text' });

      const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');

      expect(output).toContain('○');
      expect(output).toContain('(optional)');
    });

    it('includes instructions when variables are missing', async () => {
      await writeConfig({
        env: {
          stores: {
            database: {
              name: 'DATABASE_URL',
              required: true,
            },
          },
        },
      });

      await preflightCommand({ format: 'text' });

      const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');

      expect(output).toContain('To fix:');
      expect(output).toContain('manifest preflight --generate-example');
    });
  });
});
