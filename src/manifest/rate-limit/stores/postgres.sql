-- Manifest rate_limit_buckets schema.
--
-- Run once per database hosting the RateLimitStore. Compatible with PostgreSQL 13+.
-- Designed for the PostgresRateLimitStore adapter in
-- src/manifest/rate-limit/stores/postgres.ts.
--
-- Design notes:
--   * `scope_key` is the PRIMARY KEY (user:/tenant:/global:/policy:… keys from
--     the runtime rate-limit gate) so lookups and locked mutates are O(1).
--   * `timestamps` is JSONB array of epoch-ms numbers (sliding window).
--   * `window_start` is epoch-ms for the current open window.
--   * PostgresRateLimitStore.mutate uses SELECT … FOR UPDATE inside a
--     transaction so concurrent engines share one coherent counter.

CREATE TABLE IF NOT EXISTS manifest_rate_limit_buckets (
  scope_key     TEXT PRIMARY KEY,
  timestamps    JSONB NOT NULL DEFAULT '[]'::jsonb,
  window_start  BIGINT NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
