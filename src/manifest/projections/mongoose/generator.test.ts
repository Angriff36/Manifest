/**
 * Mongoose projection — generic-fixture tests.
 */

import { describe, it, expect } from 'vitest';
import type { IR, IREntity, IRStore } from '../../ir';
import { MongooseProjection } from './generator.js';

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

function mongoStore(entityName: string): IRStore {
  return { entity: entityName, target: 'mongodb', config: {} };
}

describe('MongooseProjection — metadata', () => {
  it('declares name and mongoose.schema surface', () => {
    const p = new MongooseProjection();
    expect(p.name).toBe('mongoose');
    expect(p.surfaces).toEqual(['mongoose.schema']);
  });

  it('rejects unknown surfaces', () => {
    const result = new MongooseProjection().generate(emptyIR(), { surface: 'mongoose.unknown' });
    expect(result.diagnostics[0]?.code).toBe('UNKNOWN_SURFACE');
  });
});

describe('MongooseProjection — schema emission', () => {
  it('emits Schema + model for mongodb-backed entities', () => {
    const ir = emptyIR();
    ir.entities.push(widgetEntity());
    ir.stores.push(mongoStore('Widget'));

    const result = new MongooseProjection().generate(ir, { surface: 'mongoose.schema' });
    const code = result.artifacts[0].code;

    expect(code).toMatch(/import \{ Schema, model \} from 'mongoose'/);
    expect(code).toMatch(/export const WidgetSchema = new Schema\(\{/);
    expect(code).toMatch(/name: \{ type: String, required: true \}/);
    expect(code).toMatch(/qty: \{ type: Number, required: true \}/);
    expect(code).toMatch(/model\('Widget', WidgetSchema, 'widget'\)/);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('skips non-mongodb store targets', () => {
    const ir = emptyIR();
    ir.entities.push(widgetEntity());
    ir.stores.push({ entity: 'Widget', target: 'postgres', config: {} });

    const result = new MongooseProjection().generate(ir, { surface: 'mongoose.schema' });
    expect(result.artifacts[0].code).not.toMatch(/WidgetSchema/);
    expect(result.diagnostics.some((d) => d.code === 'MONGOOSE_SKIPPED_INCOMPATIBLE')).toBe(true);
  });

  it('applies collectionMappings and fieldMappings', () => {
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
    ir.stores.push(mongoStore('Widget'));

    const code = new MongooseProjection().generate(ir, {
      surface: 'mongoose.schema',
      options: {
        collectionMappings: { Widget: 'widgets' },
        fieldMappings: { Widget: { createdAt: 'created_at' } },
      },
    }).artifacts[0].code;

    expect(code).toMatch(/created_at: \{ type: Date/);
    expect(code).not.toMatch(/createdAt:/);
    expect(code).toMatch(/'widgets'\)/);
  });

  it('emits ObjectId FK for belongsTo when not already a property', () => {
    const ir = emptyIR();
    ir.entities.push(
      {
        name: 'Author',
        properties: [
          { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        ],
        computedProperties: [],
        relationships: [{ name: 'books', kind: 'hasMany', target: 'Book' }],
        commands: [],
        constraints: [],
        policies: [],
      },
      {
        name: 'Book',
        properties: [
          { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        ],
        computedProperties: [],
        relationships: [{ name: 'author', kind: 'belongsTo', target: 'Author' }],
        commands: [],
        constraints: [],
        policies: [],
      },
    );
    ir.stores.push(mongoStore('Author'), mongoStore('Book'));

    const code = new MongooseProjection().generate(ir, { surface: 'mongoose.schema' }).artifacts[0]
      .code;
    expect(code).toMatch(/authorId: \{ type: Schema\.Types\.ObjectId, ref: 'Author' \}/);
  });

  it('errors on bare number without typeMappings', () => {
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
    ir.stores.push(mongoStore('Widget'));

    const result = new MongooseProjection().generate(ir, { surface: 'mongoose.schema' });
    expect(result.diagnostics.some((d) => d.code === 'MONGOOSE_AMBIGUOUS_NUMBER')).toBe(true);
    expect(result.artifacts[0].code).not.toMatch(/qty:/);
  });

  it('never emits computedProperties as fields', () => {
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
    ir.stores.push(mongoStore('Widget'));

    const code = new MongooseProjection().generate(ir, { surface: 'mongoose.schema' }).artifacts[0]
      .code;
    expect(code).toMatch(/price:/);
    expect(code).not.toMatch(/total:/);
  });
});
