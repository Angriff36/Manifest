/**
 * PB023 — count_of(self.<hasMany>, lambda) must lower to executable Convex
 * mutation guards (preload related rows + filter/length), not a denying throw.
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

function entity(name: string, props: IRProperty[], rels: IREntity['relationships'] = []): IREntity {
  return {
    name,
    properties: props,
    computedProperties: [],
    relationships: rels,
    commands: [],
    constraints: [],
    policies: [],
  };
}

/** Mirror Event.beginExecution readiness: count_of(self.rel, (x) => status checks) == 0 */
function countOfOpenStatus(
  rel: string,
  param: string,
  openStatuses: string[],
): IRExpression {
  let body: IRExpression | undefined;
  for (const status of openStatuses) {
    const cmp: IRExpression = {
      kind: 'binary',
      operator: '!=',
      left: { kind: 'member', object: { kind: 'identifier', name: param }, property: 'status' },
      right: { kind: 'literal', value: { kind: 'string', value: status } },
    };
    body = body
      ? { kind: 'binary', operator: 'and', left: body, right: cmp }
      : cmp;
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

describe('PB023 — count_of hasMany lambda guards in convex.mutations', () => {
  it('preloads Event-shaped hasMany edges and evaluates three count_of predicates', () => {
    const ir = emptyIR();
    ir.entities = [
      entity(
        'Event',
        [prop('stage', 'string', ['required'])],
        [
          { name: 'prepTasks', kind: 'hasMany', target: 'PrepTask' },
          { name: 'packLists', kind: 'hasMany', target: 'PackList' },
          { name: 'deliveries', kind: 'hasMany', target: 'Delivery' },
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
        guards: [
          {
            kind: 'binary',
            operator: 'and',
            left: {
              kind: 'binary',
              operator: 'and',
              left: countOfOpenStatus('prepTasks', 't', ['completed', 'cancelled']),
              right: countOfOpenStatus('packLists', 'p', ['dispatched', 'cancelled']),
            },
            right: countOfOpenStatus('deliveries', 'd', [
              'delivered',
              'cancelled',
              'failed',
            ]),
          },
        ],
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

    const res = new ConvexProjection().generate(ir, { surface: 'convex.mutations' });
    const code = res.artifacts[0].code;

    expect(res.diagnostics.filter((d) => d.code === 'CONVEX_UNRESOLVED_GUARD')).toEqual([]);
    expect(code).not.toContain('unresolved — denied');
    expect(code).toContain('Event_beginExecution');

    // All three related collections loaded via inverse eventId index
    expect(code).toContain(
      '(doc as any).prepTasks = await ctx.db.query("prepTasks").withIndex("by_eventId"',
    );
    expect(code).toContain(
      '(doc as any).packLists = await ctx.db.query("packLists").withIndex("by_eventId"',
    );
    expect(code).toContain(
      '(doc as any).deliveries = await ctx.db.query("deliveries").withIndex("by_eventId"',
    );

    // Predicates evaluate against related row status fields
    expect(code).toContain('doc.prepTasks');
    expect(code).toContain('t.status !== "completed"');
    expect(code).toContain('p.status !== "dispatched"');
    expect(code).toContain('d.status !== "delivered"');
    expect(code).toContain('.filter(');
  });
});
