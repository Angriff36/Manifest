-- Manifest idempotency_keys schema.
--
-- Run once per database hosting the IdempotencyStore. Compatible with PostgreSQL 13+.
-- Designed for the PostgresIdempotencyStore adapter in
-- src/manifest/idempotency/stores/postgres.ts.
--
-- Design notes:
--   * `idempotency_key` is the PRIMARY KEY (the caller's opaque command
--     dedup key) so `set` can use INSERT … ON CONFLICT (idempotency_key)
--     DO NOTHING for replay-safe, first-write-wins caching.
--   * `result` is JSONB so the full CommandResult round-trips without a
--     column per result shape. Callers may query/filter it without unpacking.
--   * All lookups (has/get/set) are by primary key, so no secondary index
--     is needed — the PRIMARY KEY btree covers every access path.

CREATE TABLE IF NOT EXISTS manifest_idempotency_keys (
  idempotency_key  TEXT PRIMARY KEY,
  result           JSONB NOT NULL,
  inserted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
