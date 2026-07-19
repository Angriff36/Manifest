import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import { aggregateSurface } from '../descriptor-helpers.js';

export const TERRAFORM_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'Terraform',
  surfaces: [aggregateSurface('terraform.hcl')],
  options: [],
  artifactCategories: ['infrastructure'],
  packageDependencies: [],
  runtimeDependencies: [],
  compatibleCompanions: [],
  incompatibleWith: [],
  resolved: true,
};
