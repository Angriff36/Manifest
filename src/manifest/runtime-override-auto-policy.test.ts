/**
 * Auto-policy constraint override must emit an OverrideApplied audit event.
 *
 * When an overrideable constraint fails and is overridden via its
 * `overridePolicyRef` (no explicit OverrideRequest supplied), the runtime must
 * emit the same OverrideApplied event the explicit-override path emits, so the
 * audit trail is complete. `authorizedBy` is derived from the acting user in
 * context.
 *
 * Spec: docs/spec/semantics.md § Override Mechanism.
 */

import { describe, expect, it } from 'vitest';
import { IRCompiler } from './ir-compiler';
import type { IR } from './ir';
import { RuntimeEngine, type RuntimeContext } from './runtime-engine';

const SOURCE = `
entity Expense {
  property required id: string
  property required amount: number = 0
  property required description: string = ""
  property required status: string = "draft"

  command submit() {
    constraint overrideable budgetLimit {
      expression: self.amount <= 500
      severity: block
      message: "Expenses over 500 require approval override"
      overridePolicy: canOverrideBudget
    }

    mutate status = "submitted"
    emit ExpenseSubmitted
  }
}

store Expense in memory

event ExpenseSubmitted: "expense.submitted" {
  expenseId: string
  amount: number
}

policy canOverrideBudget override:
  user.role == "manager" or user.role == "finance"
  "Only managers and finance can override budget limits"
`;

async function compileToIR(source: string): Promise<IR> {
  const compiler = new IRCompiler();
  const result = await compiler.compileToIR(source);
  if (!result.ir) {
    throw new Error(`Compilation failed: ${result.diagnostics.map(d => d.message).join(', ')}`);
  }
  return result.ir;
}

describe('auto-policy constraint override auditing', () => {
  it('emits OverrideApplied when overridePolicy authorizes without an explicit request', async () => {
    const ir = await compileToIR(SOURCE);
    const context: RuntimeContext = { user: { id: 'mgr-1', role: 'manager' } };
    const runtime = new RuntimeEngine(ir, context, { now: () => 1000000000000 });

    await runtime.createInstance('Expense', {
      id: 'exp-1',
      amount: 750,
      description: 'Conference travel',
    });

    // No overrideRequests — the auto-policy path must fire and audit.
    const result = await runtime.runCommand('submit', {}, {
      entityName: 'Expense',
      instanceId: 'exp-1',
    });

    expect(result.success).toBe(true);
    const override = result.emittedEvents.find(e => e.name === 'OverrideApplied');
    expect(override).toBeDefined();
    expect(override!.payload).toMatchObject({
      constraintCode: 'budgetLimit',
      authorizedBy: 'mgr-1',
      commandName: 'submit',
      entityName: 'Expense',
      instanceId: 'exp-1',
    });
  });

  it('does NOT auto-override or emit when the policy denies the acting user', async () => {
    const ir = await compileToIR(SOURCE);
    const context: RuntimeContext = { user: { id: 'emp-1', role: 'employee' } };
    const runtime = new RuntimeEngine(ir, context, { now: () => 1000000000000 });

    await runtime.createInstance('Expense', {
      id: 'exp-2',
      amount: 750,
      description: 'Conference travel',
    });

    const result = await runtime.runCommand('submit', {}, {
      entityName: 'Expense',
      instanceId: 'exp-2',
    });

    expect(result.success).toBe(false);
    expect(result.emittedEvents.find(e => e.name === 'OverrideApplied')).toBeUndefined();
  });
});
