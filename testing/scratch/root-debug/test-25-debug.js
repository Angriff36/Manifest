// Quick test to verify fixture 25 constraint evaluation
import { compileToIR } from './src/manifest/ir-compiler';
import { RuntimeEngine } from './src/manifest/runtime-engine';

const source = `
entity Order {
  property required id: string
  property required customerId: string
  property required status: string = "pending"
  property amount: number = 0

  command updateStatus(newStatus: string) {
    constraint statusChangeAllowed: newStatus != "cancelled" or self.status == "cancelled" "Cannot cancel an already cancelled order"
    constraint amountVerified: self.amount >= 100 or self.status == "cancelled" "Orders under $100 require manual approval"

    mutate status = newStatus
    emit OrderStatusChanged
  }

  command cancel() {
    constraint cannotCancelCancelled: self.status != "cancelled" "Cannot cancel an already cancelled order"
    constraint verifyCancellation: true "Cancellation confirmed"

    mutate status = "cancelled"
    emit OrderCancelled
  }
}

store Order in memory

event OrderStatusChanged: "order.status.changed" {
  orderId: string
}

event OrderCancelled: "order.cancelled" {
  orderId: string
}
`;

async function test() {
  const { ir } = await compileToIR(source);
  const engine = new RuntimeEngine(ir, {}, {
    generateId: () => 'test-id-1',
    now: () => 1000000000000,
  });

  console.log('Test 1: updateStatus with valid parameters');
  const order1 = await engine.createInstance('Order', {
    id: 'order1',
    customerId: 'customer1',
    status: 'pending',
    amount: 150
  });
  console.log('Created order:', order1);

  const result1 = await engine.runCommand('updateStatus', { newStatus: 'processing' }, {
    entityName: 'Order',
    instanceId: 'order1'
  });
  console.log('Result:', result1.success, result1.error, result1.constraintOutcomes);

  console.log('\nTest 4: updateStatus from cancelled with block constraint');
  const order4 = await engine.createInstance('Order', {
    id: 'order4',
    customerId: 'customer4',
    status: 'cancelled',
    amount: 200
  });
  console.log('Created order:', order4);

  const result4 = await engine.runCommand('updateStatus', { newStatus: 'shipped' }, {
    entityName: 'Order',
    instanceId: 'order4'
  });
  console.log('Result:', result4.success, result4.error, result4.constraintOutcomes);

  console.log('\nTest 5: cancel already cancelled order');
  const order5 = await engine.createInstance('Order', {
    id: 'order5',
    customerId: 'customer5',
    status: 'cancelled',
    amount: 100
  });
  console.log('Created order:', order5);

  const result5 = await engine.runCommand('cancel', {}, {
    entityName: 'Order',
    instanceId: 'order5'
  });
  console.log('Result:', result5.success, result5.error, result5.constraintOutcomes);
}

test().catch(console.error);
