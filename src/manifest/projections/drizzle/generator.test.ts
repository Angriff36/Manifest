/**
 * @manifest/projection-drizzle — generic-fixture tests.
 *
 * EVERY fixture here is generic by construction. No real-app entity, table,
 * or column name appears in this file. That is the evidence that the
 * package carries no app-specific knowledge.
 *
 * Fixtures are hand-built IR object literals so the projection's true input
 * contract is exercised in isolation.
 */

import { describe, it, expect } from 'vitest';
import type { IR, IREntity, IRStore } from '../../ir';
import { DrizzleProjection } from './generator.js';

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

function widgetEntity(): IREntity {
  return {
    name: 'Widget',
    properties: [
      { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      { name: 'name', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      { name: 'qty', type: { name: 'int', nullable: false }, modifiers: [] },
    ],
    computedProperties: [],
    relationships: [],
    commands: [],
    constraints: [],
    policies: [],
  };
}

function durableStore(entityName: string): IRStore {
  return { entity: entityName, target: 'durable', config: {} };
}

function memoryStore(entityName: string): IRStore {
  return { entity: entityName, target: 'memory', config: {} };
}

function bareEntity(
  name: string,
  extras: { properties?: IREntity['properties']; relationships?: IREntity['relationships'] } = {},
): IREntity {
  return {
    name,
    properties: [
      { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      ...(extras.properties ?? []),
    ],
    computedProperties: [],
    relationships: extras.relationships ?? [],
    commands: [],
    constraints: [],
    policies: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DrizzleProjection — projection target metadata', () => {
  it('declares the expected name, description and surfaces', () => {
    const p = new DrizzleProjection();
    expect(p.name).toBe('drizzle');
    expect(p.surfaces).toEqual(['drizzle.schema']);
    expect(p.description).toMatch(/Drizzle/);
    expect(p.description).toMatch(/Manifest IR/);
  });

  it('rejects unknown surfaces with a structured diagnostic', () => {
    const p = new DrizzleProjection();
    const result = p.generate(emptyIR(), { surface: 'drizzle.unknown' });
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('UNKNOWN_SURFACE');
    expect(result.diagnostics[0].severity).toBe('error');
  });
});

describe('DrizzleProjection — generic fixture (Widget)', () => {
  it('emits a Drizzle table for a durable entity with id, required name, and optional qty', () => {
    const ir = emptyIR();
    ir.entities.push(widgetEntity());
    ir.stores.push(durableStore('Widget'));

    const result = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' });

    expect(result.artifacts).toHaveLength(1);
    const artifact = result.artifacts[0];
    expect(artifact.id).toBe('drizzle.schema');
    expect(artifact.pathHint).toBe('schema.ts');
    expect(artifact.contentType).toBe('typescript');

    const code = artifact.code;
    expect(code).toMatch(/export const widget = pgTable\("widget", \{/);
    expect(code).toMatch(/id: varchar\("id", \{ length: 255 \}\)\.primaryKey\(\)/);
    expect(code).toMatch(/name: varchar\("name", \{ length: 255 \}\)\.notNull\(\)/);
    expect(code).toMatch(/qty: integer\("qty"\)/);

    const errs = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errs).toHaveLength(0);
  });

  it('generates deterministic output — identical IR + options produces identical code', () => {
    const ir = emptyIR();
    ir.entities.push(widgetEntity());
    ir.stores.push(durableStore('Widget'));

    const result1 = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' });
    const result2 = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' });
    expect(result1.artifacts[0].code).toBe(result2.artifacts[0].code);
  });
});

describe('DrizzleProjection — type mapping', () => {
  it('maps uuid type to uuid().primaryKey().defaultRandom()', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'uuid', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' }).artifacts[0]
      .code;
    expect(code).toMatch(/id: uuid\("id"\)\.primaryKey\(\)\.defaultRandom\(\)/);
  });

  it('maps boolean type to boolean()', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'active', type: { name: 'boolean', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' }).artifacts[0]
      .code;
    expect(code).toMatch(/active: boolean\("active"\)\.notNull\(\)/);
  });

  it('maps int type to integer()', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'count', type: { name: 'int', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' }).artifacts[0]
      .code;
    expect(code).toMatch(/count: integer\("count"\)\.notNull\(\)/);
  });

  it('maps float type to real()', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'temperature', type: { name: 'float', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' }).artifacts[0]
      .code;
    expect(code).toMatch(/temperature: real\("temperature"\)\.notNull\(\)/);
  });

  it('maps money/decimal type to numeric() with default precision', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'price', type: { name: 'money', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' }).artifacts[0]
      .code;
    expect(code).toMatch(/price: numeric\("price", \{ precision: 12, scale: 2 \}\)\.notNull\(\)/);
  });

  it('maps datetime type to timestamp()', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'createdAt', type: { name: 'datetime', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' }).artifacts[0]
      .code;
    expect(code).toMatch(/createdAt: timestamp\("createdAt"\)\.notNull\(\)/);
  });

  it('maps json type to jsonb()', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'metadata', type: { name: 'json', nullable: false }, modifiers: [] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' }).artifacts[0]
      .code;
    expect(code).toMatch(/metadata: jsonb\("metadata"\)/);
  });
});

describe('DrizzleProjection — skipping rules', () => {
  it('skips entities with store target `memory`', () => {
    const ir = emptyIR();
    ir.entities.push(widgetEntity());
    ir.stores.push(memoryStore('Widget'));

    const result = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' });
    expect(result.artifacts[0].code).not.toMatch(/pgTable/);
    const skip = result.diagnostics.find((d) => d.code === 'DRIZZLE_SKIPPED_NON_DURABLE');
    expect(skip).toBeDefined();
    expect(skip?.entity).toBe('Widget');
  });

  it('skips entities marked `external: true`', () => {
    const ir = emptyIR();
    ir.entities.push({ ...widgetEntity(), external: true } as IREntity & { external: boolean });
    ir.stores.push(durableStore('Widget'));

    const result = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' });
    expect(result.artifacts[0].code).not.toMatch(/pgTable/);
    const skip = result.diagnostics.find((d) => d.code === 'DRIZZLE_SKIPPED_EXTERNAL');
    expect(skip).toBeDefined();
  });

  it('skips entities with no store declaration', () => {
    const ir = emptyIR();
    ir.entities.push(widgetEntity());

    const result = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' });
    expect(result.artifacts[0].code).not.toMatch(/pgTable/);
    const skip = result.diagnostics.find((d) => d.code === 'DRIZZLE_SKIPPED_NO_STORE');
    expect(skip).toBeDefined();
  });

  it('NEVER iterates computedProperties (structural invariant)', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'price', type: { name: 'money', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [
        {
          name: 'total',
          type: { name: 'money', nullable: false },
          expression: { kind: 'identifier', name: 'price' },
          dependencies: ['price'],
        },
      ],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' }).artifacts[0]
      .code;
    expect(code).toMatch(/price: numeric/);
    expect(code).not.toMatch(/total/);
  });
});

describe('DrizzleProjection — bare `number` is ambiguous (DRIZZLE_AMBIGUOUS_NUMBER)', () => {
  it('emits DRIZZLE_AMBIGUOUS_NUMBER for a bare `number` property with no override', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'qty', type: { name: 'number', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const result = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' });
    const errs = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0].code).toBe('DRIZZLE_AMBIGUOUS_NUMBER');
    expect(errs[0].entity).toBe('Widget');
    expect(errs[0].message).toMatch(/Widget\.qty/);

    const code = result.artifacts[0].code;
    expect(code).not.toMatch(/qty:/);
  });

  it('resolves bare `number` when consumer supplies a typeMappings override', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'legacyCount', type: { name: 'number', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const result = new DrizzleProjection().generate(ir, {
      surface: 'drizzle.schema',
      options: { typeMappings: { Widget: { legacyCount: 'bigint' } } },
    });

    expect(result.diagnostics.filter((d) => d.code === 'DRIZZLE_AMBIGUOUS_NUMBER')).toHaveLength(0);
    expect(result.artifacts[0].code).toMatch(/legacyCount: bigint/);
  });
});

