/**
 * Configuration surface for the Elasticsearch projection.
 *
 * Every search-specific concept (index definitions, field overrides, analyzer
 * configurations, ingest pipeline settings) is supplied here. NONE of these
 * enter Manifest core grammar or IR.
 *
 * The projection discovers searchable entities from `ir.stores` entries with
 * `target === 'elasticsearch'` AND from `ir.readModels` (which are denormalized
 * views that map naturally to search indexes).
 *
 * Options also accept a `searchable` boolean on entity store configs to opt
 * specific entities into indexing (e.g. `store Order in elasticsearch searchable: true`).
 */

import type {
  ElasticsearchIndexDefinition,
  ESIngestPipeline,
  ESIndexerConfig,
} from './types.js';

export interface ElasticsearchProjectionOptions {
  /**
   * Explicit index definitions. When omitted, the projection auto-derives
   * one index per entity declared with `store X in elasticsearch`.
   */
  indices?: ElasticsearchIndexDefinition[];

  /**
   * Ingest pipelines to emit alongside the index mappings.
   * Each pipeline can be referenced by index definitions.
   */
  ingestPipelines?: ESIngestPipeline[];

  /**
   * Configuration for the generated outbox-driven indexer worker.
   * Controls batch size, retry logic, and refresh policy.
   */
  indexerConfig?: ESIndexerConfig;

  /**
   * Whether to emit a single combined mapping file or one per index.
   * Default: true (single file).
   */
  emitSingleFile?: boolean;

  /**
   * Output path hint for the mapping artifact.
   * Default: "elasticsearch-mappings.json"
   */
  output?: string;

  /**
   * Global index name prefix applied to all generated indices.
   * E.g. "prod_" produces "prod_orders".
   */
  indexNamePrefix?: string;
}

/**
 * Defaults for the Elasticsearch projection.
 */
export const ELASTICSEARCH_PROJECTION_DEFAULTS: Required<
  Pick<
    ElasticsearchProjectionOptions,
    'emitSingleFile' | 'output' | 'indexNamePrefix'
  >
> = {
  emitSingleFile: true,
  output: 'elasticsearch-mappings.json',
  indexNamePrefix: '',
} as const;

/**
 * Normalize raw options into a fully-typed configuration object.
 */
export function normalizeOptions(
  raw: Record<string, unknown> | undefined,
): ElasticsearchProjectionOptions {
  const input = (raw ?? {}) as Partial<ElasticsearchProjectionOptions>;
  return {
    indices: input.indices,
    ingestPipelines: input.ingestPipelines,
    indexerConfig: input.indexerConfig,
    emitSingleFile: input.emitSingleFile ?? ELASTICSEARCH_PROJECTION_DEFAULTS.emitSingleFile,
    output: input.output ?? ELASTICSEARCH_PROJECTION_DEFAULTS.output,
    indexNamePrefix: input.indexNamePrefix ?? ELASTICSEARCH_PROJECTION_DEFAULTS.indexNamePrefix,
  };
}
