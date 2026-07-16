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
});
