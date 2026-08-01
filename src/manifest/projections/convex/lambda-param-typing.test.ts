/**
 * Regression: count_of(self.<hasMany>, lambda) must emit typed callback params
 * (TS7006) for Event.isReadyForExecution (computed) and Event.beginExecution
 * (mutation guards) through the shared expression renderer.
 */

import { describe, it, expect } from 'vitest';
import type { IR, IREntity, IRExpression, IRProperty, IRStore } from '../../ir';
import { ConvexProjection } from './generator.js';

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

function prop(name: string, typeName: string, modifiers: IRProperty['modifiers'] = []): IRProperty {
  return { name, type: { name: typeName, nullable: false }, modifiers };
}

function entity(
  name: string,
  props: IRProperty[],
  rels: IREntity['relationships'] = [],
  computed: IREntity['computedProperties'] = [],
): IREntity {
  return {
    name,
    properties: props,
    computedProperties: computed,
    relationships: rels,
    commands: [],
    constraints: [],
    policies: [],
  };
}

function countOfOpenStatus(rel: string, param: string, openStatuses: string[]): IRExpression {
  let body: IRExpression | undefined;
  for (const status of openStatuses) {
    const cmp: IRExpression = {
      kind: 'binary',
      operator: '!=',
      left: { kind: 'member', object: { kind: 'identifier', name: param }, property: 'status' },
      right: { kind: 'literal', value: { kind: 'string', value: status } },
    };
    body = body ? { kind: 'binary', operator: 'and', left: body, right: cmp } : cmp;
  }
  return {
    kind: 'binary',
    operator: '==',
    left: {
      kind: 'call',
      callee: { kind: 'identifier', name: 'count_of' },
      args: [
        {
          kind: 'member',
          object: { kind: 'identifier', name: 'self' },
          property: rel,
        },
        { kind: 'lambda', params: [param], body: body! },
      ],
    },
    right: { kind: 'literal', value: { kind: 'number', value: 0 } },
  };
}

function readinessExpr(): IRExpression {
  return {
    kind: 'binary',
    operator: 'and',
    left: {
      kind: 'binary',
      operator: 'and',
      left: countOfOpenStatus('prepTasks', 't', ['completed', 'cancelled']),
      right: countOfOpenStatus('packLists', 'p', ['dispatched', 'cancelled']),
    },
    right: countOfOpenStatus('deliveries', 'd', ['delivered', 'cancelled', 'failed']),
  };
}

function eventDomainIR(): IR {
  const ir = emptyIR();
  const readiness = readinessExpr();
  ir.entities = [
    entity(
      'Event',
      [prop('stage', 'string', ['required'])],
      [
        { name: 'prepTasks', kind: 'hasMany', target: 'PrepTask' },
        { name: 'packLists', kind: 'hasMany', target: 'PackList' },
        { name: 'deliveries', kind: 'hasMany', target: 'Delivery' },
      ],
      [
        {
          name: 'isReadyForExecution',
          type: { name: 'boolean', nullable: false },
          expression: readiness,
          dependencies: ['prepTasks', 'packLists', 'deliveries'],
        },
      ],
    ),
    entity(
      'PrepTask',
      [prop('status', 'string', ['required']), prop('eventId', 'string', ['required'])],
      [
        {
          name: 'event',
          kind: 'belongsTo',
          target: 'Event',
          foreignKey: { fields: ['eventId'], references: ['id'] },
        },
      ],
    ),
    entity(
      'PackList',
      [prop('status', 'string', ['required']), prop('eventId', 'string', ['required'])],
      [
        {
          name: 'event',
          kind: 'belongsTo',
          target: 'Event',
          foreignKey: { fields: ['eventId'], references: ['id'] },
        },
      ],
    ),
    entity(
      'Delivery',
      [prop('status', 'string', ['required']), prop('eventId', 'string', ['required'])],
      [
        {
          name: 'event',
          kind: 'belongsTo',
          target: 'Event',
          foreignKey: { fields: ['eventId'], references: ['id'] },
        },
      ],
    ),
  ];
  const stores: IRStore[] = ['Event', 'PrepTask', 'PackList', 'Delivery'].map((e) => ({
    entity: e,
    target: 'durable',
    config: {},
  }));
  ir.stores = stores;
  ir.commands = [
    {
      name: 'beginExecution',
      entity: 'Event',
      parameters: [],
      guards: [readiness],
      actions: [
        {
          kind: 'mutate',
          target: 'stage',
          expression: { kind: 'literal', value: { kind: 'string', value: 'executing' } },
        },
      ],
      emits: [],
    },
  ];
  return ir;
}

