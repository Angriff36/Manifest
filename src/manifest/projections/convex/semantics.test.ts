/**
 * Convex projection semantics upgrades (roadmap M2–M7) — fixture tests.
 */

import { describe, it, expect } from 'vitest';
import type {
  IR,
  IREntity,
  IRStore,
  IRProperty,
  IRCommand,
  IRExpression,
  IRComputedProperty,
} from '../../ir';
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
function durable(name: string): IRStore {
  return { entity: name, target: 'durable', config: {} };
}
function prop(
  name: string,
  typeName: string,
  modifiers: IRProperty['modifiers'] = [],
  extra: Partial<IRProperty> = {},
): IRProperty {
  return { name, type: { name: typeName, nullable: false }, modifiers, ...extra };
}
function entity(name: string, props: IRProperty[], extra: Partial<IREntity> = {}): IREntity {
  return {
    name,
    properties: props,
    computedProperties: [],
    relationships: [],
    commands: [],
    constraints: [],
    policies: [],
    ...extra,
  };
}
const lit = (value: string | number | boolean): IRExpression => {
  if (typeof value === 'string') return { kind: 'literal', value: { kind: 'string', value } };
  if (typeof value === 'number') return { kind: 'literal', value: { kind: 'number', value } };
  return { kind: 'literal', value: { kind: 'boolean', value } };
};
const id = (name: string): IRExpression => ({ kind: 'identifier', name });
const call = (name: string, args: IRExpression[]): IRExpression => ({
  kind: 'call',
  callee: id(name),
  args,
});
const gen = (ir: IR, surface: string, options?: Record<string, unknown>) =>
  new ConvexProjection().generate(ir, { surface, options });

describe('M2 — transitions', () => {
  function orderIR(): IR {
    const ir = emptyIR();
    ir.entities = [
      entity('Order', [prop('status', 'string', ['required'])], {
        transitions: [
          { property: 'status', from: 'draft', to: ['submitted', 'cancelled'] },
          { property: 'status', from: 'submitted', to: ['shipped'] },
        ],
        commands: ['advance'],
      }),
    ];
    ir.stores = [durable('Order')];
    ir.commands = [
      {
        name: 'advance',
        entity: 'Order',
        parameters: [{ name: 'status', type: { name: 'string', nullable: false }, required: true }],
        guards: [],
        actions: [{ kind: 'mutate', target: 'status', expression: id('status') }],
        emits: [],
      },
      {
        name: 'cancel',
        entity: 'Order',
        parameters: [],
        guards: [],
        actions: [{ kind: 'mutate', target: 'status', expression: lit('cancelled') }],
        emits: [],
      },
      {
        name: 'noop',
        entity: 'Order',
        parameters: [],
        guards: [],
        actions: [],
        emits: [],
      },
    ];
    return ir;
  }

  it('emits pre-patch transition lookup for non-literal mutate', () => {
    const code = gen(orderIR(), 'convex.mutations').artifacts[0].code;
    expect(code).toContain('__allowed');
    expect(code).toContain('"draft": ["submitted", "cancelled"]');
    expect(code).toContain('Invalid state transition for');
    expect(code).toContain('Order_advance');
  });

  it('emits direct check for literal mutate target', () => {
    const code = gen(orderIR(), 'convex.mutations').artifacts[0].code;
    expect(code).toContain('Order_cancel');
    expect(code).toMatch(/__to = "cancelled"/);
  });

  it('keeps instance-command transition bypass and emits atomic createVia for allocators', () => {
    const code = gen(orderIR(), 'convex.mutations').artifacts[0].code;
    expect(code).toContain('__from !== __to && Object.hasOwn(__allowed, __from)');
    expect(code).toContain('export const Order_createViaAdvance = mutation({');
    expect(code).toContain('const __draft: Record<string, any> = {');
    expect(code).not.toContain('await __runOrderAdvance(ctx, { ...args, docId }, true)');
  });

  it('emits CONVEX_TRANSITION_UNUSED when command does not mutate the property', () => {
    const diags = gen(orderIR(), 'convex.mutations').diagnostics;
    expect(diags.some((d) => d.code === 'CONVEX_TRANSITION_UNUSED')).toBe(true);
  });
});

