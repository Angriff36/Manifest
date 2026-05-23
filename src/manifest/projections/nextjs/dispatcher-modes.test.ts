import { describe, it, expect } from 'vitest';
import { compileToIR } from '../../ir-compiler';
import {
  NextJsProjection,
  NEXTJS_DEFAULTS,
  DISPATCHER_DEFAULTS,
  CONCRETE_COMMAND_ROUTES_DEFAULTS,
  getManifestDefaultsSnapshot,
} from './generator';

/**
 * Verifies dispatcher.executionMode and concreteCommandRoutes config keys
 * — the two pieces of generated behaviour the config system must be able
 * to flip without touching projection source.
 *
 * Default behaviour MUST remain the historical `inline` mode (back-compat).
 * The `externalExecutor` mode must not leak any `createManifestRuntime`
 * import or `runtime.runCommand` call into emitted output.
 */
describe('nextjs.dispatcher executionMode', () => {
  const target = new NextJsProjection();

  async function sampleIR() {
    const src = `
      entity Recipe {
        property tenantId: string
        property title: string

        command create() {
          emit RecipeCreated
        }
      }

      event RecipeCreated: "recipe.created" { recipeId: string }
    `;
    const result = await compileToIR(src);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.ir).not.toBeNull();
    return result.ir!;
  }

  it('defaults to inline mode (back-compat: emits createManifestRuntime + runtime.runCommand)', async () => {
    const ir = await sampleIR();
    const result = target.generate(ir, { surface: 'nextjs.dispatcher' });
    expect(result.artifacts).toHaveLength(1);
    const code = result.artifacts[0].code;

    expect(code).toContain('createManifestRuntime');
    expect(code).toContain('runtime.runCommand');
    // Inline mode MUST NOT import any external executor by default.
    expect(code).not.toContain('executeManifestCommand');
  });

  it('explicit inline mode produces identical shape to default', async () => {
    const ir = await sampleIR();
    const defaultResult = target.generate(ir, { surface: 'nextjs.dispatcher' });
    const explicitResult = target.generate(ir, {
      surface: 'nextjs.dispatcher',
      options: { dispatcher: { executionMode: 'inline' } },
    });
    expect(explicitResult.artifacts[0].code).toBe(defaultResult.artifacts[0].code);
  });

  it('externalExecutor mode imports the configured executor and does NOT inline runtime', async () => {
    const ir = await sampleIR();
    const result = target.generate(ir, {
      surface: 'nextjs.dispatcher',
      options: {
        dispatcher: {
          executionMode: 'externalExecutor',
          executorImportPath: '@my-app/manifest-executor',
          executorImportName: 'runManifestCommand',
        },
      },
    });
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(result.artifacts).toHaveLength(1);
    const code = result.artifacts[0].code;

    // Must import the configured executor by exact name + path
    expect(code).toContain('import { runManifestCommand } from "@my-app/manifest-executor"');
    // Must call it
    expect(code).toMatch(/await\s+runManifestCommand\(/);
    // Must NOT inline runtime construction or call runtime.runCommand
    expect(code).not.toContain('createManifestRuntime');
    expect(code).not.toMatch(/runtime\.runCommand/);
  });

  it('externalExecutor mode passes entity, command, input and context to the executor', async () => {
    const ir = await sampleIR();
    const code = target.generate(ir, {
      surface: 'nextjs.dispatcher',
      options: { dispatcher: { executionMode: 'externalExecutor' } },
    }).artifacts[0].code;

    expect(code).toContain('entityName: entity');
    expect(code).toContain('commandName: command');
    expect(code).toContain('input: body');
    expect(code).toContain('context: {');
    expect(code).toContain('actorId: userId');
  });

  it('externalExecutor + deriveInstanceId emits an instanceId derivation block', async () => {
    const ir = await sampleIR();
    const code = target.generate(ir, {
      surface: 'nextjs.dispatcher',
      options: {
        dispatcher: { executionMode: 'externalExecutor', deriveInstanceId: true },
      },
    }).artifacts[0].code;

    expect(code).toMatch(/const\s+instanceId\s+=/);
    expect(code).toContain('body?.instanceId');
    expect(code).toContain('instanceId,');
  });

  it('externalExecutor without deriveInstanceId does NOT emit instanceId', async () => {
    const ir = await sampleIR();
    const code = target.generate(ir, {
      surface: 'nextjs.dispatcher',
      options: { dispatcher: { executionMode: 'externalExecutor', deriveInstanceId: false } },
    }).artifacts[0].code;

    expect(code).not.toMatch(/const\s+instanceId\s+=/);
  });

  it('dispatcher.enabled: false suppresses the artifact', async () => {
    const ir = await sampleIR();
    const result = target.generate(ir, {
      surface: 'nextjs.dispatcher',
      options: { dispatcher: { enabled: false } },
    });

    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'DISPATCHER_DISABLED', severity: 'info' })
    );
  });
});

