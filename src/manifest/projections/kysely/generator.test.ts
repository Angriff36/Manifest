/**
 * @manifest/projection-kysely — generic-fixture tests.
 *
 * EVERY fixture here is generic by construction. No real-app entity, table,
 * or column name appears in this file.
 *
 * Fixtures are hand-built IR object literals so the projection's true input
 * contract is exercised in isolation.
 */

import { describe, it, expect } from 'vitest';
import type { IR, IREntity, IRStore } from '../../ir';
import { KyselyProjection } from './generator.js';

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
      { name: 'qty', type: { name: 'int', nullable: false }, modifiers: ['required'] },
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

describe('KyselyProjection — projection target metadata', () => {
  it('declares the expected name, description and surfaces', () => {
    const p = new KyselyProjection();
    expect(p.name).toBe('kysely');
    expect(p.surfaces).toEqual(['kysely.types']);
    expect(p.description).toMatch(/Kysely/);
    expect(p.description).toMatch(/Manifest IR/);
  });

  it('rejects unknown surfaces with a structured diagnostic', () => {
    const p = new KyselyProjection();
    const result = p.generate(emptyIR(), { surface: 'kysely.unknown' });
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('UNKNOWN_SURFACE');
    expect(result.diagnostics[0].severity).toBe('error');
  });
});

describe('KyselyProjection — generic fixture (Widget)', () => {
  it('emits a Kysely types file for a durable entity', () => {
    const ir = emptyIR();
    ir.entities.push(widgetEntity());
    ir.stores.push(durableStore('Widget'));

    const result = new KyselyProjection().generate(ir, { surface: 'kysely.types' });

    expect(result.artifacts).toHaveLength(1);
    const artifact = result.artifacts[0];
    expect(artifact.id).toBe('kysely.types');
    expect(artifact.pathHint).toBe('kysely.types.ts');
    expect(artifact.contentType).toBe('typescript');

    const code = artifact.code;
    expect(code).toMatch(/export interface WidgetTable \{/);
    expect(code).toMatch(/id: Generated<string>;/);
    expect(code).toMatch(/name: string;/);
    expect(code).toMatch(/qty: number;/);
    expect(code).toMatch(/export interface DB \{/);
    expect(code).toMatch(/widget: WidgetTable;/);

    const errs = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errs).toHaveLength(0);
  });

  it('generates deterministic output — identical IR + options produces identical code', () => {
    const ir = emptyIR();
    ir.entities.push(widgetEntity());
    ir.stores.push(durableStore('Widget'));

    const result1 = new KyselyProjection().generate(ir, { surface: 'kysely.types' });
    const result2 = new KyselyProjection().generate(ir, { surface: 'kysely.types' });
    expect(result1.artifacts[0].code).toBe(result2.artifacts[0].code);
  });
});

describe('KyselyProjection — type mapping', () => {
  it('maps uuid type to Generated<string>', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'uuid', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new KyselyProjection().generate(ir, { surface: 'kysely.types' }).artifacts[0].code;
    expect(code).toMatch(/id: Generated<string>;/);
  });

  it('maps boolean type to boolean', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'active', type: { name: 'boolean', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new KyselyProjection().generate(ir, { surface: 'kysely.types' }).artifacts[0].code;
    expect(code).toMatch(/active: boolean;/);
  });

  it('maps int type to number', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'count', type: { name: 'int', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new KyselyProjection().generate(ir, { surface: 'kysely.types' }).artifacts[0].code;
    expect(code).toMatch(/count: number;/);
  });

  it('maps datetime type to ColumnType<Date, ...>', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'createdAt', type: { name: 'datetime', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new KyselyProjection().generate(ir, { surface: 'kysely.types' }).artifacts[0].code;
    expect(code).toMatch(/createdAt: ColumnType<Date,/);
  });

  it('maps json type to unknown', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'metadata', type: { name: 'json', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new KyselyProjection().generate(ir, { surface: 'kysely.types' }).artifacts[0].code;
    expect(code).toMatch(/metadata: unknown;/);
  });

  it('maps nullable properties to T | null', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'description', type: { name: 'string', nullable: true }, modifiers: [] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new KyselyProjection().generate(ir, { surface: 'kysely.types' }).artifacts[0].code;
    expect(code).toMatch(/description: string \| null;/);
  });
});

