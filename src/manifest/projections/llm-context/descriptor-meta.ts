import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import { aggregateSurface, optionalOption } from '../descriptor-helpers.js';

export const LLM_CONTEXT_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'LLM Context',
  surfaces: [
    aggregateSurface('llm-context.full'),
    aggregateSurface('llm-context.summary'),
    aggregateSurface('llm-context.ir'),
  ],
  options: [optionalOption('includeProvenance', 'boolean')],
  artifactCategories: ['documentation', 'ai-context'],
  packageDependencies: [],
  runtimeDependencies: [],
  compatibleCompanions: ['mermaid'],
  incompatibleWith: [],
  resolved: true,
};
