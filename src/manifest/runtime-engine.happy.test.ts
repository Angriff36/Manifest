import { expect, test } from 'vitest';
import { compileToIR } from './ir-compiler';
import { RuntimeEngine } from './runtime-engine';
import { examples } from './examples';

test('prep task claim succeeds with explicit context', async () => {
  const source = examples[0].code;
  const { ir, diagnostics } = compileToIR(source);

  expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  expect(ir).not.toBeNull();

  // Step 1: Set runtime context with user.role = "cook"
  const engine = new RuntimeEngine(ir!, { user: { id: 'u1', role: 'cook' } });
  
  // Create a PrepTask with status: "pending"
  const instance = engine.createInstance('PrepTask', {
    id: 'task-1',
    name: 'Chop vegetables',
    status: 'pending'
  });

  expect(instance).toBeDefined();
  expect(instance?.status).toBe('pending');

  // Execute claim(employeeId="e1")
  const result = await engine.runCommand(
    'claim',
    { employeeId: 'e1' },
    { entityName: 'PrepTask', instanceId: instance!.id }
  );

  // Assert success and status becomes "in_progress" and event is emitted
  expect(result.success).toBe(true);
  expect(result.emittedEvents.length).toBeGreaterThan(0);
  expect(result.emittedEvents[0].name).toBe('taskClaimed');

  const updated = engine.getInstance('PrepTask', instance!.id);
  expect(updated?.status).toBe('in_progress');
  expect(updated?.assignedTo).toBe('e1');
});