describe('KyselyProjection — skipping rules', () => {
  it('skips entities with store target `memory`', () => {
    const ir = emptyIR();
    ir.entities.push(widgetEntity());
    ir.stores.push(memoryStore('Widget'));

    const result = new KyselyProjection().generate(ir, { surface: 'kysely.types' });
    const code = result.artifacts[0].code;
    expect(code).not.toMatch(/WidgetTable/);
    const skip = result.diagnostics.find((d) => d.code === 'KYSELY_SKIPPED_INCOMPATIBLE');
    expect(skip).toBeDefined();
    expect(skip?.entity).toBe('Widget');
  });

  it('skips entities marked `external: true`', () => {
    const ir = emptyIR();
    ir.entities.push({ ...widgetEntity(), external: true } as IREntity & { external: boolean });
    ir.stores.push(durableStore('Widget'));

    const result = new KyselyProjection().generate(ir, { surface: 'kysely.types' });
    const code = result.artifacts[0].code;
    expect(code).not.toMatch(/WidgetTable/);
    const skip = result.diagnostics.find((d) => d.code === 'KYSELY_SKIPPED_EXTERNAL');
    expect(skip).toBeDefined();
  });

  it('skips entities with no store declaration', () => {
    const ir = emptyIR();
    ir.entities.push(widgetEntity());

    const result = new KyselyProjection().generate(ir, { surface: 'kysely.types' });
    const code = result.artifacts[0].code;
    expect(code).not.toMatch(/WidgetTable/);
    const skip = result.diagnostics.find((d) => d.code === 'KYSELY_SKIPPED_NO_STORE');
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

    const code = new KyselyProjection().generate(ir, { surface: 'kysely.types' }).artifacts[0].code;
    expect(code).toMatch(/price: string;/);
    expect(code).not.toMatch(/total/);
  });
});

describe('KyselyProjection — bare `number` is ambiguous', () => {
  it('emits KYSELY_AMBIGUOUS_NUMBER for a bare `number` property with no override', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'qty', type: { name: 'number', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const result = new KyselyProjection().generate(ir, { surface: 'kysely.types' });
    const errs = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0].code).toBe('KYSELY_AMBIGUOUS_NUMBER');
    expect(errs[0].entity).toBe('Widget');

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
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const result = new KyselyProjection().generate(ir, {
      surface: 'kysely.types',
      options: { typeMappings: { Widget: { legacyCount: 'bigint' } } },
    });

    expect(result.diagnostics.filter((d) => d.code === 'KYSELY_AMBIGUOUS_NUMBER')).toHaveLength(0);
    expect(result.artifacts[0].code).toMatch(/legacyCount: bigint;/);
  });
});

describe('KyselyProjection — unknown type diagnostic', () => {
  it('emits KYSELY_UNKNOWN_TYPE for unmappable type', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'amount', type: { name: 'currency', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const result = new KyselyProjection().generate(ir, { surface: 'kysely.types' });
    const errs = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0].code).toBe('KYSELY_UNKNOWN_TYPE');
    expect(errs[0].entity).toBe('Widget');
    expect(errs[0].message).toMatch(/currency/);
  });
});

describe('KyselyProjection — config options', () => {
  it('applies tableMappings to table name', () => {
    const ir = emptyIR();
    ir.entities.push(widgetEntity());
    ir.stores.push(durableStore('Widget'));

    const code = new KyselyProjection().generate(ir, {
      surface: 'kysely.types',
      options: { tableMappings: { Widget: 'widgets' } },
    }).artifacts[0].code;

    expect(code).toMatch(/widgets: WidgetTable;/);
  });

  it('applies typeMappings to override column type', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'data', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new KyselyProjection().generate(ir, {
      surface: 'kysely.types',
      options: { typeMappings: { Widget: { data: 'Buffer' } } },
    }).artifacts[0].code;

    expect(code).toMatch(/data: Buffer;/);
  });

  it('emits MySQL dialect factory when dialect is mysql', () => {
    const ir = emptyIR();
    ir.entities.push(widgetEntity());
    ir.stores.push(durableStore('Widget'));

    const code = new KyselyProjection().generate(ir, {
      surface: 'kysely.types',
      options: { dialect: 'mysql' },
    }).artifacts[0].code;

    expect(code).toMatch(/import \{ Kysely, MysqlDialect \} from 'kysely';/);
    expect(code).toMatch(/dialect: new MysqlDialect\(config\),/);
  });

  it('emits SQLite dialect factory when dialect is sqlite', () => {
    const ir = emptyIR();
    ir.entities.push(widgetEntity());
    ir.stores.push(durableStore('Widget'));

    const code = new KyselyProjection().generate(ir, {
      surface: 'kysely.types',
      options: { dialect: 'sqlite' },
    }).artifacts[0].code;

    expect(code).toMatch(/import \{ Kysely, SqliteDialect \} from 'kysely';/);
    expect(code).toMatch(/dialect: new SqliteDialect\(config\),/);
  });

  it('skips factory function when emitFactory is false', () => {
    const ir = emptyIR();
    ir.entities.push(widgetEntity());
    ir.stores.push(durableStore('Widget'));

    const code = new KyselyProjection().generate(ir, {
      surface: 'kysely.types',
      options: { emitFactory: false },
    }).artifacts[0].code;

    expect(code).not.toMatch(/export function createDb/);
  });
});

