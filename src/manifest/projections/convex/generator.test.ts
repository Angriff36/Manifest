/**
 * Convex projection — generic-fixture tests.
 *
 * Every fixture is generic by construction: no real-app entity, table, tenant,
 * or column name appears here. Fixtures are hand-built IR object literals so the
 * projection's input contract is exercised in isolation.
 */

import { describe, it, expect } from 'vitest';
import type { IR, IREntity, IREnum, IRStore, IRRelationship, IRProperty } from '../../ir';
import { ConvexProjection } from './generator.js';

// ---------------------------------------------------------------------------
// Generic-fixture builders
// ---------------------------------------------------------------------------

function emptyIR(): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'test-fixture-hash',
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

function durableStore(entityName: string): IRStore {
  return { entity: entityName, target: 'durable', config: {} };
}
function memoryStore(entityName: string): IRStore {
  return { entity: entityName, target: 'memory', config: {} };
}

function entity(
  name: string,
  opts: {
    properties?: IRProperty[];
    relationships?: IRRelationship[];
    computedProperties?: IREntity['computedProperties'];
    external?: boolean;
  } = {},
): IREntity {
  return {
    name,
    properties: opts.properties ?? [],
    computedProperties: opts.computedProperties ?? [],
    relationships: opts.relationships ?? [],
    commands: [],
    constraints: [],
    policies: [],
    ...(opts.external ? { external: true } : {}),
  } as IREntity;
}

function prop(name: string, typeName: string, modifiers: IRProperty['modifiers'] = [], nullable = false): IRProperty {
  return { name, type: { name: typeName, nullable }, modifiers };
}

