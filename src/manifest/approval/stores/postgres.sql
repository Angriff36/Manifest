-- Manifest approval_requests schema.
--
-- Run once per database hosting the ApprovalStore. Compatible with PostgreSQL 13+.
-- Designed for the PostgresApprovalStore adapter in
-- src/manifest/approval/stores/postgres.ts.
--
-- Design notes:
--   * `request_key` is the PRIMARY KEY (the runtime's opaque
--     `<entity>:<instanceId>:<approvalName>` key) so `save` can use
--     INSERT … ON CONFLICT (request_key) DO UPDATE for idempotent upsert.
--   * `status` is CHECK-constrained to the ApprovalRequestState status enum
--     from src/manifest/runtime-engine.ts so a malformed adapter cannot
--     silently corrupt state.
--   * `required_stages` and `grants` are JSONB so the full request
--     round-trips without a join table.
--   * `requested_at` / `expires_at` are BIGINT epoch-millis to match the
--     runtime's `now()` clock (NOT timestamptz) — the runtime owns time so
--     deterministic tests stay deterministic.
--   * The partial index keeps the expire() sweep O(log N) on the pending,
--     time-bounded subset.

CREATE TABLE IF NOT EXISTS manifest_approval_requests (
  request_key      TEXT PRIMARY KEY,
  entity           TEXT NOT NULL,
  instance_id      TEXT NOT NULL,
  approval_name    TEXT NOT NULL,
  command          TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('pending', 'granted', 'denied', 'expired')),
  required_stages  JSONB NOT NULL DEFAULT '[]'::jsonb,
  grants           JSONB NOT NULL DEFAULT '[]'::jsonb,
  requested_at     BIGINT NOT NULL,
  expires_at       BIGINT,
  denied_by        TEXT,
  denied_reason    TEXT,
  inserted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Covers expire(): status='pending' AND expires_at <= $1.
CREATE INDEX IF NOT EXISTS idx_manifest_approval_pending_expiring
  ON manifest_approval_requests (expires_at)
  WHERE status = 'pending' AND expires_at IS NOT NULL;

-- Operational lookups by entity instance (dashboards, audits).
CREATE INDEX IF NOT EXISTS idx_manifest_approval_entity_instance
  ON manifest_approval_requests (entity, instance_id);
