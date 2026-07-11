import { describe, it, expect } from 'vitest';
import { compileToIR } from './ir-compiler';
import { RuntimeEngine, type EntityInstance } from './runtime-engine';

/**
 * G7: explicit event payloads — `emit Event { field: expr }`.
 *
 * Before this feature an emitted event carried only `{ ...commandInput, result }`,
 * so declared event fields were never populated and reactions reading them got
 * `undefined`. Authors can now attach explicit payload field expressions, which
 * are evaluated against the post-action context (self = current instance) and
 * merged into the emitted payload.
 */
describe('emit with explicit payload', () => {
  const source = `
    entity Order {
      property required id: string
      property total: number = 0
      property status: string = "open"

      command complete() {
        mutate status = "completed"
        emit OrderCompleted {
          orderId: self.id,
          finalTotal: self.total
        }
      }

      store in memory
    }

    event OrderCompleted: "order.completed" {
      orderId: string
      finalTotal: number
    }
  `;

  it('populates declared event fields from the payload expressions', async () => {
    const { ir, diagnostics } = await compileToIR(source);
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(ir).not.toBeNull();

    const engine = new RuntimeEngine(ir!, {}, { now: () => 1000, generateId: () => 'test-id' });
    await engine.createInstance('Order', {
      id: 'order-1',
      total: 100,
      status: 'open',
    } as EntityInstance);

    const result = await engine.runCommand(
      'complete',
      {},
      { entityName: 'Order', instanceId: 'order-1' },
    );

    expect(result.success).toBe(true);
    expect(result.emittedEvents).toHaveLength(1);
    expect(result.emittedEvents[0].payload).toMatchObject({
      orderId: 'order-1',
      finalTotal: 100,
    });
  });
});
