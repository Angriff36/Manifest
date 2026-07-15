/**
 * Convex React client surface (`convex.react`) — unit tests.
 */

import { describe, it, expect } from 'vitest';
import type { IR, IREntity, IRProperty, IRStore, IRCommand, IRPolicy } from '../../ir';
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

function durable(name: string): IRStore {
  return { entity: name, target: 'durable', config: {} };
}

function prop(
  name: string,
  typeName: string,
  modifiers: IRProperty['modifiers'] = [],
): IRProperty {
  return { name, type: { name: typeName, nullable: false }, modifiers };
}

function entity(name: string, props: IRProperty[]): IREntity {
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

const react = (ir: IR) => new ConvexProjection().generate(ir, { surface: 'convex.react' });

describe('convex.react', () => {
  it('is declared among Convex surfaces', () => {
    expect(new ConvexProjection().surfaces).toContain('convex.react');
  });

  it('emits useQuery/useMutation hooks for public entities and commands', () => {
    const ir = emptyIR();
    ir.entities = [entity('Order', [prop('sku', 'string', ['required'])])];
    ir.stores = [durable('Order')];
    const create: IRCommand = {
      entity: 'Order',
      name: 'create',
      parameters: [{ name: 'sku', type: { name: 'string', nullable: false }, required: true }],
      guards: [],
      actions: [],
      emits: [],
    };
    ir.commands = [create];

    const code = react(ir).artifacts[0]!.code;
    expect(code).toContain('from "convex/react"');
    expect(code).toContain('../../convex/_generated/api');
    expect(code).toContain('useListOrder');
    expect(code).toContain('useGetOrder');
    expect(code).toContain('api.queries.listOrder');
    expect(code).toContain('useOrderCreate');
    expect(code).toContain('api.mutations.Order_create');
    expect(code).toContain('MANIFEST_CONVEX_REACT_HOOK_COUNT = 3');
  });

  it('omits useQuery for read-gated entities but still emits mutation hooks', () => {
    const ir = emptyIR();
    ir.entities = [entity('Secret', [prop('token', 'string', ['required'])])];
    ir.stores = [durable('Secret')];
    ir.commands = [
      {
        entity: 'Secret',
        name: 'rotate',
        parameters: [],
        guards: [],
        actions: [],
        emits: [],
      },
    ];
    const policy: IRPolicy = {
      name: 'denyRead',
      action: 'read',
      entity: 'Secret',
      expression: {
        kind: 'literal',
        value: { kind: 'boolean', value: false },
      },
    };
    ir.policies = [policy];

    const res = react(ir);
    const code = res.artifacts[0]!.code;
    expect(code).not.toContain('useListSecret');
    expect(code).not.toContain('useGetSecret');
    expect(code).toContain('useSecretRotate');
    expect(res.diagnostics.some((d) => d.code === 'CONVEX_REACT_INTERNAL_QUERY')).toBe(true);
  });

  it('emits useQuery for read-gated entities when authContextImport is set', () => {
    const ir = emptyIR();
    ir.entities = [entity('Secret', [prop('token', 'string', ['required'])])];
    ir.stores = [durable('Secret')];
    ir.policies = [
      {
        name: 'denyRead',
        action: 'read',
        entity: 'Secret',
        expression: { kind: 'literal', value: { kind: 'boolean', value: false } },
      },
    ] as IRPolicy[];
    const code = new ConvexProjection().generate(ir, {
      surface: 'convex.react',
      options: { authContextImport: './lib/authContext' },
    }).artifacts[0]!.code;
    expect(code).toContain('useListSecret');
    expect(code).toContain('useGetSecret');
  });
});
