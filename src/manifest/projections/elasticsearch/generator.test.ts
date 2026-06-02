/**
 * Tests for the Elasticsearch search projection.
 */

import { describe, expect, it } from 'vitest';
import { compileToIR } from '../../ir-compiler';
import type { IR } from '../../ir';
import { ElasticsearchProjection } from './generator';
import type { ElasticsearchIndexDefinition } from './types';

async function buildIR(source: string): Promise<IR> {
  const { ir } = await compileToIR(source);
  if (!ir) throw new Error('IR compilation failed');
  return ir;
}

const SIMPLE_SOURCE = `
entity Product {
  property required id: string
  property required name: string
  property description: string = ""
  property price: int
  property inStock: boolean
  property createdAt: datetime
}

store Product in elasticsearch
`;

const MULTI_ENTITY_SOURCE = `
entity User {
  property required id: string
  property required email: string
  property displayName: string = ""
}

entity Article {
  property required id: string
  property required title: string
  property body: text
  property authorId: string = ""
  property publishedAt: datetime
}

store User in elasticsearch
store Article in elasticsearch
`;

const NO_STORES_SOURCE = `
entity Task {
  property required id: string
  property title: string = ""
}

store Task in memory
`;

const PRIVATE_FIELD_SOURCE = `
entity Secret {
  property required id: string
  property name: string = ""
  property private password: string
}

store Secret in elasticsearch
`;

const AMBIGUOUS_NUMBER_SOURCE = `
entity Measurement {
  property required id: string
  property value: number
}

store Measurement in elasticsearch
`;

