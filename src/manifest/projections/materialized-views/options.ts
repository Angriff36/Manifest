/**
 * Configuration surface for the materialized-views projection.
 *
 * Every relational concept (view name, column name, refresh strategy, index
 * definitions) is supplied here at projection time. NONE of these enter
 * Manifest core grammar or IR. The projection translates IR + this options
 * bag into PostgreSQL `CREATE MATERIALIZED VIEW` DDL.
 *
 * The projection consumes `IRReadModel[]` (denormalized views maintained by
 * the runtime) and `IREntity[]` (entities with computed properties that the
 * caller has marked as materialized via the `views` option).
 */

import type { MaterializedViewDefinition } from './types.js';

export interface MaterializedViewsProjectionOptions {
  /**
   * Materialized view definitions to generate. Each entry maps an IR
   * read model or entity to a PostgreSQL materialized view.
   *
   *   views: [{
   *     name: "daily_order_totals",
   *     source: "Order",
   *     refreshStrategy: "scheduled",
   *     schedule: { cron: "0 * * * *" },
   *     columns: { day: "DATE_TRUNC('day', created_at)", total: "SUM(amount)" },
   *     indexes: [{ columns: ["day"], unique: true }]
   *   }]
   */
  views?: MaterializedViewDefinition[];

  /**
   * Whether to emit a single artifact with all views, or one artifact
   * per view. Default: true (single file).
   */
  emitSingleFile?: boolean;

  /**
   * Output path hint for the emitted artifact. The projection itself
   * does not write files. Default: "materialized-views.sql".
   */
  output?: string;

  /**
   * Schema to qualify view and index names with (e.g. "analytics").
   * If omitted, objects are unqualified (live in the search_path default).
   */
  schema?: string;

  /**
   * Whether to emit REFRESH MATERIALIZED VIEW statements as part of
   * the artifact (for on-demand strategy) or as a separate function
   * that can be called manually. Default: true (inline statements).
   */
  emitRefreshStatements?: boolean;
}

/**
 * Defaults. Kept as an exported const so consumers and tests can introspect.
 */
export const MATERIALIZED_VIEWS_PROJECTION_DEFAULTS: Required<
  Pick<MaterializedViewsProjectionOptions, 'emitSingleFile' | 'output' | 'emitRefreshStatements'>
> = {
  emitSingleFile: true,
  output: 'materialized-views.sql',
  emitRefreshStatements: true,
} as const;

/**
 * Normalize a raw `request.options` bag into a fully-typed options object.
 */
export function normalizeOptions(
  raw: Record<string, unknown> | undefined,
): MaterializedViewsProjectionOptions {
  const input = (raw ?? {}) as Partial<MaterializedViewsProjectionOptions>;
  return {
    views: input.views ?? [],
    emitSingleFile: input.emitSingleFile ?? MATERIALIZED_VIEWS_PROJECTION_DEFAULTS.emitSingleFile,
    output: input.output ?? MATERIALIZED_VIEWS_PROJECTION_DEFAULTS.output,
    schema: input.schema,
    emitRefreshStatements:
      input.emitRefreshStatements ?? MATERIALIZED_VIEWS_PROJECTION_DEFAULTS.emitRefreshStatements,
  };
}
