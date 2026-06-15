/**
 * Convex functions surfaces (queries + mutations) — unit tests.
 */

import { describe, it, expect } from 'vitest';
import type { IR, IREntity, IRStore, IRProperty, IRCommand, IRPolicy, IRReactionRule } from '../../ir';
import { ConvexProjection } from './generator.js';

function emptyIR(): IR {
  return {
    version: '1.0',
    provenance: { contentHash: 'h', compilerVersion: 'test', schemaVersion: '1.0', compiledAt: '2025-01-01T00:00:00.000Z' },
    modules: [], values: [], entities: [], enums: [], stores: [], events: [], commands: [], policies: [],
  };
}
function durable(name: string): IRStore { return { entity: name, target: 'durable', config: {} }; }
function prop(name: string, typeName: string, modifiers: IRProperty['modifiers'] = [], nullable = false): IRProperty {
  return { name, type: { name: typeName, nullable }, modifiers };
}
function entity(name: string, props: IRProperty[], rels: IREntity['relationships'] = []): IREntity {
  return { name, properties: props, computedProperties: [], relationships: rels, commands: [], constraints: [], policies: [] };
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
      entity('Order', [prop('sku', 'string', ['required', 'indexed'])], [{ name: 'customer', kind: 'belongsTo', target: 'Customer', foreignKey: { fields: ['customerId'] } }]),
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
});

describe('convex.mutations — governance', () => {
  function govIR(): IR {
    const ir = emptyIR();
    ir.roles = [{ name: 'Admin', allow: [], deny: [], effectivePermissions: [{ action: 'manageAccess' }, { action: 'all' }] }];
    ir.policies = [{ name: 'canManage', action: 'execute', expression: { kind: 'call', callee: { kind: 'identifier', name: 'roleAllows' }, args: [{ kind: 'member', object: { kind: 'identifier', name: 'user' }, property: 'role' }, { kind: 'literal', value: { kind: 'string', value: 'manageAccess' } }] } }] as IRPolicy[];
    ir.entities = [entity('Task', [prop('status', 'string', ['required'])])];
    ir.stores = [durable('Task')];
    const close: IRCommand = {
      name: 'close', entity: 'Task', parameters: [],
      policies: ['canManage'],
      guards: [{ kind: 'binary', operator: '==', left: { kind: 'member', object: { kind: 'identifier', name: 'self' }, property: 'status' }, right: { kind: 'literal', value: { kind: 'string', value: 'open' } } }],
      constraints: [],
      actions: [{ kind: 'mutate', target: 'status', expression: { kind: 'literal', value: { kind: 'string', value: 'closed' } } }],
      emits: [],
    };
    ir.commands = [close];
    return ir;
  }

  it('emits the role map + checkRole helper', () => {
    const code = mutations(govIR()).artifacts[0].code;
    expect(code).toContain('const ROLE_PERMISSIONS');
    expect(code).toContain('"Admin"');
    expect(code).toContain('function checkRole(');
  });

  it('renders policy → guard order, binds user, patches the action', () => {
    const code = mutations(govIR()).artifacts[0].code;
    expect(code).toContain('export const Task_close = mutation({');
    expect(code).toContain('docId: v.id("tasks")');
    expect(code).toContain('const userRole = (ctx as any).auth?.role ?? "anonymous";');
    expect(code).toContain('checkRole(userRole, "manageAccess")'); // policy
    expect(code).toContain('if (!((doc.status === "open")))'); // guard
    expect(code).toContain('status: "closed"'); // action
    expect(code).toContain('await ctx.db.patch(docId, updates)');
    // policy precedes guard
    expect(code.indexOf('checkRole(userRole')).toBeLessThan(code.indexOf('doc.status === "open"'));
  });

  it('fails CLOSED on an unresolvable guard (throws + diagnostic, never passes)', () => {
    const ir = govIR();
    // a lambda guard the resolver cannot map
    ir.commands[0].guards = [{ kind: 'lambda', params: ['x'], body: { kind: 'literal', value: { kind: 'boolean', value: true } } }];
    const res = mutations(ir);
    expect(res.diagnostics.some(d => d.code === 'CONVEX_UNRESOLVED_GUARD')).toBe(true);
    expect(res.artifacts[0].code).toContain('unresolved — denied'); // denying throw, not a pass
  });
});

describe('convex.mutations — create (param-style) & reactions', () => {
  it('maps command parameters to fields via mutate actions', () => {
    const ir = emptyIR();
    ir.entities = [entity('Recipe', [prop('yieldQuantity', 'int', ['required'])])];
    ir.stores = [durable('Recipe')];
    ir.commands = [{
      name: 'create', entity: 'Recipe',
      parameters: [{ name: 'yieldQty', type: { name: 'int', nullable: false }, required: true }],
      guards: [{ kind: 'binary', operator: '>', left: { kind: 'identifier', name: 'yieldQty' }, right: { kind: 'literal', value: { kind: 'number', value: 0 } } }],
      constraints: [],
      actions: [{ kind: 'mutate', target: 'yieldQuantity', expression: { kind: 'identifier', name: 'yieldQty' } }],
      emits: [],
    }];
    const code = mutations(ir).artifacts[0].code;
    expect(code).toContain('export const Recipe_create = mutation({');
    expect(code).toContain('yieldQty: v.int64()'); // arg is the PARAM
    expect(code).toContain('(args.yieldQty > 0)'); // guard against param
    expect(code).toContain('yieldQuantity: args.yieldQty'); // action maps param→field
  });

  it('completes non-create reactions (no TODO stubs) and emits event rows', () => {
    const ir = emptyIR();
    ir.entities = [entity('Event', [prop('title', 'string', ['required'])]), entity('Board', [prop('name', 'string', ['required'])])];
    ir.stores = [durable('Event'), durable('Board')];
    ir.reactions = [{ event: 'EventCreated', targetEntity: 'Board', targetCommand: 'create', resolve: { kind: 'literal', value: { kind: 'null' } }, params: [{ name: 'name', expression: { kind: 'member', object: { kind: 'identifier', name: 'payload' }, property: 'title' } }] }] as IRReactionRule[];
    ir.commands = [{ name: 'create', entity: 'Event', parameters: [{ name: 'title', type: { name: 'string', nullable: false }, required: true }], guards: [], constraints: [], actions: [{ kind: 'mutate', target: 'title', expression: { kind: 'identifier', name: 'title' } }], emits: ['EventCreated'] }];
    const code = mutations(ir).artifacts[0].code;
    expect(code).toContain('await ctx.db.insert("events", {'); // event row
    expect(code).toContain('await ctx.db.insert("boards", { name: payload.title })'); // reaction create with resolved param
    expect(code).not.toContain('TODO');
  });
});
