import { describe, expect, it } from 'vitest';
import type { IR, IREntity, IRProperty, IRStore } from '../../ir';
import { ConvexProjection } from './generator.js';
import { generateMutations } from './functions.js';

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

function durable(name: string): IRStore {
  return { entity: name, target: 'durable', config: {} };
}

function prop(name: string, typeName: string, modifiers: IRProperty['modifiers'] = []): IRProperty {
  return { name, type: { name: typeName, nullable: false }, modifiers };
}

function entity(
  name: string,
  props: IRProperty[],
  transitions?: IREntity['transitions'],
): IREntity {
  return {
    name,
    properties: props,
    computedProperties: [],
    relationships: [],
    commands: [],
    constraints: [],
    policies: [],
    transitions,
  };
}

function orderIR(): IR {
  const ir = emptyIR();
  ir.entities = [
    entity(
      'Order',
      [prop('status', 'string', ['required'])],
      [
        { property: 'status', from: 'draft', to: ['submitted', 'cancelled'] },
        { property: 'status', from: 'submitted', to: ['shipped'] },
      ],
    ),
  ];
  ir.stores = [durable('Order')];
  ir.commands = [
    {
      name: 'advance',
      entity: 'Order',
      parameters: [],
      guards: [],
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

describe('convex command idempotency', () => {
  it('emits commandIdempotencyKeys table when enabled (default)', () => {
    const result = new ConvexProjection().generate(orderIR(), { surface: 'convex.schema' });
    expect(result.artifacts[0]?.code).toContain('commandIdempotencyKeys');
  });

  it('does not emit commandIdempotencyKeys when disabled', () => {
    const result = new ConvexProjection().generate(orderIR(), {
      surface: 'convex.schema',
      options: { enableCommandIdempotency: false },
    });
    expect(result.artifacts[0]?.code).not.toContain('commandIdempotencyKeys');
  });

  it('accepts optional idempotencyKey on mutations and wraps handlers', () => {
    const code = generateMutations(orderIR(), {}).code;
    expect(code).toContain('idempotencyKey: v.optional(v.string())');
    expect(code).toContain('__getCommandIdempotency');
    expect(code).toContain('__setCommandIdempotency');
    expect(code).toContain('Order_advance');
  });

  it('allows same-state lifecycle writes', () => {
    const code =
      new ConvexProjection().generate(orderIR(), { surface: 'convex.mutations' }).artifacts[0]
        ?.code ?? '';
    expect(code).toContain('__from !== __to && Object.hasOwn(__allowed, __from)');
    expect(code).not.toContain('!(__creation && __from === __to)');
  });
});
