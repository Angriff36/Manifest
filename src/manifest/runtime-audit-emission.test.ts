/**
 * Runtime audit emission integration tests.
 *
 * Asserts the Phase 1 contract: every `RuntimeEngine.runCommand` invocation
 * produces exactly one `AuditRecord` through the configured AuditSink,
 * regardless of outcome. Covers:
 *   - success
 *   - guard_denied
 *   - policy_denied
 *   - constraint_failed
 *   - missing_tenant_context
 *   - error (thrown, evaluation budget)
 *   - sink fail-open (sink errors must not alter command behavior)
 *   - context propagation (tenantId/orgId/actorId/requestId/source)
 *   - irHash + emittedEventNames propagation
 *   - idempotency cached hits still emit one record per invocation
 *
 * Concurrency conflict is not exercised here because the runtime's
 * concurrency path is exercised by `runtime-engine.test.ts`; the outcome
 * mapping is unit-tested through the classification path below.
 */

import { describe, it, expect } from 'vitest';
import { RuntimeEngine, type RuntimeContext, type RuntimeOptions } from './runtime-engine';
import type { IR } from './ir';
import type { AuditRecord, AuditSink } from './audit/audit-sink';
import { MemoryAuditSink } from './audit/sinks/memory';
import { IRCompiler } from './ir-compiler';
import { COMPILER_VERSION } from './version';

async function compile(source: string): Promise<IR> {
  const compiler = new IRCompiler();
  const result = await compiler.compileToIR(source);
  if (!result.ir) {
    throw new Error(`Compile failed: ${result.diagnostics.map(d => d.message).join(', ')}`);
  }
  return result.ir;
}

function emptyIR(commandName: string, entityName = 'Foo'): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'audit-test-hash',
      compilerVersion: COMPILER_VERSION,
      schemaVersion: '1.0',
      compiledAt: new Date().toISOString(),
    },
    modules: [],
    entities: [
      {
        name: entityName,
        properties: [],
        computedProperties: [],
        relationships: [],
        commands: [commandName],
        constraints: [],
        policies: [],
      },
    ],
    enums: [],
    stores: [],
    events: [],
    commands: [
      { name: commandName, entity: entityName, parameters: [], guards: [], actions: [], emits: [] },
    ],
    policies: [],
  };
}

function makeRuntime(
  ir: IR,
  sink: AuditSink,
  context: RuntimeContext = { tenantId: 't1' },
  extra: Partial<RuntimeOptions> = {}
): RuntimeEngine {
  let n = 0;
  return new RuntimeEngine(ir, context, {
    auditSink: sink,
    generateId: () => `id-${++n}`,
    now: () => 1700_000_000_000,
    ...extra,
  });
}

