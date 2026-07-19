/**
 * Projection descriptor types and pure builders.
 * Public lookup API (`describeProjection`, …) lives on the projections registry.
 */

export { buildProjectionDescriptor, validateAgainstDescriptor } from './descriptor-build.js';

export type {
  ProjectionCapabilityGroups,
  ProjectionDescriptor,
  ProjectionDescriptorMeta,
  ProjectionInvocationRequest,
  ProjectionInvocationValidation,
  ProjectionOptionDescriptor,
  ProjectionOptionValueType,
  ProjectionPrerequisiteDescriptor,
  ProjectionPrerequisiteKind,
  ProjectionSurfaceDescriptor,
  ProjectionSurfaceMeta,
  ProjectionInvocationScope,
} from './descriptor-types.js';

export { UnknownProjectionError } from './descriptor-types.js';
