import { describe, it, expect } from 'vitest';
import { RuntimeEngine } from './runtime-engine.js';
import type { IR } from './ir.js';

function minimalIR(): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'h',
      irHash: 'h',
      compilerVersion: 'test',
      schemaVersion: '1.0',
      compiledAt: '2025-01-01T00:00:00.000Z',
    },
    modules: [],
    values: [],
    entities: [
      {
        name: 'Counter',
        properties: [
          { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
          { name: 'count', type: { name: 'int', nullable: false }, modifiers: [] },
        ],
        computedProperties: [],
        relationships: [],
        commands: ['create'],
        constraints: [],
        policies: [],
      },
    ],
    enums: [],
    stores: [{ entity: 'Counter', target: 'memory', config: {} }],
    events: [],
    commands: [
      {
        name: 'create',
        entity: 'Counter',
        parameters: [],
        guards: [],
        constraints: [],
        actions: [
          {
            kind: 'mutate',
            target: 'count',
            expression: {
              kind: 'call',
              callee: { kind: 'identifier', name: 'now' },
              args: [],
            },
          },
        ],
        emits: [],
      },
    ],
    policies: [],
  };
}

describe('RuntimeEngine profiling', () => {
  it('collects phase timings when profiling is enabled', async () => {
    const profiles: unknown[] = [];
    const engine = new RuntimeEngine(
      minimalIR(),
      { user: { id: 'u1', role: 'admin' } },
      {
        profiling: {
          enabled: true,
          onProfileComplete: (p) => profiles.push(p),
        },
      },
    );

    await engine.runCommand('create', { id: 'c1' }, { entityName: 'Counter' });

    const collected = engine.getProfiles();
    expect(collected.length).toBe(1);
    expect(collected[0].commandName).toBe('create');
    expect(collected[0].phases.length).toBeGreaterThan(0);
    expect(profiles.length).toBe(1);
  });
});
