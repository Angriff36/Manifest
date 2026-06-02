/**
 * Type definitions for the Elasticsearch projection.
 *
 * All search-specific concepts (index settings, analyzer configurations,
 * field overrides, pipeline definitions) are declared here. None of these
 * enter Manifest core grammar or IR — they arrive via projection options
 * or are inferred deterministically from IR.
 */

/** A single field mapping override for a specific property. */
export interface ESFieldOverride {
  /** Elasticsearch field type to use (e.g. "text", "keyword", "date") */
  type: string;
  /** Optional analyzer for text fields */
  analyzer?: string;
  /** Whether the field is searchable */
  index?: boolean;
  /** Whether doc_values are stored */
  doc_values?: boolean;
  /** Custom field name in the index (defaults to property name) */
  fieldName?: string;
}

/** Configuration for a single Elasticsearch index derived from an entity. */
export interface ElasticsearchIndexDefinition {
  /** Entity name to index (must match an IREntity.name) */
  entity: string;
  /** Override the index name (defaults to lowercase entity name) */
  indexName?: string;
  /** Number of shards for the index (default: 1) */
  numberOfShards?: number;
  /** Number of replicas for the index (default: 1) */
  numberOfReplicas?: number;
  /** Custom analyzers for this index */
  analyzers?: Record<string, ESAnalyzerConfig>;
  /** Per-property field mapping overrides */
  fieldOverrides?: Record<string, ESFieldOverride>;
  /** Properties to exclude from the index (by name) */
  excludeFields?: string[];
  /** Whether to include computed properties (default: false) */
  includeComputedProperties?: boolean;
}

/** Custom analyzer configuration for text analysis. */
export interface ESAnalyzerConfig {
  /** Analyzer type */
  type: 'standard' | 'simple' | 'whitespace' | 'custom';
  /** Tokenizer (required for custom analyzers) */
  tokenizer?: string;
  /** Token filters to apply */
  filter?: string[];
}

/** Ingest pipeline processor configuration. */
export interface ESIngestPipelineProcessor {
  /** Processor type (e.g. "set", "rename", "script", "date") */
  type: string;
  /** Processor-specific configuration */
  [key: string]: unknown;
}

/** Ingest pipeline definition for transforming documents before indexing. */
export interface ESIngestPipeline {
  /** Pipeline identifier */
  id: string;
  /** Pipeline description */
  description?: string;
  /** Ordered list of processors to apply */
  processors: ESIngestPipelineProcessor[];
}

/** Configuration for the outbox-driven indexer worker. */
export interface ESIndexerConfig {
  /** Batch size for bulk indexing (default: 100) */
  batchSize?: number;
  /** Refresh policy after bulk operations (default: "false") */
  refresh?: 'true' | 'false' | 'wait_for';
  /** Elasticsearch endpoint URL */
  endpoint?: string;
  /** Index name prefix (default: empty) */
  indexPrefix?: string;
  /** Whether to emit retry logic (default: true) */
  enableRetry?: boolean;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
}
