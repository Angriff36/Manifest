import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { compileToIR } from '../../ir-compiler.js';
import { ConvexProjection } from './generator.js';

// An allocating command guarding on a nested aggregate reached through a
// belongsTo (`self.inventoryItem.reservations`). Before the fix the creation
// paths never hydrated the nested hasMany, so `sum(...)` saw [] and the stock
// guard always passed (fail-open over-reservation).
const program = (commandName: string) => `
entity InventoryItem {
  property quantityOnHand: number = 0
  hasMany reservations: InventoryReservation
}
entity InventoryReservation {
  property required inventoryItemId: string
  property required quantity: number
  property status: string = "active"
  belongsTo inventoryItem: InventoryItem fields [inventoryItemId] references [id]
  command ${commandName}(inventoryItemId: string, quantity: number) {
    guard self.inventoryItem != null
    guard quantity <= self.inventoryItem.quantityOnHand - sum(self.inventoryItem.reservations, (r) => r.status == "active" ? r.quantity : 0)
    mutate inventoryItemId = inventoryItemId
    mutate quantity = quantity
  }
}
store InventoryItem in durable
store InventoryReservation in durable
`;

describe('allocating command nested aggregate guards', () => {
  it.each([
    ['create', 'InventoryReservation_create'],
    ['reserve', 'InventoryReservation_createViaReserve'],
  ])('%s blocks over-reservation using existing reservations', async (commandName, exportName) => {
    const { ir, diagnostics } = await compileToIR(program(commandName));
    expect(diagnostics.filter((entry) => entry.severity === 'error')).toEqual([]);
    const generated = new ConvexProjection().generate(ir!, {
      surface: 'convex.mutations',
      options: { policyMode: 'skip' },
    });
    expect(generated.diagnostics.filter((entry) => entry.severity === 'error')).toEqual([]);
    const javascript = ts.transpileModule(generated.artifacts[0]!.code, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exported: Record<string, { handler: (ctx: unknown, args: unknown) => Promise<unknown> }> =
      {};
    const validator = new Proxy(() => validator, { get: () => validator });
    new Function('exports', 'require', javascript)(exported, (name: string) => {
      if (name === 'convex/values') return { v: validator, ConvexError: Error };
      if (name.endsWith('/server')) return { mutation: (value: unknown) => value };
      throw new Error(`Unexpected generated import: ${name}`);
    });
    const rows = new Map<string, Record<string, unknown>>([
      ['flour', { _id: 'flour', quantityOnHand: 10 }],
      ['held', { _id: 'held', inventoryItemId: 'flour', quantity: 7, status: 'active' }],
      ['gone', { _id: 'gone', inventoryItemId: 'flour', quantity: 5, status: 'released' }],
    ]);
    const inserts: unknown[] = [];
    const ctx = {
      db: {
        get: async (id: string) => structuredClone(rows.get(id) ?? null),
        query: (table: string) => ({
          withIndex: (_index: string, predicate: (q: unknown) => unknown) => {
            expect(table).toBe('inventoryReservations');
            let field = '';
            let value: unknown;
            predicate({
              eq: (key: string, expected: unknown) => {
                field = key;
                value = expected;
              },
            });
            return {
              collect: async () =>
                structuredClone([...rows.values()].filter((row) => row[field] === value)),
            };
          },
        }),
        insert: async (_table: string, doc: unknown) => {
          inserts.push(doc);
          return 'new';
        },
      },
    };
    const handler = exported[exportName]!.handler;
    // 10 on hand − 7 actively reserved = 3 available.
    await expect(handler(ctx, { inventoryItemId: 'flour', quantity: 4 })).rejects.toThrow();
    expect(inserts).toEqual([]);
    await expect(handler(ctx, { inventoryItemId: 'flour', quantity: 3 })).resolves.toBeTruthy();
    expect(inserts).toEqual([
      expect.objectContaining({ inventoryItemId: 'flour', quantity: 3, status: 'active' }),
    ]);
    expect(inserts[0]).not.toHaveProperty('inventoryItem');
  });
});