describe('nextjs.command concreteCommandRoutes config', () => {
  const target = new NextJsProjection();

  async function sampleIR() {
    const src = `
      entity Recipe {
        property tenantId: string
        property title: string

        command create() {
          emit RecipeCreated
        }
      }

      event RecipeCreated: "recipe.created" { recipeId: string }
    `;
    const result = await compileToIR(src);
    return result.ir!;
  }

  it('legacyAliasesOnly: true (default) keeps DEPRECATED ALIAS banner', async () => {
    const ir = await sampleIR();
    const code = target.generate(ir, {
      surface: 'nextjs.command',
      entity: 'Recipe',
      command: 'create',
    }).artifacts[0].code;

    expect(code).toContain('DEPRECATED ALIAS');
  });

  it('legacyAliasesOnly: false drops the DEPRECATED ALIAS banner', async () => {
    const ir = await sampleIR();
    const code = target.generate(ir, {
      surface: 'nextjs.command',
      entity: 'Recipe',
      command: 'create',
      options: { concreteCommandRoutes: { legacyAliasesOnly: false } },
    }).artifacts[0].code;

    expect(code).not.toContain('DEPRECATED ALIAS');
  });

  it('concreteCommandRoutes.enabled: false suppresses concrete routes', async () => {
    const ir = await sampleIR();
    const result = target.generate(ir, {
      surface: 'nextjs.command',
      entity: 'Recipe',
      command: 'create',
      options: { concreteCommandRoutes: { enabled: false } },
    });

    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'CONCRETE_COMMAND_ROUTES_DISABLED', severity: 'info' })
    );
  });

  it('externalExecutor mode in per-command route delegates to the configured executor', async () => {
    const ir = await sampleIR();
    const code = target.generate(ir, {
      surface: 'nextjs.command',
      entity: 'Recipe',
      command: 'create',
      options: {
        dispatcher: {
          executionMode: 'externalExecutor',
          executorImportPath: '@my-app/manifest-executor',
          executorImportName: 'runManifestCommand',
        },
      },
    }).artifacts[0].code;

    expect(code).toContain('import { runManifestCommand } from "@my-app/manifest-executor"');
    expect(code).toMatch(/await\s+runManifestCommand\(/);
    expect(code).toContain('entityName: "Recipe"');
    expect(code).toContain('commandName: "create"');
    expect(code).not.toContain('createManifestRuntime');
  });
});

describe('exported defaults', () => {
  it('NEXTJS_DEFAULTS exposes the historical hardcoded values', () => {
    expect(NEXTJS_DEFAULTS.authProvider).toBe('clerk');
    expect(NEXTJS_DEFAULTS.authImportPath).toBe('@repo/auth/server');
    expect(NEXTJS_DEFAULTS.appDir).toBe('apps/api/app/api');
    expect(NEXTJS_DEFAULTS.tenantIdProperty).toBe('tenantId');
    expect(NEXTJS_DEFAULTS.deletedAtProperty).toBe('deletedAt');
  });

  it('DISPATCHER_DEFAULTS preserves inline mode as the back-compat default', () => {
    expect(DISPATCHER_DEFAULTS.enabled).toBe(true);
    expect(DISPATCHER_DEFAULTS.executionMode).toBe('inline');
    expect(DISPATCHER_DEFAULTS.deriveInstanceId).toBe(false);
  });

  it('CONCRETE_COMMAND_ROUTES_DEFAULTS marks per-command routes as legacy aliases', () => {
    expect(CONCRETE_COMMAND_ROUTES_DEFAULTS.enabled).toBe(true);
    expect(CONCRETE_COMMAND_ROUTES_DEFAULTS.legacyAliasesOnly).toBe(true);
  });

  it('getManifestDefaultsSnapshot returns a stable shape for CI snapshots', () => {
    const snap = getManifestDefaultsSnapshot();
    expect(snap).toMatchInlineSnapshot(`
      {
        "concreteCommandRoutes": {
          "enabled": true,
          "legacyAliasesOnly": true,
        },
        "dispatcher": {
          "deriveInstanceId": false,
          "enabled": true,
          "executionMode": "inline",
          "executorImportName": "executeManifestCommand",
          "executorImportPath": "@/lib/manifest-executor",
        },
        "nextjs": {
          "appDir": "apps/api/app/api",
          "authImportPath": "@repo/auth/server",
          "authProvider": "clerk",
          "databaseImportPath": "@repo/database",
          "deletedAtProperty": "deletedAt",
          "includeComments": true,
          "includeSoftDeleteFilter": true,
          "includeTenantFilter": true,
          "indentSize": 2,
          "responseImportPath": "@/lib/manifest-response",
          "runtimeImportPath": "@/lib/manifest-runtime",
          "strictMode": true,
          "tenantIdProperty": "tenantId",
        },
        "routes": {
          "basePath": "/api",
          "includeAuth": true,
          "includeTenant": true,
        },
        "tenantProvider": {
          "functionName": "getTenantIdForOrg",
          "importPath": "@/app/lib/tenant",
          "lookupKey": "orgId",
        },
      }
    `);
  });
});
