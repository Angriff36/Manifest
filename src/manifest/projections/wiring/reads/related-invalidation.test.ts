import { describe, expect, it } from 'vitest';
import { compileToIR } from '../../../ir-compiler.js';
import { buildWiringContract } from '../contract-builder.js';

async function compile(source: string) {
  const { ir, diagnostics } = await compileToIR(source);
  const errors = diagnostics.filter((item) => item.severity === 'error');
  expect(errors, errors.map((item) => item.message).join('\n')).toHaveLength(0);
  return ir!;
}

const SOURCE = `
entity Order {
  property required id: string
  property total: number = 0
  hasMany invoices: Invoice
  command addItem(amount: number) {
    mutate total = self.total + amount
    emit OrderUpdated
  }
  store Order in durable
}
entity Invoice {
  property required id: string
  property orderId: string = ""
  belongsTo order: Order
  command record(orderId: string) {
    mutate orderId = orderId
  }
  store Invoice in durable
}
entity Note {
  property required id: string
  property body: string = ""
  command create(body: string) {
    mutate body = body
  }
  store Note in durable
}
event OrderUpdated: "order.updated" {
  orderId: string
}
on OrderUpdated run Invoice.record
  resolve payload._subject.id
  params { orderId: payload._subject.id }
`;

describe('related read invalidation', () => {
  it('marks the pointed-at record and the reaction target stale', async () => {
    const contract = buildWiringContract(await compile(SOURCE));
    const addItem = contract.capabilities.find(
      (cap) => cap.entity === 'Order' && cap.command === 'addItem',
    )!;
    expect(addItem.invalidation.map((target) => target.readId)).toEqual([
      'Order.list',
      'Order.get',
      'Invoice.list',
      'Invoice.get',
    ]);
    expect(addItem.invalidation.some((target) => target.entity === 'Note')).toBe(false);
  });

  it('marks the parent record stale when the child changes', async () => {
    const contract = buildWiringContract(await compile(SOURCE));
    const record = contract.capabilities.find(
      (cap) => cap.entity === 'Invoice' && cap.command === 'record',
    )!;
    expect(record.invalidation.map((target) => target.readId)).toEqual([
      'Invoice.list',
      'Invoice.get',
      'Order.list',
      'Order.get',
    ]);
  });

  it('leaves an unrelated record on its own list and detail', async () => {
    const contract = buildWiringContract(await compile(SOURCE));
    const create = contract.capabilities.find(
      (cap) => cap.entity === 'Note' && cap.command === 'create',
    )!;
    expect(create.invalidation.map((target) => target.readId)).toEqual(['Note.list', 'Note.get']);
  });
});
