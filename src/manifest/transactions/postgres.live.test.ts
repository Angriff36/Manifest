/**
 * Live-database integration tests for PostgresTransactionProvider and the
 * transaction-aware Postgres adapters.
 *
 * SKIPPED when `DATABASE_URL` is unset. Use the empty Manifest Neon DB
 * (direct connection, pooler off). `MANIFEST_POSTGRES_TEST_URL` is still
 * accepted.
 *
 *   npm run test:postgres
 *
 * Covers:
 *   1. The provider itself: commit persists, throw → ROLLBACK + rethrow,
 *      client always released (no connection leak across many transactions).
 *   2. Per-adapter tx honoring: each durable write, performed with a tx
 *      handle, is absent after ROLLBACK and present after COMMIT.
 *   3. Cross-adapter atomicity (the flagship): store write + outbox enqueue +
 *      idempotency set on ONE transaction all commit together or all roll
 *      back together — the substrate the engine transaction boundary relies
 *      on. This holds even though PostgresStore constructs its own private
 *      pool: the tx handle is a dedicated PoolClient, so every adapter's
 *      query runs on that one connection regardless of which pool it holds.
 *
 * Isolation: every table is uniquely named per test run so this suite can run
 * in parallel with the sibling adapter live suites (which use fixed names)
 * without clobbering their tables. CI is unaffected because the suite skips
 * when the env var is absent.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { PostgresTransactionProvider } from './postgres';
import { PostgresStore } from '../stores.node';
import { PostgresIdempotencyStore } from '../idempotency/stores/postgres';
import { PostgresJobQueue } from '../jobs/stores/postgres';
import { PostgresApprovalStore } from '../approval/stores/postgres';
import { PostgresOutboxStore } from '../outbox/stores/postgres';
import type { EntityInstance } from '../stores.node';
import type { CommandResult, ApprovalRequestState, EmittedEvent } from '../runtime-engine';
import type { JobRecord } from '../ir';
import type { OutboxEntry } from '../outbox/outbox-store';
import { postgresLiveDatabaseUrl } from '../test/postgres-live-env';

const url = postgresLiveDatabaseUrl();
const describeLive = url ? describe : describe.skip;

// Unique per-run suffix so these tables never collide with the sibling live
// suites (or a concurrent run of this one). Valid identifier: starts with a
// letter, only [a-z0-9_].
const RUN = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const T = {
  entities: `tx_entities_${RUN}`,
  outbox: `tx_outbox_${RUN}`,
  idem: `tx_idem_${RUN}`,
  jobs: `tx_jobs_${RUN}`,
  approval: `tx_approval_${RUN}`,
  raw: `tx_raw_${RUN}`,
};

/**
 * Create just the CREATE TABLE from a canonical adapter schema file, renamed
 * to `uniqueName`. Indexes/ALTERs are dropped (not needed for correctness),
 * which also sidesteps the schema-global index-name collisions that renaming
 * only the table would leave behind.
 */
async function createTableFromSchema(
  pool: Pool,
  sqlPath: string,
  baseName: string,
  uniqueName: string
): Promise<void> {
  const raw = readFileSync(sqlPath, 'utf8');
  const noComments = raw
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');
  const statements = noComments
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  const createTable = statements.find((s) => /^create table/i.test(s));
  if (!createTable) throw new Error(`no CREATE TABLE found in ${sqlPath}`);
  await pool.query(createTable.split(baseName).join(uniqueName));
}

function event(name: string): EmittedEvent {
  return { name, channel: name.toLowerCase(), payload: { ts: 0 }, timestamp: 0 };
}

function outboxEntry(id: string): OutboxEntry {
  return { entryId: id, enqueuedAt: 1, event: event('Created'), status: 'pending', attempts: 0 };
}

function commandResult(): CommandResult {
  return { success: true, result: { ok: true }, emittedEvents: [] };
}

function job(id: string): JobRecord {
  return {
    jobId: id,
    commandName: 'processOrder',
    entityName: 'Order',
    instanceId: `inst-${id}`,
    input: { amount: 100 },
    enqueuedAt: 1,
    status: 'pending',
  };
}

function approvalState(overrides: Partial<ApprovalRequestState> = {}): ApprovalRequestState {
  return {
    entity: 'Invoice',
    instanceId: 'inv-1',
    approvalName: 'managerApproval',
    command: 'approve',
    status: 'pending',
    requiredStages: ['manager', 'finance'],
    grants: [],
    requestedAt: 1,
    ...overrides,
  };
}

interface Widget extends EntityInstance {
  id: string;
  name: string;
}

