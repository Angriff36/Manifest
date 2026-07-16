/**
 * Convex functions surfaces (queries + mutations) — unit tests.
 */

import { describe, it, expect } from 'vitest';
import type {
  IR,
  IREntity,
  IRStore,
  IRProperty,
  IRCommand,
  IRPolicy,
  IRReactionRule,
} from '../../ir';
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
  nullable = false,
): IRProperty {
  return { name, type: { name: typeName, nullable }, modifiers };
}
function entity(name: string, props: IRProperty[], rels: IREntity['relationships'] = []): IREntity {
  return {
    name,
    properties: props,
    computedProperties: [],
    relationships: rels,
    commands: [],
    constraints: [],
    policies: [],
  };
}
const queries = (ir: IR) => new ConvexProjection().generate(ir, { surface: 'convex.queries' });
const mutations = (ir: IR) => new ConvexProjection().generate(ir, { surface: 'convex.mutations' });

describe('ConvexProjection — surfaces', () => {
  it('declares schema, queries and mutations among its surfaces', () => {
    const s = new ConvexProjection().surfaces;
    expect(s).toContain('convex.schema');
    expect(s).toContain('convex.queries');
    expect(s).toContain('convex.mutations');
  });
});

describe('convex.queries', () => {
  it('emits list/get and index-based listBy with typed FK args', () => {
    const ir = emptyIR();
    ir.entities = [
      entity(
        'Order',
        [prop('sku', 'string', ['required', 'indexed'])],
        [
          {
            name: 'customer',
            kind: 'belongsTo',
            target: 'Customer',
            foreignKey: { fields: ['customerId'] },
          },
        ],
      ),
      entity('Customer', [prop('name', 'string', ['required'])]),
    ];
    ir.stores = [durable('Order'), durable('Customer')];
    const code = queries(ir).artifacts[0].code;
    expect(code).toContain('export const listOrder = query({');
    expect(code).toContain('export const getOrder = query({');
    expect(code).toContain('export const listOrderBySku = query({');
    expect(code).toContain('export const listOrderByCustomerId = query({');
    expect(code).toContain('customerId: v.id("customers")'); // FK query arg typed
    expect(code).toContain('.withIndex("by_customerId"');
  });

  it('emits listBy for a reference FK index in stringId mode (schema/query parity)', () => {
    // Regression: the schema surface emits `by_<fk>` for every belongsTo/ref
    // regardless of referenceMode, but the query surface used to derive FK
    // index fields from collectFkTargets — which is empty in stringId mode — so
    // a `by_eventId` index shipped with no matching listEventProfitabilityByEventId.
    const ir = emptyIR();
    ir.entities = [
      entity(
        'EventProfitability',
        [prop('amount', 'money', ['required'])],
        [
          {
            name: 'event',
            kind: 'belongsTo',
            target: 'CateringEvent',
            foreignKey: { fields: ['eventId'] },
          },
        ],
      ),
      entity('CateringEvent', [prop('name', 'string', ['required'])]),
    ];
    ir.stores = [durable('EventProfitability'), durable('CateringEvent')];
    const proj = new ConvexProjection();
    const options = { referenceMode: 'stringId' as const };
    const schema = proj.generate(ir, { surface: 'convex.schema', options }).artifacts[0].code;
    const code = proj.generate(ir, { surface: 'convex.queries', options }).artifacts[0].code;
    // schema produced the index...
    expect(schema).toContain('eventId: v.optional(v.string())'); // stringId column
    expect(schema).toContain('.index("by_eventId", ["eventId"])');
    // ...and the query surface now exposes it (string arg, not v.id, in stringId mode)
    expect(code).toContain('export const listEventProfitabilityByEventId = query({');
    expect(code).toContain('eventId: v.string()');
    expect(code).toContain('.withIndex("by_eventId"');
  });

  it('emits listBy for a single-field option index (custom index name honored)', () => {
    const ir = emptyIR();
    ir.entities = [entity('Order', [prop('sku', 'string', ['required'])])];
    ir.stores = [durable('Order')];
    const code = new ConvexProjection().generate(ir, {
      surface: 'convex.queries',
      options: { indexes: { Order: [{ fields: ['sku'], name: 'by_sku' }] } },
    }).artifacts[0].code;
    expect(code).toContain('export const listOrderBySku = query({');
    expect(code).toContain('.withIndex("by_sku"');
  });

  it('every single-column schema index has a matching listBy query (no surface drift)', () => {
    const ir = emptyIR();
    ir.tenant = {
      property: 'tenantId',
      type: { name: 'string', nullable: false },
      contextPath: 'context.tenantId',
    };
    ir.entities = [
      entity(
        'EventProfitability',
        [prop('tenantId', 'string', ['required']), prop('period', 'string', ['indexed'])],
        [
          {
            name: 'event',
            kind: 'belongsTo',
            target: 'CateringEvent',
            foreignKey: { fields: ['eventId'] },
          },
        ],
      ),
      entity('CateringEvent', [prop('name', 'string', ['required'])]),
    ];
    ir.stores = [durable('EventProfitability'), durable('CateringEvent')];
    const proj = new ConvexProjection();
    const options = { referenceMode: 'stringId' as const };
    const code = proj.generate(ir, { surface: 'convex.queries', options }).artifacts[0].code;
    expect(code).toContain('listEventProfitabilityByPeriod'); // indexed modifier
    expect(code).toContain('listEventProfitabilityByTenantId'); // tenant column
    expect(code).toContain('listEventProfitabilityByEventId'); // reference FK (the bug)
  });

  it('emits a composite read for a multi-field option index (schema/query parity)', () => {
    const ir = emptyIR();
    ir.entities = [
      entity('Order', [
        prop('tenantId', 'string', ['required']),
        prop('createdAt', 'datetime', ['required']),
      ]),
    ];
    ir.stores = [durable('Order')];
    const proj = new ConvexProjection();
    const options = { indexes: { Order: [['tenantId', 'createdAt']] } };
    const schema = proj.generate(ir, { surface: 'convex.schema', options }).artifacts[0].code;
    const code = proj.generate(ir, { surface: 'convex.queries', options }).artifacts[0].code;
    expect(schema).toContain('.index("by_tenantId_createdAt", ["tenantId", "createdAt"])');
    // the composite index now has a matching multi-arg read
    expect(code).toContain('export const listOrderByTenantIdAndCreatedAt = query({');
    expect(code).toContain('q.eq("tenantId", tenantId).eq("createdAt", createdAt)');
  });

  it('exposes the system events-table indexes as reads', () => {
    const ir = emptyIR();
    ir.entities = [entity('Task', [prop('title', 'string', ['required'])])];
    ir.stores = [durable('Task')];
    const code = queries(ir).artifacts[0].code;
    expect(code).toContain('export const listEventsByType = query({');
    expect(code).toContain('export const listEventsByEntity = query({');
    expect(code).toContain('export const listEventsByEntityId = query({');
    expect(code).toContain('.withIndex("by_entityId"');
  });
});

