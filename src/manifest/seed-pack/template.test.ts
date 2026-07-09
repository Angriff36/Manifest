import { describe, it, expect } from 'vitest';
import type { IR } from '../ir.js';
import { buildSeedTemplate } from './template.js';
import { FILL_PLACEHOLDER } from './types.js';

function buildVendorRequisitionIR(): IR {
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
          { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
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
          { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
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
        name: 'ExternalThing',
        external: true,
        properties: [],
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

describe('seed-pack template', () => {
  it('builds blank rows with seedKeys and skips id/external', () => {
    const pack = buildSeedTemplate(buildVendorRequisitionIR(), {
      packId: 'demo',
      version: '1.0.0',
      count: 2,
    });
    expect(pack.meta.entities).toEqual(['Vendor', 'Requisition']);
    const vendor = pack.tables.find((t) => t.entity === 'Vendor')!;
    expect(vendor.columns[0]).toBe('seedKey');
    expect(vendor.columns).not.toContain('id');
    expect(vendor.rows[0]!.seedKey).toBe('vendor-1');
    expect(vendor.rows[0]!.name).toBe(FILL_PLACEHOLDER);
    const req = pack.tables.find((t) => t.entity === 'Requisition')!;
    expect(req.columns).toContain('vendor');
    expect(req.rows[0]!.vendor).toBe(FILL_PLACEHOLDER);
  });
});
