-- Manifest outbox_entries schema.
--
-- Run once per database hosting the OutboxStore. Compatible with PostgreSQL 13+.
-- Designed for the PostgresOutboxStore adapter in src/manifest/outbox/stores/postgres.ts.
--
-- Design notes:
--   * `entry_id` is the PRIMARY KEY so INSERT … ON CONFLICT DO NOTHING
--     supports replay-safe enqueue.
--   * `status` is `CHECK`-constrained to the OutboxEntryStatus enum from
--     src/manifest/outbox/outbox-store.ts so a malformed adapter cannot
--     silently corrupt state.
--   * `event` is JSONB so callers can query/filter without unpacking.
--   * Claim uses `FOR UPDATE SKIP LOCKED` so multiple concurrent dispatcher
--     workers can claim disjoint batches without serializing through a
--     lock — see https://www.postgresql.org/docs/current/sql-select.html
--     § "The Locking Clause".
--   * `(status, enqueued_at)` index keeps the claim query O(log N) on the
--     pending-only subset.

CREATE TABLE IF NOT EXISTS manifest_outbox_entries (
  entry_id      TEXT PRIMARY KEY,
  enqueued_at   BIGINT NOT NULL,
  event         JSONB NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  claimed_at    TIMESTAMPTZ,
  delivered_at  TIMESTAMPTZ,
  failed_at     TIMESTAMPTZ,
  inserted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Covers the claim() query: status='pending' AND claimed_at IS NULL ORDER BY enqueued_at.
-- The partial index keeps the hot path O(log N) on the "ready to claim" subset.
CREATE INDEX IF NOT EXISTS idx_manifest_outbox_pending_unclaimed
  ON manifest_outbox_entries (enqueued_at)
  WHERE status = 'pending' AND claimed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_manifest_outbox_status
  ON manifest_outbox_entries (status);

-- Optional: subject projection columns. When `projectSubject` is enabled on the
-- PostgresOutboxStore, `subject_entity` and `subject_id` are populated from
-- `event.subject.entity` and `event.subject.id` at enqueue time. These columns
-- allow efficient querying by entity or instance without JSONB extraction.
-- The columns are nullable and the indexes are partial — adding them is
-- backwards-compatible and does not affect existing rows.
ALTER TABLE manifest_outbox_entries ADD COLUMN IF NOT EXISTS subject_entity TEXT;
ALTER TABLE manifest_outbox_entries ADD COLUMN IF NOT EXISTS subject_id TEXT;

CREATE INDEX IF NOT EXISTS idx_manifest_outbox_subject_entity
  ON manifest_outbox_entries (subject_entity)
  WHERE subject_entity IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_manifest_outbox_subject_id
  ON manifest_outbox_entries (subject_id)
  WHERE subject_id IS NOT NULL;

-- Optional: tenant scoping. Outbox entries inherit their tenant from the
-- `event.tenantId` JSON field. If RLS is desired, add the column and a
-- policy similar to the audit table — kept commented out by default.