describe('DrizzleProjection — unknown type diagnostic', () => {
  it('emits DRIZZLE_UNKNOWN_TYPE for unmappable type', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'amount', type: { name: 'currency', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const result = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' });
    const errs = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0].code).toBe('DRIZZLE_UNKNOWN_TYPE');
    expect(errs[0].entity).toBe('Widget');
    expect(errs[0].message).toMatch(/currency/);
  });
});

describe('DrizzleProjection — config options', () => {
  it('applies tableMappings to table name', () => {
    const ir = emptyIR();
    ir.entities.push(widgetEntity());
    ir.stores.push(durableStore('Widget'));

    const code = new DrizzleProjection().generate(ir, {
      surface: 'drizzle.schema',
      options: { tableMappings: { Widget: 'widgets' } },
    }).artifacts[0].code;

    expect(code).toMatch(/export const widgets = pgTable\("widgets", \{/);
  });

  it('applies columnMappings to column name', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'createdAt', type: { name: 'datetime', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new DrizzleProjection().generate(ir, {
      surface: 'drizzle.schema',
      options: { columnMappings: { Widget: { createdAt: 'created_at' } } },
    }).artifacts[0].code;

    expect(code).toMatch(/createdAt: timestamp\("created_at"\)/);
  });

  it('applies precision override for numeric columns', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'price', type: { name: 'decimal', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new DrizzleProjection().generate(ir, {
      surface: 'drizzle.schema',
      options: { precision: { Widget: { price: { precision: 18, scale: 8 } } } },
    }).artifacts[0].code;

    expect(code).toMatch(/price: numeric\("price", \{ precision: 18, scale: 8 \}\)/);
    expect(code).not.toMatch(/precision: 12, scale: 2/);
  });

  it('applies typeMappings to override column type', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'data', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new DrizzleProjection().generate(ir, {
      surface: 'drizzle.schema',
      options: { typeMappings: { Widget: { data: 'text' } } },
    }).artifacts[0].code;

    expect(code).toMatch(/data: text\("data"\)\.notNull\(\)/);
  });

  it('emits MySQL dialect tables when dialect is mysql', () => {
    const ir = emptyIR();
    ir.entities.push(widgetEntity());
    ir.stores.push(durableStore('Widget'));

    const code = new DrizzleProjection().generate(ir, {
      surface: 'drizzle.schema',
      options: { dialect: 'mysql' },
    }).artifacts[0].code;

    expect(code).toMatch(/import \{ mysqlTable \} from 'drizzle-orm\/mysql-core'/);
    expect(code).toMatch(/export const widget = mysqlTable\("widget", \{/);
  });

  it('emits SQLite dialect tables when dialect is sqlite', () => {
    const ir = emptyIR();
    ir.entities.push(widgetEntity());
    ir.stores.push(durableStore('Widget'));

    const code = new DrizzleProjection().generate(ir, {
      surface: 'drizzle.schema',
      options: { dialect: 'sqlite' },
    }).artifacts[0].code;

    expect(code).toMatch(/import \{ sqliteTable \} from 'drizzle-orm\/sqlite-core'/);
    expect(code).toMatch(/export const widget = sqliteTable\("widget", \{/);
  });
});

describe('DrizzleProjection — unique and indexed modifiers', () => {
  it('emits .unique() for unique modifier', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        {
          name: 'sku',
          type: { name: 'string', nullable: false },
          modifiers: ['required', 'unique'],
        },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' }).artifacts[0]
      .code;
    expect(code).toMatch(/sku: varchar\("sku", \{ length: 255 \}\)\.notNull\(\)\.unique\(\)/);
  });
});

describe('DrizzleProjection — composite PK', () => {
  it('emits a table for composite PK entity without @id on any column', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Order',
      key: ['tenantId', 'orderId'],
      properties: [
        { name: 'tenantId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'orderId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'amount', type: { name: 'int', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Order'));

    const result = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' });
    const code = result.artifacts[0].code;

    // No .primaryKey() on any single column
    expect(code).not.toMatch(/\.primaryKey\(\)/);
    // Composite PK comment
    expect(code).toMatch(/Composite primary key/);
    expect(code).toMatch(/pk: \[tenantId, orderId\]/);
    // Columns are plain
    expect(code).toMatch(/tenantId: varchar\("tenantId", \{ length: 255 \}\)\.notNull\(\)/);
    expect(code).toMatch(/orderId: varchar\("orderId", \{ length: 255 \}\)\.notNull\(\)/);

    expect(result.diagnostics.find((d) => d.code === 'DRIZZLE_NO_ID_PROPERTY')).toBeUndefined();
  });

  it('alternate keys emit comments', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Organization',
      key: ['tenantId', 'id'],
      alternateKeys: [['tenantId', 'externalId']],
      properties: [
        { name: 'tenantId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'externalId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Organization'));

    const code = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' }).artifacts[0]
      .code;
    // alternate keys should not cause errors
    expect(code).toMatch(/export const organization = pgTable/);
  });
});

describe('DrizzleProjection — relationship wiring', () => {
  it('emits FK column and relation for belongsTo', () => {
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Author', {
        relationships: [{ name: 'books', kind: 'hasMany', target: 'Book' }],
      }),
      bareEntity('Book', {
        relationships: [{ name: 'author', kind: 'belongsTo', target: 'Author' }],
      }),
    );
    ir.stores.push(durableStore('Author'), durableStore('Book'));

    const result = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' });
    const code = result.artifacts[0].code;

    // FK column on Book
    expect(code).toMatch(/authorId: varchar\("authorId"\)/);
    // Relation definition
    expect(code).toMatch(
      /author: one\(author, \{ fields: \[book\.authorId\], references: \[author\.id\] \}\)/,
    );

    expect(
      result.diagnostics.find((d) => d.code === 'DRIZZLE_RELATION_MISSING_BACKSIDE'),
    ).toBeUndefined();
  });

  it('emits one-to-one with .unique() on FK column', () => {
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('User', {
        relationships: [{ name: 'profile', kind: 'hasOne', target: 'Profile' }],
      }),
      bareEntity('Profile', {
        relationships: [{ name: 'user', kind: 'belongsTo', target: 'User' }],
      }),
    );
    ir.stores.push(durableStore('User'), durableStore('Profile'));

    const code = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' }).artifacts[0]
      .code;

    // FK column with unique
    expect(code).toMatch(/userId: varchar\("userId"\)\.unique\(\)/);
    // Relation
    expect(code).toMatch(
      /user: one\(user, \{ fields: \[profile\.userId\], references: \[user\.id\] \}\)/,
    );
  });

  it('emits ref relationship like belongsTo with warning about missing back-relation', () => {
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Event', {
        relationships: [{ name: 'createdBy', kind: 'ref', target: 'Actor' }],
      }),
      bareEntity('Actor'),
    );
    ir.stores.push(durableStore('Event'), durableStore('Actor'));

    const result = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' });
    const code = result.artifacts[0].code;

    expect(code).toMatch(/createdById: varchar\("createdById"\)/);
    const warn = result.diagnostics.find(
      (d) => d.code === 'DRIZZLE_RELATION_MISSING_BACKSIDE' && d.entity === 'Event',
    );
    expect(warn).toBeDefined();
    expect(warn?.severity).toBe('warning');
  });

  it("uses IR's foreignKey.fields when present", () => {
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Author', {
        relationships: [{ name: 'books', kind: 'hasMany', target: 'Book' }],
      }),
      bareEntity('Book', {
        relationships: [
          {
            name: 'author',
            kind: 'belongsTo',
            target: 'Author',
            foreignKey: { fields: ['writerId'] },
          },
        ],
      }),
    );
    ir.stores.push(durableStore('Author'), durableStore('Book'));

    const code = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' }).artifacts[0]
      .code;
    expect(code).toMatch(/writerId: varchar\("writerId"\)/);
    expect(code).toMatch(/fields: \[book\.writerId\], references: \[author\.id\]/);
    expect(code).not.toMatch(/authorId/);
  });

  it('respects foreignKeys config override', () => {
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Author', {
        relationships: [{ name: 'books', kind: 'hasMany', target: 'Book' }],
      }),
      bareEntity('Book', {
        relationships: [{ name: 'author', kind: 'belongsTo', target: 'Author' }],
      }),
    );
    ir.stores.push(durableStore('Author'), durableStore('Book'));

    const code = new DrizzleProjection().generate(ir, {
      surface: 'drizzle.schema',
      options: { foreignKeys: { Book: { author: 'writerId' } } },
    }).artifacts[0].code;

    expect(code).toMatch(/writerId: varchar\("writerId"\)/);
    expect(code).toMatch(/fields: \[book\.writerId\], references: \[author\.id\]/);
  });

  it('FK type follows the referenced property type (Int target → integer FK)', () => {
    const ir = emptyIR();
    ir.entities.push(
      {
        name: 'Author',
        properties: [
          { name: 'id', type: { name: 'int', nullable: false }, modifiers: ['required'] },
        ],
        computedProperties: [],
        relationships: [{ name: 'books', kind: 'hasMany', target: 'Book' }],
        commands: [],
        constraints: [],
        policies: [],
      },
      bareEntity('Book', {
        relationships: [{ name: 'author', kind: 'belongsTo', target: 'Author' }],
      }),
    );
    ir.stores.push(durableStore('Author'), durableStore('Book'));

    const code = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' }).artifacts[0]
      .code;
    expect(code).toMatch(/authorId: integer\("authorId"\)/);
  });
});

