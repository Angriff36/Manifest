import { describe, it, expect } from 'vitest';
import type { AuditSink, AuditRecord } from './audit-sink';
import { RuntimeEngine } from '../runtime-engine';
import type { IR } from '../ir';
import { COMPILER_VERSION } from '../version';

/**
 * Constitution §12 contract surface.
 *
 * These tests assert the contract is wired into the runtime as an option
 * and that the type surface accepts a conforming sink. Actual emission
 * behavior lands in the audit/outbox implementation follow-on; calling
 * runCommand with a sink configured today must NOT throw or break
 * existing behavior.
 */

function buildIR(): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 't',
      compilerVersion: COMPILER_VERSION,
      schemaVersion: '1.0',
      compiledAt: new Date().toISOString(),
    },
    modules: [],
    entities: [
      {
        name: 'Foo',
        properties: [],
        computedProperties: [],
        relationships: [],
        commands: ['bar'],
        constraints: [],
        policies: [],
      },
    ],
    stores: [],
    events: [],
    commands: [
      { name: 'bar', entity: 'Foo', parameters: [], guards: [], actions: [], emits: [] },
    ],
    policies: [],
  };
}

describe('AuditSink contract', () => {
  it('exports a record shape covering every constitution §12 field', () => {
    const record: AuditRecord = {
      recordId: 'r1',
      occurredAt: Date.now(),
      tenantId: 't1',
      orgId: 'o1',
      actorId: 'u1',
      requestId: 'req1',
      source: 'route',
      entity: 'Recipe',
      command: 'create',
      commandId: 'Recipe.create',
      outcome: 'success',
      diagnostics: undefined,
      emittedEventNames: ['RecipeCreated'],
      irHash: 'sha256',
    };
    expect(record.outcome).toBe('success');
  });

  it('RuntimeOptions.auditSink accepts a conforming sink', async () => {
    const records: AuditRecord[] = [];
    const sink: AuditSink = {
      async emit(record) {
        records.push(record);
      },
    };
    // The runtime currently does not call the sink (contract-only wire-in),
    // but accepting the option without typeerror is the load-bearing check.
    const rt = new RuntimeEngine(buildIR(), { tenantId: 't' }, { auditSink: sink });
    const result = await rt.runCommand('bar', {}, { entityName: 'Foo' });
    expect(result.success).toBe(true);
    // No assertions on `records` — emission is a follow-on contract. The
    // surface acceptance is what the constitution §12 contract demands today.
  });
});
