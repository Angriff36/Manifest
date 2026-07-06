/**
 * Composite foreign keys are unsupported at runtime and MUST fail closed.
 *
 * The reference runtime resolves single-column foreign keys only. A composite
 * `foreignKey.fields` (length > 1) previously fell back to the `${relName}Id`
 * convention, which can silently resolve the WRONG row. Instead the runtime
 * MUST raise a structured COMPOSITE_FK_UNSUPPORTED error.
 *
 * Spec: docs/spec/semantics.md § Relationship Resolution Rules.
 */

import { describe, expect, it } from 'vitest';
import { IRCompiler } from './ir-compiler';
import type { IR, IRExpression } from './ir';
import { RuntimeEngine } from './runtime-engine';

async function compile(source: string): Promise<IR> {
  const compiler = new IRCompiler();
  const result = await compiler.compileToIR(source);
  if (!result.ir) {
    throw new Error(`Compilation failed: ${result.diagnostics.map(d => d.message).join(', ')}`);
  }
  return result.ir;
}

const member = (property: string): IRExpression => ({
  kind: 'member',
  object: { kind: 'identifier', name: 'self' },
  property,
});

describe('composite foreign key runtime resolution', () => {
  it('throws COMPOSITE_FK_UNSUPPORTED when resolving a composite belongsTo', async () => {
    const ir = await compile(`
      entity Order {
        property required id: string
        property required tenantId: string
        hasMany lines: Line
      }
      entity Line {
        property required id: string
        property required orderId: string
        property required tenantId: string
        belongsTo order: Order fields [orderId, tenantId] references [id, tenantId]
      }
      store Order in memory
      store Line in memory
    `);
    const engine = new RuntimeEngine(ir);
    const self = { id: 'l1', _entity: 'Line', orderId: 'o1', tenantId: 't1' };

    await expect(engine.evaluateExpression(member('order'), { self })).rejects.toThrow(
      /COMPOSITE_FK_UNSUPPORTED/
    );
  });

  it('exposes a structured `code` on the thrown error', async () => {
    const ir = await compile(`
      entity Order {
        property required id: string
        property required tenantId: string
        hasMany lines: Line
      }
      entity Line {
        property required id: string
        property required orderId: string
        property required tenantId: string
        belongsTo order: Order fields [orderId, tenantId] references [id, tenantId]
      }
      store Order in memory
      store Line in memory
    `);
    const engine = new RuntimeEngine(ir);
    const self = { id: 'l1', _entity: 'Line', orderId: 'o1', tenantId: 't1' };

    await expect(engine.evaluateExpression(member('order'), { self })).rejects.toMatchObject({
      code: 'COMPOSITE_FK_UNSUPPORTED',
    });
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
