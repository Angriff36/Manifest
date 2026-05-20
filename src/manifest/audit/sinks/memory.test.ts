import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryAuditSink } from './memory';
import type { AuditRecord } from '../audit-sink';

function record(overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    occurredAt: 1,
    command: 'create',
    outcome: 'success',
    ...overrides,
  };
}

describe('MemoryAuditSink', () => {
  let sink: MemoryAuditSink;

  beforeEach(() => {
    sink = new MemoryAuditSink();
  });

  it('appends emitted records in order', async () => {
    await sink.emit(record({ recordId: 'r1' }));
    await sink.emit(record({ recordId: 'r2', outcome: 'guard_denied' }));

    const all = sink.list();
    expect(all).toHaveLength(2);
    expect(all[0].recordId).toBe('r1');
    expect(all[1].recordId).toBe('r2');
    expect(all[1].outcome).toBe('guard_denied');
  });

  it('drops duplicate emissions with the same recordId (idempotency)', async () => {
    const first = record({ recordId: 'r1', outcome: 'success' });
    const second = record({ recordId: 'r1', outcome: 'guard_denied' });

    await sink.emit(first);
    await sink.emit(second);

    const all = sink.list();
    expect(all).toHaveLength(1);
    // First record wins — the second emission is silently dropped.
    expect(all[0].outcome).toBe('success');
  });

  it('appends records without a recordId without idempotency dedup', async () => {
    await sink.emit(record());
    await sink.emit(record());
    await sink.emit(record());

    expect(sink.size()).toBe(3);
  });

  it('stamps a synthetic recordId when generateId is supplied and recordId is missing', async () => {
    let counter = 0;
    const idSink = new MemoryAuditSink({ generateId: () => `gen-${++counter}` });
    await idSink.emit(record());
    await idSink.emit(record());

    const all = idSink.list();
    expect(all[0].recordId).toBe('gen-1');
    expect(all[1].recordId).toBe('gen-2');
    // Synthetic ids still participate in idempotency on the next emission.
    expect(idSink.size()).toBe(2);
  });

  it('preserves all record fields including diagnostics and irHash', async () => {
    const full: AuditRecord = {
      recordId: 'r1',
      occurredAt: 42,
      tenantId: 't1',
      orgId: 'o1',
      actorId: 'u1',
      requestId: 'req1',
      source: 'route',
      entity: 'Recipe',
      command: 'create',
      commandId: 'Recipe.create',
      outcome: 'success',
      diagnostics: { note: 'ok' },
      emittedEventNames: ['RecipeCreated'],
      irHash: 'sha256-abc',
    };

    await sink.emit(full);

    const stored = sink.findByRecordId('r1');
    expect(stored).toEqual(full);
  });

  it('findByRecordId returns undefined when no match exists', async () => {
    await sink.emit(record({ recordId: 'r1' }));
    expect(sink.findByRecordId('missing')).toBeUndefined();
  });

  it('returns defensive copies — mutating list() does not affect internal state', async () => {
    await sink.emit(record({ recordId: 'r1' }));
    const snapshot = sink.list();
    snapshot[0].outcome = 'error';
    snapshot.push(record({ recordId: 'r2' }));

    const fresh = sink.list();
    expect(fresh).toHaveLength(1);
    expect(fresh[0].outcome).toBe('success');
  });

  it('clear() resets records and idempotency tracking', async () => {
    await sink.emit(record({ recordId: 'r1' }));
    await sink.emit(record({ recordId: 'r2' }));
    sink.clear();
    expect(sink.size()).toBe(0);
    // After clearing, a previously-seen recordId is accepted again.
    await sink.emit(record({ recordId: 'r1' }));
    expect(sink.size()).toBe(1);
  });
});