describe('DrizzleProjection — relationship diagnostics', () => {
  it('skips through sugar field (join entity wired via belongsTo sides)', () => {
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Author', {
        relationships: [{ name: 'books', kind: 'hasMany', target: 'Book', through: 'AuthorBook' }],
      }),
      bareEntity('Book'),
      bareEntity('AuthorBook', {
        relationships: [
          { name: 'author', kind: 'belongsTo', target: 'Author', foreignKey: { fields: ['authorId'] } },
          { name: 'book', kind: 'belongsTo', target: 'Book', foreignKey: { fields: ['bookId'] } },
        ],
      }),
    );
    ir.stores.push(durableStore('Author'), durableStore('Book'), durableStore('AuthorBook'));

    const result = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' });
    expect(
      result.diagnostics.find((d) => d.code === 'DRIZZLE_RELATION_VIA_THROUGH_UNIMPLEMENTED'),
    ).toBeUndefined();
  });

  it('emits DRIZZLE_RELATION_TARGET_NOT_EMITTED for dangling target', () => {
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Event', {
        relationships: [{ name: 'creator', kind: 'ref', target: 'ExternalActor' }],
      }),
    );
    ir.stores.push(durableStore('Event'));
    // ExternalActor has no store → not emitted

    const result = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' });
    const diag = result.diagnostics.find((d) => d.code === 'DRIZZLE_RELATION_TARGET_NOT_EMITTED');
    expect(diag).toBeDefined();
    expect(diag?.entity).toBe('Event');
  });

  it('emits DRIZZLE_RELATION_AMBIGUOUS for multiple relations between same pair', () => {
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Author', {
        relationships: [
          { name: 'authoredBooks', kind: 'hasMany', target: 'Book' },
          { name: 'editedBooks', kind: 'hasMany', target: 'Book' },
        ],
      }),
      bareEntity('Book', {
        relationships: [
          { name: 'author', kind: 'belongsTo', target: 'Author' },
          { name: 'editor', kind: 'belongsTo', target: 'Author' },
        ],
      }),
    );
    ir.stores.push(durableStore('Author'), durableStore('Book'));

    const result = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' });
    const ambig = result.diagnostics.filter((d) => d.code === 'DRIZZLE_RELATION_AMBIGUOUS');
    expect(ambig.length).toBeGreaterThan(0);
  });
});

