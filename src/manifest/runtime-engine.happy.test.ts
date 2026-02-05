import { expect, test } from 'vitest';
import { compileToIR } from './ir-compiler';
import { RuntimeEngine } from './runtime-engine';
import { examples } from './examples';

test('order addItem succeeds with localStorage target', async () => {
  // Use examples[1] which uses localStorage (a supported storage target)
  // examples[0] uses supabase which is not yet implemented
  const source = examples[1].code;
  const { ir, diagnostics } = compileToIR(source);

  expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  expect(ir).not.toBeNull();

  // Create runtime with deterministic time/ID for testing
  const engine = new RuntimeEngine(ir!, {
    user: { id: 'u1', role: 'customer' },
    now: () => 1000,
    generateId: () => 'test-id-1'
  });

  // Create an Order with default status "draft"
  const instance = await engine.createInstance('Order', {
    id: 'order-1',
    customerId: 'cust-1'
  });

  expect(instance).toBeDefined();
  expect(instance?.status).toBe('draft');

  // Execute addItem to add an item to the order
  const result = await engine.runCommand(
    'addItem',
    { productId: 'prod-1', name: 'Test Product', price: 10, quantity: 2 },
    { entityName: 'Order', instanceId: instance!.id }
  );

  // Assert success and event is emitted
  expect(result.success).toBe(true);
  expect(result.emittedEvents.length).toBe(1);
  expect(result.emittedEvents[0].name).toBe('itemAdded');
});