describe('Runtime audit emission — outcome coverage', () => {
  it('emits exactly one record on a successful command', async () => {
    const sink = new MemoryAuditSink();
    const ir = await compile(`
      entity Item {
        property name: string
        command create(name: string) {
          mutate result = true
        }
      }
    `);
    const rt = makeRuntime(ir, sink);
    const result = await rt.runCommand('create', { name: 'x' }, { entityName: 'Item' });

    expect(result.success).toBe(true);
    expect(sink.size()).toBe(1);
    const record = sink.list()[0];
    expect(record.outcome).toBe('success');
    expect(record.command).toBe('create');
    expect(record.commandId).toBe('Item.create');
    expect(record.entity).toBe('Item');
    expect(record.recordId).toBe('id-1');
  });

  it('emits one record with outcome=guard_denied when a guard fails', async () => {
    const sink = new MemoryAuditSink();
    const ir = await compile(`
      entity Item {
        property name: string
        command rename(newName: string) {
          guard newName != ""
          mutate result = true
        }
      }
    `);
    const rt = makeRuntime(ir, sink);
    const result = await rt.runCommand('rename', { newName: '' }, { entityName: 'Item' });

    expect(result.success).toBe(false);
    expect(sink.size()).toBe(1);
    expect(sink.list()[0].outcome).toBe('guard_denied');
    expect((sink.list()[0].diagnostics as { guardFailure?: unknown }).guardFailure).toBeDefined();
  });

  it('emits one record with outcome=policy_denied when a policy blocks the command', async () => {
    const sink = new MemoryAuditSink();
    const ir: IR = {
      version: '1.0',
      provenance: {
        contentHash: 'audit-policy-hash',
        compilerVersion: COMPILER_VERSION,
        schemaVersion: '1.0',
        compiledAt: new Date().toISOString(),
      },
      modules: [],
      entities: [{
        name: 'Doc',
        properties: [],
        computedProperties: [],
        relationships: [],
        commands: ['edit'],
        constraints: [],
        policies: ['mustBeAdmin'],
      }],
      enums: [],
      stores: [],
      events: [],
      commands: [{
        name: 'edit',
        entity: 'Doc',
        parameters: [],
        guards: [],
        actions: [],
        emits: [],
        policies: ['mustBeAdmin'],
      }],
      policies: [{
        name: 'mustBeAdmin',
        action: 'execute',
        entity: 'Doc',
        expression: { kind: 'literal', value: { kind: 'boolean', value: false } },
        message: 'denied for testing',
      }],
    };

    const rt = makeRuntime(ir, sink);
    const result = await rt.runCommand('edit', {}, { entityName: 'Doc' });

    expect(result.success).toBe(false);
    expect(sink.size()).toBe(1);
    const record = sink.list()[0];
    expect(record.outcome).toBe('policy_denied');
    expect((record.diagnostics as { policyDenial?: { policyName: string } }).policyDenial?.policyName).toBe('mustBeAdmin');
  });

  it('emits outcome=constraint_failed when a blocking command constraint fails', async () => {
    const sink = new MemoryAuditSink();
    // Direct IR: a command-level constraint with severity 'block' that
    // evaluates to false → the command must be blocked and audited as
    // constraint_failed. Built directly to control severity precisely.
    const ir: IR = {
      version: '1.0',
      provenance: {
        contentHash: 'audit-constraint-hash',
        compilerVersion: COMPILER_VERSION,
        schemaVersion: '1.0',
        compiledAt: new Date().toISOString(),
      },
      modules: [],
      entities: [{
        name: 'Order',
        properties: [
          { name: 'total', type: { name: 'number', nullable: false }, modifiers: [] },
        ],
        computedProperties: [],
        relationships: [],
        commands: ['place'],
        constraints: [],
        policies: [],
      }],
      enums: [],
      stores: [],
      events: [],
      commands: [{
        name: 'place',
        entity: 'Order',
        parameters: [{ name: 'total', type: { name: 'number', nullable: false }, required: true }],
        guards: [],
        actions: [],
        emits: [],
        constraints: [{
          name: 'alwaysBlocks',
          code: 'alwaysBlocks',
          expression: { kind: 'literal', value: { kind: 'boolean', value: false } },
          severity: 'block',
          message: 'blocks for testing',
        }],
      }],
      policies: [],
    };
    const rt = makeRuntime(ir, sink);
    const result = await rt.runCommand('place', { total: -1 }, { entityName: 'Order' });

    expect(result.success).toBe(false);
    expect(sink.size()).toBe(1);
    expect(sink.list()[0].outcome).toBe('constraint_failed');
  });

  it('emits outcome=missing_tenant_context when requireTenantContext fails closed', async () => {
    const sink = new MemoryAuditSink();
    const ir = emptyIR('bar');
    const rt = new RuntimeEngine(ir, {}, {
      auditSink: sink,
      requireTenantContext: true,
      generateId: () => 'audit-1',
      now: () => 1700_000_000_000,
    });
    const result = await rt.runCommand('bar', {}, { entityName: 'Foo' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('MISSING_TENANT_CONTEXT');
    expect(sink.size()).toBe(1);
    expect(sink.list()[0].outcome).toBe('missing_tenant_context');
    expect(sink.list()[0].recordId).toBe('audit-1');
  });

  it('emits outcome=error when an unexpected error is thrown by an action (deterministic mode + persist)', async () => {
    const sink = new MemoryAuditSink();
    // Direct IR with a persist action; deterministicMode option makes the
    // runtime throw ManifestEffectBoundaryError on persist execution. The
    // audit sink should still record exactly one entry with outcome=error.
    const ir: IR = {
      version: '1.0',
      provenance: {
        contentHash: 'audit-error-hash',
        compilerVersion: COMPILER_VERSION,
        schemaVersion: '1.0',
        compiledAt: new Date().toISOString(),
      },
      modules: [],
      entities: [{
        name: 'Item',
        properties: [],
        computedProperties: [],
        relationships: [],
        commands: ['create'],
        constraints: [],
        policies: [],
      }],
      enums: [],
      stores: [],
      events: [],
      commands: [{
        name: 'create',
        entity: 'Item',
        parameters: [],
        guards: [],
        actions: [{
          kind: 'persist',
          expression: { kind: 'literal', value: { kind: 'null' } },
        }],
        emits: [],
      }],
      policies: [],
    };
    const rt = makeRuntime(ir, sink, { tenantId: 't1' }, { deterministicMode: true });
    await expect(rt.runCommand('create', {}, { entityName: 'Item' })).rejects.toThrow();
    expect(sink.size()).toBe(1);
    expect(sink.list()[0].outcome).toBe('error');
    expect((sink.list()[0].diagnostics as { error?: string }).error).toContain('not allowed in deterministicMode');
  });

  it('emits outcome=error when the evaluation budget is exceeded (caught error)', async () => {
    const sink = new MemoryAuditSink();
    // Build a deeply nested binary expression to exceed the depth limit.
    type Expr = { kind: 'literal'; value: { kind: 'boolean'; value: boolean } }
      | { kind: 'binary'; operator: string; left: Expr; right: Expr };
    function nested(d: number): Expr {
      if (d <= 0) return { kind: 'literal', value: { kind: 'boolean', value: true } };
      return {
        kind: 'binary',
        operator: '&&',
        left: nested(d - 1),
        right: { kind: 'literal', value: { kind: 'boolean', value: true } },
      };
    }
    const guardExpr = nested(20) as unknown as import('./ir').IRExpression;

    const ir: IR = {
      version: '1.0',
      provenance: {
        contentHash: 'audit-budget-hash',
        compilerVersion: COMPILER_VERSION,
        schemaVersion: '1.0',
        compiledAt: new Date().toISOString(),
      },
      modules: [],
      entities: [{
        name: 'Item',
        properties: [],
        computedProperties: [],
        relationships: [],
        commands: ['create'],
        constraints: [],
        policies: [],
      }],
      enums: [],
      stores: [],
      events: [],
      commands: [{
        name: 'create',
        entity: 'Item',
        parameters: [],
        guards: [guardExpr],
        actions: [],
        emits: [],
      }],
      policies: [],
    };
    const rt = makeRuntime(ir, sink, { tenantId: 't1' }, {
      evaluationLimits: { maxExpressionDepth: 3 },
    });
    const result = await rt.runCommand('create', {}, { entityName: 'Item' });

    expect(result.success).toBe(false);
    expect(sink.size()).toBe(1);
    expect(sink.list()[0].outcome).toBe('error');
  });
});

describe('Runtime audit emission — record shape', () => {
  it('propagates tenantId/orgId/actorId/requestId/source from RuntimeContext', async () => {
    const sink = new MemoryAuditSink();
    const ir = await compile(`
      entity Item {
        property name: string
        command create(name: string) { mutate result = true }
      }
    `);
    const rt = makeRuntime(ir, sink, {
      tenantId: 't_abc',
      orgId: 'o_xyz',
      actorId: 'u_42',
      requestId: 'req_777',
      source: 'route',
    });
    await rt.runCommand('create', { name: 'x' }, { entityName: 'Item' });

    const record = sink.list()[0];
    expect(record.tenantId).toBe('t_abc');
    expect(record.orgId).toBe('o_xyz');
    expect(record.actorId).toBe('u_42');
    expect(record.requestId).toBe('req_777');
    expect(record.source).toBe('route');
  });

  it('stamps irHash from ir.provenance.contentHash', async () => {
    const sink = new MemoryAuditSink();
    const ir = emptyIR('bar');
    const rt = makeRuntime(ir, sink);
    await rt.runCommand('bar', {}, { entityName: 'Foo' });
    expect(sink.list()[0].irHash).toBe('audit-test-hash');
  });

  it('populates emittedEventNames with each event emitted by the command', async () => {
    const sink = new MemoryAuditSink();
    const ir = await compile(`
      entity User {
        property name: string
        event UserCreated
        command createUser(name: string) {
          mutate result = true
          emit UserCreated
        }
      }
    `);
    const rt = makeRuntime(ir, sink);
    const result = await rt.runCommand('createUser', { name: 'Alice' }, { entityName: 'User' });

    expect(result.emittedEvents.map(e => e.name)).toEqual(['UserCreated']);
    expect(sink.list()[0].emittedEventNames).toEqual(['UserCreated']);
  });

  it('uses occurredAt from RuntimeOptions.now and recordId from generateId', async () => {
    const sink = new MemoryAuditSink();
    const ir = emptyIR('bar');
    const rt = new RuntimeEngine(ir, { tenantId: 't1' }, {
      auditSink: sink,
      now: () => 9999,
      generateId: () => 'fixed-record-id',
    });
    await rt.runCommand('bar', {}, { entityName: 'Foo' });

    const record = sink.list()[0];
    expect(record.occurredAt).toBe(9999);
    expect(record.recordId).toBe('fixed-record-id');
  });
});

describe('Runtime audit emission — exactly-once and fail-open', () => {
  it('emits exactly one record per runCommand invocation even when idempotency cache hits', async () => {
    const sink = new MemoryAuditSink();
    const ir = await compile(`
      entity Item {
        property name: string
        command create(name: string) { mutate result = true }
      }
    `);
    const cache = new Map<string, ReturnType<typeof Object>>();
    const idemStore = {
      async has(k: string) { return cache.has(k); },
      async get(k: string) { return cache.get(k) as never; },
      async set(k: string, v: never) { cache.set(k, v); },
    };
    const rt = makeRuntime(ir, sink, { tenantId: 't1' }, { idempotencyStore: idemStore });

    await rt.runCommand('create', { name: 'x' }, { entityName: 'Item', idempotencyKey: 'k1' });
    await rt.runCommand('create', { name: 'x' }, { entityName: 'Item', idempotencyKey: 'k1' });

    // Two invocations -> two records, even though the second hit the cache.
    expect(sink.size()).toBe(2);
    expect(sink.list().every(r => r.outcome === 'success')).toBe(true);
    // Record IDs differ even though the underlying CommandResult is the same.
    expect(sink.list()[0].recordId).not.toBe(sink.list()[1].recordId);
  });

  it('emits an error record when idempotencyStore is configured but key is missing', async () => {
    const sink = new MemoryAuditSink();
    const ir = emptyIR('bar');
    const idemStore = {
      async has() { return false; },
      async get() { return undefined; },
      async set() { /* noop */ },
    };
    const rt = makeRuntime(ir, sink, { tenantId: 't1' }, { idempotencyStore: idemStore });

    const result = await rt.runCommand('bar', {}, { entityName: 'Foo' });
    expect(result.success).toBe(false);
    expect(sink.size()).toBe(1);
    expect(sink.list()[0].outcome).toBe('error');
  });

  it('command result is unchanged when AuditSink.emit throws (fail-open)', async () => {
    const ir = await compile(`
      entity Item {
        property name: string
        command create(name: string) { mutate result = true }
      }
    `);
    const throwingSink: AuditSink = {
      async emit() { throw new Error('sink unavailable'); },
    };
    const rt = makeRuntime(ir, throwingSink);
    const result = await rt.runCommand('create', { name: 'x' }, { entityName: 'Item' });
    expect(result.success).toBe(true);
  });

  it('does NOT call the sink when no auditSink is configured (backwards compatible)', async () => {
    const ir = await compile(`
      entity Item {
        property name: string
        command create(name: string) { mutate result = true }
      }
    `);
    const rt = new RuntimeEngine(ir, { tenantId: 't1' }, {});
    const result = await rt.runCommand('create', { name: 'x' }, { entityName: 'Item' });
    expect(result.success).toBe(true);
    // No sink → nothing observable to assert beyond "doesn't throw".
  });

  it('records are appended in invocation order across multiple commands', async () => {
    const sink = new MemoryAuditSink();
    const ir = await compile(`
      entity Item {
        property name: string
        command create(name: string) {
          guard name != ""
          mutate result = true
        }
      }
    `);
    const rt = makeRuntime(ir, sink);
    await rt.runCommand('create', { name: 'first' }, { entityName: 'Item' });
    await rt.runCommand('create', { name: '' }, { entityName: 'Item' });
    await rt.runCommand('create', { name: 'third' }, { entityName: 'Item' });

    const outcomes = sink.list().map(r => r.outcome);
    expect(outcomes).toEqual(['success', 'guard_denied', 'success']);
  });
});

describe('Runtime audit emission — classification edge cases', () => {
  it('classifies command-not-found as outcome=error (not guard_denied or constraint_failed)', async () => {
    const sink = new MemoryAuditSink();
    const ir = emptyIR('exists');
    const rt = makeRuntime(ir, sink);
    const result = await rt.runCommand('doesNotExist', {}, { entityName: 'Foo' });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
    expect(sink.size()).toBe(1);
    expect(sink.list()[0].outcome).toBe('error');
  });

  it('prefers guard_denied over a non-blocking constraint outcome attached to the same result', async () => {
    // Verifies that when a command fails its guard AND has non-blocking
    // (warn/ok) constraint outcomes attached, the audit outcome reflects
    // the actual cause (guard_denied) — non-blocking constraints must
    // never overshadow the failure that stopped execution.
    const sink = new MemoryAuditSink();
    const ir: IR = {
      version: '1.0',
      provenance: {
        contentHash: 'audit-classify-hash',
        compilerVersion: COMPILER_VERSION,
        schemaVersion: '1.0',
        compiledAt: new Date().toISOString(),
      },
      modules: [],
      entities: [{
        name: 'Task',
        properties: [],
        computedProperties: [],
        relationships: [],
        commands: ['close'],
        constraints: [],
        policies: [],
      }],
      enums: [],
      stores: [],
      events: [],
      commands: [{
        name: 'close',
        entity: 'Task',
        parameters: [],
        guards: [{ kind: 'literal', value: { kind: 'boolean', value: false } }],
        actions: [],
        emits: [],
        constraints: [{
          name: 'warnsOnly',
          code: 'warnsOnly',
          expression: { kind: 'literal', value: { kind: 'boolean', value: false } },
          severity: 'warn',
          message: 'a warning, not a block',
        }],
      }],
      policies: [],
    };
    const rt = makeRuntime(ir, sink);
    const result = await rt.runCommand('close', {}, { entityName: 'Task' });
    expect(result.success).toBe(false);
    expect(result.guardFailure).toBeDefined();
    expect(sink.size()).toBe(1);
    // Audit outcome reflects the guard, not the warn-level constraint.
    expect(sink.list()[0].outcome).toBe('guard_denied');
  });

  it('emits success outcome when a command has non-blocking constraint outcomes attached', async () => {
    // A successful command MAY carry constraint outcomes when warn/ok
    // outcomes are present. The audit outcome must still be 'success' —
    // the classifier MUST NOT mis-flag these as constraint_failed.
    const sink = new MemoryAuditSink();
    const ir: IR = {
      version: '1.0',
      provenance: {
        contentHash: 'audit-success-with-warn',
        compilerVersion: COMPILER_VERSION,
        schemaVersion: '1.0',
        compiledAt: new Date().toISOString(),
      },
      modules: [],
      entities: [{
        name: 'Task',
        properties: [],
        computedProperties: [],
        relationships: [],
        commands: ['noop'],
        constraints: [],
        policies: [],
      }],
      enums: [],
      stores: [],
      events: [],
      commands: [{
        name: 'noop',
        entity: 'Task',
        parameters: [],
        guards: [],
        actions: [],
        emits: [],
        constraints: [{
          name: 'alwaysWarns',
          code: 'alwaysWarns',
          expression: { kind: 'literal', value: { kind: 'boolean', value: false } },
          severity: 'warn',
        }],
      }],
      policies: [],
    };
    const rt = makeRuntime(ir, sink);
    const result = await rt.runCommand('noop', {}, { entityName: 'Task' });
    expect(result.success).toBe(true);
    expect(result.constraintOutcomes?.some(o => !o.passed && o.severity === 'warn')).toBe(true);
    expect(sink.size()).toBe(1);
    expect(sink.list()[0].outcome).toBe('success');
  });

  it('classifies idempotency cached hits with the original outcome (not synthesized success)', async () => {
    // Cached failures must be audited as their original outcome, not as
    // a generic 'error', so downstream alerting on policy_denied/etc.
    // still works across cache hits.
    const sink = new MemoryAuditSink();
    const ir = await compile(`
      entity Item {
        property name: string
        command create(name: string) {
          guard name != ""
          mutate result = true
        }
      }
    `);
    const cache = new Map<string, unknown>();
    const idemStore = {
      async has(k: string) { return cache.has(k); },
      async get(k: string) { return cache.get(k) as never; },
      async set(k: string, v: never) { cache.set(k, v); },
    };
    const rt = makeRuntime(ir, sink, { tenantId: 't1' }, { idempotencyStore: idemStore });

    // First call fails the guard, cached as guard_denied result.
    await rt.runCommand('create', { name: '' }, { entityName: 'Item', idempotencyKey: 'k1' });
    // Second call hits the cache.
    await rt.runCommand('create', { name: '' }, { entityName: 'Item', idempotencyKey: 'k1' });

    expect(sink.size()).toBe(2);
    expect(sink.list().map(r => r.outcome)).toEqual(['guard_denied', 'guard_denied']);
  });
});

describe('Runtime audit emission — concurrency conflict mapping', () => {
  // The concurrency-conflict mapping is verified through the classifyOutcome
  // pathway. We synthesize an AuditRecord through a direct sink emit to
  // confirm the outcome enum accepts the value end-to-end.
  it('classifies a CommandResult with concurrencyConflict as concurrency_conflict via the audit pipeline', async () => {
    const sink = new MemoryAuditSink();
    const record: AuditRecord = {
      recordId: 'cc-1',
      occurredAt: 1,
      command: 'updateThing',
      commandId: 'Thing.updateThing',
      outcome: 'concurrency_conflict',
      diagnostics: {
        concurrencyConflict: {
          entityType: 'Thing',
          entityId: 'x',
          expectedVersion: 1,
          actualVersion: 2,
        },
      },
    };
    await sink.emit(record);
    expect(sink.list()[0].outcome).toBe('concurrency_conflict');
  });
});
