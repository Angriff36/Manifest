import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import * as convexServer from 'convex/server';
import * as convexValues from 'convex/values';
import type { GenericId } from 'convex/values';
import { convexTest } from 'convex-test';
import type { GenericDataModel, GenericMutationCtx } from 'convex/server';
import { compileToIR } from '../../ir-compiler.js';
import { ConvexProjection, type ConvexCommandEvent } from './index.js';

const SOURCE = `
entity WorkItem {
  property amount: decimal = 0
  property reacted: boolean = false
  command create(amount: decimal) {
    guard amount >= 0
    mutate amount = amount
    emit WorkChanged { workId: self.id, amount: self.amount }
  }
  command adjust(amount: decimal) {
    guard amount >= 0
    mutate amount = amount
    emit WorkChanged { workId: self.id, amount: self.amount }
    emit AuditWritten { message: "adjusted" }
  }
  command mark() {
    mutate reacted = true
    emit WorkMarked { workId: self.id }
  }
  command silent(amount: decimal) {
    mutate amount = amount
  }
}
entity ServiceTask {
  property amount: decimal = 0
  property openedAt: datetime?
  command open(amount: decimal) {
    guard self.openedAt == null
    guard amount >= 0
    mutate amount = amount
    mutate openedAt = now()
    emit ServiceOpened { taskId: self.id, amount: self.amount }
  }
}
store WorkItem in durable
store ServiceTask in durable
event WorkChanged: "work.changed" { workId: string amount: decimal }
event WorkMarked: "work.marked" { workId: string }
event AuditWritten: "audit.written" { message: string }
event ServiceOpened: "service.opened" { taskId: string amount: decimal }
on WorkChanged run WorkItem.mark
  resolve payload.workId
`;

type Ctx = GenericMutationCtx<GenericDataModel>;
type Event = ConvexCommandEvent;
type Handler = (ctx: Ctx, event: Event) => Promise<void>;

// Execute the emitted modules with the real Convex mutation wrappers and
// convex-test database/transaction implementation. Only module resolution is
// supplied here; generated checks, writes, reactions, and idempotency all run.
function loadModule(source: string, handler: Handler): Record<string, any> {
  const javascript = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  expect(javascript.diagnostics).toEqual([]);
  const exports = {};
  const require = (name: string) => {
    if (name === 'convex/server') return convexServer;
    if (name === 'convex/values') return convexValues;
    if (name === './_generated/server') return { mutation: convexServer.mutationGeneric };
    if (name === './lib/events') return { handleManifestEvent: handler };
    if (name === './lib/auth')
      return { getAuthContext: async (ctx: Ctx) => (await ctx.auth.getUserIdentity()) ?? {} };
    throw new Error(`Unexpected generated import: ${name}`);
  };
  new Function('require', 'exports', javascript.outputText)(require, exports);
  return exports;
}

