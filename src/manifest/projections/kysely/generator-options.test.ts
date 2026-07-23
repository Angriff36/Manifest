/**
 * Kysely projection — config, relationships, imports, and structural options.
 */

import { describe, it, expect } from 'vitest';
import type { IREntity } from '../../ir';
import { KyselyProjection } from './generator.js';
import { bareEntity, durableStore, emptyIR, widgetEntity } from './test-fixtures.js';

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
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
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
        commands: [],
        constraints: [],
        policies: [],
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
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
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
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
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

    const code = new KyselyProjection().generate(ir, { surface: 'kysely.types' }).artifacts[0].code;
    expect(code).toMatch(/tags: string\[\];/);
  });
});