function generate(ir: IR, options?: Record<string, unknown>) {
  return new ConvexProjection().generate(ir, { surface: 'convex.schema', options });
}
function schemaCode(ir: IR, options?: Record<string, unknown>): string {
  return generate(ir, options).artifacts[0].code;
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe('ConvexProjection — metadata', () => {
  it('declares name and the convex.schema surface', () => {
    const p = new ConvexProjection();
    expect(p.name).toBe('convex');
    expect(p.surfaces).toContain('convex.schema');
  });

  it('returns an info diagnostic for unsupported surfaces', () => {
    const res = new ConvexProjection().generate(emptyIR(), { surface: 'convex.functions' });
    expect(res.artifacts).toHaveLength(0);
    expect(res.diagnostics[0].code).toBe('CONVEX_UNSUPPORTED_SURFACE');
  });
});

// ---------------------------------------------------------------------------
// Scaffolding & filtering
// ---------------------------------------------------------------------------

describe('ConvexProjection — emission scaffolding', () => {
  it('emits the Convex imports and defineSchema wrapper', () => {
    const ir = emptyIR();
    ir.entities = [entity('Widget', { properties: [prop('name', 'string', ['required'])] })];
    ir.stores = [durableStore('Widget')];
    const code = schemaCode(ir);
    expect(code).toContain('import { defineSchema, defineTable } from "convex/server";');
    expect(code).toContain('import { v } from "convex/values";');
    expect(code).toContain('export default defineSchema({');
  });

  it('warns and emits an empty schema when there are no persistent entities', () => {
    const res = generate(emptyIR());
    expect(res.diagnostics.some(d => d.code === 'CONVEX_EMPTY_SCHEMA')).toBe(true);
    expect(res.artifacts[0].code).toContain('export default defineSchema({');
  });

  it('skips memory-store, storeless, and external entities', () => {
    const ir = emptyIR();
    ir.entities = [
      entity('Durable', { properties: [prop('a', 'string', ['required'])] }),
      entity('Mem', { properties: [prop('a', 'string', ['required'])] }),
      entity('Storeless', { properties: [prop('a', 'string', ['required'])] }),
      entity('Ext', { properties: [prop('a', 'string', ['required'])], external: true }),
    ];
    ir.stores = [durableStore('Durable'), memoryStore('Mem'), durableStore('Ext')];
    const code = schemaCode(ir);
    expect(code).toContain('durables: defineTable');
    expect(code).not.toContain('mems:');
    expect(code).not.toContain('storeless');
    expect(code).not.toContain('exts:');
  });
});

// ---------------------------------------------------------------------------
// Type mapping
// ---------------------------------------------------------------------------

describe('ConvexProjection — type mapping', () => {
  function oneFieldSchema(typeName: string, opts?: Record<string, unknown>): string {
    const ir = emptyIR();
    ir.entities = [entity('T', { properties: [prop('f', typeName, ['required'])] })];
    ir.stores = [durableStore('T')];
    return schemaCode(ir, opts);
  }

  it('maps all numeric types to v.number() (runtime treats them as JS numbers)', () => {
    expect(oneFieldSchema('int')).toContain('f: v.number()');
    expect(oneFieldSchema('bigint')).toContain('f: v.number()');
    expect(oneFieldSchema('float')).toContain('f: v.number()');
    expect(oneFieldSchema('decimal')).toContain('f: v.number()');
    expect(oneFieldSchema('money')).toContain('f: v.number()');
  });

  it('lets a per-property typeMappings override opt back into lossless transport', () => {
    expect(oneFieldSchema('money', { typeMappings: { T: { f: 'v.string()' } } })).toContain('f: v.string()');
    expect(oneFieldSchema('bigint', { typeMappings: { T: { f: 'v.int64()' } } })).toContain('f: v.int64()');
  });

  it('maps temporal types to v.number() (epoch ms)', () => {
    expect(oneFieldSchema('datetime')).toContain('f: v.number()');
    expect(oneFieldSchema('date')).toContain('f: v.number()');
  });

  it('maps json to v.any() and bytes to v.bytes()', () => {
    expect(oneFieldSchema('json')).toContain('f: v.any()');
    expect(oneFieldSchema('bytes')).toContain('f: v.bytes()');
  });

  it('hard-errors on bare number (ambiguous)', () => {
    const ir = emptyIR();
    ir.entities = [entity('T', { properties: [prop('f', 'number', ['required'])] })];
    ir.stores = [durableStore('T')];
    const res = generate(ir);
    expect(res.diagnostics.some(d => d.code === 'CONVEX_AMBIGUOUS_NUMBER')).toBe(true);
  });

  it('hard-errors on unknown type with no override', () => {
    const ir = emptyIR();
    ir.entities = [entity('T', { properties: [prop('f', 'mystery', ['required'])] })];
    ir.stores = [durableStore('T')];
    const res = generate(ir);
    expect(res.diagnostics.some(d => d.code === 'CONVEX_UNKNOWN_TYPE')).toBe(true);
  });

  it('honors a per-property typeMappings override', () => {
    const code = oneFieldSchema('money', { typeMappings: { T: { f: 'v.number()' } } });
    expect(code).toContain('f: v.number()');
  });

  it('wraps array<T> in v.array(...)', () => {
    const ir = emptyIR();
    ir.entities = [entity('T', {
      properties: [{ name: 'tags', type: { name: 'array', nullable: false, generic: { name: 'string', nullable: false } }, modifiers: ['required'] }],
    })];
    ir.stores = [durableStore('T')];
    expect(schemaCode(ir)).toContain('tags: v.array(v.string())');
  });
});

// ---------------------------------------------------------------------------
// Modifiers, nullability, computed exclusion, id
// ---------------------------------------------------------------------------

describe('ConvexProjection — modifiers and identity', () => {
  it('wraps non-required fields in v.optional()', () => {
    const ir = emptyIR();
    ir.entities = [entity('T', { properties: [prop('a', 'string', ['required']), prop('b', 'string', [])] })];
    ir.stores = [durableStore('T')];
    const code = schemaCode(ir);
    expect(code).toContain('a: v.string()');
    expect(code).toContain('b: v.optional(v.string())');
  });

  it('unions nullable fields with v.null()', () => {
    const ir = emptyIR();
    ir.entities = [entity('T', { properties: [prop('a', 'string', ['required'], true)] })];
    ir.stores = [durableStore('T')];
    expect(schemaCode(ir)).toContain('a: v.union(v.string(), v.null())');
  });

  it('drops the IR id property (Convex _id is identity)', () => {
    const ir = emptyIR();
    ir.entities = [entity('T', { properties: [prop('id', 'string', ['required']), prop('name', 'string', ['required'])] })];
    ir.stores = [durableStore('T')];
    const code = schemaCode(ir);
    expect(code).not.toMatch(/\bid: v\./);
    expect(code).toContain('name: v.string()');
  });

  it('never emits computed properties as fields', () => {
    const ir = emptyIR();
    const e = entity('T', { properties: [prop('a', 'int', ['required'])] });
    e.computedProperties = [{ name: 'derived', type: { name: 'int', nullable: false }, expression: { kind: 'identifier', name: 'a' }, dependencies: ['a'] }];
    ir.entities = [e];
    ir.stores = [durableStore('T')];
    expect(schemaCode(ir)).not.toContain('derived');
  });
});

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

describe('ConvexProjection — enums', () => {
  function enumIR(values: IREnum['values']): IR {
    const ir = emptyIR();
    ir.enums = [{ name: 'Status', values }];
    ir.entities = [entity('T', { properties: [prop('status', 'Status', ['required'])] })];
    ir.stores = [durableStore('T')];
    return ir;
  }

  it('emits a v.union of v.literal for multi-value enums (object form)', () => {
    const code = schemaCode(enumIR([{ name: 'draft' }, { name: 'live' }]));
    expect(code).toContain('status: v.union(v.literal("draft"), v.literal("live"))');
  });

  it('handles the string-array enum form', () => {
    const code = schemaCode(enumIR(['a', 'b'] as unknown as IREnum['values']));
    expect(code).toContain('status: v.union(v.literal("a"), v.literal("b"))');
  });

  it('emits a single v.literal for a one-value enum', () => {
    const code = schemaCode(enumIR([{ name: 'only' }]));
    expect(code).toContain('status: v.literal("only")');
  });

  it('flattens enum + nullable into one union with v.null()', () => {
    const ir = emptyIR();
    ir.enums = [{ name: 'Status', values: [{ name: 'a' }] }];
    ir.entities = [entity('T', { properties: [prop('status', 'Status', ['required'], true)] })];
    ir.stores = [durableStore('T')];
    expect(schemaCode(ir)).toContain('status: v.union(v.literal("a"), v.null())');
  });
});

// ---------------------------------------------------------------------------
// References & indexes
// ---------------------------------------------------------------------------

describe('ConvexProjection — references and indexes', () => {
  it('emits v.id(targetTable) for belongsTo using the non-tenant FK column', () => {
    const ir = emptyIR();
    ir.tenant = { property: 'tenantId', type: { name: 'string', nullable: false }, contextPath: 'context.tenantId' };
    ir.entities = [
      entity('Child', {
        properties: [prop('tenantId', 'string', ['required'])],
        relationships: [{ name: 'parent', kind: 'belongsTo', target: 'Parent', foreignKey: { fields: ['tenantId', 'parentId'], references: ['tenantId', 'id'] } }],
      }),
      entity('Parent', { properties: [prop('name', 'string', ['required'])] }),
    ];
    ir.stores = [durableStore('Child'), durableStore('Parent')];
    const code = schemaCode(ir);
    expect(code).toContain('parentId: v.optional(v.id("parents"))');
    expect(code).toContain('.index("by_parentId", ["parentId"])');
  });

  it('retypes an explicit FK-column property to v.id(targetTable) in convexId mode', () => {
    const ir = emptyIR();
    ir.tenant = { property: 'tenantId', type: { name: 'string', nullable: false }, contextPath: 'context.tenantId' };
    ir.entities = [
      entity('Child', {
        // FK column declared as an explicit string property (capsule's IR shape)
        properties: [prop('tenantId', 'string', ['required']), prop('parentId', 'uuid', ['required'])],
        relationships: [{ name: 'parent', kind: 'belongsTo', target: 'Parent', foreignKey: { fields: ['tenantId', 'parentId'], references: ['tenantId', 'id'] } }],
      }),
      entity('Parent', { properties: [prop('name', 'string', ['required'])] }),
    ];
    ir.stores = [durableStore('Child'), durableStore('Parent')];
    const code = schemaCode(ir);
    // property is retyped to a typed reference, not a bare string
    expect(code).toContain('parentId: v.id("parents")');
    expect(code).not.toContain('parentId: v.string()');
    expect(code).toContain('.index("by_parentId", ["parentId"])');
  });

  it('keeps FK-column properties as their scalar type under stringId mode', () => {
    const ir = emptyIR();
    ir.entities = [
      entity('Child', {
        properties: [prop('parentId', 'uuid', ['required'])],
        relationships: [{ name: 'parent', kind: 'belongsTo', target: 'Parent', foreignKey: { fields: ['parentId'] } }],
      }),
      entity('Parent', { properties: [prop('name', 'string', ['required'])] }),
    ];
    ir.stores = [durableStore('Child'), durableStore('Parent')];
    const code = schemaCode(ir, { referenceMode: 'stringId' });
    expect(code).toContain('parentId: v.string()');
    expect(code).not.toContain('v.id(');
  });

  it('emits v.string() references under referenceMode stringId', () => {
    const ir = emptyIR();
    ir.entities = [
      entity('Child', { relationships: [{ name: 'parent', kind: 'ref', target: 'Parent', foreignKey: { fields: ['parentId'] } }] }),
      entity('Parent', { properties: [prop('name', 'string', ['required'])] }),
    ];
    ir.stores = [durableStore('Child'), durableStore('Parent')];
    const code = schemaCode(ir, { referenceMode: 'stringId' });
    expect(code).toContain('parentId: v.optional(v.string())');
  });

  it('emits a by_<col> index for indexed properties and the tenant column', () => {
    const ir = emptyIR();
    ir.tenant = { property: 'tenantId', type: { name: 'string', nullable: false }, contextPath: 'context.tenantId' };
    ir.entities = [entity('T', { properties: [prop('tenantId', 'string', ['required']), prop('sku', 'string', ['required', 'indexed'])] })];
    ir.stores = [durableStore('T')];
    const code = schemaCode(ir);
    expect(code).toContain('.index("by_sku", ["sku"])');
    expect(code).toContain('.index("by_tenantId", ["tenantId"])');
  });

  it('emits consumer-supplied composite indexes and an info diag for referential actions', () => {
    const ir = emptyIR();
    ir.entities = [
      entity('Child', { properties: [prop('a', 'string', ['required'])], relationships: [{ name: 'parent', kind: 'belongsTo', target: 'Parent', foreignKey: { fields: ['parentId'] }, onDelete: 'cascade' }] }),
      entity('Parent', { properties: [prop('name', 'string', ['required'])] }),
    ];
    ir.stores = [durableStore('Child'), durableStore('Parent')];
    const res = generate(ir, { indexes: { Child: [['a', 'parentId']] } });
    expect(res.artifacts[0].code).toContain('.index("by_a_parentId", ["a", "parentId"])');
    expect(res.diagnostics.some(d => d.code === 'CONVEX_REFERENTIAL_ACTION_DEFERRED')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Naming & determinism
// ---------------------------------------------------------------------------

describe('ConvexProjection — naming and determinism', () => {
  it('defaults table names to camelCase + pluralized (Convex idiom)', () => {
    const ir = emptyIR();
    ir.entities = [entity('CateringEvent', { properties: [prop('a', 'string', ['required'])] }), entity('Dish', { properties: [prop('a', 'string', ['required'])] })];
    ir.stores = [durableStore('CateringEvent'), durableStore('Dish')];
    const code = schemaCode(ir);
    expect(code).toContain('cateringEvents: defineTable');
    expect(code).toContain('dishes: defineTable');
  });

  it('honors tableMappings overrides', () => {
    const ir = emptyIR();
    ir.entities = [entity('CateringEvent', { properties: [prop('a', 'string', ['required'])] })];
    ir.stores = [durableStore('CateringEvent')];
    expect(schemaCode(ir, { tableMappings: { CateringEvent: 'events' } })).toContain('events: defineTable');
  });

  it('is deterministic: identical input → byte-identical output', () => {
    const build = () => {
      const ir = emptyIR();
      ir.entities = [entity('T', { properties: [prop('a', 'string', ['required']), prop('b', 'int', [])] })];
      ir.stores = [durableStore('T')];
      return schemaCode(ir);
    };
    expect(build()).toBe(build());
  });
});
