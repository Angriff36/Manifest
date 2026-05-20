/**
 * Mock-based unit tests for PostgresAuditSink.
 *
 * No live database is required. We verify the adapter issues the expected
 * SQL with the right parameter binding through a stubbed `pg`-shaped pool.
 * Live integration testing is out of scope until the repo grows DB infra
 * (see docs/spec/adapters.md § "Postgres Audit Sink" for the deferred
 * acceptance path).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PostgresAuditSink } from './postgres';
import type { AuditRecord } from '../audit-sink';
import type { Pool } from 'pg';

type Query = { sql: string; params: unknown[] };

function makeFakePool(): { pool: Pool; queries: Query[] } {
  const queries: Query[] = [];
  const pool = {
    async query(sql: string, params: unknown[]) {
      queries.push({ sql, params });
      return { rows: [] };
    },
  } as unknown as Pool;
  return { pool, queries };
}

const baseRecord: AuditRecord = {
  recordId: 'r1',
  occurredAt: 42,
  tenantId: 't1',
  command: 'create',
  commandId: 'Item.create',
  outcome: 'success',
};

describe('PostgresAuditSink', () => {
  let pool: Pool;
  let queries: Query[];
  let sink: PostgresAuditSink;

  beforeEach(() => {
    const f = makeFakePool();
    pool = f.pool;
    queries = f.queries;
    sink = new PostgresAuditSink({ pool });
  });

  it('issues an INSERT with ON CONFLICT DO NOTHING for idempotency', async () => {
    await sink.emit(baseRecord);
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain('INSERT INTO "manifest_audit_records"');
    expect(queries[0].sql).toContain('ON CONFLICT (record_id) DO NOTHING');
  });

  it('binds the record fields in declared positional order', async () => {
    await sink.emit({
      ...baseRecord,
      orgId: 'o1',
      actorId: 'u1',
      requestId: 'req1',
      source: 'route',
      entity: 'Item',
      emittedEventNames: ['ItemCreated'],
      irHash: 'sha256',
      diagnostics: { trace: 'x' },
    });
    const params = queries[0].params;
    expect(params[0]).toBe('r1');
    expect(params[1]).toBe(42);
    expect(params[2]).toBe('t1');
    expect(params[3]).toBe('o1');
    expect(params[4]).toBe('u1');
    expect(params[5]).toBe('req1');
    expect(params[6]).toBe('route');
    expect(params[7]).toBe('Item');
    expect(params[8]).toBe('create');
    expect(params[9]).toBe('Item.create');
    expect(params[10]).toBe('success');
    expect(params[11]).toEqual(['ItemCreated']);
    expect(params[12]).toBe('sha256');
    expect(params[13]).toBe(JSON.stringify({ trace: 'x' }));
  });

  it('binds undefined fields as null (not empty strings)', async () => {
    await sink.emit(baseRecord);
    const params = queries[0].params;
    expect(params[3]).toBeNull(); // orgId
    expect(params[4]).toBeNull(); // actorId
    expect(params[5]).toBeNull(); // requestId
    expect(params[6]).toBeNull(); // source
    expect(params[7]).toBeNull(); // entity
    expect(params[11]).toBeNull(); // emittedEventNames
    expect(params[12]).toBeNull(); // irHash
    expect(params[13]).toBeNull(); // diagnostics
  });

  it('serializes diagnostics as JSON', async () => {
    await sink.emit({ ...baseRecord, diagnostics: { foo: 'bar', n: 1 } });
    expect(queries[0].params[13]).toBe('{"foo":"bar","n":1}');
  });

  it('uses the configured tableName when provided', async () => {
    const custom = new PostgresAuditSink({ pool, tableName: 'audit_t' });
    await custom.emit(baseRecord);
    expect(queries[0].sql).toContain('"audit_t"');
  });

  it('escapes embedded double-quotes in the tableName', async () => {
    const custom = new PostgresAuditSink({ pool, tableName: 'evil"name' });
    await custom.emit(baseRecord);
    expect(queries[0].sql).toContain('"evil""name"');
  });

  it('throws when recordId is missing (idempotency cannot be enforced)', async () => {
    await expect(
      sink.emit({ ...baseRecord, recordId: undefined })
    ).rejects.toThrow(/requires AuditRecord.recordId/);
  });

  it('routes the INSERT through a provided PoolClient when supplied', async () => {
    const clientQueries: Query[] = [];
    const fakeClient = {
      async query(sql: string, params: unknown[]) {
        clientQueries.push({ sql, params });
        return { rows: [] };
      },
    } as unknown as import('pg').PoolClient;

    await sink.emit(baseRecord, fakeClient);
    expect(clientQueries).toHaveLength(1);
    expect(queries).toHaveLength(0);
  });
});