describe('convex.queries — tenant + soft-delete read filtering', () => {
  it('scopes list/get to the auth tenant and excludes soft-deleted rows (field-aware, default on)', () => {
    const ir = emptyIR();
    ir.tenant = {
      property: 'tenantId',
      type: { name: 'string', nullable: false },
      contextPath: 'context.tenantId',
    };
    ir.entities = [
      entity('Invoice', [prop('tenantId', 'string', ['required']), prop('deletedAt', 'datetime')]),
    ];
    ir.stores = [durable('Invoice')];
    const res = new ConvexProjection().generate(ir, {
      surface: 'convex.queries',
      options: { authContextImport: './lib/authContext' },
    });
    const code = res.artifacts[0].code;
    // list is tenant-scoped from auth (NOT a client arg) + drops soft-deleted
    expect(code).toContain(
      'const __tenant = ((await getAuthContext(ctx)) as any).tenantId ?? null;',
    );
    expect(code).toContain('.withIndex("by_tenantId", (q) => q.eq("tenantId", __tenant))');
    expect(code).toContain('rows = rows.filter((d) => (d as any).deletedAt == null);');
    // get returns null on tenant mismatch / soft-deleted
    expect(code).toContain('if (doc && (doc as any).tenantId !== __tenant) return null;');
    expect(code).toContain('if (doc && (doc as any).deletedAt != null) return null;');
    // list() must NOT accept a client-supplied tenant
    expect(code).not.toMatch(/list Invoice[\s\S]*?args:\s*\{\s*tenantId/);
  });

  it('errors when tenant filtering is on without authContextImport', () => {
    const ir = emptyIR();
    ir.tenant = {
      property: 'tenantId',
      type: { name: 'string', nullable: false },
      contextPath: 'context.tenantId',
    };
    ir.entities = [entity('Invoice', [prop('tenantId', 'string', ['required'])])];
    ir.stores = [durable('Invoice')];
    const res = queries(ir);
    expect(res.diagnostics.some((d) => d.code === 'CONVEX_AUTH_CONTEXT_REQUIRED')).toBe(true);
    expect(res.artifacts[0].code).not.toContain('(ctx as any).auth');
  });

  it('leaves reads unfiltered for entities without tenant/soft-delete columns', () => {
    const ir = emptyIR();
    ir.entities = [entity('Lookup', [prop('code', 'string', ['required'])])];
    ir.stores = [durable('Lookup')];
    const code = queries(ir).artifacts[0].code;
    expect(code).toContain('return await ctx.db.query("lookups").collect();'); // plain list
    expect(code).toContain('return await ctx.db.get(id);'); // plain get
  });

  it('respects opt-out: includeTenantFilter/includeSoftDeleteFilter = false', () => {
    const ir = emptyIR();
    ir.tenant = {
      property: 'tenantId',
      type: { name: 'string', nullable: false },
      contextPath: 'context.tenantId',
    };
    ir.entities = [
      entity('Invoice', [prop('tenantId', 'string', ['required']), prop('deletedAt', 'datetime')]),
    ];
    ir.stores = [durable('Invoice')];
    const code = new ConvexProjection().generate(ir, {
      surface: 'convex.queries',
      options: { includeTenantFilter: false, includeSoftDeleteFilter: false },
    }).artifacts[0].code;
    expect(code).toContain('return await ctx.db.query("invoices").collect();'); // back to plain list
    expect(code).not.toContain('__tenant');
  });
});

describe('authContextImport — the auth seam', () => {
  function tenantIR(): IR {
    const ir = emptyIR();
    ir.tenant = {
      property: 'tenantId',
      type: { name: 'string', nullable: false },
      contextPath: 'context.tenantId',
    };
    ir.entities = [
      entity('Invoice', [
        prop('tenantId', 'string', ['required']),
        prop('total', 'number', ['required']),
      ]),
    ];
    ir.stores = [durable('Invoice')];
    return ir;
  }
  const seam = { authContextImport: './lib/authContext' };

  it('queries derive the tenant from getAuthContext, not ctx.auth', () => {
    const code = new ConvexProjection().generate(tenantIR(), {
      surface: 'convex.queries',
      options: seam,
    }).artifacts[0].code;
    expect(code).toContain('import { getAuthContext } from "./lib/authContext";');
    expect(code).toContain(
      'const __tenant = ((await getAuthContext(ctx)) as any).tenantId ?? null;',
    );
    expect(code).not.toContain('(ctx as any).auth');
  });

  it('create derives the tenant server-side and drops the client tenant arg', () => {
    const ir = tenantIR();
    ir.commands = [
      {
        name: 'create',
        entity: 'Invoice',
        parameters: [],
        guards: [],
        constraints: [],
        actions: [],
        emits: [],
      },
    ];
    const code = new ConvexProjection().generate(ir, {
      surface: 'convex.mutations',
      options: seam,
    }).artifacts[0].code;
    expect(code).toContain('import { getAuthContext } from "./lib/authContext";');
    expect(code).toContain('const __auth = (await getAuthContext(ctx)) as any;');
    expect(code).toContain('tenantId: __auth.tenantId'); // server-derived
    expect(code).not.toContain('tenantId: v.string()'); // not a client arg
    expect(code).not.toContain('args.tenantId'); // never read from the caller
  });

  it('instance mutations reject documents from another tenant', () => {
    const ir = tenantIR();
    ir.commands = [
      {
        name: 'archive',
        entity: 'Invoice',
        parameters: [],
        guards: [],
        constraints: [],
        actions: [
          {
            kind: 'mutate',
            target: 'total',
            expression: { kind: 'literal', value: { kind: 'number', value: 0 } },
          },
        ],
        emits: [],
      },
    ];
    const code = new ConvexProjection().generate(ir, {
      surface: 'convex.mutations',
      options: seam,
    }).artifacts[0].code;
    expect(code).toContain(
      'if ((doc as any).tenantId !== __auth.tenantId) throw new Error("Invoice not found");',
    );
    // ownership check runs after the fetch, before governance/patch
    expect(code.indexOf('!== __auth.tenantId')).toBeLessThan(code.indexOf('ctx.db.patch'));
  });

  it('role/user bindings route through the auth context', () => {
    const ir = tenantIR();
    ir.policies = [
      {
        name: 'canArchive',
        action: 'execute',
        expression: {
          kind: 'call',
          callee: { kind: 'identifier', name: 'roleAllows' },
          args: [
            { kind: 'member', object: { kind: 'identifier', name: 'user' }, property: 'role' },
            { kind: 'literal', value: { kind: 'string', value: 'manage' } },
          ],
        },
      },
    ] as IRPolicy[];
    ir.commands = [
      {
        name: 'archive',
        entity: 'Invoice',
        parameters: [],
        policies: ['canArchive'],
        guards: [],
        constraints: [],
        actions: [],
        emits: [],
      },
    ];
    const code = new ConvexProjection().generate(ir, {
      surface: 'convex.mutations',
      options: seam,
    }).artifacts[0].code;
    expect(code).toContain('const userRole = __auth.role ?? "anonymous";');
    expect(code).not.toContain('(ctx as any).auth');
  });

  it('unset authContextImport with tenant filtering fails closed (no legacy ctx.auth)', () => {
    const res = queries(tenantIR());
    expect(res.diagnostics.some((d) => d.code === 'CONVEX_AUTH_CONTEXT_REQUIRED')).toBe(true);
    expect(res.artifacts[0].code).not.toContain('(ctx as any).auth');
    expect(res.artifacts[0].code).not.toContain('getAuthContext');
  });
});

describe('convex.queries — read-policy lockdown', () => {
  it('emits internalQuery for entities gated by read/all policies; others stay public', () => {
    const ir = emptyIR();
    ir.entities = [
      entity('Secret', [prop('name', 'string', ['required', 'indexed'])]),
      entity('Public', [prop('name', 'string', ['required'])]),
    ];
    ir.stores = [durable('Secret'), durable('Public')];
    ir.policies = [
      {
        name: 'canReadSecret',
        entity: 'Secret',
        action: 'read',
        expression: { kind: 'literal', value: { kind: 'boolean', value: true } },
      },
    ] as IRPolicy[];
    const res = queries(ir);
    const code = res.artifacts[0].code;
    expect(code).toContain('export const listSecret = internalQuery({');
    expect(code).toContain('export const getSecret = internalQuery({');
    expect(code).toContain('export const listSecretByName = internalQuery({');
    expect(code).toContain('export const listPublic = query({');
    expect(code).toContain('import { query, internalQuery } from "./_generated/server";');
    expect(res.diagnostics.some((d) => d.code === 'CONVEX_UNSUPPORTED_READ_POLICY')).toBe(true);
  });

  it('emits public query for read-gated entities when authContextImport is set', () => {
    const ir = emptyIR();
    ir.entities = [entity('Secret', [prop('name', 'string', ['required'])])];
    ir.stores = [durable('Secret')];
    ir.policies = [
      {
        name: 'canReadSecret',
        entity: 'Secret',
        action: 'read',
        expression: { kind: 'literal', value: { kind: 'boolean', value: true } },
      },
    ] as IRPolicy[];
    const code = new ConvexProjection().generate(ir, {
      surface: 'convex.queries',
      options: { authContextImport: './lib/authContext' },
    }).artifacts[0].code;
    expect(code).toContain('export const listSecret = query({');
    expect(code).not.toContain('= internalQuery({');
  });

  it('a global (entity-less) read policy locks down every entity, runtime-parity', () => {
    const ir = emptyIR();
    ir.entities = [entity('Doc', [prop('name', 'string', ['required'])])];
    ir.stores = [durable('Doc')];
    ir.policies = [
      {
        name: 'readAll',
        action: 'all',
        expression: { kind: 'literal', value: { kind: 'boolean', value: true } },
      },
    ] as IRPolicy[];
    const code = queries(ir).artifacts[0].code;
    expect(code).toContain('export const listDoc = internalQuery({');
    expect(code).not.toContain('= query({');
  });
});

describe('convex.mutations — governance', () => {
  function govIR(): IR {
    const ir = emptyIR();
    ir.roles = [
      {
        name: 'Admin',
        allow: [],
        deny: [],
        effectivePermissions: [{ action: 'manageAccess' }, { action: 'all' }],
      },
    ];
    ir.policies = [
      {
        name: 'canManage',
        action: 'execute',
        expression: {
          kind: 'call',
          callee: { kind: 'identifier', name: 'roleAllows' },
          args: [
            { kind: 'member', object: { kind: 'identifier', name: 'user' }, property: 'role' },
            { kind: 'literal', value: { kind: 'string', value: 'manageAccess' } },
          ],
        },
      },
    ] as IRPolicy[];
    ir.entities = [entity('Task', [prop('status', 'string', ['required'])])];
    ir.stores = [durable('Task')];
    const close: IRCommand = {
      name: 'close',
      entity: 'Task',
      parameters: [],
      policies: ['canManage'],
      guards: [
        {
          kind: 'binary',
          operator: '==',
          left: {
            kind: 'member',
            object: { kind: 'identifier', name: 'self' },
            property: 'status',
          },
          right: { kind: 'literal', value: { kind: 'string', value: 'open' } },
        },
      ],
      constraints: [],
      actions: [
        {
          kind: 'mutate',
          target: 'status',
          expression: { kind: 'literal', value: { kind: 'string', value: 'closed' } },
        },
      ],
      emits: [],
    };
    ir.commands = [close];
    return ir;
  }

  it('emits the role map + checkRole helper', () => {
    const code = new ConvexProjection().generate(govIR(), {
      surface: 'convex.mutations',
      options: { authContextImport: './lib/authContext' },
    }).artifacts[0].code;
    expect(code).toContain('const ROLE_PERMISSIONS');
    expect(code).toContain('"Admin"');
    expect(code).toContain('function checkRole(');
  });

  it('renders policy → guard order, binds user, patches the action', () => {
    const code = new ConvexProjection().generate(govIR(), {
      surface: 'convex.mutations',
      options: { authContextImport: './lib/authContext' },
    }).artifacts[0].code;
    expect(code).toContain('export const Task_close = mutation({');
    expect(code).toContain('docId: v.id("tasks")');
    expect(code).toContain('const userRole = __auth.role ?? "anonymous";');
    expect(code).toContain('checkRole(userRole, "manageAccess")'); // policy
    expect(code).toContain('if (!((doc.status === "open")))'); // guard
    expect(code).toContain('status: "closed"'); // action
    expect(code).toContain('await ctx.db.patch(docId, updates as any)');
    // policy precedes guard
    expect(code.indexOf('checkRole(userRole')).toBeLessThan(code.indexOf('doc.status === "open"'));
  });

  it('errors when policyMode enforce has policies but no authContextImport', () => {
    const res = mutations(govIR());
    expect(res.diagnostics.some((d) => d.code === 'CONVEX_AUTH_CONTEXT_REQUIRED')).toBe(true);
    expect(res.artifacts[0].code).not.toContain('(ctx as any).auth');
  });

  it('policyMode skip omits policy checks but keeps guards', () => {
    const ir = govIR();
    const res = new ConvexProjection().generate(ir, {
      surface: 'convex.mutations',
      options: { policyMode: 'skip' },
    });
    const code = res.artifacts[0].code;
    expect(code).not.toContain('checkRole('); // policy/auth omitted
    expect(code).not.toContain('ROLE_PERMISSIONS'); // helper not emitted (unused)
    expect(code).toContain('if (!((doc.status === "open")))'); // guard still enforced
    expect(code).toContain('policyMode: skip');
  });

  it('renders constraint failWhen polarity (truthy = violation) and default polarity', () => {
    const ir = govIR();
    const statusEmpty = {
      kind: 'binary' as const,
      operator: '==',
      left: {
        kind: 'member' as const,
        object: { kind: 'identifier' as const, name: 'self' },
        property: 'status',
      },
      right: { kind: 'literal' as const, value: { kind: 'string' as const, value: '' } },
    };
    ir.commands[0].constraints = [
      // failWhen: truthy expression is the VIOLATION → `if (expr) throw`
      {
        name: 'noEmptyStatus',
        code: 'noEmptyStatus',
        expression: statusEmpty,
        failWhen: true,
        message: 'status must not be empty',
      },
      // default polarity: falsy expression is the violation → `if (!(expr)) throw`
      {
        name: 'statusPresent',
        code: 'statusPresent',
        expression: statusEmpty,
        message: 'status must be empty',
      },
    ];
    const code = mutations(ir).artifacts[0].code;
    expect(code).toContain('if ((doc.status === "")) throw new Error("status must not be empty")');
    expect(code).toContain('if (!((doc.status === ""))) throw new Error("status must be empty")');
  });

  it('fails CLOSED on an unresolvable guard (throws + diagnostic, never passes)', () => {
    const ir = govIR();
    // unknown builtin — fail-closed (bare lambdas now lower to arrows)
    ir.commands[0].guards = [
      {
        kind: 'call',
        callee: { kind: 'identifier', name: 'mysteryBuiltin' },
        args: [],
      },
    ];
    const res = mutations(ir);
    expect(res.diagnostics.some((d) => d.code === 'CONVEX_UNRESOLVED_GUARD')).toBe(true);
    expect(res.artifacts[0].code).toContain('unresolved — denied'); // denying throw, not a pass
  });
});

describe('convex.mutations — create (param-style) & reactions', () => {
  it('maps command parameters to fields via mutate actions', () => {
    const ir = emptyIR();
    ir.entities = [entity('Recipe', [prop('yieldQuantity', 'int', ['required'])])];
    ir.stores = [durable('Recipe')];
    ir.commands = [
      {
        name: 'create',
        entity: 'Recipe',
        parameters: [{ name: 'yieldQty', type: { name: 'int', nullable: false }, required: true }],
        guards: [
          {
            kind: 'binary',
            operator: '>',
            left: { kind: 'identifier', name: 'yieldQty' },
            right: { kind: 'literal', value: { kind: 'number', value: 0 } },
          },
        ],
        constraints: [],
        actions: [
          {
            kind: 'mutate',
            target: 'yieldQuantity',
            expression: { kind: 'identifier', name: 'yieldQty' },
          },
        ],
        emits: [],
      },
    ];
    const code = mutations(ir).artifacts[0].code;
    expect(code).toContain('export const Recipe_create = mutation({');
    expect(code).toContain('yieldQty: v.number()'); // arg is the PARAM (numeric → v.number())
    expect(code).toContain('(args.yieldQty > 0)'); // guard against param
    expect(code).toContain('yieldQuantity: args.yieldQty'); // action maps param→field
  });

  it('exposes required non-param fields as args and fills defaults (insert completeness)', () => {
    const ir = emptyIR();
    ir.entities = [
      entity('Event', [
        prop('tenantId', 'string', ['required']), // required, no default, not a param → required arg
        {
          name: 'status',
          type: { name: 'string', nullable: false },
          modifiers: ['required'],
          defaultValue: { kind: 'string', value: 'draft' },
        }, // default → optional arg + ?? default
      ]),
    ];
    ir.stores = [durable('Event')];
    ir.commands = [
      {
        name: 'create',
        entity: 'Event',
        parameters: [{ name: 'title', type: { name: 'string', nullable: false }, required: true }],
        guards: [],
        constraints: [],
        actions: [],
        emits: [],
      },
    ];
    const code = mutations(ir).artifacts[0].code;
    expect(code).toContain('tenantId: v.string()'); // required field exposed as required arg
    expect(code).toContain('status: v.optional(v.string())'); // defaulted field is optional arg
    expect(code).toContain('title: v.string()'); // required command param exposed
    expect(code).toContain('status: args.status ?? "draft"'); // default guaranteed into doc
    expect(code).toContain('tenantId: args.tenantId');
  });

  it('renders numeric defaults as plain numbers (int/money/array<int> all v.number())', () => {
    const ir = emptyIR();
    ir.entities = [
      entity('Event', [
        {
          name: 'guestCount',
          type: { name: 'int', nullable: false },
          modifiers: ['required'],
          defaultValue: { kind: 'number', value: 1 },
        },
        {
          name: 'deposit',
          type: { name: 'money', nullable: false },
          modifiers: ['required'],
          defaultValue: { kind: 'number', value: 0 },
        },
        {
          name: 'seatCounts',
          type: { name: 'array', nullable: false, generic: { name: 'int', nullable: false } },
          modifiers: ['required'],
          defaultValue: {
            kind: 'array',
            elements: [
              { kind: 'number', value: 2 },
              { kind: 'number', value: 4 },
            ],
          },
        },
      ]),
    ];
    ir.stores = [durable('Event')];
    ir.commands = [
      {
        name: 'create',
        entity: 'Event',
        parameters: [],
        guards: [],
        constraints: [],
        actions: [],
        emits: [],
      },
    ];
    const code = mutations(ir).artifacts[0].code;
    expect(code).toContain('guestCount: args.guestCount ?? 1'); // int → plain number (no bigint literal)
    expect(code).toContain('deposit: args.deposit ?? 0'); // money → plain number (no string transport)
    expect(code).toContain('seatCounts: args.seatCounts ?? [2, 4]'); // array<int> stays plain numbers
  });

  it('lowers a `= null` clear to `undefined` for a non-nullable field; keeps null when nullable', () => {
    const ir = emptyIR();
    ir.entities = [
      entity('Ticket', [
        prop('deletedAt', 'datetime'), // optional, NOT nullable → clear becomes unset
        prop('archivedAt', 'datetime', [], true), // nullable → a real null is valid, keep it
      ]),
    ];
    ir.stores = [durable('Ticket')];
    ir.commands = [
      {
        name: 'restore',
        entity: 'Ticket',
        parameters: [],
        guards: [],
        constraints: [],
        actions: [
          {
            kind: 'mutate',
            target: 'deletedAt',
            expression: { kind: 'literal', value: { kind: 'null' } },
          },
          {
            kind: 'mutate',
            target: 'archivedAt',
            expression: { kind: 'literal', value: { kind: 'null' } },
          },
        ],
        emits: [],
      },
    ];
    const code = mutations(ir).artifacts[0].code;
    expect(code).toContain('deletedAt: undefined'); // non-nullable clear → unset (Convex rejects null here)
    expect(code).toContain('archivedAt: null'); // nullable field keeps a real null
  });

  it('binds reaction payload to the runtime contract (result + _subject)', () => {
    const ir = emptyIR();
    ir.entities = [
      entity('Event', [prop('title', 'string', ['required'])]),
      entity('Board', [prop('sourceId', 'string', ['required'])]),
    ];
    ir.stores = [durable('Event'), durable('Board')];
    // Reaction reads payload.result.id — the reference-runtime binding the
    // projection previously omitted, crashing on `undefined.id` at runtime.
    ir.reactions = [
      {
        event: 'EventCreated',
        targetEntity: 'Board',
        targetCommand: 'create',
        resolve: { kind: 'literal', value: { kind: 'null' } },
        params: [
          {
            name: 'sourceId',
            expression: {
              kind: 'member',
              object: {
                kind: 'member',
                object: { kind: 'identifier', name: 'payload' },
                property: 'result',
              },
              property: 'id',
            },
          },
        ],
      },
    ] as IRReactionRule[];
    ir.commands = [
      {
        name: 'create',
        entity: 'Event',
        parameters: [{ name: 'title', type: { name: 'string', nullable: false }, required: true }],
        guards: [],
        constraints: [],
        actions: [],
        emits: ['EventCreated'],
      },
    ];
    const code = mutations(ir).artifacts[0].code;
    expect(code).toContain('result: { _id, id: _id, ...doc }'); // result.id aliases Convex _id
    expect(code).toContain('_subject: { entity: "Event", command: "create", id: _id }'); // canonical subject metadata
    expect(code).toContain('sourceId: payload.result.id'); // reaction reads through it, no crash
  });

  it('maps array-typed command params to v.array(...), not v.any()', () => {
    const ir = emptyIR();
    ir.entities = [entity('Event', [prop('title', 'string', ['required'])])];
    ir.stores = [durable('Event')];
    ir.commands = [
      {
        name: 'create',
        entity: 'Event',
        parameters: [
          {
            name: 'tags',
            type: { name: 'array', nullable: false, generic: { name: 'string', nullable: false } },
            required: false,
          },
        ],
        guards: [],
        constraints: [],
        actions: [],
        emits: [],
      },
    ];
    const code = mutations(ir).artifacts[0].code;
    expect(code).toContain('tags: v.optional(v.array(v.string()))'); // array param keeps its element type
    expect(code).not.toContain('v.any()');
  });

  it('threads source tenantId into tenant-scoped reaction creates', () => {
    const ir = emptyIR();
    ir.tenant = {
      property: 'tenantId',
      type: { name: 'string', nullable: false },
      contextPath: 'context.tenantId',
    };
    ir.entities = [
      entity('Event', [
        prop('tenantId', 'string', ['required']),
        prop('title', 'string', ['required']),
      ]),
      entity('Board', [
        prop('tenantId', 'string', ['required']),
        prop('name', 'string', ['required']),
      ]),
    ];
    ir.stores = [durable('Event'), durable('Board')];
    ir.reactions = [
      {
        event: 'EventCreated',
        targetEntity: 'Board',
        targetCommand: 'create',
        resolve: { kind: 'literal', value: { kind: 'null' } },
        params: [
          {
            name: 'name',
            expression: {
              kind: 'member',
              object: { kind: 'identifier', name: 'payload' },
              property: 'title',
            },
          },
        ],
      },
    ] as IRReactionRule[];
    ir.commands = [
      {
        name: 'create',
        entity: 'Event',
        parameters: [{ name: 'title', type: { name: 'string', nullable: false }, required: true }],
        guards: [],
        constraints: [],
        actions: [
          { kind: 'mutate', target: 'title', expression: { kind: 'identifier', name: 'title' } },
        ],
        emits: ['EventCreated'],
      },
    ];
    const code = mutations(ir).artifacts[0].code;
    // tenantId auto-threaded from the source event into the Board insert
    expect(code).toContain(
      'await ctx.db.insert("boards", { tenantId: payload.tenantId, name: payload.title } as any)',
    );
  });

  it('does not inject tenantId when the reaction target is not tenant-scoped', () => {
    const ir = emptyIR();
    ir.tenant = {
      property: 'tenantId',
      type: { name: 'string', nullable: false },
      contextPath: 'context.tenantId',
    };
    ir.entities = [
      entity('Event', [prop('tenantId', 'string', ['required'])]),
      entity('Log', [prop('msg', 'string', ['required'])]), // no tenantId
    ];
    ir.stores = [durable('Event'), durable('Log')];
    ir.reactions = [
      {
        event: 'EventCreated',
        targetEntity: 'Log',
        targetCommand: 'create',
        resolve: { kind: 'literal', value: { kind: 'null' } },
        params: [
          { name: 'msg', expression: { kind: 'literal', value: { kind: 'string', value: 'hi' } } },
        ],
      },
    ] as IRReactionRule[];
    ir.commands = [
      {
        name: 'create',
        entity: 'Event',
        parameters: [],
        guards: [],
        constraints: [],
        actions: [],
        emits: ['EventCreated'],
      },
    ];
    const code = mutations(ir).artifacts[0].code;
    expect(code).toContain('await ctx.db.insert("logs", { msg: "hi" } as any)');
    expect(code).not.toContain('tenantId: payload.tenantId');
  });

  it('completes non-create reactions (no TODO stubs) and emits event rows', () => {
    const ir = emptyIR();
    ir.entities = [
      entity('Event', [prop('title', 'string', ['required'])]),
      entity('Board', [prop('name', 'string', ['required'])]),
    ];
    ir.stores = [durable('Event'), durable('Board')];
    ir.reactions = [
      {
        event: 'EventCreated',
        targetEntity: 'Board',
        targetCommand: 'create',
        resolve: { kind: 'literal', value: { kind: 'null' } },
        params: [
          {
            name: 'name',
            expression: {
              kind: 'member',
              object: { kind: 'identifier', name: 'payload' },
              property: 'title',
            },
          },
        ],
      },
    ] as IRReactionRule[];
    ir.commands = [
      {
        name: 'create',
        entity: 'Event',
        parameters: [{ name: 'title', type: { name: 'string', nullable: false }, required: true }],
        guards: [],
        constraints: [],
        actions: [
          { kind: 'mutate', target: 'title', expression: { kind: 'identifier', name: 'title' } },
        ],
        emits: ['EventCreated'],
      },
    ];
    const code = mutations(ir).artifacts[0].code;
    expect(code).toContain('await ctx.db.insert("manifestEvents", {'); // event row (namespaced system table)
    expect(code).toContain('await ctx.db.insert("boards", { name: payload.title } as any)'); // reaction create with resolved param
    expect(code).not.toContain('TODO');
  });
});

describe('convex.mutations — G7 emit payloads (`emit Event { field: expr }`)', () => {
  it('populates the event-row payload with declared fields (create)', () => {
    const ir = emptyIR();
    ir.entities = [
      entity('Payment', [
        prop('invoiceId', 'string', ['required']),
        prop('amount', 'money', ['required']),
      ]),
    ];
    ir.stores = [durable('Payment')];
    ir.commands = [
      {
        name: 'create',
        entity: 'Payment',
        parameters: [],
        guards: [],
        constraints: [],
        actions: [],
        emits: ['PaymentProcessed'],
        emitPayloads: [
          {
            eventName: 'PaymentProcessed',
            fields: [
              {
                name: 'invoiceId',
                expression: {
                  kind: 'member',
                  object: { kind: 'identifier', name: 'self' },
                  property: 'invoiceId',
                },
              },
              {
                name: 'amount',
                expression: {
                  kind: 'member',
                  object: { kind: 'identifier', name: 'self' },
                  property: 'amount',
                },
              },
            ],
          },
        ],
      },
    ];
    const code = mutations(ir).artifacts[0].code;
    // event row now carries the declared payload (was `payload: {}` before G7)
    expect(code).toContain('payload: { invoiceId: doc.invoiceId, amount: doc.amount }');
  });

  it('exposes a computed declared field to a reaction (the middleware-collapse case)', () => {
    const ir = emptyIR();
    ir.entities = [
      entity('Line', [prop('qty', 'int', ['required']), prop('price', 'money', ['required'])]),
      entity('Summary', [prop('amount', 'money', ['required'])]),
    ];
    ir.stores = [durable('Line'), durable('Summary')];
    // `total` is NOT an entity field — it only exists because the command declares it.
    ir.reactions = [
      {
        event: 'LineCreated',
        targetEntity: 'Summary',
        targetCommand: 'create',
        resolve: { kind: 'literal', value: { kind: 'null' } },
        params: [
          {
            name: 'amount',
            expression: {
              kind: 'member',
              object: { kind: 'identifier', name: 'payload' },
              property: 'total',
            },
          },
        ],
      },
    ] as IRReactionRule[];
    ir.commands = [
      {
        name: 'create',
        entity: 'Line',
        parameters: [],
        guards: [],
        constraints: [],
        actions: [],
        emits: ['LineCreated'],
        emitPayloads: [
          {
            eventName: 'LineCreated',
            fields: [
              {
                name: 'total',
                expression: {
                  kind: 'binary',
                  operator: '*',
                  left: {
                    kind: 'member',
                    object: { kind: 'identifier', name: 'self' },
                    property: 'qty',
                  },
                  right: {
                    kind: 'member',
                    object: { kind: 'identifier', name: 'self' },
                    property: 'price',
                  },
                },
              },
            ],
          },
        ],
      },
    ];
    const code = mutations(ir).artifacts[0].code;
    // declared computed field lands in the shared reaction payload...
    expect(code).toContain('total: (doc.qty * doc.price)');
    // ...so the reaction reading payload.total resolves (no undefined no-op)
    expect(code).toContain('amount: payload.total');
  });

  it('evaluates G7 fields against the post-action instance on a mutate command (non-create)', () => {
    const ir = emptyIR();
    ir.entities = [entity('Counter', [prop('count', 'int', ['required'])])];
    ir.stores = [durable('Counter')];
    ir.commands = [
      {
        name: 'increment',
        entity: 'Counter',
        parameters: [{ name: 'by', type: { name: 'int', nullable: false }, required: true }],
        guards: [],
        constraints: [],
        actions: [
          {
            kind: 'mutate',
            target: 'count',
            expression: {
              kind: 'binary',
              operator: '+',
              left: {
                kind: 'member',
                object: { kind: 'identifier', name: 'self' },
                property: 'count',
              },
              right: { kind: 'identifier', name: 'by' },
            },
          },
        ],
        emits: ['Counted'],
        emitPayloads: [
          {
            eventName: 'Counted',
            fields: [
              {
                name: 'newCount',
                expression: {
                  kind: 'member',
                  object: { kind: 'identifier', name: 'self' },
                  property: 'count',
                },
              },
            ],
          },
        ],
      },
    ];
    const code = mutations(ir).artifacts[0].code;
    // __after holds the post-patch instance; G7 reads it (not the pre-patch doc)
    expect(code).toContain('const __after: Record<string, any> = { ...doc, ...updates };');
    expect(code).toContain('payload: { newCount: __after.count }');
  });

  it('maps self.id to docId and previousStatus to doc.status on mutate emits', () => {
    const ir = emptyIR();
    ir.entities = [entity('Task', [prop('status', 'string', ['required'])])];
    ir.stores = [durable('Task')];
    ir.commands = [
      {
        name: 'close',
        entity: 'Task',
        parameters: [],
        guards: [],
        constraints: [],
        actions: [
          {
            kind: 'mutate',
            target: 'status',
            expression: { kind: 'literal', value: { kind: 'string', value: 'done' } },
          },
        ],
        emits: ['TaskClosed'],
        emitPayloads: [
          {
            eventName: 'TaskClosed',
            fields: [
              {
                name: 'taskId',
                expression: {
                  kind: 'member',
                  object: { kind: 'identifier', name: 'self' },
                  property: 'id',
                },
              },
              {
                name: 'previousStatus',
                expression: {
                  kind: 'member',
                  object: { kind: 'identifier', name: 'self' },
                  property: 'previousStatus',
                },
              },
              {
                name: 'status',
                expression: {
                  kind: 'member',
                  object: { kind: 'identifier', name: 'self' },
                  property: 'status',
                },
              },
            ],
          },
        ],
      },
    ];
    const code = mutations(ir).artifacts[0].code;
    expect(code).toContain('taskId: docId');
    expect(code).toContain('previousStatus: doc.status');
    expect(code).toContain('status: __after.status');
    expect(code).not.toContain('__after.id');
    expect(code).not.toContain('__after.previousStatus');
  });

  it('populates bare emit payloads from event schema or result fallback (not empty {})', () => {
    const ir = emptyIR();
    ir.entities = [entity('Task', [prop('title', 'string', ['required'])])];
    ir.stores = [durable('Task')];
    ir.events = [
      {
        name: 'TaskCreated',
        channel: 'task.created',
        payload: [
          { name: 'taskId', type: { name: 'string', nullable: false }, required: true },
          { name: 'title', type: { name: 'string', nullable: false }, required: true },
        ],
      },
    ];
    ir.commands = [
      {
        name: 'create',
        entity: 'Task',
        parameters: [{ name: 'title', type: { name: 'string', nullable: false }, required: true }],
        guards: [],
        constraints: [],
        actions: [
          { kind: 'mutate', target: 'title', expression: { kind: 'identifier', name: 'title' } },
        ],
        emits: ['TaskCreated'],
      },
    ];
    const code = mutations(ir).artifacts[0].code;
    expect(code).toContain('payload: { taskId: _id, title: doc.title }');
    expect(code).not.toMatch(/type: "TaskCreated"[\s\S]*?payload: \{\}/);
  });

  it('uses result fallback when bare emit has no event schema fields', () => {
    const ir = emptyIR();
    ir.entities = [entity('Task', [prop('title', 'string', ['required'])])];
    ir.stores = [durable('Task')];
    ir.commands = [
      {
        name: 'create',
        entity: 'Task',
        parameters: [{ name: 'title', type: { name: 'string', nullable: false }, required: true }],
        guards: [],
        constraints: [],
        actions: [
          { kind: 'mutate', target: 'title', expression: { kind: 'identifier', name: 'title' } },
        ],
        emits: ['TaskCreated'],
      },
    ];
    const code = mutations(ir).artifacts[0].code;
    expect(code).toContain('payload: { result: { _id, id: _id, ...doc } }');
    expect(code).not.toContain('payload: {}');
  });

  it('does not emit duplicate result keys when G7 declares result (TS1117 collision)', () => {
    // Capsule Manifest-source: QualityCheck.pass / EventAllergenCheck.record emit
    // `result: …` while the reaction envelope also binds reserved `result`.
    const ir = emptyIR();
    ir.entities = [
      entity('QualityCheck', [
        prop('status', 'string', ['required']),
        prop('result', 'string'),
      ]),
      entity('Board', [prop('sourceId', 'string', ['required'])]),
    ];
    ir.stores = [durable('QualityCheck'), durable('Board')];
    ir.reactions = [
      {
        event: 'QualityCheckPassed',
        targetEntity: 'Board',
        targetCommand: 'create',
        resolve: { kind: 'literal', value: { kind: 'null' } },
        params: [
          {
            name: 'sourceId',
            expression: {
              kind: 'member',
              object: {
                kind: 'member',
                object: { kind: 'identifier', name: 'payload' },
                property: '_subject',
              },
              property: 'id',
            },
          },
        ],
      },
    ] as IRReactionRule[];
    ir.commands = [
      {
        name: 'pass',
        entity: 'QualityCheck',
        parameters: [],
        guards: [],
        constraints: [],
        actions: [
          {
            kind: 'mutate',
            target: 'result',
            expression: { kind: 'literal', value: { kind: 'string', value: 'pass' } },
          },
          {
            kind: 'mutate',
            target: 'status',
            expression: { kind: 'literal', value: { kind: 'string', value: 'passed' } },
          },
        ],
        emits: ['QualityCheckPassed'],
        emitPayloads: [
          {
            eventName: 'QualityCheckPassed',
            fields: [
              {
                name: 'result',
                expression: { kind: 'literal', value: { kind: 'string', value: 'pass' } },
              },
              {
                name: 'status',
                expression: { kind: 'literal', value: { kind: 'string', value: 'passed' } },
              },
            ],
          },
        ],
      },
    ];
    const generated = mutations(ir);
    const code = generated.artifacts[0].code;
    const payloadLines = code.split('\n').filter((l) => l.includes('const payload:'));
    expect(payloadLines.length).toBeGreaterThan(0);
    for (const line of payloadLines) {
      const resultKeys = line.match(/\bresult:/g) ?? [];
      expect(resultKeys.length).toBe(1); // business G7 result only — no TS1117
    }
    expect(code).toContain('result: "pass"'); // domain field kept (not renamed)
    expect(code).not.toContain('result: { id: docId, ...__after }'); // envelope omitted on collision
    expect(code).toContain('_subject:'); // entity identity preserved
    expect(
      generated.diagnostics.some(
        (d) => d.code === 'CONVEX_PAYLOAD_FIELD_COLLISION' && d.message.includes('result'),
      ),
    ).toBe(true);
  });
});

describe('convex.mutations — fan-out reactions (`on E fanOut T where f = self.x run cmd`)', () => {
  it('renders an indexed query + per-row runMutation loop for a fan-out reaction', () => {
    const ir = emptyIR();
    ir.entities = [
      entity('Parent', [prop('status', 'string', ['required'])]),
      entity(
        'Child',
        [prop('parentId', 'string', ['required']), prop('status', 'string', ['required'])],
        [
          {
            name: 'parent',
            kind: 'belongsTo',
            target: 'Parent',
            foreignKey: { fields: ['parentId'] },
          },
        ],
      ),
    ];
    ir.stores = [durable('Parent'), durable('Child')];
    ir.commands = [
      {
        name: 'deactivate',
        entity: 'Parent',
        parameters: [],
        guards: [],
        constraints: [],
        actions: [
          {
            kind: 'mutate',
            target: 'status',
            expression: { kind: 'literal', value: { kind: 'string', value: 'inactive' } },
          },
        ],
        emits: ['ParentDeactivated'],
      },
      {
        name: 'deactivate',
        entity: 'Child',
        parameters: [],
        guards: [],
        constraints: [],
        actions: [
          {
            kind: 'mutate',
            target: 'status',
            expression: { kind: 'literal', value: { kind: 'string', value: 'inactive' } },
          },
        ],
        emits: [],
      },
    ];
    ir.reactions = [
      {
        event: 'ParentDeactivated',
        targetEntity: 'Child',
        targetCommand: 'deactivate',
        fanOut: {
          matchField: 'parentId',
          matchSource: {
            kind: 'member',
            object: { kind: 'identifier', name: 'self' },
            property: 'id',
          },
        },
      },
    ] as IRReactionRule[];
    const code = mutations(ir).artifacts[0].code;
    // the sibling-mutation dispatch import is emitted only when runMutation is used
    expect(code).toContain('import { api } from "./_generated/api";');
    // indexed FK field → withIndex by_parentId; matchSource self.id → payload.id
    expect(code).toContain('withIndex("by_parentId", (q) => q.eq("parentId", payload.id))');
    // per-match governed dispatch (target's own mutation, with its docId)
    expect(code).toContain('for (const __row of fanRows0) {');
    expect(code).toContain(
      'ctx.runMutation(api.mutations.Child_deactivate, { docId: (__row as any)._id }',
    );
    // a fan-out reaction must NOT render the single-target resolve/patch path
    expect(code).not.toContain('reactionTarget0');
  });

  it('renders a fallback filter (not withIndex) when the match field is not indexed', () => {
    const ir = emptyIR();
    ir.entities = [
      entity('Parent', [prop('status', 'string', ['required'])]),
      entity('Child', [prop('owner', 'string', ['required'])]), // 'owner' is not indexed / not an FK
    ];
    ir.stores = [durable('Parent'), durable('Child')];
    ir.commands = [
      {
        name: 'deactivate',
        entity: 'Parent',
        parameters: [],
        guards: [],
        constraints: [],
        actions: [
          {
            kind: 'mutate',
            target: 'status',
            expression: { kind: 'literal', value: { kind: 'string', value: 'inactive' } },
          },
        ],
        emits: ['ParentDeactivated'],
      },
    ];
    ir.reactions = [
      {
        event: 'ParentDeactivated',
        targetEntity: 'Child',
        targetCommand: 'deactivate',
        fanOut: {
          matchField: 'owner',
          matchSource: {
            kind: 'member',
            object: { kind: 'identifier', name: 'self' },
            property: 'id',
          },
        },
      },
    ] as IRReactionRule[];
    const res = mutations(ir);
    const code = res.artifacts[0].code;
    expect(code).toContain('.filter((q) => q.eq(q.field("owner"), payload.id))');
    expect(code).not.toContain('withIndex("by_owner"');
    expect(res.diagnostics.some((d) => d.code === 'CONVEX_FANOUT_UNINDEXED')).toBe(true);
  });
});

describe('convex.mutations — aggregate count reactions (`count(E where fk == v, ...)`)', () => {
  it('renders an indexed count + JS filters for remaining predicates, bound to the param (prep-task-station-count shape)', () => {
    const ir = emptyIR();
    ir.entities = [
      entity('Station', [prop('currentTaskCount', 'number')]),
      entity(
        'PrepTask',
        [prop('stationId', 'string', ['required']), prop('status', 'string', ['required'])],
        [
          {
            name: 'station',
            kind: 'belongsTo',
            target: 'Station',
            foreignKey: { fields: ['stationId'] },
          },
        ],
      ),
    ];
    ir.stores = [durable('Station'), durable('PrepTask')];
    ir.commands = [
      {
        name: 'claim',
        entity: 'PrepTask',
        parameters: [],
        guards: [],
        constraints: [],
        actions: [
          {
            kind: 'mutate',
            target: 'status',
            expression: { kind: 'literal', value: { kind: 'string', value: 'in_progress' } },
          },
        ],
        emits: ['PrepTaskClaimed'],
      },
    ];
    ir.reactions = [
      {
        event: 'PrepTaskClaimed',
        targetEntity: 'Station',
        targetCommand: 'syncTaskCount',
        resolve: {
          kind: 'member',
          object: { kind: 'identifier', name: 'self' },
          property: 'stationId',
        },
        params: [
          {
            name: 'currentTaskCount',
            expression: {
              kind: 'aggregate',
              op: 'count',
              entity: 'PrepTask',
              predicates: [
                {
                  field: 'stationId',
                  value: {
                    kind: 'member',
                    object: { kind: 'identifier', name: 'self' },
                    property: 'stationId',
                  },
                },
                {
                  field: 'status',
                  value: { kind: 'literal', value: { kind: 'string', value: 'in_progress' } },
                },
              ],
            },
          },
        ],
      },
    ] as IRReactionRule[];
    const code = mutations(ir).artifacts[0].code;
    // FK predicate (stationId) drives the index; self.stationId → doc.stationId (single-target scope)
    expect(code).toContain('withIndex("by_stationId", (q) => q.eq("stationId", doc.stationId))');
    // remaining equality predicate (status) applied as a JS filter, then counted
    expect(code).toContain('.filter((d) => (d as any).status === "in_progress")');
    expect(code).toContain('.length;');
    // the count variable is bound to the reaction param and patched onto the parent
    expect(code).toContain('currentTaskCount: __count0');
    expect(code).toContain(
      'ctx.db.patch(reactionTarget0 as any, { currentTaskCount: __count0 } as any)',
    );
  });

  it('renders a single-predicate indexed count (schedule-shift-count shape)', () => {
    const ir = emptyIR();
    ir.entities = [
      entity('Schedule', [prop('shiftCount', 'number')]),
      entity(
        'ScheduleShift',
        [prop('scheduleId', 'string', ['required'])],
        [
          {
            name: 'schedule',
            kind: 'belongsTo',
            target: 'Schedule',
            foreignKey: { fields: ['scheduleId'] },
          },
        ],
      ),
    ];
    ir.stores = [durable('Schedule'), durable('ScheduleShift')];
    ir.commands = [
      {
        name: 'assign',
        entity: 'ScheduleShift',
        parameters: [],
        guards: [],
        constraints: [],
        actions: [],
        emits: ['ScheduleShiftCreated'],
      },
    ];
    ir.reactions = [
      {
        event: 'ScheduleShiftCreated',
        targetEntity: 'Schedule',
        targetCommand: 'syncShiftCount',
        resolve: {
          kind: 'member',
          object: { kind: 'identifier', name: 'self' },
          property: 'scheduleId',
        },
        params: [
          {
            name: 'shiftCount',
            expression: {
              kind: 'aggregate',
              op: 'count',
              entity: 'ScheduleShift',
              predicates: [
                {
                  field: 'scheduleId',
                  value: {
                    kind: 'member',
                    object: { kind: 'identifier', name: 'self' },
                    property: 'scheduleId',
                  },
                },
              ],
            },
          },
        ],
      },
    ] as IRReactionRule[];
    const code = mutations(ir).artifacts[0].code;
    expect(code).toContain('withIndex("by_scheduleId", (q) => q.eq("scheduleId", doc.scheduleId))');
    // single predicate → no extra filter chain, just .length
    expect(code).toContain('__count0_rows.length;');
    expect(code).toContain('shiftCount: __count0');
  });

  it('renders a table scan + diagnostic when no predicate field is indexed', () => {
    const ir = emptyIR();
    ir.entities = [
      entity('Owner', [prop('tally', 'number')]),
      entity('Thing', [prop('bucket', 'string', ['required'])]), // 'bucket' is not indexed / not an FK
    ];
    ir.stores = [durable('Owner'), durable('Thing')];
    ir.commands = [
      {
        name: 'ping',
        entity: 'Thing',
        parameters: [],
        guards: [],
        constraints: [],
        actions: [],
        emits: ['ThingPinged'],
      },
    ];
    ir.reactions = [
      {
        event: 'ThingPinged',
        targetEntity: 'Owner',
        targetCommand: 'syncTally',
        resolve: {
          kind: 'member',
          object: { kind: 'identifier', name: 'self' },
          property: 'bucket',
        },
        params: [
          {
            name: 'tally',
            expression: {
              kind: 'aggregate',
              op: 'count',
              entity: 'Thing',
              predicates: [
                {
                  field: 'bucket',
                  value: {
                    kind: 'member',
                    object: { kind: 'identifier', name: 'self' },
                    property: 'bucket',
                  },
                },
              ],
            },
          },
        ],
      },
    ] as IRReactionRule[];
    const res = mutations(ir);
    const code = res.artifacts[0].code;
    // no index → plain query (no withIndex), predicate applied as a JS filter
    expect(code).not.toContain('withIndex(');
    expect(code).toContain('.filter((d) => (d as any).bucket === doc.bucket)');
    expect(res.diagnostics.some((d) => d.code === 'CONVEX_AGGREGATE_UNINDEXED')).toBe(true);
  });
});
