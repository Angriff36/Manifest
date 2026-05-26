import { describe, it, expect } from 'vitest';
import type { OutboxEntry, OutboxStore } from './outbox-store';
import { RuntimeEngine } from '../runtime-engine';
import type { IR } from '../ir';
import { COMPILER_VERSION } from '../version';

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
    enums: [],
    stores: [],
    events: [],
    commands: [
      { name: 'bar', entity: 'Foo', parameters: [], guards: [], actions: [], emits: [] },
    ],
    policies: [],
  };
}

describe('OutboxStore contract', () => {
  it('exports the entry shape with status enum and required ids', () => {
    const entry: OutboxEntry = {
      entryId: 'e1',
      enqueuedAt: Date.now(),
      event: {
        name: 'FooCreated',
        channel: 'foo.created',
        payload: { id: '1' },
        timestamp: Date.now(),
      },
      status: 'pending',
      attempts: 0,
    };
    expect(entry.status).toBe('pending');
  });

  it('RuntimeOptions.outboxStore accepts a conforming store', async () => {
    const enqueued: OutboxEntry[] = [];
    const store: OutboxStore = {
      async enqueue(entries) {
        enqueued.push(...entries);
      },
      async claim() {
        return [];
      },
      async markDelivered() {
        // no-op
      },
      async markFailed() {
        // no-op
      },
    };
    const rt = new RuntimeEngine(buildIR(), { tenantId: 't' }, { outboxStore: store });
    const result = await rt.runCommand('bar', {}, { entityName: 'Foo' });
    expect(result.success).toBe(true);
    // Contract-only wire-in; transactional integration is a follow-on.
  });
});