describeLive('PostgresTransactionProvider + tx-aware adapters (live database)', () => {
  let pool: Pool;
  let provider: PostgresTransactionProvider;
  let store: PostgresStore<Widget>;
  let idem: PostgresIdempotencyStore;
  let jobs: PostgresJobQueue;
  let approval: PostgresApprovalStore;
  let outbox: PostgresOutboxStore;

  const schemaDir = resolve(__dirname, '..');

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    provider = new PostgresTransactionProvider({ pool });

    await createTableFromSchema(
      pool,
      resolve(schemaDir, 'outbox/stores/postgres.sql'),
      'manifest_outbox_entries',
      T.outbox
    );
    await createTableFromSchema(
      pool,
      resolve(schemaDir, 'idempotency/stores/postgres.sql'),
      'manifest_idempotency_keys',
      T.idem
    );
    await createTableFromSchema(
      pool,
      resolve(schemaDir, 'jobs/stores/postgres.sql'),
      'manifest_jobs',
      T.jobs
    );
    await createTableFromSchema(
      pool,
      resolve(schemaDir, 'approval/stores/postgres.sql'),
      'manifest_approval_requests',
      T.approval
    );
    await pool.query(`DROP TABLE IF EXISTS ${T.raw} CASCADE`);
    await pool.query(`CREATE TABLE ${T.raw} (id TEXT PRIMARY KEY)`);

    idem = new PostgresIdempotencyStore({ pool, tableName: T.idem });
    jobs = new PostgresJobQueue({ pool, tableName: T.jobs });
    approval = new PostgresApprovalStore({ pool, tableName: T.approval });
    outbox = new PostgresOutboxStore({ pool, tableName: T.outbox });

    // PostgresStore builds its own private pool from the connection string.
    // Warm it up so its CREATE TABLE runs (committed) before any tx test — so
    // inside a transaction its ensureInitialized is a no-op and the tx client
    // sees the already-committed table.
    store = new PostgresStore<Widget>({ connectionString: url, tableName: T.entities });
    await store.getById('__warmup__');
  });

  afterAll(async () => {
    await store.close();
    for (const name of Object.values(T)) {
      await pool.query(`DROP TABLE IF EXISTS ${name} CASCADE`);
    }
    await pool.end();
  });

  beforeEach(async () => {
    for (const name of Object.values(T)) {
      await pool.query(`TRUNCATE ${name}`);
    }
  });

  // ─── 1. The provider itself ────────────────────────────────────────────

  it('commits the writes done inside the callback', async () => {
    await provider.withTransaction(async (tx) => {
      await tx.query(`INSERT INTO ${T.raw} (id) VALUES ($1)`, ['committed']);
    });
    const { rows } = await pool.query(`SELECT id FROM ${T.raw} WHERE id = $1`, ['committed']);
    expect(rows).toHaveLength(1);
  });

  it('rolls back on throw and rethrows the original error', async () => {
    const boom = new Error('boom');
    await expect(
      provider.withTransaction(async (tx) => {
        await tx.query(`INSERT INTO ${T.raw} (id) VALUES ($1)`, ['rolled-back']);
        throw boom;
      })
    ).rejects.toBe(boom);

    const { rows } = await pool.query(`SELECT id FROM ${T.raw} WHERE id = $1`, ['rolled-back']);
    expect(rows).toHaveLength(0);
  });

  it('releases the client on both commit and rollback (no connection leak)', async () => {
    // The default pool max is 10. Running past that many transactions
    // sequentially can only succeed if each releases its client — otherwise
    // connect() would block once the pool is exhausted. Mix commits and
    // throws to exercise both release paths. Generous timeout: this is many
    // sequential round-trips to a remote database.
    for (let i = 0; i < 15; i++) {
      if (i % 2 === 0) {
        await provider.withTransaction(async (tx) => {
          await tx.query('SELECT 1');
        });
      } else {
        await provider
          .withTransaction(async (tx) => {
            await tx.query('SELECT 1');
            throw new Error('rollback');
          })
          .catch(() => undefined);
      }
    }
    // After the loop every client is back in the pool.
    expect(pool.totalCount).toBeLessThanOrEqual(pool.options.max ?? 10);
    expect(pool.idleCount).toBeGreaterThanOrEqual(1);
    expect(pool.waitingCount).toBe(0);
  }, 30000);

  // ─── 2. Per-adapter tx honoring ────────────────────────────────────────

  it('PostgresStore.create honors tx (rollback absent, commit present)', async () => {
    await provider
      .withTransaction(async (tx) => {
        await store.create({ id: 'w1', name: 'first' }, tx);
        throw new Error('rollback');
      })
      .catch(() => undefined);
    expect(await countStore('w1')).toBe(0);

    await provider.withTransaction(async (tx) => {
      await store.create({ id: 'w1', name: 'first' }, tx);
    });
    expect(await countStore('w1')).toBe(1);
  });

  it('PostgresStore.update honors tx', async () => {
    await store.create({ id: 'w2', name: 'orig' });

    await provider
      .withTransaction(async (tx) => {
        await store.update('w2', { name: 'changed' }, tx);
        throw new Error('rollback');
      })
      .catch(() => undefined);
    expect((await store.getById('w2'))?.name).toBe('orig');

    await provider.withTransaction(async (tx) => {
      await store.update('w2', { name: 'changed' }, tx);
    });
    expect((await store.getById('w2'))?.name).toBe('changed');
  });

  it('PostgresStore.delete honors tx', async () => {
    await store.create({ id: 'w3', name: 'keep' });

    await provider
      .withTransaction(async (tx) => {
        await store.delete('w3', tx);
        throw new Error('rollback');
      })
      .catch(() => undefined);
    expect(await countStore('w3')).toBe(1);

    await provider.withTransaction(async (tx) => {
      await store.delete('w3', tx);
    });
    expect(await countStore('w3')).toBe(0);
  });

  it('PostgresIdempotencyStore.set honors tx', async () => {
    await provider
      .withTransaction(async (tx) => {
        await idem.set('k1', commandResult(), tx);
        throw new Error('rollback');
      })
      .catch(() => undefined);
    expect(await idem.has('k1')).toBe(false);

    await provider.withTransaction(async (tx) => {
      await idem.set('k1', commandResult(), tx);
    });
    expect(await idem.has('k1')).toBe(true);
  });

  it('PostgresJobQueue.enqueue honors tx', async () => {
    await provider
      .withTransaction(async (tx) => {
        await jobs.enqueue(job('j1'), tx);
        throw new Error('rollback');
      })
      .catch(() => undefined);
    expect(await countJobs('j1')).toBe(0);

    await provider.withTransaction(async (tx) => {
      await jobs.enqueue(job('j1'), tx);
    });
    expect(await countJobs('j1')).toBe(1);
  });

  it('PostgresApprovalStore.save honors tx', async () => {
    await provider
      .withTransaction(async (tx) => {
        await approval.save('a1', approvalState(), tx);
        throw new Error('rollback');
      })
      .catch(() => undefined);
    expect(await approval.load('a1')).toBeUndefined();

    await provider.withTransaction(async (tx) => {
      await approval.save('a1', approvalState(), tx);
    });
    expect(await approval.load('a1')).toBeDefined();
  });

  it('PostgresOutboxStore.enqueue honors tx', async () => {
    await provider
      .withTransaction(async (tx) => {
        await outbox.enqueue([outboxEntry('o1')], tx);
        throw new Error('rollback');
      })
      .catch(() => undefined);
    expect(await countOutbox('o1')).toBe(0);

    await provider.withTransaction(async (tx) => {
      await outbox.enqueue([outboxEntry('o1')], tx);
    });
    expect(await countOutbox('o1')).toBe(1);
  });

  // ─── 3. Cross-adapter atomicity (flagship) ─────────────────────────────

  it('rolls back store + outbox + idempotency together when the tx throws', async () => {
    await provider
      .withTransaction(async (tx) => {
        await store.create({ id: 'x1', name: 'atomic' }, tx);
        await outbox.enqueue([outboxEntry('x1')], tx);
        await idem.set('x1', commandResult(), tx);
        // Fail AFTER all three writes — nothing must survive.
        throw new Error('injected failure after writes');
      })
      .catch(() => undefined);

    expect(await countStore('x1')).toBe(0);
    expect(await countOutbox('x1')).toBe(0);
    expect(await idem.has('x1')).toBe(false);
  });

  it('commits store + outbox + idempotency together on the happy path', async () => {
    await provider.withTransaction(async (tx) => {
      await store.create({ id: 'x2', name: 'atomic' }, tx);
      await outbox.enqueue([outboxEntry('x2')], tx);
      await idem.set('x2', commandResult(), tx);
    });

    expect(await countStore('x2')).toBe(1);
    expect(await countOutbox('x2')).toBe(1);
    expect(await idem.has('x2')).toBe(true);
  });

  // ─── query helpers (read committed state via the shared pool) ───────────

  async function countStore(id: string): Promise<number> {
    const { rows } = await pool.query(`SELECT 1 FROM ${T.entities} WHERE id = $1`, [id]);
    return rows.length;
  }
  async function countOutbox(id: string): Promise<number> {
    const { rows } = await pool.query(`SELECT 1 FROM ${T.outbox} WHERE entry_id = $1`, [id]);
    return rows.length;
  }
  async function countJobs(id: string): Promise<number> {
    const { rows } = await pool.query(`SELECT 1 FROM ${T.jobs} WHERE job_id = $1`, [id]);
    return rows.length;
  }
});
