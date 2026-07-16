import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import { aggregateSurface, optionalOption } from '../descriptor-helpers.js';

export const CONTRACT_TESTS_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'Contract Tests',
  surfaces: [aggregateSurface('contract-tests.convex')],
  // Same auth seam as convex.queries — decides whether list/get are public.
  options: [optionalOption('authContextImport', 'string')],
  artifactCategories: ['tests', 'contracts'],
  packageDependencies: ['vitest'],
  runtimeDependencies: [],
  // Evidence: emitted suites assert against convex.queries / convex.mutations exports.
  compatibleCompanions: ['convex'],
  incompatibleWith: [],
  resolved: true,
};
