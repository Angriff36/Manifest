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
import type { IREntity } from '../../ir';
import { KyselyProjection } from './generator.js';
import { durableStore, emptyIR, memoryStore, widgetEntity } from './test-fixtures.js';

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
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
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
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
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
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
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
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
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
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
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
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
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
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
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
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
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
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
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