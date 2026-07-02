/**
 * END-TO-END live acceptance test for the Workstream 2D transaction boundary:
 * a real RuntimeEngine executing commands with a PostgresTransactionProvider
 * against live Postgres for the entity store, outbox, AND idempotency store —
 * proving mutation + outbox enqueue + idempotency write commit or roll back
 * as one unit through the actual `runCommand` path (not just the provider
 * substrate, which src/manifest/transactions/postgres.live.test.ts covers).
 *
 * SKIPPED when `DATABASE_URL` (or `MANIFEST_POSTGRES_TEST_URL`) is unset.
 * Tables are uniquely named per run so this suite coexists with the sibling
 * live suites.
 *
 * Note: instances are created explicitly (engine.createInstance) before each
 * command — a mutating command without an instanceId has no persistence
 * target (pre-existing engine behavior, independent of the tx boundary).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { compileToIR } from './ir-compiler';
import { RuntimeEngine } from './runtime-engine';
import type { IR } from './ir';
import { PostgresTransactionProvider } from './transactions/postgres';
import { PostgresStore } from './stores.node';
import { PostgresIdempotencyStore } from './idempotency/stores/postgres';
import { PostgresOutboxStore } from './outbox/stores/postgres';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DB_URL = process.env.MANIFEST_POSTGRES_TEST_URL ?? process.env.DATABASE_URL;

const SOURCE = `
entity Widget {
  property name: string = ""
  property total: number = 0

  command stock(newName: string, amount: number) {
    guard amount > 0
    mutate name = newName
    mutate total = amount
    emit WidgetStocked { widgetName: newName }
  }
}
store Widget in memory
`;

describe.runIf(DB_URL)('engine transaction boundary — live Postgres end-to-end', () => {
  const runTag = `e2e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const entityTable = `tx_${runTag}_widgets`;
  const outboxTable = `tx_${runTag}_outbox`;
  const idemTable = `tx_${runTag}_idem`;
  const badOutboxTable = `tx_${runTag}_outbox_missing`;

  let pool: Pool;
  let ir: IR;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DB_URL });
    const outboxSql = readFileSync(
      resolve(__dirname, './outbox/stores/postgres.sql'),
      'utf-8'
    ).replace(/manifest_outbox_entries/g, outboxTable);
    await pool.query(outboxSql);
    const idemSql = readFileSync(
      resolve(__dirname, './idempotency/stores/postgres.sql'),
      'utf-8'
    ).replace(/manifest_idempotency_keys/g, idemTable);
    await pool.query(idemSql);

    const compiled = await compileToIR(SOURCE, { useCache: false });
    expect(compiled.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    ir = compiled.ir!;
  });

  afterAll(async () => {
    for (const t of [entityTable, outboxTable, idemTable]) {
      await pool.query(`DROP TABLE IF EXISTS "${t}"`);
    }
    await pool.end();
  });

  function buildEngine(opts: { outboxTable: string; idempotency?: boolean }) {
    const entityStore = new PostgresStore({ connectionString: DB_URL!, tableName: entityTable });
    return new RuntimeEngine(
      ir,
      { user: { id: 'tester' } },
      {
        storeProvider: (name) => (name === 'Widget' ? entityStore : undefined),
        outboxStore: new PostgresOutboxStore({ pool, tableName: opts.outboxTable }),
        ...(opts.idempotency
          ? { idempotencyStore: new PostgresIdempotencyStore({ pool, tableName: idemTable }) }
          : {}),
        transactionProvider: new PostgresTransactionProvider({ pool }),
      }
    );
  }

  async function mustCreate(engine: RuntimeEngine): Promise<{ id: string }> {
    const inst = await engine.createInstance('Widget', {});
    if (!inst) throw new Error('createInstance returned undefined');
    return inst as { id: string };
  }

  async function readWidget(id: string): Promise<{ name?: string; total?: number } | null> {
    const rows = await pool.query(`SELECT data FROM "${entityTable}" WHERE id = $1`, [id]);
    if (rows.rows.length === 0) return null;
    const d = rows.rows[0].data;
    return typeof d === 'string' ? JSON.parse(d) : d;
  }

  it('commits mutation + outbox entry + idempotency record as one unit', async () => {
    const engine = buildEngine({ outboxTable, idempotency: true });
    const inst = await mustCreate(engine);

    const result = await engine.runCommand(
      'stock',
      { newName: 'atomic-widget', amount: 7 },
      { entityName: 'Widget', instanceId: inst.id, idempotencyKey: `${runTag}-commit` }
    );
    expect(result.success).toBe(true);

    const row = await readWidget(inst.id);
    expect(row?.name).toBe('atomic-widget');
    expect(row?.total).toBe(7);

    const outboxRows = await pool.query(
      `SELECT event FROM "${outboxTable}" WHERE status = 'pending'`
    );
    const names = outboxRows.rows.map((r) =>
      (typeof r.event === 'string' ? JSON.parse(r.event) : r.event).name
    );
    expect(names).toContain('WidgetStocked');

    const idem = await pool.query(
      `SELECT idempotency_key FROM "${idemTable}" WHERE idempotency_key = $1`,
      [`${runTag}-commit`]
    );
    expect(idem.rows).toHaveLength(1);
  });

  it('duplicate idempotency key returns cached result without re-executing the mutation', async () => {
    const engine = buildEngine({ outboxTable, idempotency: true });
    const inst = await mustCreate(engine);
    const key = `${runTag}-dup`;

    const first = await engine.runCommand(
      'stock',
      { newName: 'dup-widget', amount: 3 },
      { entityName: 'Widget', instanceId: inst.id, idempotencyKey: key }
    );
    expect(first.success).toBe(true);

    // Same key, different input, fresh engine: cached result, no re-execution.
    const engine2 = buildEngine({ outboxTable, idempotency: true });
    const second = await engine2.runCommand(
      'stock',
      { newName: 'dup-widget-CHANGED', amount: 99 },
      { entityName: 'Widget', instanceId: inst.id, idempotencyKey: key }
    );
    expect(second.success).toBe(true);

    const row = await readWidget(inst.id);
    expect(row?.name).toBe('dup-widget'); // not CHANGED
    expect(row?.total).toBe(3); // not 99
  });

  it('outbox enqueue failure rolls back the mutation and fails the command', async () => {
    const engine = buildEngine({ outboxTable: badOutboxTable, idempotency: false });
    const inst = await mustCreate(engine);

    const result = await engine.runCommand(
      'stock',
      { newName: 'ghost-widget', amount: 5 },
      { entityName: 'Widget', instanceId: inst.id }
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/OUTBOX_ENQUEUE_FAILED/);

    const row = await readWidget(inst.id);
    expect(row?.name).toBe(''); // mutation rolled back — defaults intact
    expect(row?.total).toBe(0);
  });

  it('guard failure persists no mutation and no idempotency record', async () => {
    const engine = buildEngine({ outboxTable, idempotency: true });
    const inst = await mustCreate(engine);

    const result = await engine.runCommand(
      'stock',
      { newName: 'rejected-widget', amount: -1 }, // guard amount > 0 fails
      { entityName: 'Widget', instanceId: inst.id, idempotencyKey: `${runTag}-guardfail` }
    );
    expect(result.success).toBe(false);

    const row = await readWidget(inst.id);
    expect(row?.name).toBe('');
    expect(row?.total).toBe(0);

    // Provider mode does not cache rolled-back attempts (spec: the attempt
    // never happened), so the key must be absent.
    const idem = await pool.query(
      `SELECT idempotency_key FROM "${idemTable}" WHERE idempotency_key = $1`,
      [`${runTag}-guardfail`]
    );
    expect(idem.rows).toHaveLength(0);
  });
});
