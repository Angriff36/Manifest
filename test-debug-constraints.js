import { compileToIR } from './src/manifest/ir-compiler.js';
import { RuntimeEngine } from './src/manifest/runtime-engine.js';
import { readFileSync } from 'fs';

async function test() {
  console.log('=== Debugging Constraint Test ===\n');

  const source = readFileSync('./src/manifest/conformance/fixtures/21-constraint-outcomes.manifest', 'utf-8');
  console.log('1. Loading manifest file...');

  const { ir, diagnostics } = await compileToIR(source);
  console.log('2. Compiled manifest. Diagnostics:', diagnostics.length);

  console.log('3. Commands in IR:', ir?.commands?.map(c => ({ name: c.name, entity: c.entity, hasConstraints: !!c.constraints, numConstraints: c.constraints?.length })));

  const engine = new RuntimeEngine(ir, {}, {
    generateId: () => 'test-id-1',
    now: () => 1000000000000,
  });

  console.log('4. Creating Order instance...');
  await engine.createInstance('Order', {
    id: 'o7',
    customerId: 'c7',
    status: 'pending',
    amount: 100,
    priority: 'normal',
    createdAt: 1000000000000
  });

  console.log('5. Instance created. Running updateStatus command...');

  try {
    const result = await engine.runCommand('updateStatus', { newStatus: 'pending' }, {
      entityName: 'Order',
      instanceId: 'o7'
    });

    console.log('6. Command result:', JSON.stringify(result, null, 2));
    console.log('7. Result type:', typeof result);
    console.log('8. Result is null?', result === null);
    console.log('9. Result is undefined?', result === undefined);
  } catch (error) {
    console.error('ERROR:', error);
    console.error('Stack:', error.stack);
  }
}

test().catch(console.error);
