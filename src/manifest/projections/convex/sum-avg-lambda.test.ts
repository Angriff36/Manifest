/**
 * Convex sum / avg / min_of / max_of (self.hasMany, λ) mutation-guard lowering.
 * Complements PB023 count_of proofs.
 */

import { describe, expect, it } from 'vitest';
import type { IR, IREntity, IRExpression, IRProperty, IRStore } from '../../ir';
import { ConvexProjection } from './generator.js';
import { renderExpression } from './expression.js';

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

function aggregateGuard(
  callee: 'sum' | 'avg' | 'min_of' | 'max_of',
  op: '>=' | '==',
  threshold: number,
): IRExpression {
  const mapper: IRExpression = {
    kind: 'lambda',
    params: ['line'],
    body: {
      kind: 'member',
      object: { kind: 'identifier', name: 'line' },
      property: 'amount',
    },
  };
  return {
    kind: 'binary',
    operator: op,
    left: {
      kind: 'call',
      callee: { kind: 'identifier', name: callee },
      args: [
        {
          kind: 'member',
          object: { kind: 'identifier', name: 'self' },
          property: 'lines',
        },
        mapper,
      ],
    },
    right: { kind: 'literal', value: { kind: 'number', value: threshold } },
  };
}

function orderIR(guard: IRExpression): IR {
  const ir = emptyIR();
  ir.entities = [
    entity('Order', [prop('status', 'string', ['required'])], [
      { name: 'lines', kind: 'hasMany', target: 'OrderLine' },
    ]),
    entity(
      'OrderLine',
      [
        prop('amount', 'number', ['required']),
        prop('orderId', 'string', ['required']),
      ],
      [
        {
          name: 'order',
          kind: 'belongsTo',
          target: 'Order',
          foreignKey: { fields: ['orderId'], references: ['id'] },
        },
      ],
    ),
  ];
  const stores: IRStore[] = ['Order', 'OrderLine'].map((e) => ({
    entity: e,
    target: 'durable',
    config: {},
  }));
  ir.stores = stores;
  ir.commands = [
    {
      name: 'submit',
      entity: 'Order',
      parameters: [],
      guards: [guard],
      actions: [
        {
          kind: 'mutate',
          target: 'status',
          expression: { kind: 'literal', value: { kind: 'string', value: 'submitted' } },
        },
      ],
      emits: [],
    },
  ];
  return ir;
}

describe('Convex sum/avg/min_of/max_of hasMany lambda guards', () => {
  it('expression renderer resolves sum/avg/min_of/max_of with mapper', () => {
    const mapper: IRExpression = {
      kind: 'lambda',
      params: ['line'],
      body: {
        kind: 'member',
        object: { kind: 'identifier', name: 'line' },
        property: 'amount',
      },
    };
    const collection: IRExpression = {
      kind: 'member',
      object: { kind: 'identifier', name: 'self' },
      property: 'lines',
    };
    for (const name of ['sum', 'avg', 'min_of', 'max_of'] as const) {
      const call: IRExpression = {
        kind: 'call',
        callee: { kind: 'identifier', name },
        args: [collection, mapper],
      };
      const res = renderExpression(call, {
        selfVar: 'doc',
        resolveCollectionElementType: () => 'Doc<"orderLines">',
      });
      expect(res.unresolved, name).toEqual([]);
      expect(res.code).toContain('doc.lines');
      expect(res.code).toContain('line.amount');
    }
  });

  it('preloads hasMany and evaluates sum(self.lines, λ) guard', () => {
    const res = new ConvexProjection().generate(orderIR(aggregateGuard('sum', '>=', 100)), {
      surface: 'convex.mutations',
    });
    const code = res.artifacts[0]?.code ?? '';
    expect(res.diagnostics.filter((d) => d.code === 'CONVEX_UNRESOLVED_GUARD')).toEqual([]);
    expect(code).toContain('(doc as any).lines = await ctx.db.query("orderLines")');
    expect(code).toContain('.map(');
    expect(code).toContain('.reduce(');
    expect(code).toContain('line.amount');
    expect(code).not.toContain('unresolved — denied');
  });

  it('preloads hasMany and evaluates avg(self.lines, λ) guard', () => {
    const res = new ConvexProjection().generate(orderIR(aggregateGuard('avg', '>=', 10)), {
      surface: 'convex.mutations',
    });
    const code = res.artifacts[0]?.code ?? '';
    expect(res.diagnostics.filter((d) => d.code === 'CONVEX_UNRESOLVED_GUARD')).toEqual([]);
    expect(code).toContain('__vals');
    expect(code).toContain('/ __vals.length');
    expect(code).toContain('line.amount');
  });

  it('preloads hasMany and evaluates min_of/max_of guards', () => {
    for (const callee of ['min_of', 'max_of'] as const) {
      const res = new ConvexProjection().generate(orderIR(aggregateGuard(callee, '>=', 1)), {
        surface: 'convex.mutations',
      });
      const code = res.artifacts[0]?.code ?? '';
      expect(res.diagnostics.filter((d) => d.code === 'CONVEX_UNRESOLVED_GUARD'), callee).toEqual(
        [],
      );
      expect(code, callee).toContain(callee === 'min_of' ? 'Math.min' : 'Math.max');
    }
  });
});