describe('ElasticsearchProjection', () => {
  const projection = new ElasticsearchProjection();

  // -------------------------------------------------------------------------
  // Projection target metadata
  // -------------------------------------------------------------------------

  it('has the correct name and surfaces', () => {
    expect(projection.name).toBe('elasticsearch');
    expect(projection.surfaces).toContain('elasticsearch.mapping');
    expect(projection.surfaces).toContain('elasticsearch.indexTemplate');
    expect(projection.surfaces).toContain('elasticsearch.ingestPipeline');
    expect(projection.surfaces).toContain('elasticsearch.indexer');
    expect(projection.surfaces).toContain('elasticsearch.client');
  });

  // -------------------------------------------------------------------------
  // Mapping surface
  // -------------------------------------------------------------------------

  it('generates index mapping JSON for entities with elasticsearch stores', async () => {
    const ir = await buildIR(SIMPLE_SOURCE);
    const result = projection.generate(ir, { surface: 'elasticsearch.mapping' });

    expect(result.artifacts).toHaveLength(1);
    const code = result.artifacts[0].code;
    const parsed = JSON.parse(code);

    expect(parsed.indices).toBeDefined();
    expect(parsed.indices.products).toBeDefined();
    expect(parsed.indices.products.mappings.properties.name).toEqual({ type: 'keyword' });
    expect(parsed.indices.products.mappings.properties.price).toEqual({ type: 'integer' });
    expect(parsed.indices.products.mappings.properties.inStock).toEqual({ type: 'boolean' });
    expect(parsed.indices.products.mappings.properties.createdAt).toEqual({ type: 'date' });
    expect(parsed.indices.products.settings.number_of_shards).toBe(1);
  });

  it('emits info diagnostic when no elasticsearch stores exist', async () => {
    const ir = await buildIR(NO_STORES_SOURCE);
    const result = projection.generate(ir, { surface: 'elasticsearch.mapping' });

    expect(result.diagnostics.some((d) => d.code === 'ELASTICSEARCH_NO_STORES')).toBe(true);
  });

  it('skips private properties in index mapping', async () => {
    const ir = await buildIR(PRIVATE_FIELD_SOURCE);
    const result = projection.generate(ir, { surface: 'elasticsearch.mapping' });
    const parsed = JSON.parse(result.artifacts[0].code);

    expect(parsed.indices.secrets.mappings.properties.password).toBeUndefined();
    expect(parsed.indices.secrets.mappings.properties.name).toBeDefined();
  });

  it('emits diagnostic for ambiguous number type', async () => {
    const ir = await buildIR(AMBIGUOUS_NUMBER_SOURCE);
    const result = projection.generate(ir, { surface: 'elasticsearch.mapping' });

    const diag = result.diagnostics.find((d) => d.code === 'ELASTICSEARCH_AMBIGUOUS_NUMBER');
    expect(diag).toBeDefined();
    expect(diag!.severity).toBe('error');
    expect(diag!.entity).toBe('Measurement');
  });

  it('applies index name prefix from options', async () => {
    const ir = await buildIR(SIMPLE_SOURCE);
    const result = projection.generate(ir, {
      surface: 'elasticsearch.mapping',
      options: { indexNamePrefix: 'prod_' },
    });
    const parsed = JSON.parse(result.artifacts[0].code);
    expect(parsed.indices['prod_products']).toBeDefined();
  });

  it('respects custom field overrides', async () => {
    const ir = await buildIR(SIMPLE_SOURCE);
    const indexDef: ElasticsearchIndexDefinition = {
      entity: 'Product',
      fieldOverrides: {
        name: { type: 'text', analyzer: 'standard' },
      },
    };
    const result = projection.generate(ir, {
      surface: 'elasticsearch.mapping',
      options: { indices: [indexDef] },
    });
    const parsed = JSON.parse(result.artifacts[0].code);
    expect(parsed.indices.products.mappings.properties.name).toEqual({
      type: 'text',
      analyzer: 'standard',
    });
  });

  it('generates mappings for multiple entities', async () => {
    const ir = await buildIR(MULTI_ENTITY_SOURCE);
    const result = projection.generate(ir, { surface: 'elasticsearch.mapping' });
    const parsed = JSON.parse(result.artifacts[0].code);

    expect(parsed.indices.users).toBeDefined();
    expect(parsed.indices.articles).toBeDefined();
    expect(parsed.indices.articles.mappings.properties.body).toEqual({ type: 'text' });
  });

  // -------------------------------------------------------------------------
  // Index template surface
  // -------------------------------------------------------------------------

  it('generates index template JSON with patterns', async () => {
    const ir = await buildIR(SIMPLE_SOURCE);
    const result = projection.generate(ir, { surface: 'elasticsearch.indexTemplate' });
    const parsed = JSON.parse(result.artifacts[0].code);

    expect(parsed.index_templates).toBeDefined();
    const template = parsed.index_templates['products-template'];
    expect(template).toBeDefined();
    expect(template.index_patterns).toContain('products*');
    expect(template.priority).toBe(100);
    expect(template.template.mappings.properties.name).toEqual({ type: 'keyword' });
  });

  // -------------------------------------------------------------------------
  // Ingest pipeline surface
  // -------------------------------------------------------------------------

  it('generates empty pipelines when none configured', async () => {
    const ir = await buildIR(SIMPLE_SOURCE);
    const result = projection.generate(ir, { surface: 'elasticsearch.ingestPipeline' });
    const parsed = JSON.parse(result.artifacts[0].code);

    expect(parsed.pipelines).toEqual([]);
  });

  it('emits declared ingest pipelines', async () => {
    const ir = await buildIR(SIMPLE_SOURCE);
    const result = projection.generate(ir, {
      surface: 'elasticsearch.ingestPipeline',
      options: {
        ingestPipelines: [
          {
            id: 'product-enrichment',
            description: 'Enrich product documents',
            processors: [
              { type: 'set', field: 'indexed', value: true },
              { type: 'rename', field: 'desc', target_field: 'description' },
            ],
          },
        ],
      },
    });
    const parsed = JSON.parse(result.artifacts[0].code);
    expect(parsed.pipelines).toHaveLength(1);
    expect(parsed.pipelines[0].id).toBe('product-enrichment');
    expect(parsed.pipelines[0].processors).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // Indexer surface
  // -------------------------------------------------------------------------

  it('generates TypeScript indexer with outbox integration', async () => {
    const ir = await buildIR(SIMPLE_SOURCE);
    const result = projection.generate(ir, { surface: 'elasticsearch.indexer' });
    const code = result.artifacts[0].code;

    expect(code).toContain('import type { OutboxStore');
    expect(code).toContain('runElasticsearchIndexer');
    expect(code).toContain('indexProduct');
    expect(code).toContain('outboxStore.claim');
    expect(code).toContain('outboxStore.markDelivered');
    expect(code).toContain('outboxStore.markFailed');
    expect(code).toContain('client.bulk');
  });

  it('indexer includes retry logic with exponential backoff', async () => {
    const ir = await buildIR(SIMPLE_SOURCE);
    const result = projection.generate(ir, { surface: 'elasticsearch.indexer' });
    const code = result.artifacts[0].code;

    expect(code).toContain('setTimeout');
    expect(code).toContain('Math.pow(2,');
  });

  it('indexer respects batch size from config', async () => {
    const ir = await buildIR(SIMPLE_SOURCE);
    const result = projection.generate(ir, {
      surface: 'elasticsearch.indexer',
      options: { indexerConfig: { batchSize: 50 } },
    });
    const code = result.artifacts[0].code;

    expect(code).toContain('?? 50');
  });

  it('indexer disables retry when configured', async () => {
    const ir = await buildIR(SIMPLE_SOURCE);
    const result = projection.generate(ir, {
      surface: 'elasticsearch.indexer',
      options: { indexerConfig: { enableRetry: false } },
    });
    const code = result.artifacts[0].code;

    // When retry is disabled, maxAttempts should be 1
    expect(code).toContain('maxAttempts = 1');
  });

  // -------------------------------------------------------------------------
  // Client surface
  // -------------------------------------------------------------------------

  it('generates typed search client with entity-specific functions', async () => {
    const ir = await buildIR(SIMPLE_SOURCE);
    const result = projection.generate(ir, { surface: 'elasticsearch.client' });
    const code = result.artifacts[0].code;

    expect(code).toContain('searchProducts');
    expect(code).toContain('findProduct');
    expect(code).toContain('ProductDocument');
    expect(code).toContain('SearchResult<');
  });

  it('client generates multi-entity search functions', async () => {
    const ir = await buildIR(MULTI_ENTITY_SOURCE);
    const result = projection.generate(ir, { surface: 'elasticsearch.client' });
    const code = result.artifacts[0].code;

    expect(code).toContain('searchUsers');
    expect(code).toContain('searchArticles');
    expect(code).toContain('findUser');
    expect(code).toContain('findArticle');
  });

  it('client includes multi_match query for text fields', async () => {
    const ir = await buildIR(SIMPLE_SOURCE);
    const result = projection.generate(ir, { surface: 'elasticsearch.client' });
    const code = result.artifacts[0].code;

    expect(code).toContain('multi_match');
    expect(code).toContain("'name'");
  });

  // -------------------------------------------------------------------------
  // Error / diagnostic handling
  // -------------------------------------------------------------------------

  it('emits error for unknown surface', () => {
    const result = projection.generate({} as IR, { surface: 'elasticsearch.bogus' });
    expect(result.artifacts).toHaveLength(0);
    const diag = result.diagnostics.find((d) => d.severity === 'error');
    expect(diag).toBeDefined();
    expect(diag!.code).toBe('ELASTICSEARCH_UNKNOWN_SURFACE');
  });

  it('emits error when index def references unknown entity', async () => {
    const ir = await buildIR(SIMPLE_SOURCE);
    const result = projection.generate(ir, {
      surface: 'elasticsearch.mapping',
      options: {
        indices: [{ entity: 'NonExistent' }],
      },
    });
    const diag = result.diagnostics.find((d) => d.code === 'ELASTICSEARCH_UNKNOWN_ENTITY');
    expect(diag).toBeDefined();
    expect(diag!.severity).toBe('error');
  });

  it('emits warning when no indices are declared', async () => {
    const ir = await buildIR(NO_STORES_SOURCE);
    const result = projection.generate(ir, { surface: 'elasticsearch.mapping' });
    const diag = result.diagnostics.find((d) => d.code === 'ELASTICSEARCH_NO_INDICES');
    expect(diag).toBeDefined();
    expect(diag!.severity).toBe('warning');
  });

  // -------------------------------------------------------------------------
  // Determinism
  // -------------------------------------------------------------------------

  it('produces deterministic output across multiple runs', async () => {
    const ir = await buildIR(SIMPLE_SOURCE);
    const result1 = projection.generate(ir, { surface: 'elasticsearch.mapping' });
    const result2 = projection.generate(ir, { surface: 'elasticsearch.mapping' });
    expect(result1.artifacts[0].code).toBe(result2.artifacts[0].code);
  });

  it('produces deterministic indexer output', async () => {
    const ir = await buildIR(SIMPLE_SOURCE);
    const result1 = projection.generate(ir, { surface: 'elasticsearch.indexer' });
    const result2 = projection.generate(ir, { surface: 'elasticsearch.indexer' });
    expect(result1.artifacts[0].code).toBe(result2.artifacts[0].code);
  });

  // -------------------------------------------------------------------------
  // Multi-tenant support
  // -------------------------------------------------------------------------

  it('adds tenant field to mapping when IR has tenant config', async () => {
    const ir = await buildIR(SIMPLE_SOURCE);

    // Inject tenant config
    const tenantIr: IR = {
      ...ir,
      tenant: {
        property: 'tenantId',
        type: { name: 'string', nullable: false },
        contextPath: 'context.tenantId',
      },
    };

    const result = projection.generate(tenantIr, { surface: 'elasticsearch.mapping' });
    const parsed = JSON.parse(result.artifacts[0].code);

    expect(parsed.indices.products.mappings.properties.tenantId).toEqual({ type: 'keyword' });
  });
});
