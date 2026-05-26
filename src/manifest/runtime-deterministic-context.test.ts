import { describe, it, expect } from 'vitest';
import { RuntimeEngine, ManifestEffectBoundaryError } from './runtime-engine';
import type { IR } from './ir';
import { COMPILER_VERSION } from './version';

/**
 * Tests that `context.deterministic === true` triggers the effect boundary
 * the same way `options.deterministicMode === true` does. Deterministic mode
 * is reachable from the runtime context so a downstream consumer can flip it
 * per request without re-instantiating the engine.
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
  values: [],
  entities: [
      {
        name: 'Foo',
        properties: [
          { name: 'name', type: { name: 'string', nullable: false }, modifiers: [] },
        ],
        computedProperties: [],
        relationships: [],
        commands: ['tag'],
        constraints: [],
        policies: [],
      },
    ],
    enums: [],
    stores: [],
    events: [],
    commands: [
      {
        name: 'tag',
        entity: 'Foo',
        parameters: [],
        guards: [],
        actions: [
          {
            kind: 'persist',
            expression: {
              kind: 'literal',
              value: { kind: 'null' },
            },
          },
        ],
        emits: [],
      },
    ],
    policies: [],
  };
}

describe('context.deterministic triggers effect boundary', () => {
  it('throws ManifestEffectBoundaryError when context.deterministic=true and persist runs', async () => {
    const ir = buildIR();
    const rt = new RuntimeEngine(ir, { tenantId: 't', deterministic: true });
    await expect(
      rt.runCommand('tag', {}, { entityName: 'Foo' })
    ).rejects.toBeInstanceOf(ManifestEffectBoundaryError);
  });

  it('does not throw when context.deterministic is unset or false', async () => {
    const ir = buildIR();
    const rt = new RuntimeEngine(ir, { tenantId: 't' });
    const result = await rt.runCommand('tag', {}, { entityName: 'Foo' });
    // Persist with null expression is a no-op in non-deterministic mode.
    expect(result.success).toBe(true);
  });

  it('options.deterministicMode still takes precedence when both are set', async () => {
    const ir = buildIR();
    // options says false explicitly; context says true. Options wins (explicit caller intent).
    const rt = new RuntimeEngine(
      ir,
      { tenantId: 't', deterministic: true },
      { deterministicMode: false }
    );
    const result = await rt.runCommand('tag', {}, { entityName: 'Foo' });
    expect(result.success).toBe(true);
  });
});
