/**
 * Public entry point for the Terraform projection.
 */

export { TerraformProjection } from './generator.js';
export {
  normalizeOptions,
  TERRAFORM_PROJECTION_DEFAULTS,
  type TerraformProjectionOptions,
  type TerraformProvider,
  type TerraformBucket,
  type TerraformDatabaseConfig,
} from './options.js';
export {
  PERSISTENT_DB_TARGETS,
  resolveDatabaseConfig,
  DEFAULT_AWS_DB_CONFIG,
  DEFAULT_GCP_DB_CONFIG,
  type ResolvedDatabaseConfig,
  type ResolvedDatabaseResource,
  type HclResource,
  type ResourceCategory,
} from './types.js';
