/**
 * Kysely `columnMappings` option — property/FK keys become SQL column names.
 */

import { describe, it, expect } from 'vitest';
import { KyselyProjection } from './generator.js';
import { bareEntity, durableStore, emptyIR } from './test-fixtures.js';

describe('KyselyProjection — columnMappings', () => {
  it('renames a property key to the mapped SQL column name', () => {
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

    const code = new KyselyProjection().generate(ir, {
      surface: 'kysely.types',
      options: { columnMappings: { Widget: { createdAt: 'created_at' } } },
    }).artifacts[0].code;

    expect(code).toMatch(/created_at: ColumnType<Date,/);
    expect(code).not.toMatch(/createdAt:/);
  });

  it('renames synthesized belongsTo FK columns', () => {
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

    const code = new KyselyProjection().generate(ir, {
      surface: 'kysely.types',
      options: { columnMappings: { Book: { authorId: 'author_id' } } },
    }).artifacts[0].code;

    expect(code).toMatch(/author_id: string;/);
    expect(code).not.toMatch(/authorId:/);
  });
});