describe('M3 — private strip + encrypted diagnostic', () => {
  function vendorIR(): IR {
    const ir = emptyIR();
    ir.entities = [
      entity('Vendor', [
        prop('name', 'string', ['required']),
        prop('taxId', 'string', ['private', 'encrypted']),
        prop('note', 'string', ['private']),
      ]),
    ];
    ir.stores = [durable('Vendor')];
    return ir;
  }

  it('strips private fields from list/get returns', () => {
    const code = gen(vendorIR(), 'convex.queries').artifacts[0].code;
    expect(code).toContain('delete (__out as any).taxId');
    expect(code).toContain('delete (__out as any).note');
    expect(code).toContain('delete (o as any).taxId');
    expect(code).not.toMatch(/return await ctx\.db\.get\(id\);/);
  });

  it('fails loudly when encrypted persistent fields have no encryptionImport', () => {
    const diags = gen(vendorIR(), 'convex.schema').diagnostics;
    const enc = diags.filter((d) => d.code === 'CONVEX_ENCRYPTION_IMPORT_REQUIRED');
    expect(enc.length).toBe(1);
    expect(enc[0].message).toContain('taxId');
  });

  it('encrypts writes and decrypts reads through the author-owned seam', () => {
    const ir = vendorIR();
    ir.commands = [
      {
        name: 'create',
        entity: 'Vendor',
        parameters: [],
        guards: [],
        constraints: [],
        actions: [],
        emits: [],
      },
      {
        name: 'rename',
        entity: 'Vendor',
        parameters: [{ name: 'taxId', type: { name: 'string', nullable: false }, required: true }],
        guards: [],
        constraints: [],
        actions: [
          { kind: 'mutate', target: 'taxId', expression: { kind: 'identifier', name: 'taxId' } },
        ],
        emits: [],
      },
    ];
    const options = { encryptionImport: './lib/encryption' };
    const queries = gen(ir, 'convex.queries', options);
    const mutations = gen(ir, 'convex.mutations', options);

    expect(queries.diagnostics.some((d) => d.code === 'CONVEX_ENCRYPTION_IMPORT_REQUIRED')).toBe(
      false,
    );
    expect(queries.artifacts[0].code).toContain('import { decrypt } from "./lib/encryption";');
    expect(queries.artifacts[0].code).toContain(
      'async function __decryptDoc(ctx: any, entity: string, fields: readonly string[], doc: any)',
    );
    expect(queries.artifacts[0].code).toContain('await __decryptDoc(ctx, "Vendor", ["taxId"],');

    expect(mutations.artifacts[0].code).toContain(
      'import { encrypt, decrypt } from "./lib/encryption";',
    );
    expect(mutations.artifacts[0].code).toContain(
      'const __storedDoc = await __encryptDoc(ctx, "Vendor", ["taxId"], doc);',
    );
    expect(mutations.artifacts[0].code).toContain('ctx.db.insert("vendors", __storedDoc as any)');
    expect(mutations.artifacts[0].code).toContain(
      'const __storedUpdates = await __encryptDoc(ctx, "Vendor", ["taxId"], updates);',
    );
    expect(mutations.artifacts[0].code).toContain('ctx.db.patch(docId, __storedUpdates as any)');
  });

  it('keeps byte-stable returns when entity has no private fields', () => {
    const ir = emptyIR();
    ir.entities = [entity('Item', [prop('sku', 'string', ['required'])])];
    ir.stores = [durable('Item')];
    const code = gen(ir, 'convex.queries').artifacts[0].code;
    expect(code).toContain('return await ctx.db.query("items").collect();');
    expect(code).not.toContain('__out');
  });

  it('strips private fields from mutation RETURNS (create and instance)', () => {
    // Regression: queries stripped private fields but mutations returned
    // { _id, ...doc } / { ...doc, ...updates } wholesale — a create/update
    // handed taxId straight back to the caller.
    const ir = vendorIR();
    ir.commands = [
      {
        name: 'create',
        entity: 'Vendor',
        parameters: [],
        guards: [],
        constraints: [],
        actions: [],
        emits: [],
      },
      {
        name: 'rename',
        entity: 'Vendor',
        parameters: [{ name: 'name', type: { name: 'string', nullable: false }, required: true }],
        guards: [],
        constraints: [],
        actions: [
          { kind: 'mutate', target: 'name', expression: { kind: 'identifier', name: 'name' } },
        ],
        emits: [],
      },
    ];
    const code = gen(ir, 'convex.mutations').artifacts[0].code;
    expect(code).not.toContain('return { _id, ...doc };');
    expect(code).not.toContain('return { ...doc, ...updates };');
    expect(code).toContain('delete (__ret as any).taxId');
    expect(code).toContain('delete (__ret as any).note');
  });

  it('keeps byte-stable mutation returns when entity has no private fields', () => {
    const ir = emptyIR();
    ir.entities = [entity('Item', [prop('sku', 'string', ['required'])])];
    ir.stores = [durable('Item')];
    ir.commands = [
      {
        name: 'create',
        entity: 'Item',
        parameters: [],
        guards: [],
        constraints: [],
        actions: [],
        emits: [],
      },
    ];
    const code = gen(ir, 'convex.mutations').artifacts[0].code;
    expect(code).toContain('return { _id, ...doc };');
    expect(code).not.toContain('__ret');
  });
});

