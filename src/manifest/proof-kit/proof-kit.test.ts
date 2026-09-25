import { describe, expect, it } from 'vitest';
import type { IR, IRCommand, IREntity, IRExpression, IRPolicy, IRReactionRule } from '../ir.js';
import { COMPILER_VERSION } from '../version.js';
import {
  emitCapabilityCatalog,
  emitIntegrationGuardConfig,
  emitProofRegistry,
  formatCapabilityCatalogMarkdown,
  reactionProofId,
  runManifestIntegrationGuard,
  validateProofRegistry,
} from './index.js';

const member = (root: string, property: string): IRExpression => ({
  kind: 'member',
  object: { kind: 'identifier', name: root },
  property,
});

function entity(name: string, commands: string[]): IREntity {
  return {
    name,
    properties: [
      { name: 'tenantId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      { name: 'status', type: { name: 'string', nullable: false }, modifiers: ['required'] },
    ],
    computedProperties: [],
    relationships: [],
    commands,
    constraints: [],
    policies: [`${name}Execute`],
    defaultPolicies: [`${name}Execute`],
    transitions: [{ property: 'status', from: 'calculated', to: ['confirmed'] }],
  };
}

function command(entityName: string, name: string, emits: string[] = []): IRCommand {
  return {
    entity: entityName,
    name,
    parameters: [],
    guards: [],
    actions: [],
    emits,
  };
}

function policy(name: string, entityName: string): IRPolicy {
  return {
    name,
    entity: entityName,
    action: 'execute',
    expression: {
      kind: 'call',
      callee: { kind: 'identifier', name: 'roleAllows' },
      args: [
        member('user', 'role'),
        { kind: 'literal', value: { kind: 'string', value: 'inventoryAccess' } },
      ],
    },
  };
}

function sliceIR(): IR {
  const commands = [
    command('IngredientDemand', 'confirm', ['IngredientDemandConfirmed']),
    command('PurchaseNeed', 'create', ['PurchaseNeedOpened']),
  ];
  const reactions: IRReactionRule[] = [
    {
      event: 'IngredientDemandConfirmed',
      targetEntity: 'PurchaseNeed',
      targetCommand: 'create',
      resolve: { kind: 'literal', value: { kind: 'null' } },
      params: [],
    },
  ];
  const entities = [entity('IngredientDemand', ['confirm']), entity('PurchaseNeed', ['create'])];
  return {
    version: '1.0',
    provenance: {
      contentHash: 'proof-kit-hash',
      compilerVersion: COMPILER_VERSION,
      schemaVersion: '1.0',
      compiledAt: '2026-07-16T00:00:00.000Z',
    },
    modules: [],
    values: [],
    entities,
    enums: [],
    stores: entities.map((item) => ({ entity: item.name, target: 'durable', config: {} })),
    events: [],
    commands,
    policies: [
      policy('IngredientDemandExecute', 'IngredientDemand'),
      policy('PurchaseNeedExecute', 'PurchaseNeed'),
    ],
    reactions,
  };
}

describe('proof-kit catalog + registry', () => {
  it('emits vertical-slice catalog from IR metadata (not TS scraping)', () => {
    const ir = sliceIR();
    const catalog = emitCapabilityCatalog(ir, {
      entityFilter: ['IngredientDemand', 'PurchaseNeed'],
      versions: {
        manifestVersion: COMPILER_VERSION,
        projection: 'convex',
        preset: { id: 'convex-application', version: '1.3.4' },
      },
      runtimeProofIds: new Set([reactionProofId(ir.reactions![0]!)]),
    });

    expect(catalog.schemaVersion).toBe('manifest-capability-catalog/v1');
    expect(catalog.entities.map((e) => e.entity)).toEqual(['IngredientDemand', 'PurchaseNeed']);
    expect(catalog.entities[0]!.table).toBe('ingredientDemands');
    expect(catalog.entities[1]!.allocatingCreate?.useCreateAlias).toBe('useCreatePurchaseNeed');
    expect(catalog.entities[0]!.requiredRolesOrCapabilities).toContain('inventoryAccess');
    const reaction = catalog.entities[0]!.reactions.find((r) =>
      r.id.includes('IngredientDemandConfirmed'),
    );
    expect(reaction?.runtimeProofStatus).toBe('runtime_proven');
    expect(reaction?.expectedConsequence).toBe('PurchaseNeed.create');

    const md = formatCapabilityCatalogMarkdown(catalog);
    expect(md).toContain('IngredientDemand');
    expect(md).toContain('PurchaseNeed.create');
  });

  it('derives runtime_proven only when a runtime test path is bound', () => {
    const ir = sliceIR();
    const proofId = reactionProofId(ir.reactions![0]!);
    const registry = emitProofRegistry(ir, {
      entityFilter: ['IngredientDemand', 'PurchaseNeed'],
      versions: {
        manifestVersion: COMPILER_VERSION,
        preset: { id: 'convex-application', version: '1.3.4' },
      },
      testBindings: [
        {
          proofId,
          structuralTest: 'tests/event-reaction-projection.test.ts',
          runtimeTest: 'tests/proofs/ingredient-demand-confirm.runtime.test.ts',
        },
      ],
    });
    const entry = registry.proofs.find((p) => p.id === proofId)!;
    expect(entry.status).toBe('runtime_proven');
    expect(entry.runtimeTest).toContain('ingredient-demand-confirm');
  });

  it('rejects handwritten runtime_proven without a test file', () => {
    const ir = sliceIR();
    const catalog = emitCapabilityCatalog(ir, {
      entityFilter: ['IngredientDemand', 'PurchaseNeed'],
    });
    const proofId = reactionProofId(ir.reactions![0]!);
    const registry = emitProofRegistry(ir, {
      entityFilter: ['IngredientDemand', 'PurchaseNeed'],
      versions: { manifestVersion: COMPILER_VERSION },
      testBindings: [{ proofId, runtimeTest: 'tests/missing-runtime.test.ts' }],
    });
    // Simulate handwritten overclaim: status kept but path deleted
    registry.proofs = registry.proofs.map((p) =>
      p.id === proofId ? { ...p, status: 'runtime_proven', runtimeTest: undefined } : p,
    );

    const issues = validateProofRegistry(registry, {
      rootDir: process.cwd(),
      catalog,
      installedManifestVersion: COMPILER_VERSION,
      fileExists: () => false,
    });
    expect(issues.some((i) => i.code === 'HANDWRITTEN_RUNTIME_CLAIM')).toBe(true);
  });

  it('fails validation when runtime test path is missing on disk', () => {
    const ir = sliceIR();
    const catalog = emitCapabilityCatalog(ir, {
      entityFilter: ['IngredientDemand', 'PurchaseNeed'],
    });
    const proofId = reactionProofId(ir.reactions![0]!);
    const registry = emitProofRegistry(ir, {
      entityFilter: ['IngredientDemand', 'PurchaseNeed'],
      versions: { manifestVersion: COMPILER_VERSION },
      testBindings: [{ proofId, runtimeTest: 'tests/does-not-exist.runtime.test.ts' }],
    });

    const issues = validateProofRegistry(registry, {
      rootDir: '/tmp/app',
      catalog,
      installedManifestVersion: COMPILER_VERSION,
      fileExists: () => false,
    });
    expect(issues.some((i) => i.code === 'RUNTIME_PROOF_MISSING_TEST')).toBe(true);
  });

  it('guard engine uses generated owned tables and reports file+line', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const ir = sliceIR();
    const catalog = emitCapabilityCatalog(ir, {
      entityFilter: ['IngredientDemand', 'PurchaseNeed'],
    });
    const config = emitIntegrationGuardConfig(catalog, {
      featureRoots: ['src/features/inventory'],
      lifecycleLiteralPattern:
        '\\b(?:from|to)\\s*:\\s*["\'](?:pending|calculated|confirmed|open|ordered)["\']',
    });
    expect(config.ownedTables).toEqual(['ingredientDemands', 'purchaseNeeds']);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-kit-guard-'));
    const feature = path.join(root, 'src/features/inventory');
    fs.mkdirSync(feature, { recursive: true });
    fs.writeFileSync(
      path.join(feature, 'Bypass.tsx'),
      'import { useMutation } from "convex/react";\nexport const x = useMutation(api.foo);\n',
    );
    const violations = runManifestIntegrationGuard(root, config);
    expect(violations.some((v) => v.rule === 'approved-api-path' && v.line === 1)).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('guard engine allowances and write targets (2026-09-25)', () => {
  async function tree(files: Record<string, string>) {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-kit-guard-ext-'));
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    }
    return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
  }

  const base = {
    schemaVersion: 'manifest-integration-guard/v1' as const,
    versions: { manifestVersion: 'test', projection: 'convex' },
    featureRoots: ['src/features/events'],
    convexLibRoot: 'convex/lib',
    ownedTables: ['events'],
    forbidDirectConvexHooks: true,
    forbiddenImportPatterns: ['(?:^|/)convex/(?:queries|mutations)(?:\\.|$|/)', '^convex/react$'],
    lifecyclePolicies: [],
    exceptions: [],
  };

  it('an allowance permits only the named import and hook in that file', async () => {
    const { root, cleanup } = await tree({
      'src/features/events/GuestPanel.tsx':
        'import { useQuery } from "convex/react";\nconst rows = useQuery(api.x);\n',
      'src/features/events/GuestWriter.tsx':
        'import { useMutation } from "convex/react";\nconst go = useMutation(api.y);\n',
      'src/features/events/GuestPanelBypass.tsx':
        'import { useMutation } from "convex/react";\nconst go = useMutation(api.y);\n',
    });
    try {
      const config = {
        ...base,
        allowances: [
          {
            pathSuffix: '/GuestPanel.tsx',
            imports: ['convex/react'],
            hooks: ['useQuery' as const],
            reason: 'relationship query',
          },
        ],
      };
      const files = (rule: string) =>
        runManifestIntegrationGuard(root, config)
          .filter((v) => v.rule === rule)
          .map((v) => v.file.split('/').pop());
      expect(files('approved-api-path')).not.toContain('GuestPanel.tsx');
      expect(files('approved-api-path')).toContain('GuestWriter.tsx');
      expect(files('approved-api-path')).toContain('GuestPanelBypass.tsx');

      const { writeFileSync } = await import('node:fs');
      const path = await import('node:path');
      writeFileSync(
        path.join(root, 'src/features/events/GuestPanel.tsx'),
        'import { useQuery, useMutation } from "convex/react";\nconst rows = useQuery(api.x);\nconst go = useMutation(api.y);\n',
      );
      const panel = runManifestIntegrationGuard(root, config).filter((v) =>
        v.file.endsWith('/GuestPanel.tsx'),
      );
      expect(panel).toEqual([expect.objectContaining({ rule: 'approved-api-path', line: 3 })]);
    } finally {
      cleanup();
    }
  });

  it('write targets flag only writes to owned document ids', async () => {
    const { root, cleanup } = await tree({
      'convex/lib/reads.ts':
        'export async function f(ctx: any, eventId: Id<"events">, file: any) {\n  const e = await ctx.db.get(eventId);\n  await ctx.db.patch(file._id, { seen: true });\n}\n',
      'convex/lib/typed.ts':
        'type EventKey = Id<"events">;\nexport async function f(ctx: any, key: EventKey) {\n  const target = key;\n  await ctx.db.patch(target, { title: "x" });\n}\n',
      'convex/lib/member.ts':
        'export async function f(ctx: any, event: any) {\n  const row = await ctx.db.get(event._id as Id<"events">);\n  await ctx.db.delete(event._id);\n}\n',
      'convex/lib/insert.ts':
        'export async function f(ctx: any) {\n  await ctx.db.insert("events", {});\n}\n',
    });
    try {
      const flagged = (config: typeof base & Record<string, unknown>) =>
        new Set(
          runManifestIntegrationGuard(root, config as never)
            .filter((v) => v.rule === 'generated-writes-only')
            .map((v) => v.file.split('/').pop()),
        );
      // Coarse default: any write in a file that mentions an owned table.
      expect(flagged(base)).toEqual(new Set(['reads.ts', 'typed.ts', 'member.ts', 'insert.ts']));
      const precise = flagged({
        ...base,
        writeTargets: { typedIdTables: ['events'], idNames: [], memberRoots: ['event'] },
      });
      expect(precise).toEqual(new Set(['typed.ts', 'member.ts', 'insert.ts']));
    } finally {
      cleanup();
    }
  });
});

describe('proof-kit package boundary', () => {
  it('core index does not reference convex-test', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(__dirname);
    const files = fs
      .readdirSync(root)
      .filter((f) => f.endsWith('.ts') && !f.includes('convex-test') && !f.endsWith('.test.ts'));
    for (const file of files) {
      const text = fs.readFileSync(path.join(root, file), 'utf8');
      expect(text).not.toMatch(/from ['"]convex-test['"]/);
      expect(text).not.toMatch(/require\(['"]convex-test['"]\)/);
    }
  });
});
