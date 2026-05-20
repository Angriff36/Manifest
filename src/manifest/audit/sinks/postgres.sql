-- Manifest audit_records schema.
--
-- Run once per database hosting the AuditSink. Compatible with PostgreSQL 13+.
-- Designed for the PostgresAuditSink adapter in src/manifest/audit/sinks/postgres.ts.
--
-- Design notes:
--   * `record_id` is the PRIMARY KEY so a unique index supports the
--     idempotent INSERT … ON CONFLICT DO NOTHING upsert used by the sink.
--   * `diagnostics` is JSONB so callers can query failure details ad hoc.
--   * `(tenant_id, occurred_at DESC)` covers the most common compliance
--     query: "show me what happened in tenant T over the last N minutes."
--   * If you operate multi-tenant via row-level security, see the
--     `manifest_audit_records_tenant_isolation` policy stub below — it is
--     intentionally generic and not coupled to any specific provider.

CREATE TABLE IF NOT EXISTS manifest_audit_records (
  record_id            TEXT PRIMARY KEY,
  occurred_at          BIGINT NOT NULL,
  tenant_id            TEXT,
  org_id               TEXT,
  actor_id             TEXT,
  request_id           TEXT,
  source               TEXT,
  entity               TEXT,
  command              TEXT NOT NULL,
  command_id           TEXT,
  outcome              TEXT NOT NULL,
  emitted_event_names  TEXT[],
  ir_hash              TEXT,
  diagnostics          JSONB,
  inserted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manifest_audit_tenant_occurred
  ON manifest_audit_records (tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_manifest_audit_command_occurred
  ON manifest_audit_records (command_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_manifest_audit_outcome
  ON manifest_audit_records (outcome);

-- Optional: tenant isolation via Postgres row-level security.
-- Uncomment and adapt to your tenant-identity strategy. The policy reads
-- the current tenant from a session variable that the application must
-- set on each connection (e.g. `SET app.tenant_id = '<id>'`).
--
-- ALTER TABLE manifest_audit_records ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY manifest_audit_records_tenant_isolation
--   ON manifest_audit_records
--   USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id', true));
