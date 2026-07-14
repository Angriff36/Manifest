import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import { aggregateSurface, optionalEntitySurface, optionalOption } from '../descriptor-helpers.js';

export const MERMAID_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'Mermaid',
  surfaces: [
    aggregateSurface('mermaid.er'),
    optionalEntitySurface('mermaid.state'),
    optionalEntitySurface('mermaid.sequence'),
    aggregateSurface('mermaid.all'),
  ],
  options: [
    optionalOption('entity', 'string', {
      description: 'Optional entity filter (also accepted via request.entity).',
    }),
    optionalOption('markdown', 'boolean', { default: false }),
  ],
  artifactCategories: ['documentation', 'diagram'],
  packageDependencies: [],
  runtimeDependencies: [],
  compatibleCompanions: ['llm-context'],
  incompatibleWith: [],
  resolved: true,
};
