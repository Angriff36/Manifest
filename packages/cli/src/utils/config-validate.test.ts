import { describe, it, expect } from 'vitest';
import { validateConfig, formatDiagnostic } from './config-validate.js';
import type { ManifestConfig } from './config.js';

describe('validateConfig', () => {
  it('accepts a null config (defaults apply)', async () => {
    const result = await validateConfig(null);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('accepts an empty config', async () => {
    const result = await validateConfig({});
    expect(result.ok).toBe(true);
  });

  it('accepts a minimal valid config', async () => {
    const config: ManifestConfig = {
      src: 'src/**/*.manifest',
      output: 'ir/',
    };
    const result = await validateConfig(config);
    expect(result.ok).toBe(true);
  });

  it('accepts the full set of documented nextjs options', async () => {
    const config: ManifestConfig = {
      src: 'src/**/*.manifest',
      output: 'ir/',
      projections: {
        nextjs: {
          output: 'generated/',
          options: {
            authProvider: 'clerk',
            authImportPath: '@repo/auth/server',
            databaseImportPath: '@repo/database',
            responseImportPath: '@/lib/manifest-response',
            runtimeImportPath: '@/lib/manifest-runtime',
            includeTenantFilter: true,
            includeSoftDeleteFilter: true,
            tenantIdProperty: 'tenantId',
            deletedAtProperty: 'deletedAt',
            appDir: 'apps/api/app/api',
            strictMode: true,
            indentSize: 2,
          },
        },
      },
    };
    const result = await validateConfig(config);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('accepts a dispatcher block with externalExecutor mode', async () => {
    const config: ManifestConfig = {
      projections: {
        nextjs: {
          options: {
            dispatcher: {
              enabled: true,
              executionMode: 'externalExecutor',
              executorImportPath: '@my-app/manifest-executor',
              executorImportName: 'runManifestCommand',
              deriveInstanceId: true,
            },
          },
        },
      },
    };
    const result = await validateConfig(config);
    expect(result.ok).toBe(true);
  });

  it('rejects an unknown top-level key', async () => {
    const config = { unknownKey: true } as unknown as ManifestConfig;
    const result = await validateConfig(config);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.message.includes('unknownKey'))).toBe(true);
  });

  it('rejects an unknown nextjs option key', async () => {
    const config = {
      projections: {
        nextjs: {
          options: {
            unknownOption: 42,
          },
        },
      },
    } as unknown as ManifestConfig;
    const result = await validateConfig(config);
    expect(result.ok).toBe(false);
    const diag = result.diagnostics.find((d) => d.path.includes('options'));
    expect(diag).toBeDefined();
    expect(diag?.message).toContain('unknownOption');
  });

  it('rejects an invalid enum value for authProvider', async () => {
    const config = {
      projections: {
        nextjs: {
          options: { authProvider: 'invalid-provider' },
        },
      },
    } as unknown as ManifestConfig;
    const result = await validateConfig(config);
    expect(result.ok).toBe(false);
    const diag = result.diagnostics.find((d) => d.path.endsWith('authProvider'));
    expect(diag).toBeDefined();
    expect(diag?.allowed).toEqual(['clerk', 'nextauth', 'custom', 'none']);
  });

  it('rejects an invalid enum value for dispatcher.executionMode', async () => {
    const config = {
      projections: {
        nextjs: {
          options: {
            dispatcher: { executionMode: 'wrong-mode' },
          },
        },
      },
    } as unknown as ManifestConfig;
    const result = await validateConfig(config);
    expect(result.ok).toBe(false);
    const diag = result.diagnostics.find((d) => d.path.endsWith('executionMode'));
    expect(diag?.allowed).toEqual(['inline', 'externalExecutor']);
  });

  it('rejects a non-boolean for includeTenantFilter', async () => {
    const config = {
      projections: {
        nextjs: {
          options: { includeTenantFilter: 'yes' },
        },
      },
    } as unknown as ManifestConfig;
    const result = await validateConfig(config);
    expect(result.ok).toBe(false);
  });

  it('rejects a tenantProvider missing required keys', async () => {
    const config = {
      projections: {
        nextjs: {
          options: {
            tenantProvider: { importPath: '@repo/db' },
          },
        },
      },
    } as unknown as ManifestConfig;
    const result = await validateConfig(config);
    expect(result.ok).toBe(false);
    // Two missing required keys: functionName, lookupKey
    expect(result.diagnostics.some((d) => d.message.includes('functionName'))).toBe(true);
    expect(result.diagnostics.some((d) => d.message.includes('lookupKey'))).toBe(true);
  });

  it('rejects indentSize out of range', async () => {
    const config = {
      projections: {
        nextjs: {
          options: { indentSize: 100 },
        },
      },
    } as unknown as ManifestConfig;
    const result = await validateConfig(config);
    expect(result.ok).toBe(false);
  });

  it('emits diagnostics with a dotted path for nested violations', async () => {
    const config = {
      projections: {
        nextjs: {
          options: { dispatcher: { executionMode: 'bogus' } },
        },
      },
    } as unknown as ManifestConfig;
    const result = await validateConfig(config);
    const diag = result.diagnostics.find((d) => d.path.endsWith('executionMode'));
    expect(diag?.path).toBe('projections.nextjs.options.dispatcher.executionMode');
  });
});

describe('formatDiagnostic', () => {
  it('renders a dotted path and message', () => {
    const formatted = formatDiagnostic({
      path: 'projections.nextjs.options.authProvider',
      message: 'must be equal to one of the allowed values',
      allowed: ['clerk', 'nextauth', 'custom', 'none'],
    });
    expect(formatted).toContain('projections.nextjs.options.authProvider');
    expect(formatted).toContain('clerk, nextauth, custom, none');
  });

  it('uses <root> when path is empty', () => {
    const formatted = formatDiagnostic({ path: '', message: 'some root-level problem' });
    expect(formatted).toContain('<root>');
  });
});
