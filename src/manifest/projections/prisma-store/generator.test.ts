import { describe, it, expect } from 'vitest';
import type { IR, IREntity, IRStore } from '../../ir';
import { PrismaStoreProjection } from './generator.js';

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
      { name: 'tenantId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      { name: 'version', type: { name: 'int', nullable: false }, modifiers: [] },
      { name: 'deletedAt', type: { name: 'datetime', nullable: true }, modifiers: [] },
    ],
    computedProperties: [],
    relationships: [],
    commands: [],
    constraints: [],
    policies: [],
    versionProperty: 'version',
  };
}

function durableStore(entityName: string): IRStore {
  return { entity: entityName, target: 'durable', config: {} };
}

describe('PrismaStoreProjection', () => {
  it('declares metadata and registry surfaces', () => {
    const p = new PrismaStoreProjection();
    expect(p.name).toBe('prisma-store');
    expect(p.surfaces).toEqual(['prisma-store.metadata', 'prisma-store.registry']);
  });

  it('emits metadata with snake_case columns and soft-delete flag', () => {
    const ir: IR = {
      ...emptyIR(),
      entities: [widgetEntity()],
      stores: [durableStore('Widget')],
    };
    const p = new PrismaStoreProjection();
    const result = p.generate(ir, {
      surface: 'prisma-store.metadata',
      options: { naming: 'snake_case' },
    });

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].pathHint).toBe('prisma-model-metadata.generated.ts');
    expect(result.artifacts[0].code).toContain('PRISMA_MODEL_METADATA');
    expect(result.artifacts[0].code).toContain('"accessor": "widgets"');
    expect(result.artifacts[0].code).toContain('"hasDeletedAt": true');
    expect(result.artifacts[0].code).toContain('"versionProperty": "version"');
    expect(result.artifacts[0].code).toContain('"name": "tenant_id"');
  });

  it('emits registry listing durable entities', () => {
    const ir: IR = {
      ...emptyIR(),
      entities: [widgetEntity()],
      stores: [durableStore('Widget')],
    };
    const p = new PrismaStoreProjection();
    const result = p.generate(ir, { surface: 'prisma-store.registry' });

    expect(result.artifacts[0].code).toContain('DURABLE_ENTITY_NAMES');
    expect(result.artifacts[0].code).toContain('"Widget"');
    expect(result.artifacts[0].code).toContain('createAllGenericPrismaStores');
  });

  it('skips memory-backed entities', () => {
    const ir: IR = {
      ...emptyIR(),
      entities: [widgetEntity()],
      stores: [{ entity: 'Widget', target: 'memory', config: {} }],
    };
    const p = new PrismaStoreProjection();
    const result = p.generate(ir, { surface: 'prisma-store.metadata' });
    expect(result.artifacts[0].code).toMatch(/PRISMA_MODEL_METADATA[^=]*=\s*\{\s*\}/);
  });

  it('emits status-based soft-delete metadata when configured (D27)', () => {
    const statusEntity: IREntity = {
      name: 'Plan',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'tenantId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'status', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    };
    const ir: IR = {
      ...emptyIR(),
      entities: [statusEntity],
      stores: [durableStore('Plan')],
    };
    const p = new PrismaStoreProjection();
    const result = p.generate(ir, {
      surface: 'prisma-store.metadata',
      options: { softDelete: { Plan: { field: 'status', deletedValue: 'deleted' } } },
    });

    const code = result.artifacts[0].code;
    expect(code).toContain('"softDeleteStatus"');
    expect(code).toContain('"column": "status"');
    expect(code).toContain('"deletedValue": "deleted"');
  });

  it('warns when softDelete references a missing property', () => {
    const ir: IR = {
      ...emptyIR(),
      entities: [widgetEntity()],
      stores: [durableStore('Widget')],
    };
    const p = new PrismaStoreProjection();
    const result = p.generate(ir, {
      surface: 'prisma-store.metadata',
      options: { softDelete: { Widget: { field: 'nope', deletedValue: 'deleted' } } },
    });

    expect(result.artifacts[0].code).not.toContain('softDeleteStatus');
    expect(
      result.diagnostics.some((d) => d.code === 'PRISMA_STORE_SOFT_DELETE_FIELD_MISSING'),
    ).toBe(true);
  });
});
