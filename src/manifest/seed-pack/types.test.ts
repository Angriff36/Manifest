import { describe, it, expect } from 'vitest';
import {
  FILL_PLACEHOLDER,
  SAMPLE_DATA_ROW_ENTITY,
  isBlankCell,
  slugEntity,
} from './types.js';
import { buildSampleDataRowId, toSampleDataRowRecord } from './sample-data-row.js';

describe('seed-pack types', () => {
  it('treats empty and {{fill}} as blank', () => {
    expect(isBlankCell('')).toBe(true);
    expect(isBlankCell('  ')).toBe(true);
    expect(isBlankCell(FILL_PLACEHOLDER)).toBe(true);
    expect(isBlankCell('Acme')).toBe(false);
  });

  it('exports SampleDataRow entity name', () => {
    expect(SAMPLE_DATA_ROW_ENTITY).toBe('SampleDataRow');
  });

  it('slugs entity names for seedKeys', () => {
    expect(slugEntity('PurchaseOrder')).toBe('purchase-order');
  });

  it('builds stable SampleDataRow ids', () => {
    const id = buildSampleDataRowId('t1', 'demo', '1.0.0', 'Vendor', 'vendor-1');
    expect(id).toBe('t1:demo:1.0.0:Vendor:vendor-1');
    const row = toSampleDataRowRecord({
      tenantId: 't1',
      packId: 'demo',
      version: '1.0.0',
      entity: 'Vendor',
      seedKey: 'vendor-1',
      instanceId: 'uuid-1',
    });
    expect(row.id).toBe(id);
    expect(row.instanceId).toBe('uuid-1');
  });
});
