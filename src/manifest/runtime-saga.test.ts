import { describe, it, expect } from 'vitest';
import { RuntimeEngine, type SagaResult } from './runtime-engine';
import { IRCompiler } from './ir-compiler';
import type { IR } from './ir';

async function compileToIR(source: string): Promise<IR> {
  const compiler = new IRCompiler();
  const result = await compiler.compileToIR(source);
  if (!result.ir) {
    throw new Error(`Compilation failed: ${result.diagnostics.map((d) => d.message).join(', ')}`);
  }
  return result.ir;
}

const SAGA_SOURCE = `
entity Payment {
  property required id: string
  property amount: number = 0
  property status: string = "none"

  command charge(amount: number) {
    mutate amount = amount
    mutate status = "charged"
    emit PaymentCharged
  }

  command refund() {
    mutate status = "refunded"
    emit PaymentRefunded
  }

  store in memory
}

entity Inventory {
  property required id: string
  property reserved: boolean = false

  command reserve() {
    mutate reserved = true
    emit InventoryReserved
  }

  command release() {
    mutate reserved = false
    emit InventoryReleased
  }

  store in memory
}

entity Notification {
  property required id: string
  property sent: boolean = false

  command send() {
    mutate sent = true
    emit NotificationSent
  }

  store in memory
}

event PaymentCharged: "payment.charged" { id: string }
event PaymentRefunded: "payment.refunded" { id: string }
event InventoryReserved: "inventory.reserved" { id: string }
event InventoryReleased: "inventory.released" { id: string }
event NotificationSent: "notification.sent" { id: string }
event SagaStarted: "saga.started" { sagaName: string }
event SagaCompleted: "saga.completed" { sagaName: string }
event SagaFailed: "saga.failed" { sagaName: string }
event SagaStepCompleted: "saga.step.completed" { sagaName: string }

saga ProcessOrder {
  step chargePayment {
    command: Payment.charge
    compensate: Payment.refund
  }
  step reserveInventory {
    command: Inventory.reserve
    compensate: Inventory.release
  }
  step notifyCustomer {
    command: Notification.send
  }
  on_failure: "compensate"
  emit SagaStarted
  emit SagaCompleted
  emit SagaFailed
  emit SagaStepCompleted
}
`;

