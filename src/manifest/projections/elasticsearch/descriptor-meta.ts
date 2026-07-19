import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import { aggregateSurface } from '../descriptor-helpers.js';

export const ELASTICSEARCH_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'Elasticsearch',
  surfaces: [
    aggregateSurface('elasticsearch.mapping'),
    aggregateSurface('elasticsearch.indexTemplate'),
    aggregateSurface('elasticsearch.ingestPipeline'),
    aggregateSurface('elasticsearch.indexer'),
    aggregateSurface('elasticsearch.client'),
  ],
  options: [],
  artifactCategories: ['search'],
  packageDependencies: ['@elastic/elasticsearch'],
  runtimeDependencies: [],
  compatibleCompanions: [],
  incompatibleWith: [],
  resolved: true,
};
