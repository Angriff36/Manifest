import { describe, expect, it } from 'vitest';
import type { IR, IRCommand, IREntity, IRExpression, IRReactionRule } from '../../ir';
import { ConvexProjection } from './generator.js';

const member = (root: string, property: string): IRExpression => ({
  kind: 'member',
  object: { kind: 'identifier', name: root },
  property,
});

function entity(name: string, commands: string[]): IREntity {
  return {
    name,
    properties: [
      { name: 'tenantId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      { name: 'eventId', type: { name: 'string', nullable: false }, modifiers: ['required', 'indexed'] },
      { name: 'status', type: { name: 'string', nullable: false }, modifiers: ['required'] },
    ],
    computedProperties: [],
    relationships: [],
    commands,
    constraints: [],
    policies: [],
  };
}

function command(entityName: string, name: string, emits: string[] = []): IRCommand {
  return {
    entity: entityName,
    name,
    parameters: [],
    guards: [],
    actions: [],
    emits,
  };
}

function reactionIR(): IR {
  const commands = [
    command('Event', 'approve', ['EventApproved']),
    command('Event', 'cancel', ['EventCancelled']),
    command('Payment', 'settle', ['PaymentSettled']),
    command('QualityCheck', 'fail', ['QualityCheckFailed']),
    command('IngredientDemand', 'confirm', ['IngredientDemandConfirmed']),
    command('VendorOrderLine', 'addLine', ['VendorOrderLineAdded']),
    command('PrepTask', 'markBlocked'),
    command('Invoice', 'applyPayment'),
    command('PurchaseNeed', 'create'),
    command('PurchaseNeed', 'markOrdered'),
  ];
  const fan = (event: string, targetEntity: string, targetCommand: string): IRReactionRule => ({
    event,
    targetEntity,
    targetCommand,
    fanOut: { matchField: 'eventId', matchSource: member('payload', 'eventId') },
    params: [],
  });
  const reactions: IRReactionRule[] = [
    fan('EventApproved', 'PrepTask', 'markBlocked'),
    fan('EventCancelled', 'PrepTask', 'markBlocked'),
    {
      event: 'PaymentSettled',
      targetEntity: 'Invoice',
      targetCommand: 'applyPayment',
      resolve: member('payload', 'invoiceId'),
      params: [],
    },
    fan('QualityCheckFailed', 'PrepTask', 'markBlocked'),
    {
      event: 'IngredientDemandConfirmed',
      targetEntity: 'PurchaseNeed',
      targetCommand: 'create',
      resolve: member('payload', 'purchaseNeedId'),
      params: [],
    },
    fan('VendorOrderLineAdded', 'PurchaseNeed', 'markOrdered'),
  ];
  const entities = [
    entity('Event', ['approve', 'cancel']),
    entity('Payment', ['settle']),
    entity('QualityCheck', ['fail']),
    entity('IngredientDemand', ['confirm']),
    entity('VendorOrderLine', ['addLine']),
    entity('PrepTask', ['markBlocked']),
    entity('Invoice', ['applyPayment']),
    entity('PurchaseNeed', ['create', 'markOrdered']),
  ];
  return {
    version: '1.0',
    provenance: {
      contentHash: 'h', compilerVersion: 'test', schemaVersion: '1.0', compiledAt: '2026-01-01T00:00:00.000Z',
    },
    modules: [], values: [], entities, enums: [],
    stores: entities.map((item) => ({ entity: item.name, target: 'durable', config: {} })),
    events: [], commands, policies: [], reactions,
  };
}

describe('Convex governed reactions', () => {
  it('uses flat payloads and generated command runners for known reaction paths', () => {
    const code = new ConvexProjection().generate(reactionIR(), {
      surface: 'convex.mutations',
    }).artifacts[0]!.code;

    expect(code).toContain('import { mutation, type MutationCtx } from "./_generated/server";');
    expect(code).toContain('ctx: MutationCtx');
    expect(code).toContain('payload.eventId');
    expect(code).not.toContain('payload.payload');
    expect(code).toContain('await __runPrepTaskMarkBlocked(ctx, { docId: (__row as any)._id');
    expect(code).toContain('await __runInvoiceApplyPayment(ctx, { docId: reactionTarget');
    expect(code).toContain('await __runPurchaseNeedCreate(ctx, {');
    expect(code).toContain('await __runPurchaseNeedMarkOrdered(ctx, { docId: (__row as any)._id');
    expect(code).not.toMatch(/ctx\.db\.(?:insert|patch)\([^\n]+reaction/);
    expect(code).not.toContain('ctx.runMutation(api.mutations');
  });
});
