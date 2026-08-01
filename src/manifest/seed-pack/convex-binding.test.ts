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

  it('binds an initialization-only entity to createVia and emits a direct-run entrypoint', () => {
    const ir = emptyIR();
    ir.entities = [entity('Event')];
    ir.entities[0]!.properties.push({
      name: 'internalNote',
      type: { name: 'string', nullable: true },
      modifiers: [],
    });
    ir.stores = [{ entity: 'Event', target: 'durable', config: {} } satisfies IRStore];
    ir.commands = [
      {
        entity: 'Event',
        name: 'open',
        parameters: [{ name: 'title', type: { name: 'string', nullable: false }, required: true }],
        guards: [],
        actions: [],
        emits: [],
        initialization: {
          initializationInputs: ['title'],
          authenticatedOwnershipFields: [],
          declaredDefaults: [],
          initialLifecycleState: [],
          commandOwnedFields: ['title'],
          draftFields: ['id', 'title'],
          finalDocumentRequirements: ['title'],
          dynamicGuardIndexes: [],
          redundantGuardIndexes: [],
        },
      },
    ];
    const pack: SeedPack = {
      meta: { packId: 'event-spine', version: '1', entities: ['Event'] },
      tables: [
        {
          entity: 'Event',
          columns: ['seedKey', 'title', 'internalNote'],
          rows: [{ seedKey: 'event-1', title: 'Launch', internalNote: 'not a command parameter' }],
        },
      ],
    };

    const { binding, code } = generateConvexSeedScript(ir, pack);

    expect(binding.entities[0]!.createMutation).toBe('Event_createViaOpen');
    expect(code).toContain('api.mutations.Event_createViaOpen');
    expect(code).not.toContain('"internalNote"');
    expect(code).toContain('(import.meta as ImportMeta & { main?: boolean }).main === true');
    expect(code).toContain('const deploymentUrl = process.argv[2] || process.env.CONVEX_URL;');
    expect(code).toContain(
      'Usage: bun scripts/seed-convex.ts <deployment-url> (or set CONVEX_URL)',
    );
    expect(code).toContain('process.exit(1);');
    expect(code).toContain('await seedConvex(deploymentUrl);');
    expect(code).toContain('Manifest Convex seed complete: ${rowsAttempted} rows attempted.');
  });

  it('chooses the first initialization command in IR order and documents the choice', () => {
    const ir = emptyIR();
    ir.entities = [entity('Event')];
    ir.stores = [{ entity: 'Event', target: 'durable', config: {} } satisfies IRStore];
    const initialization = {
      initializationInputs: ['title'],
      authenticatedOwnershipFields: [],
      declaredDefaults: [],
      initialLifecycleState: [],
      commandOwnedFields: ['title'],
      draftFields: ['id', 'title'],
      finalDocumentRequirements: ['title'],
      dynamicGuardIndexes: [],
      redundantGuardIndexes: [],
    };
    ir.commands = ['open', 'import'].map((name) => ({
      entity: 'Event',
      name,
      parameters: [{ name: 'title', type: { name: 'string', nullable: false }, required: true }],
      guards: [],
      actions: [],
      emits: [],
      initialization,
    }));
    const pack: SeedPack = {
      meta: { packId: 'event-spine', version: '1', entities: ['Event'] },
      tables: [
        { entity: 'Event', columns: ['seedKey', 'title'], rows: [{ seedKey: 'e1', title: 'One' }] },
      ],
    };

    const { binding, code } = generateConvexSeedScript(ir, pack);

    expect(binding.entities[0]!.createMutation).toBe('Event_createViaOpen');
    expect(code).toContain(
      'Event has multiple initialization commands (open, import); using first in IR order: open.',
    );
  });

  it('keeps a skip comment for a persistent entity with no creation command', () => {
    const ir = emptyIR();
    ir.entities = [entity('Task')];
    ir.stores = [{ entity: 'Task', target: 'durable', config: {} } satisfies IRStore];
    const pack: SeedPack = {
      meta: { packId: 'demo', version: '1', entities: ['Task'] },
      tables: [
        { entity: 'Task', columns: ['seedKey', 'title'], rows: [{ seedKey: 't1', title: 'One' }] },
      ],
    };

    const { binding, code } = generateConvexSeedScript(ir, pack);

    expect(binding.entities[0]!.createMutation).toBeNull();
    expect(code).toContain('skip Task: no creation command in IR (1 rows unused)');
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

  it('skips memory-store entities and emits typed datetime literals without duplicate keys', () => {
    const ir = emptyIR();
    const milestone: IREntity = {
      name: 'ActionMilestone',
      properties: [
        { name: 'title', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'dueDate', type: { name: 'datetime', nullable: false }, modifiers: ['required'] },
        {
          name: 'disciplinaryActionId',
          type: { name: 'string', nullable: false },
          modifiers: ['required'],
        },
      ],
      computedProperties: [],
      relationships: [
        {
          name: 'disciplinaryAction',
          kind: 'belongsTo',
          target: 'DisciplinaryAction',
          foreignKey: { fields: ['disciplinaryActionId'], references: ['id'] },
        },
      ],
      commands: [],
      constraints: [],
      policies: [],
    };
    const flag: IREntity = {
      name: 'FeatureFlag',
      properties: [
        { name: 'flagKey', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    };
    ir.entities = [milestone, flag];
    ir.stores = [
      { entity: 'ActionMilestone', target: 'durable', config: {} },
      { entity: 'FeatureFlag', target: 'memory', config: {} },
    ];
    ir.commands = [
      {
        entity: 'ActionMilestone',
        name: 'create',
        parameters: [
          {
            name: 'disciplinaryActionId',
            type: { name: 'string', nullable: false },
            required: true,
          },
          { name: 'title', type: { name: 'string', nullable: false }, required: true },
          { name: 'dueDate', type: { name: 'datetime', nullable: false }, required: true },
        ],
        guards: [],
        actions: [],
        emits: [],
      },
      {
        entity: 'FeatureFlag',
        name: 'create',
        parameters: [
          { name: 'flagKey', type: { name: 'string', nullable: false }, required: true },
        ],
        guards: [],
        actions: [],
        emits: [],
      },
    ];

    const pack: SeedPack = {
      meta: { packId: 'demo', version: '1', entities: ['ActionMilestone', 'FeatureFlag'] },
      tables: [
        {
          entity: 'ActionMilestone',
          columns: ['seedKey', 'title', 'dueDate', 'disciplinaryActionId', 'disciplinaryAction'],
          rows: [
            {
              seedKey: 'm1',
              title: '{{fill}}',
              dueDate: '{{fill}}',
              disciplinaryActionId: '{{fill}}',
              disciplinaryAction: '{{fill}}',
            },
          ],
        },
        {
          entity: 'FeatureFlag',
          columns: ['seedKey', 'flagKey'],
          rows: [{ seedKey: 'f1', flagKey: '{{fill}}' }],
        },
      ],
    };

    const { code, binding } = generateConvexSeedScript(ir, pack);
    expect(binding.entities.find((e) => e.entity === 'FeatureFlag')!.createMutation).toBeNull();
    expect(code).toContain('skip FeatureFlag: not a Convex-persistent store');
    expect(code).not.toContain('FeatureFlag_create');
    expect(code).toMatch(/"dueDate": \d+/);
    expect(code).not.toMatch(/"dueDate": "/);
    // disciplinaryActionId appears once (relationship overwrites property fill)
    const line = code
      .split('\n')
      .find((l) => l.includes('await client.mutation(api.mutations.ActionMilestone_create'))!;
    expect(line).toBeTruthy();
    const keys = [...line.matchAll(/"([^"]+)":/g)].map((m) => m[1]!);
    expect(keys.filter((k) => k === 'disciplinaryActionId')).toHaveLength(1);
    expect(code).toMatch(/"dueDate": \d+/);
  });
});
