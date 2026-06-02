/**
 * Internal types for the Terraform projection.
 * These are used by the generator and are not part of the public API.
 */

import type { IREntity } from '../../ir';
import type { TerraformDatabaseConfig } from './options.js';

/**
 * Stores that represent persistent database targets suitable for
 * infrastructure provisioning. Non-persistent targets (memory,
 * localStorage, durable) are skipped.
 */
export const PERSISTENT_DB_TARGETS = new Set(['postgres', 'supabase']);

/**
 * A resolved database resource: an entity backed by a persistent store
 * with its property metadata captured for HCL emission.
 */
export interface ResolvedDatabaseResource {
  entity: IREntity;
  storeTarget: string;
  tableName: string;
}

/**
 * The three resource categories emitted by this projection.
 */
export type ResourceCategory = 'database' | 'storage' | 'messaging';

/**
 * HCL emission result for a single resource block.
 */
export interface HclResource {
  /** Terraform resource type, e.g. 'aws_db_instance' */
  resourceType: string;
  /** Resource name (local name in the HCL block) */
  resourceName: string;
  /** The complete HCL block including resource type, name, and attributes */
  block: string;
  /** Category for grouping in multi-file mode */
  category: ResourceCategory;
  /** Entity name this resource was derived from (for diagnostics) */
  entity?: string;
}

/**
 * Resolved database config with all defaults applied.
 */
export interface ResolvedDatabaseConfig {
  instanceClass: string;
  engineVersion: string;
  allocatedStorage: number;
  region: string;
  masterUsername: string;
  databaseName: string;
}

export const DEFAULT_AWS_DB_CONFIG: ResolvedDatabaseConfig = {
  instanceClass: 'db.t3.micro',
  engineVersion: '15',
  allocatedStorage: 20,
  region: 'us-east-1',
  masterUsername: 'admin',
  databaseName: 'app',
};

export const DEFAULT_GCP_DB_CONFIG: ResolvedDatabaseConfig = {
  instanceClass: 'db-f1-micro',
  engineVersion: 'POSTGRES_15',
  allocatedStorage: 20,
  region: 'us-central1',
  masterUsername: 'admin',
  databaseName: 'app',
};

export function resolveDatabaseConfig(
  config: TerraformDatabaseConfig | undefined,
  provider: 'aws' | 'gcp' | 'supabase',
): ResolvedDatabaseConfig {
  const defaults = provider === 'gcp' ? DEFAULT_GCP_DB_CONFIG : DEFAULT_AWS_DB_CONFIG;
  return {
    instanceClass: config?.instanceClass ?? defaults.instanceClass,
    engineVersion: config?.engineVersion ?? defaults.engineVersion,
    allocatedStorage: config?.allocatedStorage ?? defaults.allocatedStorage,
    region: config?.region ?? defaults.region,
    masterUsername: config?.masterUsername ?? defaults.masterUsername,
    databaseName: config?.databaseName ?? defaults.databaseName,
  };
}
