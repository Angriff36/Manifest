/**
 * Helper script to generate conformance test results
 * Run with: npx tsx scripts/generate-results.ts
 */

import { compileToIR } from '../src/manifest/ir-compiler';
import { RuntimeEngine, RuntimeOptions } from '../src/manifest/runtime-engine';
import { readFileSync } from 'fs';
import { join } from 'path';

const FIXTURES_DIR = join(process.cwd(), 'src', 'manifest', 'conformance', 'fixtures');

const DETERMINISTIC_TIMESTAMP = 1000000000000;
let idCounter = 0;

function createDeterministicOptions(): RuntimeOptions {
  idCounter = 0;
  return {
    generateId: () => `test-id-${++idCounter}`,
    now: () => DETERMINISTIC_TIMESTAMP,
  };
}

async function testComputeAction() {
  console.log('\n=== Testing 09-compute-action ===');

  const source = readFileSync(join(FIXTURES_DIR, '09-compute-action.manifest'), 'utf-8');
  const { ir } = compileToIR(source);

  if (!ir) {
    console.error('Failed to compile IR');
    return;
  }

  const engine = new RuntimeEngine(ir, {}, createDeterministicOptions());

  // Test 1: addItem with assignment form
  console.log('\nTest 1: addItem with assignment form');
  engine.createInstance('Inventory', { id: 'inv-1', quantity: 10, lowStock: false });
  const result1 = await engine.runCommand('addItem', { amount: 5 }, {
    entityName: 'Inventory',
    instanceId: 'inv-1',
  });
  console.log('Result:', result1);
  console.log('Instance state:', engine.getInstance('Inventory', 'inv-1'));

  // Test 2: addItem starting from zero
  console.log('\nTest 2: addItem starting from zero');
  engine.createInstance('Inventory', { id: 'inv-2', quantity: 0, lowStock: false });
  const result2 = await engine.runCommand('addItem', { amount: 10 }, {
    entityName: 'Inventory',
    instanceId: 'inv-2',
  });
  console.log('Result:', result2);
  console.log('Instance state:', engine.getInstance('Inventory', 'inv-2'));

  // Test 3: checkStock (expression form)
  console.log('\nTest 3: checkStock (expression form - computed property)');
  engine.createInstance('Inventory', { id: 'inv-3', quantity: 3, lowStock: false });
  const result3 = await engine.runCommand('checkStock', {}, {
    entityName: 'Inventory',
    instanceId: 'inv-3',
  });
  console.log('Result:', result3);
  console.log('Instance state:', engine.getInstance('Inventory', 'inv-3'));
}

async function testEventLog() {
  console.log('\n=== Testing 15-event-log ===');

  const source = readFileSync(join(FIXTURES_DIR, '15-event-log.manifest'), 'utf-8');
  const { ir } = compileToIR(source);

  if (!ir) {
    console.error('Failed to compile IR');
    return;
  }

  const engine = new RuntimeEngine(ir, {}, createDeterministicOptions());

  // Test 1: addItem emits OrderUpdated event
  console.log('\nTest 1: addItem emits OrderUpdated event');
  engine.createInstance('Order', { id: 'order-1', total: 0 });
  const result1 = await engine.runCommand('addItem', { amount: 50 }, {
    entityName: 'Order',
    instanceId: 'order-1',
  });
  console.log('Result:', JSON.stringify(result1, null, 2));
  console.log('Instance state:', engine.getInstance('Order', 'order-1'));

  // Test 2: multiple addItem calls
  console.log('\nTest 2: multiple addItem calls');
  engine.createInstance('Order', { id: 'order-2', total: 100 });
  await engine.runCommand('addItem', { amount: 25 }, {
    entityName: 'Order',
    instanceId: 'order-2',
  });
  const result2 = await engine.runCommand('addItem', { amount: 75 }, {
    entityName: 'Order',
    instanceId: 'order-2',
  });
  console.log('Result:', JSON.stringify(result2, null, 2));
  console.log('Instance state:', engine.getInstance('Order', 'order-2'));

  // Test 3: complete emits OrderCompleted event
  console.log('\nTest 3: complete emits OrderCompleted event');
  engine.createInstance('Order', { id: 'order-3', total: 200 });
  const result3 = await engine.runCommand('complete', {}, {
    entityName: 'Order',
    instanceId: 'order-3',
  });
  console.log('Result:', JSON.stringify(result3, null, 2));
  console.log('Instance state:', engine.getInstance('Order', 'order-3'));

  // Test 4: get event log
  console.log('\nTest 4: get event log');
  const events = engine.getEventLog();
  console.log('Event log:', JSON.stringify(events, null, 2));
}

async function main() {
  await testComputeAction();
  await testEventLog();
}

main().catch(console.error);
