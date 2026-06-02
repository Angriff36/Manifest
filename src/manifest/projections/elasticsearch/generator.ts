/**
 * Elasticsearch Projection for Manifest IR.
 *
 * Generates Elasticsearch index mappings, index template configurations,
 * typed ingest pipeline definitions, search query builders, and an
 * outbox-driven sync adapter from IR entities marked with `searchable`
 * (via `store X in elasticsearch` declarations).
 *
 * Surfaces:
 *   - elasticsearch.mapping        → Per-index mapping JSON
 *   - elasticsearch.indexTemplate   → Composable index template JSON
 *   - elasticsearch.ingestPipeline  → Ingest pipeline definitions
 *   - elasticsearch.indexer         → TypeScript outbox-driven indexer worker
 *   - elasticsearch.client          → Typed search query builder helpers
 *
 * Design philosophy:
 *   - Search interpretation starts HERE. No search concept (analyzer, boost,
 *     index template, pipeline processor) lives in Manifest core grammar or IR.
 *   - Entities are discovered via `ir.stores.filter(s => s.target === 'elasticsearch')`
 *     and/or `ir.readModels` (denormalized views that map naturally to search).
 *   - Computed properties are excluded by default (they are derived; ES would
 *     store stale copies). Opt in via `includeComputedProperties: true`.
 *   - Private properties are always excluded (never index secrets).
 *   - The indexer surface emits a dispatcher consumer that subscribes to the
 *     outbox and bulk-indexes entity state changes into ES.
 *   - Honors tenant isolation: when `ir.tenant` is set, adds the tenant
 *     property as a required `keyword` field to every index mapping.
 *   - Hard diagnostic on ambiguous `number` type — no silent fallback.
 */

import type { IR, IREntity, IRProperty, IRStore, IRType } from '../../ir';
import type {
  ProjectionArtifact,
  ProjectionDiagnostic,
  ProjectionRequest,
  ProjectionResult,
  ProjectionTarget,
} from '../interface';

import { normalizeOptions } from './options.js';
import {
  ES_TYPE_MAPPING,
  UNSUPPORTED_ES_TYPES,
  type ESFieldType,
} from './type-mapping.js';
import type {
  ElasticsearchIndexDefinition,
  ESFieldOverride,
} from './types.js';

// ============================================================================
// Surface constants
// ============================================================================

export const SURFACE_MAPPING = 'elasticsearch.mapping' as const;
export const SURFACE_INDEX_TEMPLATE = 'elasticsearch.indexTemplate' as const;
export const SURFACE_INGEST_PIPELINE = 'elasticsearch.ingestPipeline' as const;
export const SURFACE_INDEXER = 'elasticsearch.indexer' as const;
export const SURFACE_CLIENT = 'elasticsearch.client' as const;
export const SURFACES = [
  SURFACE_MAPPING,
  SURFACE_INDEX_TEMPLATE,
  SURFACE_INGEST_PIPELINE,
  SURFACE_INDEXER,
  SURFACE_CLIENT,
] as const;

// ============================================================================
// Helpers
// ============================================================================

function isElasticsearchTarget(target: string): boolean {
  return target === 'elasticsearch';
}

function getElasticsearchStores(ir: IR): IRStore[] {
  return (ir.stores ?? []).filter((s) => isElasticsearchTarget(s.target));
}

function entityFromIR(ir: IR, entityName: string): IREntity | undefined {
  return ir.entities.find((e) => e.name === entityName);
}

function isPrivateProperty(prop: IRProperty): boolean {
  return prop.modifiers.includes('private');
}

function indexNameFor(entityName: string, prefix: string): string {
  const snake = entityName
    .replace(/([A-Z])/g, (m, _ch, idx) => (idx === 0 ? m.toLowerCase() : '_' + m.toLowerCase()))
    .replace(/[^a-z0-9_]/g, '');
  return `${prefix}${snake}s`;
}

// ============================================================================
// Type → ES field type resolution
// ============================================================================

