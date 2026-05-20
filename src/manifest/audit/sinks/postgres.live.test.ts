/**
 * Live-database integration tests for PostgresAuditSink.
 *
 * SKIPPED by default. Set `MANIFEST_POSTGRES_TEST_URL` to a writable
 * PostgreSQL connection string to run:
 *
 *   MANIFEST_POSTGRES_TEST_URL=postgres://user:pass@localhost:5432/manifest_test \
 *     npx vitest run src/manifest/audit/sinks/postgres.live.test.ts
 *
 * The suite creates `manifest_audit_records` from the shipped schema, runs
 * its assertions, then drops the table — so successive runs against the
 * same database are idempotent. CI is unaffected because the suite skips
 * when the env var is absent.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { PostgresAuditSink } from './postgres';
import type { AuditRecord } from '../audit-sink';

const url = process.env.MANIFEST_POSTGRES_TEST_URL;
const describeLive = url ? describe : describe.skip;

const TABLE = 'manifest_audit_records';

describeLive('PostgresAuditSink (live database)', () => {
  let pool: Pool;
  let sink: PostgresAuditSink;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    const schema = readFileSync(
      resolve(__dirname, 'postgres.sql'),
      'utf8'
    );
    // Run the shipped schema verbatim — the same statements a downstream
    // operator would run in production.
    await pool.query(`DROP TABLE IF EXISTS ${TABLE} CASCADE`);
    await pool.query(schema);
  });

  afterAll(async () => {
    await pool.query(`DROP TABLE IF EXISTS ${TABLE} CASCADE`);
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE ${TABLE}`);
    sink = new PostgresAuditSink({ pool });
  });

  it('inserts a record and preserves every field', async () => {
    const record: AuditRecord = {
      recordId: 'live-r1',
      occurredAt: 42,
      tenantId: 't1',
      orgId: 'o1',
      actorId: 'u1',
      requestId: 'req-1',
      source: 'route',
      entity: 'Item',
      command: 'create',
      commandId: 'Item.create',
      outcome: 'success',
      diagnostics: { note: 'live test' },
      emittedEventNames: ['ItemCreated'],
      irHash: 'sha256-live',
    };
    await sink.emit(record);
    const { rows } = await pool.query(
      `SELECT * FROM ${TABLE} WHERE record_id = $1`,
      ['live-r1']
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].tenant_id).toBe('t1');
    expect(rows[0].command_id).toBe('Item.create');
    expect(rows[0].outcome).toBe('success');
    expect(rows[0].emitted_event_names).toEqual(['ItemCreated']);
    expect(rows[0].diagnostics).toEqual({ note: 'live test' });
  });

  it('is idempotent: a repeated emit for the same record_id leaves a single row', async () => {
    const record: AuditRecord = {
      recordId: 'live-dup',
      occurredAt: 1,
      command: 'create',
      outcome: 'success',
    };
    await sink.emit(record);
    await sink.emit({ ...record, outcome: 'guard_denied' });

    const { rows } = await pool.query(
      `SELECT outcome FROM ${TABLE} WHERE record_id = $1`,
      ['live-dup']
    );
    expect(rows).toHaveLength(1);
    // First write wins — ON CONFLICT DO NOTHING.
    expect(rows[0].outcome).toBe('success');
  });
});