describe('DrizzleProjection — referential actions', () => {
  it('emits onDelete action in relation', () => {
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Author', {
        relationships: [{ name: 'books', kind: 'hasMany', target: 'Book' }],
      }),
      bareEntity('Book', {
        relationships: [
          { name: 'author', kind: 'belongsTo' as const, target: 'Author', onDelete: 'cascade' },
        ],
      }),
    );
    ir.stores.push(durableStore('Author'), durableStore('Book'));

    const code = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' }).artifacts[0]
      .code;
    expect(code).toMatch(/onDelete: 'cascade'/);
  });

  it('emits both onDelete and onUpdate', () => {
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Author', {
        relationships: [{ name: 'books', kind: 'hasMany', target: 'Book' }],
      }),
      bareEntity('Book', {
        relationships: [
          {
            name: 'author',
            kind: 'belongsTo' as const,
            target: 'Author',
            onDelete: 'cascade',
            onUpdate: 'noAction',
          },
        ],
      }),
    );
    ir.stores.push(durableStore('Author'), durableStore('Book'));

    const code = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' }).artifacts[0]
      .code;
    expect(code).toMatch(/onDelete: 'cascade'/);
    expect(code).toMatch(/onUpdate: 'noAction'/);
  });
});

describe('DrizzleProjection — imports', () => {
  it('imports only used column types', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'count', type: { name: 'int', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' }).artifacts[0]
      .code;
    expect(code).toMatch(/import.*integer.*from 'drizzle-orm\/pg-core'/);
    expect(code).toMatch(/import.*varchar.*from 'drizzle-orm\/pg-core'/);
  });

  it('imports relations helper when relationships exist', () => {
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Author', {
        relationships: [{ name: 'books', kind: 'hasMany', target: 'Book' }],
      }),
      bareEntity('Book', {
        relationships: [{ name: 'author', kind: 'belongsTo', target: 'Author' }],
      }),
    );
    ir.stores.push(durableStore('Author'), durableStore('Book'));

    const code = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' }).artifacts[0]
      .code;
    expect(code).toMatch(/import \{ relations \} from 'drizzle-orm'/);
  });
});

