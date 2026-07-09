import { describe, it, expect } from 'vitest';
import type { IR } from '../ir.js';
import { buildSeedTemplate } from './template.js';
import { validateSeedPack } from './validate.js';
import { fillSeedPack } from './fill.js';
import { createHeuristicFillProvider } from './fill-providers.js';
import { FILL_PLACEHOLDER } from './types.js';

function buildIR(): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'test',
      compilerVersion: '1.0.0',
      schemaVersion: '1.0',
      compiledAt: '2024-01-01T00:00:00.000Z',
    },
    modules: [],
    values: [],
    entities: [
      {
        name: 'Vendor',
        properties: [
          { name: 'name', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        ],
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [],
        policies: [],
      },
      {
        name: 'Requisition',
        properties: [
          { name: 'title', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        ],
        computedProperties: [],
        relationships: [
          {
            name: 'vendor',
            kind: 'belongsTo',
            target: 'Vendor',
            foreignKey: { fields: ['vendorId'] },
          },
        ],
        commands: [],
        constraints: [],
        policies: [],
      },
      {
        name: 'Vehicle',
        properties: [
          { name: 'label', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        ],
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [],
        policies: [],
      },
    ],
    enums: [],
    stores: [],
    events: [],
    commands: [],
    policies: [],
  };
}

describe('seed-pack validate', () => {
  it('errors when pack entity missing from IR', () => {
    const ir = buildIR();
    const pack = buildSeedTemplate(ir, { packId: 'd', version: '1', count: 1 });
    pack.tables.push({
      entity: 'Ghost',
      columns: ['seedKey', 'name'],
      rows: [{ seedKey: 'g-1', name: 'x' }],
    });
    pack.meta.entities.push('Ghost');
    const v = validateSeedPack(ir, pack);
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.code === 'entity_missing')).toBe(true);
  });

  it('errors on unknown column', () => {
    const ir = buildIR();
    const pack = buildSeedTemplate(ir, { packId: 'd', version: '1', count: 1, entity: ['Vendor'] });
    pack.tables[0]!.columns.push('notAField');
    pack.tables[0]!.rows[0]!.notAField = 'x';
    const v = validateSeedPack(ir, pack);
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.code === 'column_unknown')).toBe(true);
  });

  it('does not fail when unused IR entity exists', () => {
    const ir = buildIR();
    const pack = buildSeedTemplate(ir, {
      packId: 'd',
      version: '1',
      count: 1,
      entity: ['Vendor', 'Requisition'],
    });
    // fill FKs + required
    pack.tables[0]!.rows[0]!.name = 'Acme';
    pack.tables[1]!.rows[0]!.title = 'Paper';
    pack.tables[1]!.rows[0]!.vendor = 'vendor-1';
    const v = validateSeedPack(ir, pack, { requireFilled: true });
    expect(v.ok).toBe(true);
    expect(v.warnings.some((w) => w.entity === 'Vehicle')).toBe(true);
  });

  it('errors on missing FK seedKey', () => {
    const ir = buildIR();
    const pack = buildSeedTemplate(ir, {
      packId: 'd',
      version: '1',
      count: 1,
      entity: ['Vendor', 'Requisition'],
    });
    pack.tables[0]!.rows[0]!.name = 'Acme';
    pack.tables[1]!.rows[0]!.title = 'Paper';
    pack.tables[1]!.rows[0]!.vendor = 'no-such-vendor';
    const v = validateSeedPack(ir, pack);
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.code === 'fk_seedKey_missing')).toBe(true);
  });

  it('errors on duplicate seedKey', () => {
    const ir = buildIR();
    const pack = buildSeedTemplate(ir, { packId: 'd', version: '1', count: 2, entity: ['Vendor'] });
    pack.tables[0]!.rows[1]!.seedKey = pack.tables[0]!.rows[0]!.seedKey;
    const v = validateSeedPack(ir, pack);
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.code === 'seedKey_duplicate')).toBe(true);
  });

  it('requireFilled flags blank required props', () => {
    const ir = buildIR();
    const pack = buildSeedTemplate(ir, { packId: 'd', version: '1', count: 1, entity: ['Vendor'] });
    expect(pack.tables[0]!.rows[0]!.name).toBe(FILL_PLACEHOLDER);
    const v = validateSeedPack(ir, pack, { requireFilled: true });
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.code === 'required_blank')).toBe(true);
  });
});

describe('seed-pack fill', () => {
  it('fills blanks without overwriting reviewed values', async () => {
    const ir = buildIR();
    const pack = buildSeedTemplate(ir, {
      packId: 'd',
      version: '1',
      count: 1,
      entity: ['Vendor', 'Requisition'],
    });
    pack.tables[0]!.rows[0]!.name = 'Acme';
    const filled = await fillSeedPack(ir, pack, {
      provider: createHeuristicFillProvider(42),
    });
    expect(filled.tables[0]!.rows[0]!.name).toBe('Acme');
    expect(filled.tables[1]!.rows[0]!.title).not.toBe(FILL_PLACEHOLDER);
    expect(filled.tables[1]!.rows[0]!.vendor).toBe('vendor-1');
    const v = validateSeedPack(ir, filled, { requireFilled: true });
    expect(v.ok).toBe(true);
  });

  it('overwrite regenerates existing values', async () => {
    const ir = buildIR();
    const pack = buildSeedTemplate(ir, { packId: 'd', version: '1', count: 1, entity: ['Vendor'] });
    pack.tables[0]!.rows[0]!.name = 'Acme';
    const filled = await fillSeedPack(ir, pack, {
      provider: createHeuristicFillProvider(7),
      overwrite: true,
    });
    expect(filled.tables[0]!.rows[0]!.name).not.toBe('Acme');
  });
});