async function fixture(handler: Handler, source = SOURCE, enabled = true) {
  const compiled = await compileToIR(source);
  expect(compiled.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
  expect(compiled.ir).not.toBeNull();
  const projection = new ConvexProjection();
  const options = {
    enableCommandIdempotency: true,
    authContextImport: './lib/auth',
    ...(enabled ? { eventHandlerImport: './lib/events' } : {}),
  };
  const generate = (surface: string) => {
    const result = projection.generate(compiled.ir!, { surface, options });
    expect(result.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    return result.artifacts[0]!.code;
  };
  const code = generate('convex.mutations');
  const schema = loadModule(generate('convex.schema'), handler).default;
  const mutations = loadModule(code, handler);
  const root = convexTest(schema, {
    './_generated/server.ts': async () => ({ mutation: convexServer.mutationGeneric }),
    './mutations.ts': async () => mutations,
  });
  const call = (name: string, args: Record<string, unknown> = {}) =>
    root.mutation(convexServer.makeFunctionReference<'mutation'>(`mutations:${name}`), args);
  const rows = (table: string) => root.run((ctx) => ctx.db.query(table).collect());
  return { root, call, rows, code };
}

describe('Convex transactional event handler', () => {
  it('runs child handlers before each own emission and reuses exact persisted payloads', async () => {
    const seen: Array<{ event: Event; reacted: unknown }> = [];
    const f = await fixture(async (ctx, event) => {
      seen.push({
        event,
        reacted: (await ctx.db.get(event.entityId as GenericId<string>))?.reacted,
      });
    });
    const created = await f.call('WorkItem_create', { amount: 10 });
    expect(seen.map(({ event }) => event.type)).toEqual(['WorkMarked', 'WorkChanged']);
    seen.length = 0;
    await f.call('WorkItem_adjust', { docId: created._id, amount: 20 });
    expect(seen.map(({ event }) => [event.type, event.command, event.emitIndex])).toEqual([
      ['WorkMarked', 'mark', 0],
      ['WorkChanged', 'adjust', 0],
      ['AuditWritten', 'adjust', 1],
    ]);
    expect(seen.every((item) => item.reacted === true)).toBe(true);
    expect(seen[1]!.event.payload).toEqual({ workId: created._id, amount: 20 });
    expect(seen[2]!.event.payload).toEqual({ message: 'adjusted' });
    const persisted = await f.rows('manifestEvents');
    for (const { event } of seen) {
      const row = persisted.find((item) => item._id === event.eventId)!;
      expect(row).toBeDefined();
      expect(event).toEqual({
        eventId: row._id,
        type: row.type,
        entity: row.entity,
        entityId: row.entityId,
        payload: row.payload,
        createdAt: row.createdAt,
        command: event.command,
        emitIndex: event.emitIndex,
      });
    }
  });

  it('covers governed creation and skips every handler on idempotency replay', async () => {
    const seen: Event[] = [];
    const f = await fixture(async (_ctx, event) => {
      seen.push(event);
    });
    const args = { amount: 12, idempotencyKey: 'open-once' };
    const created = await f.call('ServiceTask_createViaOpen', args);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      type: 'ServiceOpened',
      entity: 'ServiceTask',
      entityId: created.docId,
      command: 'open',
      emitIndex: 0,
      payload: { taskId: created.docId, amount: 12 },
    });
    expect(await f.call('ServiceTask_createViaOpen', args)).toEqual(created);
    expect(seen).toHaveLength(1);
    expect(await f.rows('serviceTasks')).toHaveLength(1);

    const work = await f.call('WorkItem_create', { amount: 10, idempotencyKey: 'work-once' });
    const count = seen.length;
    await f.call('WorkItem_create', { amount: 10, idempotencyKey: 'work-once' });
    expect(seen).toHaveLength(count);
    const adjusted = await f.call('WorkItem_adjust', {
      docId: work._id,
      amount: 15,
      idempotencyKey: 'adjust-once',
    });
    const after = seen.length;
    expect(
      await f.call('WorkItem_adjust', {
        docId: work._id,
        amount: 15,
        idempotencyKey: 'adjust-once',
      }),
    ).toEqual(adjusted);
    expect(seen).toHaveLength(after);
  });

  it.each(['WorkChanged', 'WorkMarked', 'AuditWritten'])(
    'rolls back command, reaction, event, handler, and idempotency writes when %s throws',
    async (failingEvent) => {
      const f = await fixture(async (ctx, event) => {
        if (event.type === failingEvent) {
          await ctx.db.insert('serviceTasks', { amount: 99 });
          throw new Error('Required dependent work failed');
        }
      });
      const id = await f.root.run((ctx) =>
        ctx.db.insert('workItems', { amount: 10, reacted: false }),
      );
      await expect(
        f.call('WorkItem_adjust', {
          docId: id,
          amount: 20,
          idempotencyKey: 'failed-adjust',
        }),
      ).rejects.toThrow('Required dependent work failed');
      expect(await f.root.run((ctx) => ctx.db.get(id))).toMatchObject({
        amount: 10,
        reacted: false,
      });
      expect(await f.rows('manifestEvents')).toEqual([]);
      expect(await f.rows('serviceTasks')).toEqual([]);
      expect(await f.rows('commandIdempotency')).toEqual([]);
    },
  );

  it.each(['WorkItem_create', 'ServiceTask_createViaOpen'])(
    'rolls back the new record when a %s handler throws',
    async (command) => {
      const f = await fixture(async () => {
        throw new Error('creation handler failed');
      });
      await expect(
        f.call(command, { amount: 10, idempotencyKey: 'failed-create' }),
      ).rejects.toThrow('creation handler failed');
      for (const table of ['workItems', 'serviceTasks', 'manifestEvents', 'commandIdempotency']) {
        expect(await f.rows(table)).toEqual([]);
      }
    },
  );

  it('does not call the handler for failed guards or commands without emissions', async () => {
    const seen: Event[] = [];
    const f = await fixture(async (_ctx, event) => {
      seen.push(event);
    });
    await expect(f.call('WorkItem_create', { amount: -1 })).rejects.toThrow();
    await expect(f.call('ServiceTask_createViaOpen', { amount: -1 })).rejects.toThrow();
    const id = await f.root.run((ctx) =>
      ctx.db.insert('workItems', { amount: 10, reacted: false }),
    );
    await expect(f.call('WorkItem_adjust', { docId: id, amount: -1 })).rejects.toThrow();
    await f.call('WorkItem_silent', { docId: id, amount: 15 });
    expect(seen).toEqual([]);
  });

  it('does not run a parent handler after its declared reaction fails', async () => {
    const seen: Event[] = [];
    const f = await fixture(
      async (_ctx, event) => {
        seen.push(event);
      },
      SOURCE.replace('command mark() {', 'command mark() { guard self.amount < 20'),
    );
    const id = await f.root.run((ctx) =>
      ctx.db.insert('workItems', { amount: 10, reacted: false }),
    );
    await expect(f.call('WorkItem_adjust', { docId: id, amount: 20 })).rejects.toThrow();
    expect(seen).toEqual([]);
    expect(await f.rows('manifestEvents')).toEqual([]);
    expect(await f.root.run((ctx) => ctx.db.get(id))).toMatchObject({ amount: 10, reacted: false });
  });

  it('keeps policy evaluation before transactional handlers', async () => {
    const seen: Event[] = [];
    const f = await fixture(
      async (_ctx, event) => {
        seen.push(event);
      },
      SOURCE.replace(
        'entity WorkItem {',
        'entity WorkItem {\n default policy chefOnly execute: user.role == "chef" "Chef required"',
      ),
    );
    await expect(f.call('WorkItem_create', { amount: 10 })).rejects.toThrow('Chef required');
    expect(seen).toEqual([]);
    const chef = f.root.withIdentity({ subject: 'chef', role: 'chef' });
    await chef.mutation(
      convexServer.makeFunctionReference<'mutation'>('mutations:WorkItem_create'),
      { amount: 10 },
    );
    expect(seen.map((event) => event.type)).toEqual(['WorkMarked', 'WorkChanged']);
  });

  it('keeps schema-derived and bare fallback payloads identical to stored events', async () => {
    const seen: Event[] = [];
    const f = await fixture(
      async (_ctx, event) => {
        seen.push(event);
      },
      `
      entity Sample {
        property amount: int = 0
        command create(amount: int) {
          mutate amount = amount
          emit SampleOpened
          emit BareOpened
        }
      }
      store Sample in durable
      event SampleOpened: "sample.opened" { sampleId: string amount: int happenedAt: datetime }
      event BareOpened: "bare.opened" {}
    `,
    );
    const created = await f.call('Sample_create', { amount: 12 });
    expect(seen).toHaveLength(2);
    expect(seen[0]!.payload).toEqual({
      sampleId: created._id,
      amount: 12,
      happenedAt: expect.any(Number),
    });
    const rows = await f.rows('manifestEvents');
    for (const event of seen) {
      expect(rows.find((row) => row._id === event.eventId)?.payload).toEqual(event.payload);
    }
    expect(seen[1]!.payload).toMatchObject({ result: { amount: 12 } });
  });

  it('does not shadow command parameters or compute locals with handler bindings', async () => {
    const seen: Event[] = [];
    const f = await fixture(
      async (_ctx, event) => {
        seen.push(event);
      },
      `
      entity Sample {
        property amount: int = 0
        command change(__handleManifestEvent: int, __manifestEventId0: int) {
          compute __manifestEvent0 = __handleManifestEvent + __manifestEventId0
          mutate amount = __manifestEvent0
          emit Changed { amount: __manifestEvent0 }
        }
      }
      store Sample in durable
      event Changed: "sample.changed" { amount: int }
    `,
    );
    const id = await f.root.run((ctx) => ctx.db.insert('samples', { amount: 0 }));
    await f.call('Sample_change', { docId: id, __handleManifestEvent: 5, __manifestEventId0: 7 });
    expect(seen[0]!.payload).toEqual({ amount: 12 });
  });

  it('preserves default generation and omits the import when there are no emissions', async () => {
    const f = await fixture(
      async () => {
        throw new Error('unexpected');
      },
      SOURCE,
      false,
    );
    expect(f.code).not.toContain('handleManifestEvent');
    await f.call('WorkItem_create', { amount: 10 });
    const silent = await fixture(
      async () => {},
      `
      entity Silent { property value: int = 0 command create(value: int) { mutate value = value } }
      store Silent in durable
    `,
    );
    expect(silent.code).not.toContain('./lib/events');
    await silent.call('Silent_create', { value: 1 });
  });
  it.each([true, false])(
    'preserves createVia parameters and ordered computes (handler %s)',
    async (enabled) => {
      const seen: Event[] = [];
      const source = `
      entity RecipeStep {
        property amount: decimal = 0
        property reactionAmount: decimal = 0
        property reactionSync: boolean = true
        property openedAt: datetime?
        command open(amount: decimal, optional synchronizePrep: boolean) {
          guard self.openedAt == null
          guard amount >= 0
          compute syncPrepRequested = synchronizePrep != null ? synchronizePrep : true
          compute doubled = amount * 2
          mutate amount = doubled
          compute afterAmount = self.amount + 1
          mutate amount = afterAmount
          mutate openedAt = now()
          emit StepOpened { stepId: self.id, original: amount, current: self.amount, computedAmount: afterAmount, sync: syncPrepRequested, directSync: synchronizePrep != null ? synchronizePrep : true }
        }
        command record(amount: decimal, sync: boolean) {
          mutate reactionAmount = amount
          mutate reactionSync = sync
        }
      }
      store RecipeStep in durable
      event StepOpened: "step.opened" { stepId: string original: decimal current: decimal computedAmount: decimal sync: boolean directSync: boolean }
      on StepOpened run RecipeStep.record
        resolve payload.stepId
        params { amount: payload.computedAmount, sync: payload.sync }
    `;
      const f = await fixture(
        async (_ctx, event) => {
          seen.push(event);
        },
        source,
        enabled,
      );
      for (const synchronizePrep of [false, true, undefined]) {
        const args = {
          amount: 4,
          ...(synchronizePrep === undefined ? {} : { synchronizePrep }),
          idempotencyKey: `open-${synchronizePrep}`,
        };
        const created = await f.call('RecipeStep_createViaOpen', args);
        const row = await f.root.run((ctx) => ctx.db.get(created.docId));
        expect(row).toMatchObject({
          amount: 9,
          reactionAmount: 9,
          reactionSync: synchronizePrep ?? true,
        });
        for (const local of ['synchronizePrep', 'syncPrepRequested', 'doubled', 'afterAmount'])
          expect(row).not.toHaveProperty(local);
        const event = (await f.rows('manifestEvents')).find(
          (event) => event.entityId === created.docId,
        )!;
        expect(event.payload).toEqual({
          stepId: created.docId,
          original: 4,
          current: 9,
          computedAmount: 9,
          sync: synchronizePrep ?? true,
          directSync: synchronizePrep ?? true,
        });
        if (enabled) expect(seen[seen.length - 1]!.payload).toEqual(event.payload);
        const before = {
          rows: await f.rows('recipeSteps'),
          events: await f.rows('manifestEvents'),
          seen: seen.length,
        };
        expect(await f.call('RecipeStep_createViaOpen', args)).toEqual(created);
        expect({
          rows: await f.rows('recipeSteps'),
          events: await f.rows('manifestEvents'),
          seen: seen.length,
        }).toEqual(before);
      }
    },
  );
});
