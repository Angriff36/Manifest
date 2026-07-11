/**
 * Composite foreign keys resolve to the correct row at runtime.
 *
 * The reference runtime formerly failed closed (COMPOSITE_FK_UNSUPPORTED) on any
 * multi-column `foreignKey.fields`. It now resolves composite relationships by
 * matching every FK column against the target's referenced columns, so it picks
 * the exact row even when several targets share a first-column value.
 *
 * Spec: docs/spec/semantics.md § Composite Keys / Relationship Resolution Rules.
 */

import { describe, expect, it } from 'vitest';
import { IRCompiler } from './ir-compiler';
import type { IR, IRExpression } from './ir';
import { RuntimeEngine, type EntityInstance } from './runtime-engine';

async function compile(source: string): Promise<IR> {
  const compiler = new IRCompiler();
  const result = await compiler.compileToIR(source);
  if (!result.ir) {
    throw new Error(`Compilation failed: ${result.diagnostics.map((d) => d.message).join(', ')}`);
  }
  return result.ir;
}

const member = (property: string): IRExpression => ({
  kind: 'member',
  object: { kind: 'identifier', name: 'self' },
  property,
});

const COMPOSITE_SOURCE = `
  entity Order {
    property required orderId: string
    property required tenantId: string
    property status: string
    key [tenantId, orderId]
    hasMany lines: Line
  }
  entity Line {
    property required lineNo: string
    property required orderId: string
    property required tenantId: string
    belongsTo order: Order fields [orderId, tenantId] references [orderId, tenantId]
  }
  store Order in memory
  store Line in memory
`;

describe('composite foreign key runtime resolution', () => {
  it('resolves a composite belongsTo to the exact target row', async () => {
    const ir = await compile(COMPOSITE_SOURCE);
    const engine = new RuntimeEngine(ir);
    await engine.createInstance('Order', { orderId: 'o1', tenantId: 't1', status: 'open' });
    const line = (await engine.createInstance('Line', {
      lineNo: '1',
      orderId: 'o1',
      tenantId: 't1',
    }))!;

    const resolved = (await engine.evaluateExpression(member('order'), {
      self: { ...line, _entity: 'Line' },
    })) as EntityInstance;
    expect(resolved).not.toBeNull();
    expect(resolved.tenantId).toBe('t1');
    expect(resolved.orderId).toBe('o1');
    expect(resolved.status).toBe('open');
  });

  it('disambiguates targets that share a single FK column (picks the right tenant)', async () => {
    const ir = await compile(COMPOSITE_SOURCE);
    const engine = new RuntimeEngine(ir);
    // Two orders share orderId 'o1'; only the composite (tenant + order) is unique.
    await engine.createInstance('Order', { orderId: 'o1', tenantId: 't1', status: 'open' });
    await engine.createInstance('Order', { orderId: 'o1', tenantId: 't2', status: 'closed' });
    const line = (await engine.createInstance('Line', {
      lineNo: '1',
      orderId: 'o1',
      tenantId: 't2',
    }))!;

    const resolved = (await engine.evaluateExpression(member('order'), {
      self: { ...line, _entity: 'Line' },
    })) as EntityInstance;
    expect(resolved.tenantId).toBe('t2');
    expect(resolved.status).toBe('closed');
  });

  it('resolves a composite hasMany inverse to all matching rows', async () => {
    const ir = await compile(COMPOSITE_SOURCE);
    const engine = new RuntimeEngine(ir);
    const order = (await engine.createInstance('Order', {
      orderId: 'o1',
      tenantId: 't1',
      status: 'open',
    }))!;
    await engine.createInstance('Line', { lineNo: '1', orderId: 'o1', tenantId: 't1' });
    await engine.createInstance('Line', { lineNo: '2', orderId: 'o1', tenantId: 't1' });
    // A line in another tenant that shares orderId must NOT match.
    await engine.createInstance('Line', { lineNo: '9', orderId: 'o1', tenantId: 't2' });

    const lines = (await engine.evaluateExpression(member('lines'), {
      self: { ...order, _entity: 'Order' },
    })) as EntityInstance[];
    expect(Array.isArray(lines)).toBe(true);
    expect(lines.map((l) => l.lineNo).sort()).toEqual(['1', '2']);
  });

  it('returns null for a composite belongsTo when the target is absent', async () => {
    const ir = await compile(COMPOSITE_SOURCE);
    const engine = new RuntimeEngine(ir);
    const line = (await engine.createInstance('Line', {
      lineNo: '1',
      orderId: 'missing',
      tenantId: 't1',
    }))!;

    await expect(
      engine.evaluateExpression(member('order'), { self: { ...line, _entity: 'Line' } }),
    ).resolves.toBeNull();
  });

  it('still resolves a single-column belongsTo without throwing (returns null when absent)', async () => {
    const ir = await compile(`
      entity Order {
        property required id: string
        hasMany lines: Line
      }
      entity Line {
        property required id: string
        property required orderId: string
        belongsTo order: Order fields [orderId] references [id]
      }
      store Order in memory
      store Line in memory
    `);
    const engine = new RuntimeEngine(ir);
    const self = { id: 'l1', _entity: 'Line', orderId: 'missing' };

    await expect(engine.evaluateExpression(member('order'), { self })).resolves.toBeNull();
  });
});