describe('DrizzleProjection — index emission', () => {
  it('emits index definitions from options.indexes', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'sku', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new DrizzleProjection().generate(ir, {
      surface: 'drizzle.schema',
      options: { indexes: { Widget: [['sku']] } },
    }).artifacts[0].code;

    expect(code).toMatch(/index\("widget_sku_idx"\)/);
    expect(code).toMatch(/\.on\(widget\.sku\)/);
  });

  it('emits named index', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'name', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new DrizzleProjection().generate(ir, {
      surface: 'drizzle.schema',
      options: { indexes: { Widget: [{ fields: ['name'], name: 'widget_name_idx' }] } },
    }).artifacts[0].code;

    expect(code).toMatch(/index\("widget_name_idx"\)/);
    expect(code).toMatch(/\.on\(widget\.name\)/);
  });
});

describe('DrizzleProjection — default values', () => {
  it('emits .default() for string property with default', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        {
          name: 'status',
          type: { name: 'string', nullable: false },
          modifiers: ['required'],
          defaultValue: { kind: 'string', value: 'active' },
        },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' }).artifacts[0]
      .code;
    expect(code).toMatch(
      /status: varchar\("status", \{ length: 255 \}\)\.notNull\(\)\.default\("active"\)/,
    );
  });

  it('emits .default() for boolean property with default', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        {
          name: 'active',
          type: { name: 'boolean', nullable: false },
          modifiers: ['required'],
          defaultValue: { kind: 'boolean', value: true },
        },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' }).artifacts[0]
      .code;
    expect(code).toMatch(/active: boolean\("active"\)\.notNull\(\)\.default\(true\)/);
  });

  it('emits .default() for int property with default', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        {
          name: 'qty',
          type: { name: 'int', nullable: false },
          modifiers: [],
          defaultValue: { kind: 'number', value: 0 },
        },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' }).artifacts[0]
      .code;
    expect(code).toMatch(/qty: integer\("qty"\)\.default\(0\)/);
  });
});

