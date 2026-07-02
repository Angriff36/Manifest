/**
 * Live-database integration tests for PostgresJobQueue.
 *
 * SKIPPED when `DATABASE_URL` is unset. Use the empty Manifest Neon DB
 * (direct connection, pooler off). `MANIFEST_POSTGRES_TEST_URL` is still accepted.
 *
 *   npm run test:postgres
 *
 * Covers schema apply, enqueue idempotency, drainPending exactly-once +
 * pending→running flip, concurrent drain disjointness (FOR UPDATE SKIP
 * LOCKED), and updateStatus persistence. CI is unaffected because the suite
 * skips when the env var is absent.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { PostgresJobQueue } from './postgres';
import type { JobRecord } from '../../ir';
import { postgresLiveDatabaseUrl } from '../../test/postgres-live-env';

const url = postgresLiveDatabaseUrl();
const describeLive = url ? describe : describe.skip;

const TABLE = 'manifest_jobs';

function job(id: string, enqueuedAt = 0): JobRecord {
  return {
    jobId: id,
    commandName: 'processOrder',
    entityName: 'Order',
    instanceId: `inst-${id}`,
    input: { amount: 100 },
    enqueuedAt,
    status: 'pending',
  };
}

describeLive('PostgresJobQueue (live database)', () => {
  let pool: Pool;
  let queue: PostgresJobQueue;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    const schema = readFileSync(resolve(__dirname, 'postgres.sql'), 'utf8');
    await pool.query(`DROP TABLE IF EXISTS ${TABLE} CASCADE`);
    await pool.query(schema);
  });

  afterAll(async () => {
    await pool.query(`DROP TABLE IF EXISTS ${TABLE} CASCADE`);
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE ${TABLE}`);
    queue = new PostgresJobQueue({ pool });
  });

  it('enqueue + drainPending returns the job once and flips it to running', async () => {
    await queue.enqueue(job('a', 1));
    const first = await queue.drainPending();
    expect(first.map(j => j.jobId)).toEqual(['a']);
    expect(first[0].status).toBe('running');

    // The row is now 'running', so a second drain returns nothing.
    const second = await queue.drainPending();
    expect(second).toEqual([]);

    const { rows } = await pool.query(`SELECT status FROM ${TABLE} WHERE job_id = $1`, ['a']);
    expect(rows[0].status).toBe('running');
  });

  it('drainPending returns jobs in FIFO order by enqueued_at', async () => {
    await queue.enqueue(job('c', 300));
    await queue.enqueue(job('a', 100));
    await queue.enqueue(job('b', 200));
    const drained = await queue.drainPending();
    expect(drained.map(j => j.jobId)).toEqual(['a', 'b', 'c']);
  });

  it('preserves the full JobRecord across enqueue/drain', async () => {
    await queue.enqueue({
      jobId: 'full',
      commandName: 'processOrder',
      entityName: 'Order',
      instanceId: 'inst-1',
      input: { amount: 42, note: 'hi' },
      correlationId: 'corr-1',
      causationId: 'cause-1',
      enqueuedAt: 5,
      status: 'pending',
    });
    const [drained] = await queue.drainPending();
    expect(drained).toEqual({
      jobId: 'full',
      commandName: 'processOrder',
      entityName: 'Order',
      instanceId: 'inst-1',
      input: { amount: 42, note: 'hi' },
      correlationId: 'corr-1',
      causationId: 'cause-1',
      enqueuedAt: 5,
      status: 'running',
    });
  });

  it('concurrent drainPending calls receive disjoint jobs (SKIP LOCKED works)', async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `e${i}`);
    for (const [i, id] of ids.entries()) {
      await queue.enqueue(job(id, i));
    }

    const [batchA, batchB] = await Promise.all([queue.drainPending(), queue.drainPending()]);
    const idsA = batchA.map(j => j.jobId);
    const idsB = batchB.map(j => j.jobId);
    const overlap = idsA.filter(id => idsB.includes(id));
    expect(overlap).toEqual([]);
    // Together they cover all 20.
    expect(new Set([...idsA, ...idsB]).size).toBe(20);
  });

  it('updateStatus persists status, result, and error', async () => {
    await queue.enqueue(job('a', 1));
    await queue.drainPending();

    await queue.updateStatus('a', 'completed', { result: { ok: true } });
    let { rows } = await pool.query(
      `SELECT status, result, error FROM ${TABLE} WHERE job_id = $1`,
      ['a']
    );
    expect(rows[0].status).toBe('completed');
    expect(rows[0].result).toEqual({ ok: true });
    expect(rows[0].error).toBeNull();

    await queue.updateStatus('a', 'failed', { error: 'boom' });
    ({ rows } = await pool.query(
      `SELECT status, error FROM ${TABLE} WHERE job_id = $1`,
      ['a']
    ));
    expect(rows[0].status).toBe('failed');
    expect(rows[0].error).toBe('boom');
  });

  it('enqueue is idempotent on job_id', async () => {
    await queue.enqueue(job('dup', 1));
    // Re-enqueue with different content — first write must win.
    await queue.enqueue({ ...job('dup', 999), commandName: 'changed' });
    const { rows } = await pool.query(
      `SELECT command_name, enqueued_at FROM ${TABLE} WHERE job_id = $1`,
      ['dup']
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].command_name).toBe('processOrder');
  });
});
