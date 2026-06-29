import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { validateConfig, formatDiagnostic, loadConfigSchema } from './config-validate.js';
import { mergeBuildConfig, type ManifestConfig } from './config.js';

/** Walk up from this test file to load a docs/spec/config schema file. */
function loadSpecSchema(fileName: string): { properties?: Record<string, unknown> } {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let prev = ''; dir !== prev; prev = dir, dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'docs', 'spec', 'config', fileName);
    try {
      return JSON.parse(readFileSync(candidate, 'utf-8'));
    } catch {
      // keep walking up
    }
  }
  throw new Error(`Could not locate docs/spec/config/${fileName}`);
}

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

  it('accepts a prisma projection config with all documented options', async () => {
    const config: ManifestConfig = {
      projections: {
        prisma: {
          output: 'generated/schema.prisma',
          options: {
            provider: 'postgresql',
            urlEnvVar: 'POSTGRES_URL',
            tableMappings: { Order: 'orders' },
            columnMappings: { Order: { createdAt: 'created_at' } },
            precision: { Order: { total: { precision: 14, scale: 2 } } },
            indexes: { Order: [['customerId', 'createdAt'], { fields: ['status'], name: 'order_status_idx' }] },
            typeMappings: { Order: { legacyAmount: 'Decimal' } },
            foreignKeys: {
              Order: {
                customer: 'customerRef',
                vendor: { fields: ['vendorId'], references: ['id'], onDelete: 'Cascade', onUpdate: 'NoAction' },
              },
            },
            dbAttributes: { Order: { amount: 'Decimal(14, 2)' } },
            fieldAttributes: { Order: { code: ['@unique'] } },
            naming: { table: 'snake_case', column: 'snake_case', pluralizeTables: true },
          },
        },
      },
    };
    const result = await validateConfig(config);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  // Regression: PrismaStoreProjectionOptions previously used allOf with
  // additionalProperties:false. Draft-07 evaluates additionalProperties per
  // allOf branch, and each branch is blind to the other's properties — so a
  // valid prisma-store config (inherited provider/naming + own accessorNames)
  // was falsely rejected, and `softDelete` was missing entirely. The def is
  // now flattened into one closed object. Guard against allOf sneaking back.
  it('accepts a prisma-store config mixing inherited and own options + softDelete', async () => {
    const config: ManifestConfig = {
      projections: {
        'prisma-store': {
          options: {
            provider: 'postgresql',
            naming: 'snake_case',
            accessorNames: { OrderLine: 'order_lines' },
            metadataOutput: 'metadata.generated.ts',
            registryOutput: 'registry.generated.ts',
            storeImportPath: '@repo/store',
            metadataImportPath: './metadata.generated.js',
            softDelete: { Order: { field: 'status', deletedValue: 'deleted' } },
          },
        },
      },
    };
    const result = await validateConfig(config);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('rejects an unknown key inside prisma-store options (closedness preserved after flatten)', async () => {
    const config = {
      projections: { 'prisma-store': { options: { entityToPrismaModel: { A: 'a' } } } },
    } as unknown as ManifestConfig;
    const result = await validateConfig(config);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.message.includes('entityToPrismaModel'))).toBe(true);
  });

  it("accepts a global naming default (string shorthand)", async () => {
    const config: ManifestConfig = {
      naming: 'snake_case',
      projections: { prisma: { options: { provider: 'postgresql' } } },
    };
    const result = await validateConfig(config);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('rejects an invalid naming case value', async () => {
    const config = {
      projections: { prisma: { options: { naming: { column: 'kebab-case' } } } },
    } as unknown as ManifestConfig;
    const result = await validateConfig(config);
    expect(result.ok).toBe(false);
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

  // ── G0: hooks + plugins are real, consumed config keys (manifest install-hooks,
  //    manifest plugins). They must validate, not be rejected as unknown keys.
  it('accepts a hooks block with all documented keys', async () => {
    const config: ManifestConfig = {
      src: '**/*.manifest',
      hooks: {
        skipInCi: true,
        provider: 'husky',
        runFmt: true,
        runValidate: true,
      },
    };
    const result = await validateConfig(config);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('accepts the simple-git-hooks provider', async () => {
    const result = await validateConfig({ hooks: { provider: 'simple-git-hooks' } });
    expect(result.ok).toBe(true);
  });

  it('rejects an invalid hooks.provider enum value', async () => {
    const config = { hooks: { provider: 'lefthook' } } as unknown as ManifestConfig;
    const result = await validateConfig(config);
    expect(result.ok).toBe(false);
    const diag = result.diagnostics.find((d) => d.path.endsWith('provider'));
    expect(diag?.allowed).toEqual(['husky', 'simple-git-hooks']);
  });

  it('rejects an unknown key inside hooks', async () => {
    const config = { hooks: { runLint: true } } as unknown as ManifestConfig;
    const result = await validateConfig(config);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.message.includes('runLint'))).toBe(true);
  });

  it('accepts a plugins array with module/options/enabled', async () => {
    const config: ManifestConfig = {
      src: '**/*.manifest',
      plugins: [
        { module: '@acme/manifest-audit', enabled: true, options: { level: 'strict' } },
        { module: './local/redaction-plugin.ts' },
      ],
    };
    const result = await validateConfig(config);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('rejects a plugin declaration missing the required module key', async () => {
    const config = { plugins: [{ enabled: true }] } as unknown as ManifestConfig;
    const result = await validateConfig(config);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.message.includes('module'))).toBe(true);
  });

  it('rejects an unknown key inside a plugin declaration', async () => {
    const config = {
      plugins: [{ module: '@acme/x', version: '1.0.0' }],
    } as unknown as ManifestConfig;
    const result = await validateConfig(config);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.message.includes('version'))).toBe(true);
  });

  it('accepts a full config combining projections, env, hooks, and plugins', async () => {
    const config: ManifestConfig = {
      src: 'modules/**/*.manifest',
      output: 'ir/',
      projections: { nextjs: { output: 'app/api', options: { authProvider: 'clerk' } } },
      env: { stores: { DATABASE_URL: { name: 'DATABASE_URL', required: true } } },
      hooks: { provider: 'husky', runValidate: true },
      plugins: [{ module: '@acme/manifest-audit' }],
    };
    const result = await validateConfig(config);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });
});

// ── Schema drift fix: the loaded schema (manifest.config.schema.json) previously
//    lacked generator/relationMode/multiSchema under prisma options, so a real
//    multi-schema config was rejected by `manifest config validate` even though
//    the projection honors those keys. These guard against the desync returning.
describe('validateConfig — prisma multiSchema/relationMode/generator', () => {
  it('accepts projections.prisma.options.generator', async () => {
    const config: ManifestConfig = {
      projections: {
        prisma: {
          output: 'packages/database/prisma',
          options: {
            provider: 'postgresql',
            generator: {
              provider: 'prisma-client',
              output: '../generated',
              moduleFormat: 'esm',
              generatedFileExtension: 'ts',
              importFileExtension: 'ts',
            },
          },
        },
      },
    };
    const result = await validateConfig(config);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('accepts projections.prisma.options.relationMode', async () => {
    const result = await validateConfig({
      projections: { prisma: { options: { provider: 'postgresql', relationMode: 'prisma' } } },
    });
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('accepts projections.prisma.options.multiSchema', async () => {
    const config: ManifestConfig = {
      projections: {
        prisma: {
          options: {
            provider: 'postgresql',
            multiSchema: {
              enabled: true,
              schemas: ['public', 'tenant_crm', 'tenant_events'],
              entitySchema: { Client: 'tenant_crm', Event: 'tenant_events' },
              defaultSchema: 'public',
            },
          },
        },
      },
    };
    const result = await validateConfig(config);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('rejects a random unknown key under prisma options (closedness preserved)', async () => {
    const config = {
      projections: { prisma: { options: { provider: 'postgresql', notARealOption: true } } },
    } as unknown as ManifestConfig;
    const result = await validateConfig(config);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.message.includes('notARealOption'))).toBe(true);
  });

  it('accepts projections.prisma.options.autoBackRelations', async () => {
    const result = await validateConfig({
      projections: { prisma: { options: { provider: 'postgresql', autoBackRelations: true } } },
    });
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('accepts a top-level output on prisma-store (required by generate --all)', async () => {
    const result = await validateConfig({
      projections: { 'prisma-store': { output: 'manifest/generated/runtime/', options: { provider: 'postgresql' } } },
    });
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('rejects an unknown key inside multiSchema (closed object)', async () => {
    const config = {
      projections: { prisma: { options: { multiSchema: { enabled: true, bogus: 1 } } } },
    } as unknown as ManifestConfig;
    const result = await validateConfig(config);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.message.includes('bogus'))).toBe(true);
  });

  it('accepts prisma-store with inherited multiSchema/relationMode/generator + store-owned options', async () => {
    const config: ManifestConfig = {
      projections: {
        'prisma-store': {
          options: {
            provider: 'postgresql',
            naming: 'snake_case',
            relationMode: 'prisma',
            generator: { provider: 'prisma-client' },
            multiSchema: { enabled: true, entitySchema: { Order: 'tenant_accounting' } },
            accessorNames: { OrderLine: 'order_lines' },
            metadataOutput: 'metadata.generated.ts',
            registryOutput: 'registry.generated.ts',
            softDelete: { Order: { field: 'status', deletedValue: 'deleted' } },
          },
        },
      },
    };
    const result = await validateConfig(config);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  // The TS config's `build` block is merged over YAML and validated by the SAME
  // schema (config.ts loadAllConfigs → mergeBuildConfig → validateConfig). Prove
  // a .ts-authored prisma options bag survives that path.
  it('accepts a .ts-style build block (merged) with the new prisma options', async () => {
    const tsBuild: ManifestConfig = {
      projections: {
        prisma: {
          output: 'packages/database/prisma',
          options: {
            provider: 'postgresql',
            relationMode: 'prisma',
            generator: { provider: 'prisma-client', moduleFormat: 'esm' },
            multiSchema: { enabled: true, schemas: ['public'], defaultSchema: 'public' },
          },
        },
      },
    };
    const merged = mergeBuildConfig(null, tsBuild);
    const result = await validateConfig(merged);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });
});

// ── Drift guard between the loaded contract (manifest.config.schema.json) and
//    the standalone reference schema (prisma-projection.schema.json). Nothing
//    loads the standalone file; this test is what keeps it honest so a future
//    edit to one isn't silently absent from the other.
describe('prisma projection schema drift', () => {
  it('reference prisma-projection.schema.json key set equals loaded PrismaProjectionOptions key set', async () => {
    const reference = loadSpecSchema('prisma-projection.schema.json');
    const loaded = (await loadConfigSchema()) as {
      definitions: { PrismaProjectionOptions: { properties: Record<string, unknown> } };
    };
    const referenceKeys = Object.keys(reference.properties ?? {}).sort();
    const loadedKeys = Object.keys(loaded.definitions.PrismaProjectionOptions.properties).sort();
    expect(loadedKeys).toEqual(referenceKeys);
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