describe('convex lambda param typing — Event.isReadyForExecution / beginExecution', () => {
  it('emits Doc<> callback params on computed helpers and mutation guards', () => {
    const ir = eventDomainIR();
    const proj = new ConvexProjection();

    const computed = proj.generate(ir, { surface: 'convex.computed' }).artifacts[0]!.code;
    const mutations = proj.generate(ir, { surface: 'convex.mutations' }).artifacts[0]!.code;

    expect(computed).toContain('computeEvent');
    expect(computed).toContain('isReadyForExecution');
    expect(mutations).toContain('Event_beginExecution');

    for (const code of [computed, mutations]) {
      expect(code).toContain('import type { Doc } from "./_generated/dataModel"');
      expect(code).toContain('(t: Doc<"prepTasks">)');
      expect(code).toContain('(p: Doc<"packLists">)');
      expect(code).toContain('(d: Doc<"deliveries">)');
      expect(code).not.toMatch(/\.filter\(\([tpd]\)\s*=>/);
    }
  });

  it('uses the hydrated row shape when count_of and sum lambdas traverse belongsTo', () => {
    const ir = emptyIR();
    ir.entities = [
      entity(
        'Board',
        [prop('status', 'string', ['required'])],
        [{ name: 'tasks', kind: 'hasMany', target: 'Task' }],
      ),
      entity(
        'Task',
        [
          prop('boardId', 'string', ['required']),
          prop('predecessorTaskId', 'string'),
          prop('status', 'string', ['required']),
          prop('effort', 'number', ['required']),
        ],
        [
          {
            name: 'board',
            kind: 'belongsTo',
            target: 'Board',
            foreignKey: { fields: ['boardId'], references: ['id'] },
          },
          {
            name: 'predecessorTask',
            kind: 'belongsTo',
            target: 'Task',
            foreignKey: { fields: ['predecessorTaskId'], references: ['id'] },
          },
        ],
      ),
    ];
    ir.stores = ['Board', 'Task'].map((storedEntity): IRStore => ({
      entity: storedEntity,
      target: 'durable',
      config: {},
    }));
    const tasks: IRExpression = {
      kind: 'member',
      object: { kind: 'identifier', name: 'self' },
      property: 'tasks',
    };
    const predecessorStatus: IRExpression = {
      kind: 'member',
      object: {
        kind: 'member',
        object: { kind: 'identifier', name: 'line' },
        property: 'predecessorTask',
      },
      property: 'status',
    };
    const predecessorEffort: IRExpression = {
      kind: 'member',
      object: {
        kind: 'member',
        object: { kind: 'identifier', name: 'line' },
        property: 'predecessorTask',
      },
      property: 'effort',
    };
    ir.commands = [
      {
        name: 'start',
        entity: 'Board',
        parameters: [],
        guards: [
          {
            kind: 'binary',
            operator: '==',
            left: {
              kind: 'call',
              callee: { kind: 'identifier', name: 'count_of' },
              args: [
                tasks,
                {
                  kind: 'lambda',
                  params: ['line'],
                  body: {
                    kind: 'binary',
                    operator: '!=',
                    left: predecessorStatus,
                    right: { kind: 'literal', value: { kind: 'string', value: 'done' } },
                  },
                },
              ],
            },
            right: { kind: 'literal', value: { kind: 'number', value: 0 } },
          },
          {
            kind: 'binary',
            operator: '>=',
            left: {
              kind: 'call',
              callee: { kind: 'identifier', name: 'sum' },
              args: [tasks, { kind: 'lambda', params: ['line'], body: predecessorEffort }],
            },
            right: { kind: 'literal', value: { kind: 'number', value: 0 } },
          },
        ],
        actions: [
          {
            kind: 'mutate',
            target: 'status',
            expression: { kind: 'literal', value: { kind: 'string', value: 'started' } },
          },
        ],
        emits: [],
      },
    ];

    const generated = new ConvexProjection().generate(ir, { surface: 'convex.mutations' });
    const code = generated.artifacts[0]!.code;

    expect(generated.diagnostics.filter((d) => d.code === 'CONVEX_UNRESOLVED_GUARD')).toEqual([]);
    expect(code).toContain('.predecessorTask = __fk != null ? await ctx.db.get');
    // Each guard renders in the public mutation and the reaction runner, so the
    // lambda appears once per surface; the invariant is that EVERY occurrence
    // uses the hydrated shape (no Doc<"tasks"> param remains).
    expect(code.match(/\(line: Record<string, any>\)/g)!.length).toBeGreaterThanOrEqual(2);
    expect(code).not.toContain('(line: Doc<"tasks">)');
    expect(code).toContain('line.predecessorTask.status');
    expect(code).toContain('line.predecessorTask.effort');
  });
});
