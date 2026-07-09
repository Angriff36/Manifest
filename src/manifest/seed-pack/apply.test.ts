import { describe, it, expect } from 'vitest';
import type { IR } from '../ir.js';
import { buildSeedTemplate } from './template.js';
import { fillSeedPack } from './fill.js';
import { createHeuristicFillProvider } from './fill-providers.js';
import {
  applySeedPack,
  clearSeedPack,
  createMemorySeedStore,
} from './apply.js';
import { SAMPLE_DATA_ROW_ENTITY } from './types.js';
import type { EntityInstance, Store } from '../runtime-engine.js';

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
          { name: 'tenantId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
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
          { name: 'tenantId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
          { name: 'vendorId', type: { name: 'string', nullable: true }, modifiers: ['optional'] },
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
    ],
    enums: [],
    stores: [],
    events: [],
    commands: [],
    policies: [],
  };
}

describe('seed-pack apply/clear', () => {
  it('applies two-phase, is idempotent, and clears only tracked rows', async () => {
    const ir = buildIR();
    let pack = buildSeedTemplate(ir, { packId: 'demo', version: '1.0.0', count: 1 });
    pack = await fillSeedPack(ir, pack, { provider: createHeuristicFillProvider(1) });

    const stores = new Map<string, Store<EntityInstance>>();
    const getStore = (name: string) => {
      let s = stores.get(name);
      if (!s) {
        s = createMemorySeedStore(() => `id-${name}-${stores.size}-${Math.random()}`);
        stores.set(name, s);
      }
      return s;
    };

    // Unrelated real row
    const vendorStore = getStore('Vendor');
    await vendorStore.create({ id: 'real-vendor', name: 'Real Co', tenantId: 't1' });

    const first = await applySeedPack({
      ir,
      pack,
      tenantId: 't1',
      getStore,
    });
    expect(first.applied).toBe(true);
    expect(first.created).toBe(2);
    expect(first.related).toBe(1);

    const vendors = await vendorStore.getAll();
    expect(vendors.some((v) => v.id === 'real-vendor')).toBe(true);
    expect(vendors.length).toBe(2);

    const reqs = await getStore('Requisition').getAll();
    expect(reqs).toHaveLength(1);
    const vendorId = first.seedKeyToId['Vendor:vendor-1'];
    expect(reqs[0]!.vendorId).toBe(vendorId);

    const tracking = await getStore(SAMPLE_DATA_ROW_ENTITY).getAll();
    expect(tracking).toHaveLength(2);

    const second = await applySeedPack({ ir, pack, tenantId: 't1', getStore });
    expect(second.skipped).toBe(true);
    expect((await vendorStore.getAll()).length).toBe(2);

    const cleared = await clearSeedPack({
      tenantId: 't1',
      getStore,
      packId: 'demo',
      version: '1.0.0',
      entities: ['Requisition', 'Vendor'],
    });
    expect(cleared.deletedInstances).toBe(2);
    expect(cleared.deletedTrackingRows).toBe(2);
    expect((await vendorStore.getAll()).map((v) => v.id)).toEqual(['real-vendor']);
    expect(await getStore('Requisition').getAll()).toHaveLength(0);
    expect(await getStore(SAMPLE_DATA_ROW_ENTITY).getAll()).toHaveLength(0);
  });
});
