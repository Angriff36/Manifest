/**
 * Configuration surface for the Terraform projection.
 *
 * Every infrastructure concept (provider, instance class, bucket
 * definitions, topic config) is supplied here at projection time.
 * NONE of these enter Manifest core grammar or IR.
 *
 * The projection translates IR + this options bag into Terraform HCL
 * resource definitions for one of three cloud providers:
 *   - 'aws'     → aws_db_instance, aws_s3_bucket, aws_sns_topic
 *   - 'gcp'     → google_sql_database_instance, google_storage_bucket, google_pubsub_topic
 *   - 'supabase' → supabase project notes
 */

export type TerraformProvider = 'aws' | 'gcp' | 'supabase';

/**
 * Declarative storage bucket definitions. The IR does not currently
 * expose storage buckets as first-class concepts, so consumers declare
 * them here. Each bucket can optionally be tagged with the entity
 * whose data it backs for documentation purposes.
 */
export interface TerraformBucket {
  /** Bucket name (used as-is in HCL) */
  name: string;
  /** Optional: entity whose data this bucket stores (for comments/labeling) */
  entity?: string;
  /** Enable versioning (default: true) */
  versioning?: boolean;
  /** Enable encryption (default: true) */
  encryption?: boolean;
}

/**
 * Database instance configuration applied to the generated database
 * resource. Defaults are conservative — production deployments should
 * override with explicit values.
 */
export interface TerraformDatabaseConfig {
  /** Instance class (e.g. 'db.t3.micro' for AWS, 'db-f1-micro' for GCP) */
  instanceClass?: string;
  /** Engine version (e.g. '15' for PostgreSQL 15) */
  engineVersion?: string;
  /** Allocated storage in GB (AWS/GCP) */
  allocatedStorage?: number;
  /** Cloud region (e.g. 'us-east-1', 'us-central1') */
  region?: string;
  /** Master username (default: 'admin') */
  masterUsername?: string;
  /** Database name (default: 'app') */
  databaseName?: string;
}

export interface TerraformProjectionOptions {
  /**
   * Cloud provider to generate HCL for.
   * Default: 'aws'
   */
  provider?: TerraformProvider;

  /**
   * Output path hint for the emitted artifact.
   * Default: 'main.tf'
   */
  output?: string;

  /**
   * Whether to emit a single file with all resources, or one file
   * per resource category (database, storage, messaging).
   * Default: true (single file)
   */
  emitSingleFile?: boolean;

  /**
   * Whether to emit the provider configuration block at the top
   * of the file (terraform block + provider block).
   * Default: true
   */
  emitProviderConfig?: boolean;

  /**
   * Declarative storage bucket definitions. Only used for 'aws' and 'gcp'.
   * Ignored for 'supabase'.
   */
  storageBuckets?: TerraformBucket[];

  /**
   * Database instance configuration. Ignored for 'supabase' (Supabase
   * provisions databases as part of the project resource).
   */
  databaseConfig?: TerraformDatabaseConfig;
}

/**
 * Defaults. Kept as an exported const so consumers and tests can introspect.
 */
export const TERRAFORM_PROJECTION_DEFAULTS: Required<
  Pick<TerraformProjectionOptions, 'provider' | 'output' | 'emitSingleFile' | 'emitProviderConfig'>
> = {
  provider: 'aws',
  output: 'main.tf',
  emitSingleFile: true,
  emitProviderConfig: true,
} as const;

/**
 * Normalize a raw `request.options` bag into a fully-typed options object.
 */
export function normalizeOptions(
  raw: Record<string, unknown> | undefined,
): TerraformProjectionOptions {
  const input = (raw ?? {}) as Partial<TerraformProjectionOptions>;
  return {
    provider: input.provider ?? TERRAFORM_PROJECTION_DEFAULTS.provider,
    output: input.output ?? TERRAFORM_PROJECTION_DEFAULTS.output,
    emitSingleFile: input.emitSingleFile ?? TERRAFORM_PROJECTION_DEFAULTS.emitSingleFile,
    emitProviderConfig:
      input.emitProviderConfig ?? TERRAFORM_PROJECTION_DEFAULTS.emitProviderConfig,
    storageBuckets: input.storageBuckets,
    databaseConfig: input.databaseConfig,
  };
}