describe('RuntimeEngine – Saga Orchestration', () => {
  let ir: IR;

  it('compiles saga source without errors', async () => {
    ir = await compileToIR(SAGA_SOURCE);
    expect(ir.sagas).toBeDefined();
    expect(ir.sagas).toHaveLength(1);
    expect(ir.sagas![0].name).toBe('ProcessOrder');
    expect(ir.sagas![0].steps).toHaveLength(3);
  });

  describe('happy path', () => {
    it('should execute all saga steps successfully', async () => {
      ir = await compileToIR(SAGA_SOURCE);
      const runtime = new RuntimeEngine(ir);

      const result: SagaResult = await runtime.runSaga('ProcessOrder', {
        chargePayment: { input: { amount: 100 }, instanceId: 'pay-1' },
        reserveInventory: { instanceId: 'inv-1' },
        notifyCustomer: { instanceId: 'notif-1' },
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.saga).toBe('ProcessOrder');
      expect(result.steps).toHaveLength(3);
      expect(result.steps[0].step).toBe('chargePayment');
      expect(result.steps[0].status).toBe('completed');
      expect(result.steps[1].step).toBe('reserveInventory');
      expect(result.steps[1].status).toBe('completed');
      expect(result.steps[2].step).toBe('notifyCustomer');
      expect(result.steps[2].status).toBe('completed');
    });

    it('should emit lifecycle events', async () => {
      ir = await compileToIR(SAGA_SOURCE);
      const runtime = new RuntimeEngine(ir);

      const result: SagaResult = await runtime.runSaga('ProcessOrder', {
        chargePayment: { input: { amount: 50 }, instanceId: 'pay-2' },
        reserveInventory: { instanceId: 'inv-2' },
        notifyCustomer: { instanceId: 'notif-2' },
      });

      expect(result.success).toBe(true);
      const lifecycleEvents = result.emittedEvents.filter((e) =>
        ['SagaStarted', 'SagaCompleted', 'SagaStepCompleted'].includes(e.name),
      );
      // SagaStarted + 3x SagaStepCompleted + SagaCompleted = 5
      const started = lifecycleEvents.filter((e) => e.name === 'SagaStarted');
      const stepCompleted = lifecycleEvents.filter((e) => e.name === 'SagaStepCompleted');
      const completed = lifecycleEvents.filter((e) => e.name === 'SagaCompleted');
      expect(started).toHaveLength(1);
      expect(stepCompleted).toHaveLength(3);
      expect(completed).toHaveLength(1);
    });

    it('should also include command-level emitted events', async () => {
      ir = await compileToIR(SAGA_SOURCE);
      const runtime = new RuntimeEngine(ir);

      const result: SagaResult = await runtime.runSaga('ProcessOrder', {
        chargePayment: { input: { amount: 75 }, instanceId: 'pay-3' },
        reserveInventory: { instanceId: 'inv-3' },
        notifyCustomer: { instanceId: 'notif-3' },
      });

      const commandEvents = result.emittedEvents.filter((e) =>
        ['PaymentCharged', 'InventoryReserved', 'NotificationSent'].includes(e.name),
      );
      expect(commandEvents).toHaveLength(3);
    });
  });

  describe('failure + compensation', () => {
    it('should compensate completed steps when a step fails', async () => {
      // Build a source where the 2nd step's command has a guard that always fails
      const failingSource = `
entity Payment {
  property required id: string
  property amount: number = 0
  property status: string = "none"

  command charge(amount: number) {
    mutate amount = amount
    mutate status = "charged"
    emit PaymentCharged
  }

  command refund() {
    mutate status = "refunded"
    emit PaymentRefunded
  }

  store in memory
}

entity Inventory {
  property required id: string
  property reserved: boolean = false

  command reserve() {
    guard false
    mutate reserved = true
    emit InventoryReserved
  }

  command release() {
    mutate reserved = false
    emit InventoryReleased
  }

  store in memory
}

entity Notification {
  property required id: string
  property sent: boolean = false

  command send() {
    mutate sent = true
    emit NotificationSent
  }

  store in memory
}

event PaymentCharged: "payment.charged" { id: string }
event PaymentRefunded: "payment.refunded" { id: string }
event InventoryReserved: "inventory.reserved" { id: string }
event InventoryReleased: "inventory.released" { id: string }
event NotificationSent: "notification.sent" { id: string }
event SagaStarted: "saga.started" { sagaName: string }
event SagaCompleted: "saga.completed" { sagaName: string }
event SagaFailed: "saga.failed" { sagaName: string }
event SagaStepCompleted: "saga.step.completed" { sagaName: string }

saga ProcessOrder {
  step chargePayment {
    command: Payment.charge
    compensate: Payment.refund
  }
  step reserveInventory {
    command: Inventory.reserve
    compensate: Inventory.release
  }
  step notifyCustomer {
    command: Notification.send
  }
  on_failure: "compensate"
  emit SagaStarted
  emit SagaCompleted
  emit SagaFailed
  emit SagaStepCompleted
}
`;
      const failIr = await compileToIR(failingSource);
      const runtime = new RuntimeEngine(failIr);

      const result: SagaResult = await runtime.runSaga('ProcessOrder', {
        chargePayment: { input: { amount: 100 }, instanceId: 'pay-fail' },
        reserveInventory: { instanceId: 'inv-fail' },
        notifyCustomer: { instanceId: 'notif-fail' },
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('compensated');
      expect(result.failedStep).toBe('reserveInventory');

      // chargePayment should have been compensated (refund executed)
      const chargeStep = result.steps.find((s) => s.step === 'chargePayment');
      expect(chargeStep).toBeDefined();
      expect(chargeStep!.status).toBe('compensated');

      // reserveInventory failed
      const reserveStep = result.steps.find((s) => s.step === 'reserveInventory');
      expect(reserveStep).toBeDefined();
      expect(reserveStep!.status).toBe('failed');

      // notifyCustomer was never reached — should not appear or be skipped
      const notifyStep = result.steps.find((s) => s.step === 'notifyCustomer');
      expect(notifyStep).toBeUndefined();

      // SagaFailed event should have been emitted
      const failedEvent = result.emittedEvents.find((e) => e.name === 'SagaFailed');
      expect(failedEvent).toBeDefined();
    });
  });

  describe('abort mode', () => {
    it('should abort without compensating when on_failure is abort', async () => {
      const abortSource = `
entity Payment {
  property required id: string
  property amount: number = 0
  property status: string = "none"

  command charge(amount: number) {
    mutate amount = amount
    mutate status = "charged"
    emit PaymentCharged
  }

  command refund() {
    mutate status = "refunded"
    emit PaymentRefunded
  }

  store in memory
}

entity Inventory {
  property required id: string
  property reserved: boolean = false

  command reserve() {
    guard false
    mutate reserved = true
  }

  command release() {
    mutate reserved = false
  }

  store in memory
}

event PaymentCharged: "payment.charged" { id: string }
event PaymentRefunded: "payment.refunded" { id: string }
event SagaStarted: "saga.started" { sagaName: string }
event SagaFailed: "saga.failed" { sagaName: string }

saga AbortOrder {
  step chargePayment {
    command: Payment.charge
    compensate: Payment.refund
  }
  step reserveInventory {
    command: Inventory.reserve
    compensate: Inventory.release
  }
  on_failure: "abort"
  emit SagaStarted
  emit SagaFailed
}
`;
      const abortIr = await compileToIR(abortSource);
      const runtime = new RuntimeEngine(abortIr);

      const result: SagaResult = await runtime.runSaga('AbortOrder', {
        chargePayment: { input: { amount: 200 }, instanceId: 'pay-abort' },
        reserveInventory: { instanceId: 'inv-abort' },
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('aborted');
      expect(result.failedStep).toBe('reserveInventory');

      // chargePayment was NOT compensated (abort mode)
      const chargeStep = result.steps.find((s) => s.step === 'chargePayment');
      expect(chargeStep).toBeDefined();
      expect(chargeStep!.status).toBe('completed');

      // No PaymentRefunded event should appear
      const refundEvents = result.emittedEvents.filter((e) => e.name === 'PaymentRefunded');
      expect(refundEvents).toHaveLength(0);
    });
  });

  describe('unknown saga', () => {
    it('should return an error for an unknown saga name', async () => {
      ir = await compileToIR(SAGA_SOURCE);
      const runtime = new RuntimeEngine(ir);

      const result: SagaResult = await runtime.runSaga('NonExistentSaga');
      expect(result.success).toBe(false);
      expect(result.status).toBe('aborted');
      expect(result.error).toContain('Unknown saga');
    });
  });

  // ─── BUG 1: compensation must receive the original step input ──────────
  describe('compensation input + failure reporting', () => {
    // refund() takes `amount` — the SAME input shape as charge(). A correct
    // engine must hand the original forward-step input to the compensation,
    // otherwise refund's guard (amount > 0) fails and nothing is reversed.
    const COMPENSATION_SOURCE = `
entity Payment {
  property required id: string
  property amount: number = 0
  property status: string = "none"

  command charge(amount: number) {
    mutate amount = amount
    mutate status = "charged"
    emit PaymentCharged
  }

  command refund(amount: number) {
    guard amount > 0
    mutate amount = 0
    mutate status = "refunded"
    emit PaymentRefunded
  }

  store in memory
}

entity Inventory {
  property required id: string
  property reserved: boolean = false

  command reserve() {
    guard false
    mutate reserved = true
    emit InventoryReserved
  }

  command release() {
    mutate reserved = false
  }

  store in memory
}

event PaymentCharged: "payment.charged" { id: string }
event PaymentRefunded: "payment.refunded" { id: string }
event InventoryReserved: "inventory.reserved" { id: string }
event SagaStarted: "saga.started" { sagaName: string }
event SagaFailed: "saga.failed" { sagaName: string }

saga ChargeThenReserve {
  step chargePayment {
    command: Payment.charge
    compensate: Payment.refund
  }
  step reserveInventory {
    command: Inventory.reserve
    compensate: Inventory.release
  }
  on_failure: "compensate"
  emit SagaStarted
  emit SagaFailed
}
`;

    it('passes the original step input to the compensation command and reverses state', async () => {
      const ir2 = await compileToIR(COMPENSATION_SOURCE);
      const runtime = new RuntimeEngine(ir2);
      await runtime.createInstance('Payment', { id: 'pay-comp', amount: 0, status: 'none' });
      await runtime.createInstance('Inventory', { id: 'inv-comp', reserved: false });

      const result = await runtime.runSaga('ChargeThenReserve', {
        chargePayment: { input: { amount: 100 }, instanceId: 'pay-comp' },
        reserveInventory: { instanceId: 'inv-comp' },
      });

      expect(result.success).toBe(false);
      expect(result.failedStep).toBe('reserveInventory');

      const chargeStep = result.steps.find((s) => s.step === 'chargePayment')!;
      // Compensation actually ran (its guard saw amount=100), so it reversed state.
      expect(chargeStep.status).toBe('compensated');
      expect(chargeStep.compensation?.success).toBe(true);

      // The refund executed: state was actually reversed.
      const payment = await runtime.getInstance('Payment', 'pay-comp');
      expect(payment!.status).toBe('refunded');
      expect(payment!.amount).toBe(0);

      // PaymentRefunded proves the compensation command really executed.
      expect(result.emittedEvents.some((e) => e.name === 'PaymentRefunded')).toBe(true);
    });

    it('reports compensation_failed when the compensation command fails its guard', async () => {
      // refund() guard is amount > 0; pass amount = 0 so the refund guard fails.
      const ir2 = await compileToIR(COMPENSATION_SOURCE);
      const runtime = new RuntimeEngine(ir2);
      await runtime.createInstance('Payment', { id: 'pay-fail', amount: 0, status: 'none' });
      await runtime.createInstance('Inventory', { id: 'inv-fail', reserved: false });

      const result = await runtime.runSaga('ChargeThenReserve', {
        chargePayment: { input: { amount: 0 }, instanceId: 'pay-fail' },
        reserveInventory: { instanceId: 'inv-fail' },
      });

      expect(result.success).toBe(false);
      const chargeStep = result.steps.find((s) => s.step === 'chargePayment')!;
      // The compensation FAILED — it must NOT be mislabeled 'compensated'.
      expect(chargeStep.status).toBe('compensation_failed');

      // State was never reversed.
      const payment = await runtime.getInstance('Payment', 'pay-fail');
      expect(payment!.status).toBe('charged');
    });
  });
});