describe('KyselyProjection — relationship wiring', () => {
  it('emits FK column for belongsTo relationship', () => {
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

    const code = new KyselyProjection().generate(ir, { surface: 'kysely.types' }).artifacts[0].code;

    // FK column on Book
    expect(code).toMatch(/authorId: string;/);
  });

  it('does not duplicate FK column if already declared as property', () => {
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Author', {
        relationships: [{ name: 'books', kind: 'hasMany', target: 'Book' }],
      }),
      {
        name: 'Book',
        properties: [
          { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
          { name: 'authorId', type: { name: 'string', nullable: true }, modifiers: [] },
        ],
        computedProperties: [],
        relationships: [{ name: 'author', kind: 'belongsTo' as const, target: 'Author' }],
        commands: [], constraints: [], policies: [],
      },
    );
    ir.stores.push(durableStore('Author'), durableStore('Book'));

    const code = new KyselyProjection().generate(ir, { surface: 'kysely.types' }).artifacts[0].code;

    // Should only have one authorId line
    const matches = code.match(/authorId:/g);
    expect(matches).toHaveLength(1);
  });
});

describe('KyselyProjection — composite PK', () => {
  it('emits a table interface for composite PK entity', () => {
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

    const result = new KyselyProjection().generate(ir, { surface: 'kysely.types' });
    const code = result.artifacts[0].code;

    // No Generated<> wrapper on tenantId or orderId (composite PK)
    expect(code).toMatch(/tenantId: string;/);
    expect(code).toMatch(/orderId: string;/);
    // Comment about composite PK
    expect(code).toMatch(/Composite primary key: \[tenantId, orderId\]/);
  });
});

describe('KyselyProjection — preserves IR source order', () => {
  it('Beta before Alpha in IR → Beta before Alpha in output', () => {
    const ir = emptyIR();
    const beta: IREntity = {
      name: 'Beta',
      properties: [{ name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] }],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    };
    const alpha: IREntity = {
      name: 'Alpha',
      properties: [{ name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] }],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    };
    ir.entities.push(beta, alpha);
    ir.stores.push(durableStore('Beta'), durableStore('Alpha'));

    const result = new KyselyProjection().generate(ir, { surface: 'kysely.types' });
    const code = result.artifacts[0].code;
    const betaPos = code.indexOf('export interface BetaTable');
    const alphaPos = code.indexOf('export interface AlphaTable');
    expect(betaPos).toBeGreaterThan(-1);
    expect(alphaPos).toBeGreaterThan(-1);
    expect(betaPos).toBeLessThan(alphaPos);
  });
});

describe('KyselyProjection — import optimization', () => {
  it('imports Generated when entities have id columns', () => {
    const ir = emptyIR();
    ir.entities.push(widgetEntity());
    ir.stores.push(durableStore('Widget'));

    const code = new KyselyProjection().generate(ir, { surface: 'kysely.types' }).artifacts[0].code;
    expect(code).toMatch(/import type \{ Generated \} from 'kysely';/);
  });

  it('imports ColumnType when entities have datetime columns', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'createdAt', type: { name: 'datetime', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new KyselyProjection().generate(ir, { surface: 'kysely.types' }).artifacts[0].code;
    expect(code).toMatch(/import type \{ Generated, ColumnType \} from 'kysely';/);
  });
});

describe('KyselyProjection — default values', () => {
  it('emits Generated<> for property with default value', () => {
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
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new KyselyProjection().generate(ir, { surface: 'kysely.types' }).artifacts[0].code;
    expect(code).toMatch(/status: Generated<string>;/);
  });
});

describe('KyselyProjection — array types', () => {
  it('emits array<string> as string[]', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Taggable',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'tags', type: { name: 'array', generic: { name: 'string', nullable: false }, nullable: false }, modifiers: [] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Taggable'));

    const code = new KyselyProjection().generate(ir, { surface: 'kysely.types' }).artifacts[0].code;
    expect(code).toMatch(/tags: string\[\];/);
  });
});
