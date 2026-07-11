/**
 * Runtime smoke check.
 *
 * Spins up a minimal in-memory RuntimeEngine wired with MemoryAuditSink
 * and MemoryOutboxStore, runs a single emit-event command, and asserts:
 *
 *   1. Exactly one AuditRecord was emitted, outcome=success.
 *   2. The audit record carries the tenant/actor/source from RuntimeContext.
 *   3. The audit record's emittedEventNames reflects the command's emit.
 *   4. The outbox enqueued exactly one entry, status='pending'.
 *
 * Purpose: prove the adapter contracts actually function in *this* build of
 * the package, end-to-end through `runCommand`. This is the difference
 * between "the AuditSink option type-checks" (v0.4.0) and "the runtime
 * actually calls AuditSink.emit" (v0.5.0+). If the smoke fails, the
 * package is published but the runtime contract isn't honored.
 *
 * Independent of the downstream repo. The smoke uses a tiny inline IR so
 * a wrong package install is caught even before the downstream's .manifest
 * files are read. The downstream's own command behavior is exercised
 * separately by `manifest harness`.
 */

import { RuntimeEngine } from '@angriff36/manifest';
import { MemoryAuditSink } from '@angriff36/manifest/audit/memory';
import { MemoryOutboxStore } from '@angriff36/manifest/outbox/memory';
import type { IR } from '@angriff36/manifest/ir';

export interface RuntimeSmokeAssertion {
  name: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
}

export interface RuntimeSmokeResult {
  /** Overall pass/fail. True only if every assertion passed. */
  ok: boolean;
  assertions: RuntimeSmokeAssertion[];
  /** Errors that prevented the smoke from running at all (import failures, etc.). */
  fatal?: string;
}

function ir(): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'integration-check-smoke',
      compilerVersion: '0.0.0-smoke',
      schemaVersion: '1.0',
      compiledAt: new Date(0).toISOString(),
    },
    modules: [],
    values: [],
    entities: [
      {
        name: 'Smoke',
        properties: [],
        computedProperties: [],
        relationships: [],
        commands: ['fire'],
        constraints: [],
        policies: [],
      },
    ],
    enums: [],
    stores: [],
    events: [
      {
        name: 'SmokeFired',
        channel: 'smoke.fired',
        payload: [],
      },
    ],
    commands: [
      {
        name: 'fire',
        entity: 'Smoke',
        parameters: [],
        guards: [],
        actions: [],
        emits: ['SmokeFired'],
      },
    ],
    policies: [],
  };
}

/**
 * Run the runtime smoke. Catches package-import failures as `fatal` so
 * the caller can surface "the adapter subpaths are unresolvable" as a
 * distinct failure mode from "an assertion failed".
 */
export async function runRuntimeSmoke(): Promise<RuntimeSmokeResult> {
  const assertions: RuntimeSmokeAssertion[] = [];

  let sink: MemoryAuditSink;
  let store: MemoryOutboxStore;
  try {
    sink = new MemoryAuditSink();
    store = new MemoryOutboxStore();
  } catch (e) {
    return {
      ok: false,
      assertions,
      fatal: `Could not construct MemoryAuditSink / MemoryOutboxStore: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  let runtime: RuntimeEngine;
  try {
    runtime = new RuntimeEngine(
      ir(),
      { tenantId: 't_smoke', actorId: 'u_smoke', source: 'integration-check' },
      {
        auditSink: sink,
        outboxStore: store,
        generateId: () => 'smoke-id',
        now: () => 1_700_000_000_000,
      },
    );
  } catch (e) {
    return {
      ok: false,
      assertions,
      fatal: `Could not instantiate RuntimeEngine with adapter wiring: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  let success = false;
  let emittedEventNames: string[] = [];
  try {
    const result = await runtime.runCommand('fire', {}, { entityName: 'Smoke' });
    success = result.success;
    emittedEventNames = result.emittedEvents.map((e) => e.name);
  } catch (e) {
    return {
      ok: false,
      assertions,
      fatal: `runCommand threw: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  assertions.push({
    name: 'command.success',
    expected: true,
    actual: success,
    passed: success === true,
  });

  // Exactly one audit record was emitted.
  const auditRecords = sink.list();
  assertions.push({
    name: 'audit.emittedExactlyOnce',
    expected: 1,
    actual: auditRecords.length,
    passed: auditRecords.length === 1,
  });

  if (auditRecords.length === 1) {
    const rec = auditRecords[0];
    assertions.push({
      name: 'audit.outcome',
      expected: 'success',
      actual: rec.outcome,
      passed: rec.outcome === 'success',
    });
    assertions.push({
      name: 'audit.tenantId',
      expected: 't_smoke',
      actual: rec.tenantId,
      passed: rec.tenantId === 't_smoke',
    });
    assertions.push({
      name: 'audit.actorId',
      expected: 'u_smoke',
      actual: rec.actorId,
      passed: rec.actorId === 'u_smoke',
    });
    assertions.push({
      name: 'audit.source',
      expected: 'integration-check',
      actual: rec.source,
      passed: rec.source === 'integration-check',
    });
    assertions.push({
      name: 'audit.emittedEventNames',
      expected: ['SmokeFired'],
      actual: rec.emittedEventNames,
      passed: JSON.stringify(rec.emittedEventNames) === JSON.stringify(['SmokeFired']),
    });
  }

  // Emitted event surfaced through CommandResult.
  assertions.push({
    name: 'commandResult.emittedEventNames',
    expected: ['SmokeFired'],
    actual: emittedEventNames,
    passed: JSON.stringify(emittedEventNames) === JSON.stringify(['SmokeFired']),
  });

  // Outbox enqueued exactly one pending entry for the emitted event.
  const outboxEntries = store.list();
  assertions.push({
    name: 'outbox.enqueuedExactlyOnce',
    expected: 1,
    actual: outboxEntries.length,
    passed: outboxEntries.length === 1,
  });
  if (outboxEntries.length === 1) {
    const entry = outboxEntries[0];
    assertions.push({
      name: 'outbox.entry.status',
      expected: 'pending',
      actual: entry.status,
      passed: entry.status === 'pending',
    });
    assertions.push({
      name: 'outbox.entry.event.name',
      expected: 'SmokeFired',
      actual: entry.event.name,
      passed: entry.event.name === 'SmokeFired',
    });
  }

  return {
    ok: assertions.every((a) => a.passed),
    assertions,
  };
}
