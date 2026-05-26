import { describe, it, expect } from 'vitest';
import { RuntimeEngine } from './runtime-engine';
import type { IR } from './ir';
import { COMPILER_VERSION } from './version';

/**
 * Tenant-scoped commands MUST fail closed when the runtime context lacks
 * tenantId. Manifest exposes this as the `requireTenantContext` runtime
 * option; downstream governance integrations flip it on for governed
 * entities.
 */

function buildIR(): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'test',
      compilerVersion: COMPILER_VERSION,
      schemaVersion: '1.0',
      compiledAt: new Date().toISOString(),
    },
    modules: [],
    entities: [
      {
        name: 'Foo',
        properties: [],
        computedProperties: [],
        relationships: [],
        commands: ['bar'],
        constraints: [],
        policies: [],
      },
    ],
    enums: [],
    stores: [],
    events: [],
    commands: [
      {
        name: 'bar',
        entity: 'Foo',
        parameters: [],
        guards: [],
        actions: [],
        emits: [],
      },
    ],
    policies: [],
  };
}

describe('requireTenantContext fail-closed', () => {
  it('returns MISSING_TENANT_CONTEXT failure when tenantId absent and option set', async () => {
    const ir = buildIR();
    const rt = new RuntimeEngine(ir, {}, { requireTenantContext: true });
    const result = await rt.runCommand('bar', {}, { entityName: 'Foo' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('MISSING_TENANT_CONTEXT');
    // No events on a closed-before-execution failure.
    expect(result.emittedEvents).toEqual([]);
  });

  it('allows execution when tenantId present and option set', async () => {
    const ir = buildIR();
    const rt = new RuntimeEngine(
      ir,
      { tenantId: 't_1' },
      { requireTenantContext: true }
    );
    const result = await rt.runCommand('bar', {}, { entityName: 'Foo' });
    expect(result.success).toBe(true);
  });

  it('does not enforce when option is unset (backwards compatibility)', async () => {
    const ir = buildIR();
    const rt = new RuntimeEngine(ir, {}, {});
    const result = await rt.runCommand('bar', {}, { entityName: 'Foo' });
    expect(result.success).toBe(true);
  });

  it('treats empty-string tenantId as missing', async () => {
    const ir = buildIR();
    const rt = new RuntimeEngine(ir, { tenantId: '' }, { requireTenantContext: true });
    const result = await rt.runCommand('bar', {}, { entityName: 'Foo' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('MISSING_TENANT_CONTEXT');
  });
});
