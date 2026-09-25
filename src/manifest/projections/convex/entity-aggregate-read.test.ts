import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { compileToIR } from '../../ir-compiler.js';
import { ConvexProjection } from './generator.js';
import type { ConvexProjectionOptions } from './options.js';

// Entity-scoped aggregates (`count(Entity where …)`) in command guards and
// constraints, and index selection for their reads (docs/spec/builtins.md).

const styleProgram = `
entity ServiceStyle {
  property status: string = "active"
  hasMany events: Event
}
entity Event {
  property serviceStyleId: string?
  belongsTo serviceStyle: ServiceStyle with serviceStyleId
  command changeServiceStyle(serviceStyleId: string) {
    constraint activeStyle: count(ServiceStyle where id == serviceStyleId, status == "active") > 0 "Events must reference an active service style"
    mutate serviceStyleId = serviceStyleId
  }
}
store ServiceStyle in durable
store Event in durable
`;

async function generate(source: string, options: Partial<ConvexProjectionOptions> = {}) {
  const { ir, diagnostics } = await compileToIR(source);
  expect(diagnostics.filter((entry) => entry.severity === 'error')).toEqual([]);
  const generated = new ConvexProjection().generate(ir!, {
    surface: 'convex.mutations',
    options: { policyMode: 'skip', ...options },
  });
  expect(generated.diagnostics.filter((entry) => entry.severity === 'error')).toEqual([]);
  return generated.artifacts[0]!.code;
}

function load(code: string) {
  const javascript = ts.transpileModule(code, {
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
  return exported;
}

describe('entity-scoped aggregate in a command constraint', () => {
  function database() {
    const rows = new Map<string, Record<string, unknown>>([
      ['style_active', { _id: 'style_active', status: 'active' }],
      ['style_retired', { _id: 'style_retired', status: 'retired' }],
      ['evt', { _id: 'evt', serviceStyleId: null }],
    ]);
    const patches: Record<string, unknown>[] = [];
    const ctx = {
      db: {
        normalizeId: (table: string, id: string) =>
          table === 'serviceStyles' && id.startsWith('style_') ? id : null,
        get: async (id: string) => structuredClone(rows.get(id) ?? null),
        query: () => {
          throw new Error('an id predicate must not scan');
        },
        patch: async (_id: string, value: Record<string, unknown>) => {
          patches.push(value);
        },
        insert: async () => 'event_row',
      },
    };
    return { ctx, patches };
  }

  it('reads the referenced row by id and allows an active target', async () => {
    const code = await generate(styleProgram);
    expect(code).toContain('ctx.db.normalizeId("serviceStyles"');
    const { ctx, patches } = database();
    await load(code).Event_changeServiceStyle!.handler(ctx, {
      docId: 'evt',
      serviceStyleId: 'style_active',
    });
    expect(patches).toEqual([expect.objectContaining({ serviceStyleId: 'style_active' })]);
  });

  it.each([
    ['a retired target', 'style_retired'],
    ['an id from another table', 'vendor_1'],
    ['an unknown id', 'style_missing'],
  ])('rejects %s without writing', async (_label, serviceStyleId) => {
    const code = await generate(styleProgram);
    const { ctx, patches } = database();
    await expect(
      load(code).Event_changeServiceStyle!.handler(ctx, { docId: 'evt', serviceStyleId }),
    ).rejects.toThrow('Events must reference an active service style');
    expect(patches).toEqual([]);
  });
});

describe('aggregate read index selection', () => {
  const contributionProgram = `
entity Event {
  property name: string?
  hasMany contributions: Contribution
}
entity Ingredient {
  property name: string?
  hasMany contributions: Contribution
}
entity Contribution {
  property required eventId: string
  property required ingredientId: string
  property quantity: number = 0
  belongsTo event: Event with eventId
  belongsTo ingredient: Ingredient with ingredientId
  command record(eventId: string, ingredientId: string, quantity: number) {
    mutate eventId = eventId
    mutate ingredientId = ingredientId
    mutate quantity = quantity
    emit Recorded
  }
}
entity Total {
  property required eventKey: string
  property required ingredientKey: string
  property quantity: number = 0
  command recompute(quantity: number) {
    mutate quantity = quantity
  }
}
event Recorded: "recorded" {
  eventId: string
  ingredientId: string
  totalId: string
}
on Recorded run Total.recompute
  match eventKey = payload.eventId, ingredientKey = payload.ingredientId
  params {
    quantity: sum(Contribution where eventId == payload.eventId, ingredientId == payload.ingredientId, of quantity)
  }
store Event in durable
store Ingredient in durable
store Contribution in durable
store Total in durable
`;

  it('uses a declared composite index covering every equality predicate', async () => {
    const code = await generate(contributionProgram, {
      indexes: {
        Contribution: [{ fields: ['eventId', 'ingredientId'], name: 'by_event_ingredient' }],
      },
    });
    expect(code).toContain(
      '.withIndex("by_event_ingredient", (q) => q.eq("eventId", payload.eventId).eq("ingredientId", payload.ingredientId))',
    );
    expect(code).not.toContain('(d as any).ingredientId === payload.ingredientId');
  });

  it('keeps the first single-field index when no composite is declared', async () => {
    const code = await generate(contributionProgram);
    expect(code).toContain('.withIndex("by_eventId", (q) => q.eq("eventId", payload.eventId))');
    expect(code).toContain('(d as any).ingredientId === payload.ingredientId');
  });
});