describe('DrizzleProjection — array types', () => {
  it('emits .array() for array<string> type', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Taggable',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        {
          name: 'tags',
          type: { name: 'array', generic: { name: 'string', nullable: false }, nullable: false },
          modifiers: [],
        },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Taggable'));

    const code = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' }).artifacts[0]
      .code;
    expect(code).toMatch(/tags: varchar\("tags", \{ length: 255 \}\)\.array\(\)/);
  });

  it('emits .array() for array<int> type', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Scored',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        {
          name: 'scores',
          type: { name: 'array', generic: { name: 'int', nullable: false }, nullable: false },
          modifiers: [],
        },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Scored'));

    const code = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' }).artifacts[0]
      .code;
    expect(code).toMatch(/scores: integer\("scores"\)\.array\(\)/);
  });
});

describe('DrizzleProjection — NO_ID_PROPERTY error', () => {
  it('emits DRIZZLE_NO_ID_PROPERTY when entity has no id and no composite key', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'name', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const result = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' });
    const err = result.diagnostics.find((d) => d.code === 'DRIZZLE_NO_ID_PROPERTY');
    expect(err).toBeDefined();
    expect(err?.entity).toBe('Widget');
    expect(err?.severity).toBe('error');
  });
});

describe('DrizzleProjection — preserves IR source order', () => {
  it('Beta before Alpha in IR → Beta before Alpha in output', () => {
    const ir = emptyIR();
    const beta: IREntity = {
      name: 'Beta',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    };
    const alpha: IREntity = {
      name: 'Alpha',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    };
    ir.entities.push(beta, alpha);
    ir.stores.push(durableStore('Beta'), durableStore('Alpha'));

    const result = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' });
    const code = result.artifacts[0].code;
    const betaPos = code.indexOf('export const beta =');
    const alphaPos = code.indexOf('export const alpha =');
    expect(betaPos).toBeGreaterThan(-1);
    expect(alphaPos).toBeGreaterThan(-1);
    expect(betaPos).toBeLessThan(alphaPos);
  });
});