describe('M4 — computed helpers', () => {
  function lineIR(expr: IRExpression): IR {
    const ir = emptyIR();
    const computed: IRComputedProperty = {
      name: 'total',
      type: { name: 'float', nullable: false },
      expression: expr,
      dependencies: ['price', 'qty'],
    };
    ir.entities = [
      entity('Line', [prop('price', 'float', ['required']), prop('qty', 'int', ['required'])], {
        computedProperties: [computed],
      }),
    ];
    ir.stores = [durable('Line')];
    return ir;
  }

  it('emits computeLine helper for self-only expression', () => {
    const expr: IRExpression = {
      kind: 'binary',
      operator: '*',
      left: id('price'),
      right: id('qty'),
    };
    const code = gen(lineIR(expr), 'convex.computed').artifacts[0].code;
    expect(code).toContain('export function computeLine');
    expect(code).toContain('total: (doc.price * doc.qty)');
  });

  it('emits CONVEX_UNRESOLVED_COMPUTED for unmappable expression', () => {
    const expr = call('mysteryBuiltin', [id('price')]);
    const diags = gen(lineIR(expr), 'convex.computed').diagnostics;
    expect(diags.some((d) => d.code === 'CONVEX_UNRESOLVED_COMPUTED')).toBe(true);
  });

  it('declares convex.computed among surfaces', () => {
    expect(new ConvexProjection().surfaces).toContain('convex.computed');
  });
});

describe('M5 — substring + list defaults', () => {
  it('resolves substring() in the expression renderer', () => {
    const expr = call('substring', [call('uuid', []), lit(0), lit(8)]);
    const r = renderExpression(expr, { selfVar: 'args' });
    expect(r.unresolved).toEqual([]);
    expect(r.code).toBe('(crypto.randomUUID()).substring(0, 8)');
  });

  it('keeps create mutate that uses substring (not omitted)', () => {
    const ir = emptyIR();
    ir.entities = [entity('WorkOrder', [prop('workOrderNumber', 'string', ['required'])])];
    ir.stores = [durable('WorkOrder')];
    ir.commands = [
      {
        name: 'create',
        entity: 'WorkOrder',
        parameters: [],
        guards: [],
        actions: [
          {
            kind: 'mutate',
            target: 'workOrderNumber',
            expression: call('substring', [call('uuid', []), lit(0), lit(8)]),
          },
        ],
        emits: [],
      },
    ];
    const result = gen(ir, 'convex.mutations');
    expect(result.artifacts[0].code).toContain(
      'workOrderNumber: (crypto.randomUUID()).substring(0, 8)',
    );
    expect(result.diagnostics.some((d) => d.code === 'CONVEX_UNRESOLVED_ACTION')).toBe(false);
  });

  it('includes list<T> property with empty-array default on create', () => {
    const ir = emptyIR();
    const accessibility: IRProperty = {
      name: 'accessibilityOptions',
      type: { name: 'list', nullable: false, generic: { name: 'string', nullable: false } },
      modifiers: ['required'],
      defaultValue: { kind: 'array', elements: [] },
    };
    ir.entities = [entity('Event', [prop('title', 'string', ['required']), accessibility])];
    ir.stores = [durable('Event')];
    ir.commands = [
      {
        name: 'create',
        entity: 'Event',
        parameters: [],
        guards: [],
        actions: [],
        emits: [],
      } satisfies IRCommand,
    ];
    const mut = gen(ir, 'convex.mutations').artifacts[0].code;
    const schema = gen(ir, 'convex.schema').artifacts[0].code;
    expect(schema).toContain('accessibilityOptions: v.array(v.string())');
    expect(mut).toContain('accessibilityOptions: args.accessibilityOptions ?? []');
  });
});