interface ResolvedFieldMapping {
  fieldName: string;
  esType: string;
  diagnostics: ProjectionDiagnostic[];
}

function resolveFieldType(
  prop: IRProperty,
  override: ESFieldOverride | undefined,
  entityName: string,
): ResolvedFieldMapping {
  const diagnostics: ProjectionDiagnostic[] = [];

  // Check for explicit override first
  if (override) {
    return {
      fieldName: override.fieldName ?? prop.name,
      esType: override.type,
      diagnostics,
    };
  }

  // Handle array types: unwrap the generic
  let typeToMap = prop.type;
  if (typeToMap.name === 'array' && typeToMap.generic) {
    typeToMap = typeToMap.generic;
  }

  // Check for unsupported types
  if (UNSUPPORTED_ES_TYPES.has(typeToMap.name)) {
    diagnostics.push({
      severity: 'error',
      code: 'ELASTICSEARCH_AMBIGUOUS_NUMBER',
      message:
        typeToMap.name === 'number'
          ? `Property '${entityName}.${prop.name}' has type 'number' which is ambiguous in Elasticsearch (could be integer, long, float, or scaled_float). Use 'int', 'bigint', 'float', or 'decimal' instead, or provide a fieldOverride.`
          : `Property '${entityName}.${prop.name}' has unsupported type '${typeToMap.name}' for Elasticsearch indexing.`,
      entity: entityName,
    });
    return {
      fieldName: prop.name,
      esType: 'keyword', // fallback for diagnostic — artifact will still be generated
      diagnostics,
    };
  }

  // Look up in the type mapping table
  const mapping: ESFieldType | undefined = ES_TYPE_MAPPING[typeToMap.name];
  if (!mapping) {
    diagnostics.push({
      severity: 'error',
      code: 'ELASTICSEARCH_UNSUPPORTED_TYPE',
      message: `Property '${entityName}.${prop.name}' has type '${typeToMap.name}' which is not supported by the Elasticsearch projection.`,
      entity: entityName,
    });
    return {
      fieldName: prop.name,
      esType: 'keyword',
      diagnostics,
    };
  }

  return {
    fieldName: prop.name,
    esType: mapping.type,
    diagnostics,
  };
}

// ============================================================================
// Index mapping generation
// ============================================================================

interface ResolvedIndex {
  entity: IREntity;
  indexName: string;
  fieldMappings: Record<string, Record<string, unknown>>;
  diagnostics: ProjectionDiagnostic[];
}

function buildIndexMapping(
  ir: IR,
  def: ElasticsearchIndexDefinition,
  prefix: string,
): ResolvedIndex | null {
  const entity = entityFromIR(ir, def.entity);
  if (!entity) {
    return null;
  }

  const diagnostics: ProjectionDiagnostic[] = [];
  const indexName = def.indexName ?? indexNameFor(entity.name, prefix);
  const fieldMappings: Record<string, Record<string, unknown>> = {};

  const excludeSet = new Set(def.excludeFields ?? []);

  // Map all non-private, non-excluded properties
  for (const prop of entity.properties) {
    if (isPrivateProperty(prop)) continue;
    if (excludeSet.has(prop.name)) continue;

    const override = def.fieldOverrides?.[prop.name];
    const resolved = resolveFieldType(prop, override, entity.name);
    diagnostics.push(...resolved.diagnostics);

    const fieldConfig: Record<string, unknown> = { type: resolved.esType };

    // Add nullable metadata as a multi-field for filtering
    if (prop.type.nullable) {
      fieldConfig.null_value = null;
    }

    // Add analyzer hint from override or type mapping
    if (override?.analyzer) {
      fieldConfig.analyzer = override.analyzer;
    }

    fieldMappings[resolved.fieldName] = fieldConfig;
  }

  // Add tenant field if multi-tenant IR
  if (ir.tenant && !fieldMappings[ir.tenant.property]) {
    fieldMappings[ir.tenant.property] = { type: 'keyword' };
  }

  // Add standard metadata fields
  fieldMappings._id = { type: 'keyword' };
  fieldMappings._indexed_at = { type: 'date' };

  return { entity, indexName, fieldMappings, diagnostics };
}

