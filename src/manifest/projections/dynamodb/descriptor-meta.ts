import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import { aggregateSurface } from '../descriptor-helpers.js';

export const DYNAMODB_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'DynamoDB',
  surfaces: [
    aggregateSurface('dynamodb.cloudformation'),
    aggregateSurface('dynamodb.cdk'),
    aggregateSurface('dynamodb.terraform'),
  ],
  options: [],
  artifactCategories: ['infrastructure'],
  packageDependencies: ['aws-cdk-lib'],
  runtimeDependencies: [],
  compatibleCompanions: [],
  incompatibleWith: [],
  resolved: true,
};
