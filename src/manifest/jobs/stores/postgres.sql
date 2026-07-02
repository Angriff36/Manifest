-- Manifest jobs schema (async-command durable JobQueue).
--
-- Run once per database hosting the PostgresJobQueue. Compatible with
-- PostgreSQL 13+. Designed for the PostgresJobQueue adapter in
-- src/manifest/jobs/stores/postgres.ts.
--
-- Design notes:
--   * `job_id` is the PRIMARY KEY so `enqueue` can use
--     INSERT … ON CONFLICT (job_id) DO NOTHING for replay-safe enqueue.
--   * `status` is CHECK-constrained to the JobRecord status enum from
--     src/manifest/ir.ts so a malformed adapter cannot silently corrupt state.
--   * `input` / `result` are JSONB so command arguments and results
--     round-trip without a join table.
--   * `enqueued_at` is BIGINT epoch-millis to match the runtime's `now()`
--     clock (NOT timestamptz) — the runtime owns time so deterministic tests
--     stay deterministic. `inserted_at` / `updated_at` are DB wall-clock for
--     operational visibility only.
--   * drainPending claims pending rows with FOR UPDATE SKIP LOCKED and flips
--     them to 'running' in one statement, so concurrent workers get disjoint
--     jobs. The partial index keeps that claim O(log N) on the pending subset.

CREATE TABLE IF NOT EXISTS manifest_jobs (
  job_id          TEXT PRIMARY KEY,
  command_name    TEXT NOT NULL,
  entity_name     TEXT,
  instance_id     TEXT,
  input           JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlation_id  TEXT,
  causation_id    TEXT,
  enqueued_at     BIGINT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  result          JSONB,
  error           TEXT,
  inserted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Covers drainPending(): status='pending' ORDER BY enqueued_at.
CREATE INDEX IF NOT EXISTS idx_manifest_jobs_pending
  ON manifest_jobs (enqueued_at)
  WHERE status = 'pending';