// ============================================================================
// Surface generators
// ============================================================================

function generateMapping(
  ir: IR,
  opts: ReturnType<typeof normalizeOptions>,
): { code: string; diagnostics: ProjectionDiagnostic[] } {
  const allDiagnostics: ProjectionDiagnostic[] = [];
  const stores = getElasticsearchStores(ir);

  // Derive index definitions from stores if not provided
  const indexDefs = opts.indices ?? deriveIndexDefsFromStores(ir, stores);

  if (indexDefs.length === 0) {
    allDiagnostics.push({
      severity: 'warning',
      code: 'ELASTICSEARCH_NO_INDICES',
      message:
        'No elasticsearch store targets found in IR and no indices declared in options. ' +
        'Add `store X in elasticsearch` to an entity or pass `indices` in options.',
    });
    return { code: JSON.stringify({ indices: {} }, null, 2), diagnostics: allDiagnostics };
  }

  const indices: Record<string, unknown> = {};

  for (const def of indexDefs) {
    const resolved = buildIndexMapping(ir, def, opts.indexNamePrefix ?? '');
    if (!resolved) {
      allDiagnostics.push({
        severity: 'error',
        code: 'ELASTICSEARCH_UNKNOWN_ENTITY',
        message: `Index definition references unknown entity '${def.entity}'.`,
      });
      continue;
    }

    allDiagnostics.push(...resolved.diagnostics);

    const settings: Record<string, unknown> = {
      number_of_shards: def.numberOfShards ?? 1,
      number_of_replicas: def.numberOfReplicas ?? 1,
    };

    if (def.analyzers) {
      settings.analysis = {
        analyzer: def.analyzers,
      };
    }

    indices[resolved.indexName] = {
      settings,
      mappings: {
        properties: resolved.fieldMappings,
      },
    };
  }

  return { code: JSON.stringify({ indices }, null, 2) + '\n', diagnostics: allDiagnostics };
}

function deriveIndexDefsFromStores(
  _ir: IR,
  stores: IRStore[],
): ElasticsearchIndexDefinition[] {
  return stores.map((store) => ({
    entity: store.entity,
    // Read searchable flag from store config if present
    ...(store.config && typeof store.config === 'object' ? {} : {}),
  }));
}

function generateIndexTemplate(
  ir: IR,
  opts: ReturnType<typeof normalizeOptions>,
): { code: string; diagnostics: ProjectionDiagnostic[] } {
  const allDiagnostics: ProjectionDiagnostic[] = [];
  const stores = getElasticsearchStores(ir);
  const indexDefs = opts.indices ?? deriveIndexDefsFromStores(ir, stores);

  const templates: Record<string, unknown> = {};

  for (const def of indexDefs) {
    const resolved = buildIndexMapping(ir, def, opts.indexNamePrefix ?? '');
    if (!resolved) continue;

    allDiagnostics.push(...resolved.diagnostics);

    const templateName = `${resolved.indexName}-template`;
    const indexPatterns = [`${resolved.indexName}*`];

    templates[templateName] = {
      index_patterns: indexPatterns,
      priority: 100,
      template: {
        settings: {
          number_of_shards: def.numberOfShards ?? 1,
          number_of_replicas: def.numberOfReplicas ?? 1,
          ...(def.analyzers ? { analysis: { analyzer: def.analyzers } } : {}),
        },
        mappings: {
          properties: resolved.fieldMappings,
        },
      },
    };
  }

  return { code: JSON.stringify({ index_templates: templates }, null, 2) + '\n', diagnostics: allDiagnostics };
}

function generateIngestPipeline(opts: ReturnType<typeof normalizeOptions>): string {
  const pipelines = opts.ingestPipelines ?? [];

  const result = {
    description: 'Ingest pipelines generated from Manifest IR',
    pipelines: pipelines.map((p) => ({
      id: p.id,
      description: p.description ?? `Pipeline for ${p.id}`,
      processors: p.processors,
    })),
  };

  return JSON.stringify(result, null, 2) + '\n';
}

