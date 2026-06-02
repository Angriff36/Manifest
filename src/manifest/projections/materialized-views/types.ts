/**
 * Type definitions for the materialized-views projection.
 *
 * This projection generates PostgreSQL `CREATE MATERIALIZED VIEW` DDL from
 * Manifest IR read models and entities with computed properties marked as
 * materialized. The projection carries all relational concepts (view name,
 * column names, refresh strategy, index definitions) — none of those enter
 * Manifest core grammar or IR.
 */

/** Refresh strategy for a materialized view. */
export type MaterializedViewRefreshStrategy = 'on-demand' | 'scheduled' | 'trigger-based';

/**
 * Schedule configuration for 'scheduled' refresh strategy.
 * Maps to a pg_cron expression or a simple interval spec.
 */
export interface MaterializedViewSchedule {
  /** Cron expression for pg_cron (e.g. "0 * * * *" for hourly). */
  cron?: string;
  /** Interval string for pg_cron (e.g. "1 hour", "30 minutes"). Mutually exclusive with cron. */
  interval?: string;
}

/**
 * Trigger configuration for 'trigger-based' refresh strategy.
 * Maps to a row-count threshold or event-based trigger.
 */
export interface MaterializedViewTrigger {
  /** Source table whose changes trigger a refresh. */
  sourceTable: string;
  /** Column that when changed triggers a refresh. */
  column?: string;
  /** Debounce interval in seconds — refresh at most once per N seconds. */
  debounceSeconds?: number;
}

/**
 * One index entry on the materialized view.
 * Maps to a `CREATE INDEX` statement.
 */
export interface MaterializedViewIndex {
  /** Columns to index (composite if multiple). */
  columns: string[];
  /** Optional index name. Auto-generated if omitted. */
  name?: string;
  /** Unique index. */
  unique?: boolean;
  /** Index method (btree, hash, gin, gist). Defaults to 'btree'. */
  method?: 'btree' | 'hash' | 'gin' | 'gist';
  /** WHERE clause for partial index. */
  where?: string;
}

/**
 * Definition of a single materialized view to be generated.
 * Consumers declare these via the `views` option on the projection.
 */
export interface MaterializedViewDefinition {
  /** Unique view name in the output DDL. */
  name: string;

  /**
   * Source read model name (from `IRReadModel[]`) or entity name
   * (from `IREntity[]`). Must match a declaration in the IR.
   */
  source: string;

  /** Override for the view name in SQL (defaults to `name`). */
  viewName?: string;

  /**
   * Override for the source table name in the SQL query.
   * Defaults to the lowercased entity name (snake_case) or the
   * read model's `storeTarget` table name.
   */
  sourceTable?: string;

  /**
   * Refresh strategy for this materialized view.
   * Defaults to 'on-demand'.
   */
  refreshStrategy?: MaterializedViewRefreshStrategy;

  /** Schedule config (only used when refreshStrategy is 'scheduled'). */
  schedule?: MaterializedViewSchedule;

  /** Trigger config (only used when refreshStrategy is 'trigger-based'). */
  trigger?: MaterializedViewTrigger;

  /**
   * Per-column SELECT expressions. If omitted, the projection emits
   * `SELECT *` from the source table. The key is the output column
   * name; the value is the raw SQL expression to compute it.
   *
   * Example: { dailyTotal: "SUM(amount)", orderCount: "COUNT(*)" }
   */
  columns?: Record<string, string>;

  /** Indexes to create on the materialized view. */
  indexes?: MaterializedViewIndex[];

  /**
   * WITH NO DATA — create the view but do not populate it.
   * The first REFRESH MATERIALIZED VIEW will populate.
   */
  withNoData?: boolean;

  /**
   * Free-form SQL to append after the CREATE MATERIALIZED VIEW body
   * (e.g. additional GRANT statements or comments). Use sparingly.
   */
  trailingSql?: string;
}