describe('DrizzleProjection — composite FK with referential actions', () => {
  it('composite FK emits correct relation definition', () => {
    const ir = emptyIR();
    ir.entities.push(
      {
        name: 'Organization',
        key: ['tenantId', 'id'],
        properties: [
          { name: 'tenantId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
          { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        ],
        computedProperties: [],
        relationships: [{ name: 'orders', kind: 'hasMany', target: 'Order' }],
        commands: [],
        constraints: [],
        policies: [],
      },
      {
        name: 'Order',
        key: ['tenantId', 'orderId'],
        properties: [
          { name: 'tenantId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
          { name: 'orderId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        ],
        computedProperties: [],
        relationships: [
          {
            name: 'org',
            kind: 'belongsTo' as const,
            target: 'Organization',
            foreignKey: { fields: ['tenantId', 'orderId'], references: ['tenantId', 'id'] },
          },
        ],
        commands: [],
        constraints: [],
        policies: [],
      },
    );
    ir.stores.push(durableStore('Organization'), durableStore('Order'));

    const result = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' });
    const code = result.artifacts[0].code;

    expect(code).toMatch(
      /fields: \[order\.tenantId, order\.orderId\], references: \[organization\.tenantId, organization\.id\]/,
    );
  });

  it('FK with onDelete from ForeignKeyConfig object', () => {
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Author', {
        relationships: [{ name: 'books', kind: 'hasMany', target: 'Book' }],
      }),
      bareEntity('Book', {
        relationships: [{ name: 'author', kind: 'belongsTo', target: 'Author' }],
      }),
    );
    ir.stores.push(durableStore('Author'), durableStore('Book'));

    const code = new DrizzleProjection().generate(ir, {
      surface: 'drizzle.schema',
      options: {
        foreignKeys: {
          Book: {
            author: {
              fields: ['authorId'],
              references: ['id'],
              onDelete: 'Cascade',
            },
          },
        },
      },
    }).artifacts[0].code;

    expect(code).toMatch(/onDelete: 'Cascade'/);
  });
});

// ============================================================================
// IRType.params precision/scale
// ============================================================================

describe('DrizzleProjection — IRType.params precision/scale', () => {
  it('uses IRType.params precision/scale for decimal when options.precision is absent', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        {
          name: 'price',
          type: { name: 'decimal', nullable: false, params: { precision: 20, scale: 6 } },
          modifiers: ['required'],
        },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' }).artifacts[0]
      .code;
    expect(code).toMatch(/price: numeric\("price", \{ precision: 20, scale: 6 \}\)/);
    expect(code).not.toMatch(/precision: 12, scale: 2/);
  });

  it('options.precision beats IRType.params (explicit config wins)', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        {
          name: 'price',
          type: { name: 'decimal', nullable: false, params: { precision: 20, scale: 6 } },
          modifiers: ['required'],
        },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new DrizzleProjection().generate(ir, {
      surface: 'drizzle.schema',
      options: { precision: { Widget: { price: { precision: 10, scale: 4 } } } },
    }).artifacts[0].code;
    expect(code).toMatch(/price: numeric\("price", \{ precision: 10, scale: 4 \}\)/);
    expect(code).not.toMatch(/precision: 20, scale: 6/);
  });

  it('falls back to default precision when IRType.params is absent (existing behavior)', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'cost', type: { name: 'decimal', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' }).artifacts[0]
      .code;
    expect(code).toMatch(/cost: numeric\("cost", \{ precision: 12, scale: 2 \}\)/);
  });
});