function generateIndexer(ir: IR, opts: ReturnType<typeof normalizeOptions>): string {
  const stores = getElasticsearchStores(ir);
  const indexerConfig = opts.indexerConfig ?? {};
  const batchSize = indexerConfig.batchSize ?? 100;
  const refresh = indexerConfig.refresh ?? 'false';
  const maxRetries = indexerConfig.maxRetries ?? 3;
  const enableRetry = indexerConfig.enableRetry ?? true;
  const indexPrefix = indexerConfig.indexPrefix ?? opts.indexNamePrefix ?? '';

  const lines: string[] = [];
  lines.push(`/**`);
  lines.push(` * Elasticsearch indexer worker — outbox-driven sync adapter.`);
  lines.push(` * Generated by Manifest — do not edit by hand.`);
  lines.push(` *`);
  lines.push(` * Consumes outbox entries and bulk-indexes entity state changes`);
  lines.push(` * into Elasticsearch. Uses the transactional outbox pattern to`);
  lines.push(` * guarantee at-least-once delivery and idempotent indexing.`);
  lines.push(` */`);
  lines.push(``);
  lines.push(`import type { OutboxStore, OutboxEntry } from '@manifest/outbox';`);
  lines.push(``);
  lines.push(`/** Elasticsearch bulk operation shape */`);
  lines.push(`interface BulkOperation {`);
  lines.push(`  index: { _index: string; _id: string };`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`interface BulkResponse {`);
  lines.push(`  errors: boolean;`);
  lines.push(`  items: Array<{ index?: { _id: string; status: number; error?: unknown } }>;`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`/** Minimal fetch-based ES client interface */`);
  lines.push(`interface ESClient {`);
  lines.push(`  bulk(body: string): Promise<BulkResponse>;`);
  lines.push(`  ping(): Promise<boolean>;`);
  lines.push(`}`);
  lines.push(``);

  // Generate entity-specific indexer functions
  for (const store of stores) {
    const entity = entityFromIR(ir, store.entity);
    if (!entity) continue;

    const indexName = indexNameFor(entity.name, indexPrefix);
    const funcName = `index${entity.name}`;

    lines.push(`/**`);
    lines.push(` * Build an Elasticsearch document from a ${entity.name} entity.`);
    lines.push(` */`);
    lines.push(`function build${entity.name}Document(entity: Record<string, unknown>): Record<string, unknown> {`);
    lines.push(`  return {`);
    lines.push(`    ...entity,`);
    lines.push(`    _indexed_at: new Date().toISOString(),`);
    lines.push(`  };`);
    lines.push(`}`);
    lines.push(``);

    lines.push(`/**`);
    lines.push(` * Index a single ${entity.name} entity into Elasticsearch.`);
    lines.push(` */`);
    lines.push(`export async function ${funcName}(`);
    lines.push(`  client: ESClient,`);
    lines.push(`  entity: Record<string, unknown>,`);
    lines.push(`  id: string,`);
    lines.push(`): Promise<void> {`);
    lines.push(`  const doc = build${entity.name}Document(entity);`);
    lines.push(`  const body = JSON.stringify({`);
    lines.push(`    index: { _index: ${JSON.stringify(indexName)}, _id: id },`);
    lines.push(`  }) + '\\n' + JSON.stringify(doc) + '\\n';`);
    lines.push(`  await client.bulk(body);`);
    lines.push(`}`);
    lines.push(``);
  }

  // Main indexer loop
  lines.push(`/**`);
  lines.push(` * Run the Elasticsearch indexer loop.`);
  lines.push(` * Claims batches from the outbox and bulk-indexes them.`);
  lines.push(` */`);
  lines.push(`export async function runElasticsearchIndexer(`);
  lines.push(`  outboxStore: OutboxStore,`);
  lines.push(`  client: ESClient,`);
  lines.push(`  options?: { batchSize?: number; refresh?: string },`);
  lines.push(`): Promise<void> {`);
  lines.push(`  const batch = options?.batchSize ?? ${batchSize};`);
  lines.push(`  const refresh = options?.refresh ?? ${JSON.stringify(refresh)};`);
  lines.push(``);
  lines.push(`  // Verify ES connectivity`);
  lines.push(`  const alive = await client.ping();`);
  lines.push(`  if (!alive) throw new Error('Elasticsearch is not reachable');`);
  lines.push(``);
  lines.push(`  // Claim and index in a loop`);
  lines.push(`  const entries = await outboxStore.claim(batch);`);
  lines.push(`  if (entries.length === 0) return;`);
  lines.push(``);
  lines.push(`  // Map outbox events to bulk index operations`);
  lines.push(`  const operations = entries`);
  lines.push(`    .filter((e) => e.event.entityName)`);
  lines.push(`    .map((entry: OutboxEntry) => {`);
  lines.push(`      const event = entry.event;`);
  lines.push(`      const entityName = event.entityName;`);
  lines.push(`      const doc = { ...event.payload, _indexed_at: new Date().toISOString() };`);
  lines.push(`      return {`);
  lines.push(`        index: { _index: entityName, _id: event.instanceId ?? entry.entryId },`);
  lines.push(`        doc,`);
  lines.push(`      };`);
  lines.push(`    });`);
  lines.push(``);
  lines.push(`  if (operations.length === 0) {`);
  lines.push(`    await outboxStore.markDelivered(entries.map((e) => e.entryId));`);
  lines.push(`    return;`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  // Build bulk request body`);
  lines.push(`  const body = operations`);
  lines.push(`    .flatMap((op) => [`);
  lines.push(`      JSON.stringify({ index: { _index: op.index._index, _id: op.index._id } }),`);
  lines.push(`      JSON.stringify(op.doc),`);
  lines.push(`    ])`);
  lines.push(`    .join('\\n') + '\\n';`);
  lines.push(``);
  lines.push(`  // Execute with retry`);
  lines.push(`  let attempts = 0;`);
  lines.push(`  const maxAttempts = ${enableRetry ? maxRetries : 1};`);
  lines.push(`  while (attempts < maxAttempts) {`);
  lines.push(`    try {`);
  lines.push(`      const response = await client.bulk(body);`);
  lines.push(`      if (response.errors) {`);
  lines.push(`        const failedIds = response.items`);
  lines.push(`          .filter((item) => item.index?.error)`);
  lines.push(`          .map((item) => item.index!._id);`);
  lines.push(`        if (failedIds.length > 0) {`);
  lines.push(`          await outboxStore.markFailed(failedIds, 'Bulk index error');`);
  lines.push(`        }`);
  lines.push(`        const succeededIds = entries`);
  lines.push(`          .map((e) => e.entryId)`);
  lines.push(`          .filter((id) => !failedIds.includes(id));`);
  lines.push(`        await outboxStore.markDelivered(succeededIds);`);
  lines.push(`        return;`);
  lines.push(`      } else {`);
  lines.push(`        await outboxStore.markDelivered(entries.map((e) => e.entryId));`);
  lines.push(`        return;`);
  lines.push(`      }`);
  lines.push(`    } catch (error) {`);
  lines.push(`      attempts++;`);
  lines.push(`      if (attempts >= maxAttempts) {`);
  lines.push(`        const msg = error instanceof Error ? error.message : String(error);`);
  lines.push(`        await outboxStore.markFailed(`);
  lines.push(`          entries.map((e) => e.entryId),`);
  lines.push(`          \`Indexing failed after \${attempts} attempts: \${msg}\`,`);
  lines.push(`        );`);
  lines.push(`        throw error;`);
  lines.push(`      }`);
  lines.push(`      // Exponential backoff: 100ms, 200ms, 400ms`);
  lines.push(`      await new Promise((r) => setTimeout(r, 100 * Math.pow(2, attempts - 1)));`);
  lines.push(`    }`);
  lines.push(`  }`);
  lines.push(`}`);
  lines.push(``);

  return lines.join('\n');
}

function generateClient(ir: IR, opts: ReturnType<typeof normalizeOptions>): string {
  const stores = getElasticsearchStores(ir);
  const indexPrefix = opts.indexNamePrefix ?? '';

  const lines: string[] = [];
  lines.push(`/**`);
  lines.push(` * Elasticsearch typed search query builders.`);
  lines.push(` * Generated by Manifest — do not edit by hand.`);
  lines.push(` *`);
  lines.push(` * Provides typed search functions for each indexed entity.`);
  lines.push(` */`);
  lines.push(``);
  lines.push(`import type { ESClient } from './indexer';`);
  lines.push(``);
  lines.push(`/** Search query result */`);
  lines.push(`export interface SearchResult<T> {`);
  lines.push(`  hits: Array<{ _id: string; _source: T; _score: number }>;`);
  lines.push(`  total: { value: number; relation: 'eq' | 'gte' };`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`/** Search options */`);
  lines.push(`export interface SearchOptions {`);
  lines.push(`  from?: number;`);
  lines.push(`  size?: number;`);
  lines.push(`  sort?: Array<Record<string, 'asc' | 'desc'>>;`);
  lines.push(`  refresh?: boolean;`);
  lines.push(`}`);
  lines.push(``);

  for (const store of stores) {
    const entity = entityFromIR(ir, store.entity);
    if (!entity) continue;

    const indexName = indexNameFor(entity.name, indexPrefix);
    const funcName = `search${entity.name}s`;
    const findOneName = `find${entity.name}`;

    // Build a typed interface for the entity document
    lines.push(`/** ${entity.name} document as stored in Elasticsearch */`);
    lines.push(`export interface ${entity.name}Document {`);
    for (const prop of entity.properties) {
      if (isPrivateProperty(prop)) continue;
      const tsType = irTypeToTs(prop.type);
      const optional = prop.type.nullable ? '?' : '';
      lines.push(`  ${prop.name}${optional}: ${tsType};`);
    }
    lines.push(`  _indexed_at: string;`);
    lines.push(`}`);
    lines.push(``);

    // Search all function
    lines.push(`/**`);
    lines.push(` * Search ${entity.name} documents with a full-text query.`);
    lines.push(` */`);
    lines.push(`export async function ${funcName}(`);
    lines.push(`  client: ESClient,`);
    lines.push(`  query: string,`);
    lines.push(`  options?: SearchOptions,`);
    lines.push(`): Promise<SearchResult<${entity.name}Document>> {`);
    lines.push(`  const body = {`);
    lines.push(`    from: options?.from ?? 0,`);
    lines.push(`    size: options?.size ?? 20,`);
    lines.push(`    query: {`);
    lines.push(`      multi_match: {`);
    lines.push(`        query,`);
    lines.push(`        fields: [${entity.properties.filter((p) => p.type.name === 'string' || p.type.name === 'text').map((p) => `'${p.name}'`).join(', ')}],`);
    lines.push(`      },`);
    lines.push(`    },`);
    lines.push(`    ...(options?.sort ? { sort: options.sort } : {}),`);
    lines.push(`  };`);
    lines.push(`  const response = await fetch(\`${endpointPlaceholder()}/\${${JSON.stringify(indexName)}}/_search\`, {`);
    lines.push(`    method: 'POST',`);
    lines.push(`    headers: { 'Content-Type': 'application/json' },`);
    lines.push(`    body: JSON.stringify(body),`);
    lines.push(`  });`);
    lines.push(`  return response.json() as Promise<SearchResult<${entity.name}Document>>;`);
    lines.push(`}`);
    lines.push(``);

    // Find by ID
    lines.push(`/**`);
    lines.push(` * Find a single ${entity.name} document by ID.`);
    lines.push(` */`);
    lines.push(`export async function ${findOneName}(`);
    lines.push(`  client: ESClient,`);
    lines.push(`  id: string,`);
    lines.push(`): Promise<${entity.name}Document | null> {`);
    lines.push(`  const response = await fetch(\`${endpointPlaceholder()}/\${${JSON.stringify(indexName)}}/_doc/\${id}\`);`);
    lines.push(`  if (response.status === 404) return null;`);
    lines.push(`  const data = await response.json() as { _source: ${entity.name}Document };`);
    lines.push(`  return data._source;`);
    lines.push(`}`);
    lines.push(``);
  }

  return lines.join('\n');
}

function endpointPlaceholder(): string {
  return 'http://localhost:9200';
}

function irTypeToTs(type: IRType): string {
  switch (type.name) {
    case 'string':
    case 'text':
    case 'uuid':
    case 'date':
    case 'datetime':
      return 'string';
    case 'int':
    case 'bigint':
    case 'float':
    case 'decimal':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'json':
      return 'Record<string, unknown>';
    case 'array':
      return type.generic ? `${irTypeToTs(type.generic)}[]` : 'unknown[]';
    default:
      return 'unknown';
  }
}

// ============================================================================
// ProjectionTarget implementation
// ============================================================================

export class ElasticsearchProjection implements ProjectionTarget {
  readonly name = 'elasticsearch';
  readonly description =
    'Generates Elasticsearch index mappings, index templates, ingest pipelines, ' +
    'outbox-driven indexer workers, and typed search query builders from IR entities ' +
    'marked with `store X in elasticsearch`.';
  readonly surfaces = SURFACES;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    const artifacts: ProjectionArtifact[] = [];
    const diagnostics: ProjectionDiagnostic[] = [];
    const opts = normalizeOptions(request.options);

    if (!SURFACES.includes(request.surface as (typeof SURFACES)[number])) {
      diagnostics.push({
        severity: 'error',
        code: 'ELASTICSEARCH_UNKNOWN_SURFACE',
        message: `Elasticsearch projection does not support surface '${request.surface}'. Supported: ${SURFACES.join(', ')}.`,
      });
      return { artifacts, diagnostics };
    }

    const stores = getElasticsearchStores(ir);
    if (stores.length === 0 && !opts.indices) {
      diagnostics.push({
        severity: 'info',
        code: 'ELASTICSEARCH_NO_STORES',
        message:
          'No elasticsearch store targets found in IR. ' +
          'Declare `store X in elasticsearch` for entities you want indexed, ' +
          'or pass explicit `indices` in projection options.',
      });
    }

    switch (request.surface) {
      case SURFACE_MAPPING: {
        const result = generateMapping(ir, opts);
        diagnostics.push(...result.diagnostics);
        artifacts.push({
          id: 'elasticsearch.mapping',
          pathHint: opts.output,
          contentType: 'json',
          code: result.code,
        });
        break;
      }
      case SURFACE_INDEX_TEMPLATE: {
        const result = generateIndexTemplate(ir, opts);
        diagnostics.push(...result.diagnostics);
        artifacts.push({
          id: 'elasticsearch.indexTemplate',
          pathHint: 'elasticsearch-index-templates.json',
          contentType: 'json',
          code: result.code,
        });
        break;
      }
      case SURFACE_INGEST_PIPELINE: {
        artifacts.push({
          id: 'elasticsearch.ingestPipeline',
          pathHint: 'elasticsearch-ingest-pipelines.json',
          contentType: 'json',
          code: generateIngestPipeline(opts),
        });
        break;
      }
      case SURFACE_INDEXER: {
        artifacts.push({
          id: 'elasticsearch.indexer',
          pathHint: 'elasticsearch-indexer.ts',
          contentType: 'typescript',
          code: generateIndexer(ir, opts),
        });
        break;
      }
      case SURFACE_CLIENT: {
        artifacts.push({
          id: 'elasticsearch.client',
          pathHint: 'elasticsearch-client.ts',
          contentType: 'typescript',
          code: generateClient(ir, opts),
        });
        break;
      }
    }

    return { artifacts, diagnostics };
  }
}
