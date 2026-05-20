import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { auditBypassesCommand } from './audit-bypasses';

async function tempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeRegistry(dir: string, body: unknown): Promise<string> {
  const p = path.join(dir, 'bypasses.json');
  await fs.writeFile(p, JSON.stringify(body, null, 2), 'utf-8');
  return p;
}

const futureDate = '2099-01-01';
const pastDate = '2000-01-01';
const validApproved = '2024-01-01';

function validEntry(overrides: Record<string, unknown> = {}) {
  return {
    entity: 'AdminLog',
    path: 'src/legacy/admin-log.ts',
    reason: 'Admin-tools-only log writer, predates runtime.',
    whyRuntimeNotRequired: 'Log writes are append-only operational telemetry, not domain state.',
    tenantBoundary: 'Admin role enforced by Clerk middleware; no tenant data.',
    owner: 'platform-team@example.com',
    approvedAt: validApproved,
    reviewBy: futureDate,
    ...overrides,
  };
}

describe('manifest audit bypasses', () => {
  it('reports no findings for a conforming registry', async () => {
    const dir = await tempDir('manifest-bypass-valid-');
    const filePath = path.join(dir, 'src/legacy/admin-log.ts');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, '// stub', 'utf-8');
    const registry = await writeRegistry(dir, {
      version: '1',
      bypasses: [validEntry()],
    });

    const result = await auditBypassesCommand({
      registry,
      root: dir,
      format: 'json',
    });
    expect(result.errorCount).toBe(0);
    expect(result.warningCount).toBe(0);
  });

  it('reports schema errors when required fields are missing', async () => {
    const dir = await tempDir('manifest-bypass-missing-field-');
    const registry = await writeRegistry(dir, {
      version: '1',
      bypasses: [
        {
          entity: 'Foo',
          path: 'x.ts',
          // reason intentionally omitted
          whyRuntimeNotRequired: 'why',
          tenantBoundary: 'b',
          owner: 'me',
          approvedAt: validApproved,
          reviewBy: futureDate,
        },
      ],
    });
    const result = await auditBypassesCommand({ registry, root: dir, format: 'json' });
    expect(result.errorCount).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.code === 'BYPASS_SCHEMA_INVALID')).toBe(true);
  });

  it('reports a missing-file path as BYPASS_PATH_MISSING error', async () => {
    const dir = await tempDir('manifest-bypass-missing-file-');
    const registry = await writeRegistry(dir, {
      version: '1',
      bypasses: [validEntry({ path: 'does/not/exist.ts' })],
    });
    const result = await auditBypassesCommand({ registry, root: dir, format: 'json' });
    expect(result.errorCount).toBe(1);
    expect(result.findings[0].code).toBe('BYPASS_PATH_MISSING');
  });

  it('reports expired reviewBy as warning by default', async () => {
    const dir = await tempDir('manifest-bypass-expired-');
    const filePath = path.join(dir, 'src/old.ts');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, '', 'utf-8');
    const registry = await writeRegistry(dir, {
      version: '1',
      bypasses: [validEntry({ path: 'src/old.ts', reviewBy: pastDate })],
    });
    const result = await auditBypassesCommand({ registry, root: dir, format: 'json' });
    expect(result.errorCount).toBe(0);
    expect(result.warningCount).toBe(1);
    expect(result.findings[0].code).toBe('BYPASS_REVIEW_OVERDUE');
  });

  it('escalates expired reviewBy to error under --strict-expiry', async () => {
    const dir = await tempDir('manifest-bypass-strict-');
    const filePath = path.join(dir, 'src/old.ts');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, '', 'utf-8');
    const registry = await writeRegistry(dir, {
      version: '1',
      bypasses: [validEntry({ path: 'src/old.ts', reviewBy: pastDate })],
    });
    const result = await auditBypassesCommand({
      registry,
      root: dir,
      strictExpiry: true,
      format: 'json',
    });
    expect(result.errorCount).toBe(1);
    expect(result.findings[0].code).toBe('BYPASS_REVIEW_OVERDUE');
  });

  it('errors when --registry is not provided', async () => {
    const result = await auditBypassesCommand({ format: 'json' });
    expect(result.errorCount).toBe(1);
    expect(result.findings[0].code).toBe('BYPASS_REGISTRY_MISSING');
  });

  it('errors when registry file does not exist', async () => {
    const result = await auditBypassesCommand({
      registry: '/path/that/cannot/possibly/exist-' + Date.now() + '.json',
      format: 'json',
    });
    expect(result.errorCount).toBe(1);
    expect(result.findings[0].code).toBe('BYPASS_REGISTRY_NOT_FOUND');
  });

  it('errors when registry file is not valid JSON', async () => {
    const dir = await tempDir('manifest-bypass-bad-json-');
    const p = path.join(dir, 'bad.json');
    await fs.writeFile(p, '{ not: json }', 'utf-8');
    const result = await auditBypassesCommand({ registry: p, root: dir, format: 'json' });
    expect(result.errorCount).toBe(1);
    expect(result.findings[0].code).toBe('BYPASS_REGISTRY_NOT_JSON');
  });
});
