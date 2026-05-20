import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { auditGovernanceCommand } from './audit-governance';

async function tempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeFile(p: string, content: string) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, 'utf-8');
}

describe('manifest audit-governance', () => {
  it('runs all detectors by default and reports the detector list', async () => {
    const dir = await tempDir('manifest-audit-gov-empty-');
    const result = await auditGovernanceCommand({ root: dir, format: 'json' });
    expect(result.detectorsRun).toEqual(
      expect.arrayContaining([
        'direct-writes',
        'event-fabrication',
        'route-drift',
        'missing-tests',
        'bypass-violations',
      ])
    );
  });

  it('--only selects a subset of detectors', async () => {
    const dir = await tempDir('manifest-audit-gov-only-');
    const result = await auditGovernanceCommand({
      root: dir,
      only: 'direct-writes,route-drift',
      format: 'json',
    });
    expect(result.detectorsRun).toEqual(['direct-writes', 'route-drift']);
  });

  it('flags a direct write in a route as DIRECT_WRITE', async () => {
    const dir = await tempDir('manifest-audit-gov-dw-');
    await writeFile(
      path.join(dir, 'app/api/recipes/route.ts'),
      `import { prisma } from "@/db";\nexport async function POST() {\n  await prisma.recipe.create({ data: {} });\n}\n`
    );
    const result = await auditGovernanceCommand({
      root: dir,
      only: 'direct-writes',
      format: 'json',
    });
    expect(result.errorCount).toBeGreaterThanOrEqual(1);
    expect(result.findings.some((f) => f.code === 'DIRECT_WRITE')).toBe(true);
  });

  it('flags event fabrication in routes', async () => {
    const dir = await tempDir('manifest-audit-gov-ef-');
    await writeFile(
      path.join(dir, 'app/api/recipes/route.ts'),
      `import { eventBus } from "@/events";\nexport async function POST() {\n  await eventBus.publish('Recipe.published', {});\n}\n`
    );
    const result = await auditGovernanceCommand({
      root: dir,
      only: 'event-fabrication',
      format: 'json',
    });
    expect(result.errorCount).toBe(1);
    expect(result.findings[0].code).toBe('EVENT_FABRICATION_PUBLISH');
  });

  it('does not flag the canonical dispatcher route as drift', async () => {
    const dir = await tempDir('manifest-audit-gov-canonical-');
    await writeFile(
      path.join(dir, 'app/api/manifest/[entity]/commands/[command]/route.ts'),
      `export async function POST() { return runCommand('x', {}, {}); }\n`
    );
    const result = await auditGovernanceCommand({
      root: dir,
      only: 'route-drift',
      format: 'json',
    });
    expect(result.errorCount).toBe(0);
  });

  it('flags concrete per-command routes that call runCommand without a deprecation banner', async () => {
    const dir = await tempDir('manifest-audit-gov-drift-');
    await writeFile(
      path.join(dir, 'app/api/recipes/create/route.ts'),
      `export async function POST() { return runCommand('create', {}, {}); }\n`
    );
    const result = await auditGovernanceCommand({
      root: dir,
      only: 'route-drift',
      format: 'json',
    });
    expect(result.errorCount).toBe(1);
    expect(result.findings[0].code).toBe('ROUTE_DRIFT');
  });

  it('does not flag concrete per-command routes that DO carry the deprecation banner', async () => {
    const dir = await tempDir('manifest-audit-gov-aliased-');
    await writeFile(
      path.join(dir, 'app/api/recipes/create/route.ts'),
      `// DEPRECATED ALIAS — see /api/manifest/[entity]/commands/[command]\nexport async function POST() { return runCommand('create', {}, {}); }\n`
    );
    const result = await auditGovernanceCommand({
      root: dir,
      only: 'route-drift',
      format: 'json',
    });
    expect(result.errorCount).toBe(0);
  });

  it('missing-tests detector warns when no commands registry is provided', async () => {
    const dir = await tempDir('manifest-audit-gov-mt-no-reg-');
    const result = await auditGovernanceCommand({
      root: dir,
      only: 'missing-tests',
      format: 'json',
    });
    expect(result.warningCount).toBe(1);
    expect(result.findings[0].code).toBe('MISSING_TESTS_NO_REGISTRY');
  });

  it('missing-tests detector flags governed commands without test references', async () => {
    const dir = await tempDir('manifest-audit-gov-mt-');
    const registryPath = path.join(dir, 'commands.json');
    await writeFile(
      registryPath,
      JSON.stringify({
        irHash: 'h',
        compilerVersion: 'v',
        commands: [{ entity: 'Recipe', command: 'create', commandId: 'Recipe.create' }],
      })
    );
    const result = await auditGovernanceCommand({
      root: dir,
      only: 'missing-tests',
      commandsRegistry: registryPath,
      format: 'json',
    });
    expect(result.errorCount).toBe(1);
    expect(result.findings[0].code).toBe('MISSING_CONFORMANCE_TEST');
  });

  it('missing-tests detector passes when a test references the commandId', async () => {
    const dir = await tempDir('manifest-audit-gov-mt-ok-');
    const registryPath = path.join(dir, 'commands.json');
    await writeFile(
      registryPath,
      JSON.stringify({
        irHash: 'h',
        compilerVersion: 'v',
        commands: [{ entity: 'Recipe', command: 'create', commandId: 'Recipe.create' }],
      })
    );
    await writeFile(
      path.join(dir, 'tests/recipe.test.ts'),
      `import { describe } from 'vitest';\ndescribe('Recipe.create', () => {});\n`
    );
    const result = await auditGovernanceCommand({
      root: dir,
      only: 'missing-tests',
      commandsRegistry: registryPath,
      format: 'json',
    });
    expect(result.errorCount).toBe(0);
  });

  it('bypass-violations detector flags writes not in the bypass registry', async () => {
    const dir = await tempDir('manifest-audit-gov-bv-');
    await writeFile(
      path.join(dir, 'app/api/recipes/route.ts'),
      `import { prisma } from "@/db";\nexport async function POST() {\n  await prisma.recipe.create({ data: {} });\n}\n`
    );
    const bypassPath = path.join(dir, 'bypasses.json');
    await writeFile(
      bypassPath,
      JSON.stringify({
        version: '1',
        bypasses: [
          {
            entity: 'Other',
            path: 'app/api/other/route.ts',
            reason: '',
            whyRuntimeNotRequired: '',
            tenantBoundary: '',
            owner: '',
            approvedAt: '2024-01-01',
            reviewBy: '2099-01-01',
          },
        ],
      })
    );
    const result = await auditGovernanceCommand({
      root: dir,
      only: 'bypass-violations',
      bypassRegistry: bypassPath,
      format: 'json',
    });
    expect(result.errorCount).toBeGreaterThanOrEqual(1);
    expect(result.findings.some((f) => f.code === 'BYPASS_VIOLATION')).toBe(true);
  });

  it('bypass-violations detector does not flag writes that ARE in the bypass registry', async () => {
    const dir = await tempDir('manifest-audit-gov-bv-ok-');
    await writeFile(
      path.join(dir, 'app/api/recipes/route.ts'),
      `import { prisma } from "@/db";\nexport async function POST() {\n  await prisma.recipe.create({ data: {} });\n}\n`
    );
    const bypassPath = path.join(dir, 'bypasses.json');
    await writeFile(
      bypassPath,
      JSON.stringify({
        version: '1',
        bypasses: [
          {
            entity: 'Recipe',
            path: 'app/api/recipes/route.ts',
            reason: '',
            whyRuntimeNotRequired: '',
            tenantBoundary: '',
            owner: '',
            approvedAt: '2024-01-01',
            reviewBy: '2099-01-01',
          },
        ],
      })
    );
    const result = await auditGovernanceCommand({
      root: dir,
      only: 'bypass-violations',
      bypassRegistry: bypassPath,
      format: 'json',
    });
    expect(result.findings.some((f) => f.code === 'BYPASS_VIOLATION')).toBe(false);
  });
});
