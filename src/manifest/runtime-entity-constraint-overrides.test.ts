/**
 * Entity-level constraint overrides on create/update.
 *
 * Entity constraints marked `overrideable` MUST honor the same Override Mechanism
 * as command constraints (explicit OverrideRequest + auto-policy via overridePolicyRef),
 * including OverrideApplied audit events.
 *
 * Spec: docs/spec/semantics.md § Constraints / § Override Mechanism.
 */

import { describe, expect, it } from 'vitest';
import { IRCompiler } from './ir-compiler';
import type { IR, OverrideRequest } from './ir';
import { RuntimeEngine, type RuntimeContext } from './runtime-engine';

const SOURCE = `
entity Person {
  property required id: string
  property required age: number = 0
  property required name: string = ""

  constraint overrideable minAge {
    expression: self.age >= 18
    severity: block
    message: "Must be 18 or older"
    overridePolicy: canOverrideAge
  }

  command create(age: number, name: string) {
    mutate age = age
    mutate name = name
  }

  command register(age: number, name: string) {
    mutate age = age
    mutate name = name
  }
}

store Person in memory

policy canOverrideAge override:
  user.role == "admin"
  "Only admins can override age minimum"
`;

async function compileToIR(source: string): Promise<IR> {
  const compiler = new IRCompiler();
  const result = await compiler.compileToIR(source);
  if (!result.ir) {
    throw new Error(`Compilation failed: ${result.diagnostics.map((d) => d.message).join(', ')}`);
  }
  return result.ir;
}

describe('entity-level constraint overrides', () => {
  it('blocks create when overrideable entity constraint fails without authorization', async () => {
    const ir = await compileToIR(SOURCE);
    const runtime = new RuntimeEngine(ir, { user: { id: 'u1', role: 'user' } }, {
      now: () => 1_700_000_000_000,
    });

    const created = await runtime.createInstance('Person', {
      id: 'p1',
      age: 16,
      name: 'Sam',
    });

    expect(created).toBeUndefined();
  });

  it('allows create via auto-policy when acting user satisfies overridePolicy', async () => {
    const ir = await compileToIR(SOURCE);
    const context: RuntimeContext = { user: { id: 'admin-1', role: 'admin' } };
    const runtime = new RuntimeEngine(ir, context, { now: () => 1_700_000_000_000 });

    const created = await runtime.createInstance('Person', {
      id: 'p2',
      age: 16,
      name: 'Alex',
    });

    expect(created).toBeDefined();
    expect(created?.age).toBe(16);

    const overrideEvents = runtime.getEventLog().filter((e) => e.name === 'OverrideApplied');
    expect(overrideEvents).toHaveLength(1);
    expect(overrideEvents[0].payload).toMatchObject({
      constraintCode: 'minAge',
      authorizedBy: 'admin-1',
    });
  });

  it('allows create via explicit OverrideRequest when authorized', async () => {
    const ir = await compileToIR(SOURCE);
    const runtime = new RuntimeEngine(ir, { user: { id: 'u2', role: 'user' } }, {
      now: () => 1_700_000_000_000,
    });

    const override: OverrideRequest = {
      constraintCode: 'minAge',
      reason: 'Emancipated minor enrollment',
      authorizedBy: 'admin-1',
      timestamp: 1_700_000_000_000,
    };

    // Explicit path still requires overridePolicy expression to pass for the
    // acting context when overridePolicyRef is set — elevate role for auth check.
    runtime.setContext({ user: { id: 'admin-1', role: 'admin' } });
    const created = await runtime.createInstance(
      'Person',
      { id: 'p3', age: 15, name: 'Jordan' },
      { overrideRequests: [override] },
    );

    expect(created).toBeDefined();
    expect(created?.age).toBe(15);
  });

  it('allows update that would violate entity constraint when auto-policy authorizes', async () => {
    const ir = await compileToIR(SOURCE);
    const runtime = new RuntimeEngine(ir, { user: { id: 'admin-1', role: 'admin' } }, {
      now: () => 1_700_000_000_000,
    });

    await runtime.createInstance('Person', { id: 'p4', age: 21, name: 'Pat' });
    const updated = await runtime.updateInstance('Person', 'p4', { age: 14 });

    expect(updated).toBeDefined();
    expect(updated?.age).toBe(14);
  });

  it('honors entity overrides during Entity.create command auto-create', async () => {
    const ir = await compileToIR(SOURCE);
    const runtime = new RuntimeEngine(ir, { user: { id: 'admin-1', role: 'admin' } }, {
      now: () => 1_700_000_000_000,
    });

    const result = await runtime.runCommand(
      'create',
      { id: 'p5', age: 12, name: 'Chris' },
      { entityName: 'Person' },
    );

    expect(result.success).toBe(true);
    const overrides = result.emittedEvents.filter((e) => e.name === 'OverrideApplied');
    expect(overrides.length).toBeGreaterThanOrEqual(1);
  });
});