describe('M7 — capability diagnostics', () => {
  it('emits CONVEX_UNSUPPORTED_APPROVAL when approvals are declared', () => {
    const ir = emptyIR();
    ir.entities = [
      entity('Invoice', [prop('amount', 'money', ['required'])], {
        approvals: [
          {
            name: 'managerOk',
            command: 'submit',
            stages: [{ name: 'mgr', policy: lit(true), required: 1 }],
            emits: [],
          },
        ],
      }),
    ];
    ir.stores = [durable('Invoice')];
    const diags = gen(ir, 'convex.schema').diagnostics;
    expect(diags.some((d) => d.code === 'CONVEX_UNSUPPORTED_APPROVAL')).toBe(true);
  });

  it('emits CONVEX_UNSUPPORTED_RETRY for retrying commands', () => {
    const ir = emptyIR();
    ir.entities = [entity('Job', [prop('name', 'string', ['required'])])];
    ir.stores = [durable('Job')];
    ir.commands = [
      {
        name: 'run',
        entity: 'Job',
        parameters: [],
        guards: [],
        actions: [],
        emits: [],
        retry: { maxAttempts: 3, backoff: 'exponential', delayMs: 100 },
      },
    ];
    const diags = gen(ir, 'convex.mutations').diagnostics;
    expect(diags.some((d) => d.code === 'CONVEX_UNSUPPORTED_RETRY')).toBe(true);
  });

  it('emits CONVEX_PARTIAL_REALTIME info when realtime hint is set (platform-reactive)', () => {
    const ir = emptyIR();
    ir.entities = [entity('Feed', [prop('title', 'string', ['required'])], { realtime: true })];
    ir.stores = [durable('Feed')];
    const diags = gen(ir, 'convex.schema').diagnostics;
    const hit = diags.find((d) => d.code === 'CONVEX_PARTIAL_REALTIME');
    expect(hit?.severity).toBe('info');
    expect(diags.some((d) => d.code === 'CONVEX_UNSUPPORTED_REALTIME')).toBe(false);
  });

  it('emits CONVEX_PARTIAL_COMPUTED_CACHE info when cache directives are declared', () => {
    const ir = emptyIR();
    ir.entities = [
      entity('Item', [prop('price', 'int', ['required'])], {
        computedProperties: [
          {
            name: 'doubled',
            type: { name: 'int', nullable: false },
            expression: { kind: 'identifier', name: 'price' },
            dependencies: ['price'],
            cache: { strategy: 'request' },
          } satisfies IRComputedProperty,
        ],
      }),
    ];
    ir.stores = [durable('Item')];
    const diags = gen(ir, 'convex.schema').diagnostics;
    const hit = diags.find((d) => d.code === 'CONVEX_PARTIAL_COMPUTED_CACHE');
    expect(hit?.severity).toBe('info');
    expect(diags.some((d) => d.code === 'CONVEX_UNSUPPORTED_COMPUTED_CACHE')).toBe(false);
  });

  it('emits .searchIndex for searchable string properties (no UNSUPPORTED_SEARCHABLE)', () => {
    const ir = emptyIR();
    ir.entities = [
      entity('Article', [
        prop('title', 'string', ['required', 'searchable']),
        prop('body', 'text', ['searchable']),
        prop('views', 'number', ['searchable']),
      ]),
    ];
    ir.stores = [durable('Article')];
    const res = gen(ir, 'convex.schema');
    const code = res.artifacts[0].code;
    expect(code).toContain('.searchIndex("search_title", { searchField: "title" })');
    expect(code).toContain('.searchIndex("search_body", { searchField: "body" })');
    expect(code).not.toContain('search_views');
    expect(res.diagnostics.some((d) => d.code === 'CONVEX_UNSUPPORTED_SEARCHABLE')).toBe(true);
    expect(
      res.diagnostics.some(
        (d) =>
          d.code === 'CONVEX_UNSUPPORTED_SEARCHABLE' &&
          typeof d.message === 'string' &&
          d.message.includes('views'),
      ),
    ).toBe(true);
    expect(
      res.diagnostics.some(
        (d) =>
          d.code === 'CONVEX_UNSUPPORTED_SEARCHABLE' &&
          typeof d.message === 'string' &&
          d.message.includes('title'),
      ),
    ).toBe(false);
  });

  it('adds tenant filterFields on searchable indexes when tenant is declared', () => {
    const ir = emptyIR();
    ir.tenant = {
      property: 'tenantId',
      type: { name: 'string', nullable: false },
      contextPath: 'context.tenantId',
    };
    ir.entities = [
      entity('Doc', [
        prop('tenantId', 'string', ['required']),
        prop('content', 'string', ['required', 'searchable']),
      ]),
    ];
    ir.stores = [durable('Doc')];
    const code = gen(ir, 'convex.schema').artifacts[0].code;
    expect(code).toContain(
      '.searchIndex("search_content", { searchField: "content", filterFields: ["tenantId"] })',
    );
  });
});