// ============================================================================
// indexed modifier → Drizzle index()
// ============================================================================

describe('DrizzleProjection — indexed modifier emits index()', () => {
  it('emits an index for a property with the indexed modifier', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        {
          name: 'tenantId',
          type: { name: 'string', nullable: false },
          modifiers: ['required', 'indexed'],
        },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' }).artifacts[0]
      .code;
    expect(code).toMatch(/index\("widget_tenantId_idx"\)/);
    expect(code).toMatch(/\.on\(widget\.tenantId\)/);
    expect(code).toMatch(/import \{ index \} from/);
  });

  it('does not duplicate index when property already in options.indexes', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        {
          name: 'tenantId',
          type: { name: 'string', nullable: false },
          modifiers: ['required', 'indexed'],
        },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    // Generate with options.indexes already covering the indexed property
    const codeWithOptionsIndex = new DrizzleProjection().generate(ir, {
      surface: 'drizzle.schema',
      options: { indexes: { Widget: [['tenantId']] } },
    }).artifacts[0].code;

    // Generate with modifier only (no options.indexes) — same index should be emitted
    const codeModifierOnly = new DrizzleProjection().generate(ir, {
      surface: 'drizzle.schema',
    }).artifacts[0].code;

    // Both should produce exactly one index export block for tenantId
    const exportBlocksWithOptions =
      codeWithOptionsIndex.match(/export const .* = index\(.*tenantId/g) ?? [];
    const exportBlocksModifier =
      codeModifierOnly.match(/export const .* = index\(.*tenantId/g) ?? [];
    expect(exportBlocksWithOptions).toHaveLength(1);
    expect(exportBlocksModifier).toHaveLength(1);
  });

  it('emits indexes for multiple indexed properties', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        {
          name: 'accountId',
          type: { name: 'string', nullable: false },
          modifiers: ['required', 'indexed'],
        },
        { name: 'status', type: { name: 'string', nullable: false }, modifiers: ['indexed'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new DrizzleProjection().generate(ir, { surface: 'drizzle.schema' }).artifacts[0]
      .code;
    expect(code).toMatch(/widget_accountId_idx/);
    expect(code).toMatch(/widget_status_idx/);
    expect(code).toMatch(/\.on\(widget\.accountId\)/);
    expect(code).toMatch(/\.on\(widget\.status\)/);
  });
});
