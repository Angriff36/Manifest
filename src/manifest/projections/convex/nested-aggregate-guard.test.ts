import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { compileToIR } from '../../ir-compiler.js';
import { ConvexProjection } from './generator.js';

const PROGRAM = `
entity PackItem {
  property packListId: string
  property eventDishId: string?
  property labels: array<map<string>> = []
  belongsTo packList: PackList fields [packListId] references [id]
  belongsTo eventDish: EventDish fields [eventDishId] references [id]
  command adopt(eventDishId: string) {
    guard self.packList != null
    guard count_of(filter(self.labels, (item) => item.id == "label")) == 1
    guard count_of(filter(self.packList.event.eventDishes, (item) => item.id == eventDishId)) == 1
    mutate eventDishId = eventDishId
  }
}
entity PackList {
  property eventId: string
  belongsTo event: Event fields [eventId] references [id]
}
entity Event {
  property name: string
  hasMany eventDishes: EventDish
}
entity EventDish {
  property eventId: string
  belongsTo event: Event fields [eventId] references [id]
}
store PackItem in durable
store PackList in durable
store Event in durable
store EventDish in durable
`;

describe('generated nested aggregate command guards', () => {
  it.each([false, true])(
    'adopts only a matching related identity (tenant isolation: %s)',
    async (tenantIsolation) => {
      const { ir, diagnostics } = await compileToIR(
        tenantIsolation
          ? 'tenant tenantId: string from context.tenantId\n' +
              PROGRAM.replace(/entity (\w+) \{/g, 'entity $1 {\n  property tenantId: string')
          : PROGRAM,
      );
      expect(diagnostics.filter((entry) => entry.severity === 'error')).toEqual([]);
      expect(ir).toBeTruthy();
      const generated = new ConvexProjection().generate(ir!, {
        surface: 'convex.mutations',
        options: {
          policyMode: 'skip',
          ...(tenantIsolation ? { authContextImport: './auth', includeTenantFilter: true } : {}),
        },
      });
      expect(generated.diagnostics.filter((entry) => entry.severity === 'error')).toEqual([]);
      const code = generated.artifacts[0]!.code;
      const javascript = ts.transpileModule(code, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      const exported: Record<
        string,
        { handler: (ctx: unknown, args: unknown) => Promise<unknown> }
      > = {};
      const validator = new Proxy(() => validator, { get: () => validator });
      new Function('exports', 'require', javascript)(exported, (name: string) => {
        if (name === 'convex/values') return { v: validator, ConvexError: Error };
        if (name.endsWith('/server')) return { mutation: (value: unknown) => value };
        if (name === './auth') return { getAuthContext: async () => ({ tenantId: 'caterer' }) };
        throw new Error(`Unexpected generated import: ${name}`);
      });
      const rows = new Map<string, Record<string, unknown>>([
        ['packing', { _id: 'packing', packListId: 'list', labels: [{ id: 'label' }] }],
        ['list', { _id: 'list', eventId: 'event' }],
        ['event', { _id: 'event', name: 'Wedding' }],
        ['menu-line', { _id: 'menu-line', eventId: 'event' }],
        ['other-menu-line', { _id: 'other-menu-line', eventId: 'other-event' }],
      ]);
      if (tenantIsolation) for (const row of rows.values()) row.tenantId = 'caterer';
      const writes: unknown[] = [];
      const ctx = {
        db: {
          get: async (id: string) => structuredClone(rows.get(id) ?? null),
          query: (table: string) => ({
            withIndex: (_index: string, predicate: (q: unknown) => unknown) => {
              expect(table).toBe('eventDishes');
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
                  structuredClone(
                    [...rows.values()].filter((row) => row[field] === value && row._id !== 'list'),
                  ),
              };
            },
          }),
          patch: async (id: string, patch: unknown) => {
            writes.push({ id, patch });
          },
        },
      };
      const handler = exported.PackItem_adopt!.handler;
      await expect(
        handler(ctx, { docId: 'packing', eventDishId: 'menu-line' }),
      ).resolves.toMatchObject({ eventDishId: 'menu-line' });
      expect(writes).toEqual([{ id: 'packing', patch: { eventDishId: 'menu-line' } }]);
      writes.length = 0;
      await expect(
        handler(ctx, { docId: 'packing', eventDishId: 'other-menu-line' }),
      ).rejects.toThrow();
      expect(writes).toEqual([]);
      if (tenantIsolation) {
        // Cross-tenant corruption at every relationship hop must never authorize a write.
        for (const id of ['list', 'event', 'menu-line']) {
          rows.get(id)!.tenantId = 'other-caterer';
          await expect(
            handler(ctx, { docId: 'packing', eventDishId: 'menu-line' }),
          ).rejects.toThrow();
          expect(writes).toEqual([]);
          rows.get(id)!.tenantId = 'caterer';
        }
      }
    },
  );
});