describe('M7 — versionProperty OCC', () => {
  function versionedIR(): IR {
    const ir = emptyIR();
    ir.entities = [
      entity('Doc', [prop('title', 'string', ['required'])], {
        versionProperty: 'version',
        versionAtProperty: 'versionAt',
        commands: ['create', 'rename'],
      }),
    ];
    ir.stores = [durable('Doc')];
    ir.commands = [
      {
        name: 'create',
        entity: 'Doc',
        parameters: [],
        guards: [],
        actions: [],
        emits: [],
      },
      {
        name: 'rename',
        entity: 'Doc',
        parameters: [{ name: 'title', type: { name: 'string', nullable: false }, required: true }],
        guards: [],
        actions: [{ kind: 'mutate', target: 'title', expression: id('title') }],
        emits: [],
      },
    ];
    return ir;
  }

  it('synthesizes version fields in schema and seeds create', () => {
    const ir = versionedIR();
    const schema = gen(ir, 'convex.schema');
    expect(schema.artifacts[0].code).toContain('version: v.number()');
    expect(schema.artifacts[0].code).toContain('versionAt: v.number()');
    expect(schema.diagnostics.some((d) => d.code === 'CONVEX_UNSUPPORTED_VERSION')).toBe(false);

    const mut = gen(ir, 'convex.mutations').artifacts[0].code;
    expect(mut).toContain('version: 1');
    expect(mut).toContain('versionAt: Date.now()');
    const createBlock = mut.slice(
      mut.indexOf('export const Doc_create'),
      mut.indexOf('export const Doc_rename'),
    );
    expect(createBlock).not.toMatch(/args:\s*\{[^}]*\bversion:/s);
  });

  it('emits OCC check + increment on update mutations', () => {
    const mut = gen(versionedIR(), 'convex.mutations').artifacts[0].code;
    const rename = mut.slice(mut.indexOf('async function __runDocRename'));
    expect(rename).toContain('version: v.optional(v.number())');
    expect(rename).toContain('ConcurrencyConflict: VERSION_MISMATCH');
    expect(rename).toContain('version: ((doc as any).version ?? 0) + 1');
    expect(rename).toContain('versionAt: Date.now()');
    const checkAt = rename.indexOf('VERSION_MISMATCH');
    const patchAt = rename.indexOf('ctx.db.patch');
    expect(checkAt).toBeGreaterThan(-1);
    expect(patchAt).toBeGreaterThan(checkAt);
  });
});

describe('working surfaces — smoke fixtures', () => {
  it('schema emits table for durable entity', () => {
    const ir = emptyIR();
    ir.entities = [entity('Book', [prop('title', 'string', ['required'])])];
    ir.stores = [durable('Book')];
    const code = gen(ir, 'convex.schema').artifacts[0].code;
    expect(code).toContain('books: defineTable');
    expect(code).toContain('title: v.string()');
  });

  it('mutations preserve policy→guard→constraint order markers', () => {
    const ir = emptyIR();
    ir.entities = [
      entity('Task', [prop('done', 'boolean', ['required'])], {
        policies: ['canEdit'],
        commands: ['complete'],
      }),
    ];
    ir.stores = [durable('Task')];
    ir.policies = [
      {
        name: 'canEdit',
        entity: 'Task',
        action: 'execute',
        expression: { kind: 'binary', operator: '==', left: id('user'), right: id('user') },
      },
    ];
    // Use a resolvable policy so we get a throw line, not unresolved deny.
    ir.policies[0].expression = {
      kind: 'binary',
      operator: '==',
      left: { kind: 'member', object: id('user'), property: 'role' },
      right: lit('admin'),
    };
    ir.commands = [
      {
        name: 'complete',
        entity: 'Task',
        parameters: [],
        policies: ['canEdit'],
        guards: [
          {
            kind: 'unary',
            operator: '!',
            operand: { kind: 'member', object: id('self'), property: 'done' },
          },
        ],
        constraints: [
          {
            name: 'ok',
            code: 'ok',
            expression: lit(true),
            severity: 'block',
          },
        ],
        actions: [{ kind: 'mutate', target: 'done', expression: lit(true) }],
        emits: [],
      },
    ];
    const code = gen(ir, 'convex.mutations').artifacts[0].code;
    const policyIdx = code.indexOf('user.role');
    const guardIdx = code.indexOf('!doc.done');
    const mutateIdx = code.indexOf('done: true');
    expect(policyIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(policyIdx);
    expect(mutateIdx).toBeGreaterThan(guardIdx);
  });
});
