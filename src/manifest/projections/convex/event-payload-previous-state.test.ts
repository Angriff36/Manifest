/**
 * Regression: previous-state event fields must come from IR `compute` bindings
 * evaluated against the pre-update document — not `__after.previous*` and not
 * field-name prefix guesses (e.g. previousQuantity → doc.quantity).
 */

import { describe, it, expect } from 'vitest';
import type { IR, IRCommand, IREntity, IRProperty, IRStore } from '../../ir.js';
import { ConvexProjection } from './generator.js';
import { renderCommandComputeBindings, renderEmitPayloadFields } from './event-payload.js';

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

function entity(name: string, props: IRProperty[]): IREntity {
  return {
    name,
    properties: props,
    computedProperties: [],
    relationships: [],
    commands: [],
    constraints: [],
    policies: [],
    mixins: [],
    defaultPolicies: [],
  };
}

function durable(entityName: string): IRStore {
  return { entity: entityName, target: 'durable', config: {} };
}

function self(property: string) {
  return {
    kind: 'member' as const,
    object: { kind: 'identifier' as const, name: 'self' },
    property,
  };
}

describe('event payload previous-state (compute bindings)', () => {
  it('status A→B: previousStatus from compute(doc.status), status from post-update', () => {
    const ir = emptyIR();
    ir.entities = [entity('Delivery', [prop('status', 'string', ['required'])])];
    ir.stores = [durable('Delivery')];
    ir.events = [
      {
        name: 'DeliveryConfirmed',
        channel: 'delivery.confirmed',
        payload: [
          { name: 'previousStatus', type: { name: 'string', nullable: false }, required: true },
          { name: 'status', type: { name: 'string', nullable: false }, required: true },
        ],
      },
    ];
    const cmd: IRCommand = {
      name: 'confirmDelivery',
      entity: 'Delivery',
      parameters: [],
      guards: [],
      constraints: [],
      actions: [
        {
          kind: 'compute',
          target: 'previousStatus',
          expression: self('status'),
        },
        {
          kind: 'mutate',
          target: 'status',
          expression: { kind: 'literal', value: { kind: 'string', value: 'delivered' } },
        },
      ],
      emits: ['DeliveryConfirmed'],
      emitPayloads: [
        {
          eventName: 'DeliveryConfirmed',
          fields: [
            {
              name: 'previousStatus',
              expression: { kind: 'identifier', name: 'previousStatus' },
            },
            {
              name: 'status',
              expression: self('status'),
            },
          ],
        },
      ],
    };
    ir.commands = [cmd];

    const before = renderCommandComputeBindings(cmd, { selfVar: 'doc', locals: [] });
    expect(before.bindings).toEqual([{ name: 'previousStatus', code: 'doc.status' }]);

    const fields = renderEmitPayloadFields(
      cmd,
      'DeliveryConfirmed',
      { selfVar: '__after', idExpr: 'docId', beforeVar: 'doc', locals: before.localNames },
      'docId',
      before.localNames,
    ).fields;
    expect(fields.find((f) => f.name === 'previousStatus')?.code).toBe('previousStatus');
    expect(fields.find((f) => f.name === 'status')?.code).toBe('__after.status');
    expect(fields.every((f) => !f.code.includes('__after.previous'))).toBe(true);

    const code = new ConvexProjection().generate(ir, {
      surface: 'convex.mutations',
      options: { policyMode: 'skip' },
    }).artifacts[0]!.code;
    expect(code).toContain('const previousStatus = doc.status;');
    expect(code).toContain('previousStatus: previousStatus');
    expect(code).toContain('status: __after.status');
    expect(code).not.toContain('__after.previousStatus');
    // Must use the compute local — not the old prefix rewrite to doc.status alone.
    expect(code).toMatch(/previousStatus:\s*previousStatus/);
  });

  it('does not prefix-guess previousQuantity → doc.quantity when compute uses quantityOnHand', () => {
    const ir = emptyIR();
    ir.entities = [entity('InventoryItem', [prop('quantityOnHand', 'number', ['required'])])];
    ir.stores = [durable('InventoryItem')];
    const cmd: IRCommand = {
      name: 'adjustQuantity',
      entity: 'InventoryItem',
      parameters: [{ name: 'delta', type: { name: 'number', nullable: false }, required: true }],
      guards: [],
      constraints: [],
      actions: [
        {
          kind: 'compute',
          target: 'previousQuantity',
          expression: self('quantityOnHand'),
        },
        {
          kind: 'compute',
          target: 'nextQuantity',
          expression: {
            kind: 'binary',
            operator: '+',
            left: self('quantityOnHand'),
            right: { kind: 'identifier', name: 'delta' },
          },
        },
        {
          kind: 'mutate',
          target: 'quantityOnHand',
          expression: { kind: 'identifier', name: 'nextQuantity' },
        },
      ],
      emits: ['InventoryQuantityAdjusted'],
      emitPayloads: [
        {
          eventName: 'InventoryQuantityAdjusted',
          fields: [
            {
              name: 'previousQuantity',
              expression: { kind: 'identifier', name: 'previousQuantity' },
            },
            {
              name: 'quantityOnHand',
              expression: { kind: 'identifier', name: 'nextQuantity' },
            },
          ],
        },
      ],
    };
    ir.commands = [cmd];

    const code = new ConvexProjection().generate(ir, {
      surface: 'convex.mutations',
      options: { policyMode: 'skip' },
    }).artifacts[0]!.code;
    expect(code).toContain('const previousQuantity = doc.quantityOnHand;');
    expect(code).toContain('const nextQuantity = (doc.quantityOnHand + delta)');
    expect(code).toContain('quantityOnHand: nextQuantity');
    expect(code).toContain('previousQuantity: previousQuantity');
    expect(code).not.toContain('previousQuantity: doc.quantity');
    expect(code).not.toContain('doc.nextQuantity');
    expect(code).not.toContain('__after.nextQuantity');
    expect(code).not.toContain('__after.previousQuantity');
  });

  it('emits compute locals before transition checks that reference them', () => {
    const ir = emptyIR();
    const invoice = entity('Invoice', [
      prop('status', 'string', ['required']),
      prop('amountDue', 'number', ['required']),
    ]);
    invoice.transitions = [{ property: 'status', from: 'sent', to: ['paid', 'partial'] }];
    ir.entities = [invoice];
    ir.stores = [durable('Invoice')];
    ir.commands = [
      {
        name: 'applyPayment',
        entity: 'Invoice',
        parameters: [
          { name: 'paymentAmount', type: { name: 'number', nullable: false }, required: true },
        ],
        guards: [],
        constraints: [],
        actions: [
          {
            kind: 'compute',
            target: 'nextDue',
            expression: {
              kind: 'binary',
              operator: '-',
              left: self('amountDue'),
              right: { kind: 'identifier', name: 'paymentAmount' },
            },
          },
          {
            kind: 'mutate',
            target: 'status',
            expression: {
              kind: 'conditional',
              condition: {
                kind: 'binary',
                operator: '==',
                left: { kind: 'identifier', name: 'nextDue' },
                right: { kind: 'literal', value: { kind: 'number', value: 0 } },
              },
              consequent: { kind: 'literal', value: { kind: 'string', value: 'paid' } },
              alternate: { kind: 'literal', value: { kind: 'string', value: 'partial' } },
            },
          },
        ],
        emits: [],
      },
    ];

    const code = new ConvexProjection().generate(ir, {
      surface: 'convex.mutations',
      options: { policyMode: 'skip' },
    }).artifacts[0]!.code;
    const computeAt = code.indexOf('const nextDue =');
    const transitionAt = code.indexOf('const __to = String');
    expect(computeAt).toBeGreaterThan(-1);
    expect(transitionAt).toBeGreaterThan(-1);
    expect(computeAt).toBeLessThan(transitionAt);
  });
});
