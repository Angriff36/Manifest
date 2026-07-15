/**
 * Seed-pack Convex binding — unit tests.
 */

import { describe, it, expect } from 'vitest';
import type { IR, IREntity, IRProperty, IRStore, IRCommand } from '../ir';
import type { SeedPack } from './types.js';
import { describeConvexSeedBinding, generateConvexSeedScript } from './convex-binding.js';

function emptyIR(): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'h',
      compilerVersion: 'test',
      schemaVersion: '1.0',
      compiledAt: '2025-01-01T00:00:00.000Z',
    },
    modules: [],
    values: [],
    entities: [],
    enums: [],
    stores: [],
    events: [],
    commands: [],
    policies: [],
  };
}

function entity(name: string): IREntity {
  const props: IRProperty[] = [
    { name: 'title', type: { name: 'string', nullable: false }, modifiers: ['required'] },
  ];
  return {
    name,
    properties: props,
    computedProperties: [],
    relationships: [],
    commands: [],
    constraints: [],
    policies: [],
  };
}

describe('Convex seed binding', () => {
  it('maps pack rows to Entity_create mutations', () => {
    const ir = emptyIR();
    ir.entities = [entity('Task')];
    ir.stores = [{ entity: 'Task', target: 'durable', config: {} } satisfies IRStore];
    const create: IRCommand = {
      entity: 'Task',
      name: 'create',
      parameters: [{ name: 'title', type: { name: 'string', nullable: false }, required: true }],
      guards: [],
      actions: [],
      emits: [],
    };
    ir.commands = [create];

    const pack: SeedPack = {
      meta: { packId: 'demo', version: '1', entities: ['Task'] },
      tables: [
        {
          entity: 'Task',
          columns: ['seedKey', 'title'],
          rows: [{ seedKey: 't1', title: 'Hello' }],
        },
      ],
    };

    const binding = describeConvexSeedBinding(ir, pack);
    expect(binding.entities[0]!.createMutation).toBe('Task_create');
    expect(binding.entities[0]!.seedKeys).toEqual(['t1']);

    const { code } = generateConvexSeedScript(ir, pack);
    expect(code).toContain('ConvexHttpClient');
    expect(code).toContain('api.mutations.Task_create');
    expect(code).toContain('"Hello"');
  });

  it('fills blank template cells and never emits empty mutation args', () => {
    const ir = emptyIR();
    ir.entities = [entity('Task')];
    ir.stores = [{ entity: 'Task', target: 'durable', config: {} } satisfies IRStore];
    ir.commands = [
      {
        entity: 'Task',
        name: 'create',
        parameters: [{ name: 'title', type: { name: 'string', nullable: false }, required: true }],
        guards: [],
        actions: [],
        emits: [],
      },
    ];
    const pack: SeedPack = {
      meta: { packId: 'demo', version: '1', entities: ['Task'] },
      tables: [
        {
          entity: 'Task',
          columns: ['seedKey', 'title'],
          rows: [{ seedKey: 't1', title: '{{fill}}' }],
        },
      ],
    };
    const { code } = generateConvexSeedScript(ir, pack);
    expect(code).not.toMatch(/\.mutation\([^,]+,\s*\{\s*\}\s*as any\)/);
    expect(code).toContain('api.mutations.Task_create');
    expect(code).toMatch(/"title":/);
  });
});
