import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import { aggregateSurface } from '../descriptor-helpers.js';

export const STORYBOOK_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'Storybook',
  surfaces: [
    aggregateSurface('storybook.entity'),
    aggregateSurface('storybook.command'),
    aggregateSurface('storybook.all'),
  ],
  options: [],
  artifactCategories: ['documentation', 'stories'],
  packageDependencies: ['storybook'],
  runtimeDependencies: [],
  compatibleCompanions: [],
  incompatibleWith: [],
  resolved: false,
};
