/**
 * Terraform HCL projection.
 *
 * Consumes Manifest IR (entities + stores + events) + projection config and
 * emits Terraform HCL resource definitions for one of three cloud providers:
 *   - 'aws'     → aws_db_instance, aws_s3_bucket, aws_sns_topic
 *   - 'gcp'     → google_sql_database_instance, google_storage_bucket, google_pubsub_topic
 *   - 'supabase' → supabase project notes (database is managed by Supabase)
 *
 * Boundary rules (following Prisma/Drizzle/materialized-views conventions):
 *   - Infrastructure interpretation starts HERE. No infrastructure concept
 *     (instance class, region, bucket name, topic name) lives in Manifest
 *     core grammar or IR — all of it arrives via projection options.
 *   - The projection carries NO knowledge of any specific application,
 *     cloud account, or deployment topology.
 *   - Non-persistent store targets (memory, localStorage, durable) are skipped.
 *   - Entities without a store declaration are skipped.
 *   - `computedProperties` are NEVER treated as stored columns.
 *   - Unknown property types produce error diagnostics. No silent fallback.
 */

import type { IR, IREvent, IRStore, IRType } from '../../ir';
import type {
  ProjectionArtifact,
  ProjectionDiagnostic,
  ProjectionRequest,
  ProjectionResult,
  ProjectionTarget,
} from '../interface';

import { normalizeOptions, type TerraformBucket, type TerraformProvider } from './options.js';
import {
  PERSISTENT_DB_TARGETS,
  resolveDatabaseConfig,
  type HclResource,
  type ResolvedDatabaseConfig,
  type ResolvedDatabaseResource,
  type ResourceCategory,
} from './types.js';

// ============================================================================
// Surface identifiers
// ============================================================================

const SURFACE_HCL = 'terraform.hcl' as const;
const SURFACES = [SURFACE_HCL] as const;

// ============================================================================
// Naming helpers
// ============================================================================

/** PascalCase → snake_case. */
function toSnakeCase(name: string): string {
  return name
    .replace(/([A-Z])/g, (m, _ch, idx) => (idx === 0 ? m.toLowerCase() : '_' + m.toLowerCase()))
    .replace(/[^a-z0-9_]/g, '');
}

/** PascalCase → snake_case plural for table names. */
function defaultTableName(entityName: string): string {
  const snake = toSnakeCase(entityName);
  return `${snake}s`;
}

/** Sanitize a name for use as a Terraform resource local name. */
function terraformResourceName(name: string): string {
  return toSnakeCase(name).replace(/_+/g, '_').replace(/^_|_$/g, '');
}

// ============================================================================
// HCL escape helpers
// ============================================================================

/** Escape a string for use inside double-quoted HCL. */
function hclEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/** Format an HCL string literal. */
function hclString(value: string): string {
  return `"${hclEscape(value)}"`;
}

// ============================================================================
// IR type → HCL column type mapping
// ============================================================================

/**
 * Maps Manifest IR types to provider-specific column type strings.
 * Returns null for types that cannot be represented in a database column
 * (e.g. object/map without generic — caller should emit a diagnostic).
 */
function irTypeToHclColumnType(
  type: IRType,
  provider: TerraformProvider,
): { hcl: string; nullable: boolean } | null {
  const baseType = type.name;
  const nullable = type.nullable;

  // AWS RDS and GCP Cloud SQL both use standard PostgreSQL types.
  // Supabase also uses PostgreSQL under the hood.
  const PG_TYPE_MAP: Record<string, string> = {
    string: 'TEXT',
    int: 'INTEGER',
    float: 'DOUBLE PRECISION',
    boolean: 'BOOLEAN',
    datetime: 'TIMESTAMP WITH TIME ZONE',
    uuid: 'UUID',
    money: 'NUMERIC(19,4)',
    decimal: 'NUMERIC',
    json: 'JSONB',
    bytes: 'BYTEA',
  };

  // Array types: append [] for PostgreSQL array syntax.
  if (baseType === 'array' && type.generic) {
    const elementType = irTypeToHclColumnType(type.generic, provider);
    if (!elementType) return null;
    return { hcl: `${elementType.hcl}[]`, nullable };
  }

  const mapped = PG_TYPE_MAP[baseType];
  if (mapped) {
    return { hcl: mapped, nullable };
  }

  // Unknown/custom types (including enum names) are not mapped.
  return null;
}

// ============================================================================
// Source resolution
// ============================================================================

/**
 * Build a map of entity name → IRStore for quick lookup.
 */
function buildStoreMap(ir: IR): Map<string, IRStore> {
  const map = new Map<string, IRStore>();
  for (const store of ir.stores) {
    map.set(store.entity, store);
  }
  return map;
}

/**
 * Resolve which entities should become database resources.
 * Returns entities backed by persistent store targets.
 */
function resolveDatabaseResources(
  ir: IR,
  storeMap: Map<string, IRStore>,
  diagnostics: ProjectionDiagnostic[],
): ResolvedDatabaseResource[] {
  const resources: ResolvedDatabaseResource[] = [];

  for (const entity of ir.entities) {
    const store = storeMap.get(entity.name);
    if (!store) {
      diagnostics.push({
        severity: 'info',
        code: 'SKIPPED_NO_STORE',
        message: `Entity '${entity.name}' has no store declaration. Skipped.`,
        entity: entity.name,
      });
      continue;
    }

    if (!PERSISTENT_DB_TARGETS.has(store.target)) {
      diagnostics.push({
        severity: 'info',
        code: 'SKIPPED_NON_PERSISTENT',
        message: `Entity '${entity.name}' uses non-persistent store '${store.target}'. Skipped.`,
        entity: entity.name,
      });
      continue;
    }

    resources.push({
      entity,
      storeTarget: store.target,
      tableName: defaultTableName(entity.name),
    });
  }

  return resources;
}

// ============================================================================
// HCL emission — AWS
// ============================================================================

function emitAwsProviderConfig(config: ResolvedDatabaseConfig): string {
  return [
    'terraform {',
    '  required_version = ">= 1.0"',
    '  required_providers {',
    '    aws = {',
    '      source  = "hashicorp/aws"',
    '      version = "~> 5.0"',
    '    }',
    '  }',
    '}',
    '',
    'provider "aws" {',
    `  region = ${hclString(config.region)}`,
    '}',
    '',
  ].join('\n');
}

function emitAwsDatabaseInstance(
  resourceName: string,
  dbConfig: ResolvedDatabaseConfig,
): string {
  return [
    `resource "aws_db_instance" ${hclString(resourceName)} {`,
    `  identifier         = ${hclString(`${resourceName}-instance`)}`,
    `  engine             = "postgres"`,
    `  engine_version     = ${hclString(dbConfig.engineVersion)}`,
    `  instance_class     = ${hclString(dbConfig.instanceClass)}`,
    `  allocated_storage  = ${dbConfig.allocatedStorage}`,
    `  storage_type       = "gp2"`,
    `  db_name            = ${hclString(dbConfig.databaseName)}`,
    `  username           = ${hclString(dbConfig.masterUsername)}`,
    `  password           = var.db_password`,
    `  skip_final_snapshot = true`,
    ``,
    `  vpc_security_group_ids = [aws_security_group.${resourceName}.id]`,
    `  db_subnet_group_name   = aws_db_subnet_group.${resourceName}.name`,
    '}',
    '',
  ].join('\n');
}

function emitAwsTable(
  resourceName: string,
  resolved: ResolvedDatabaseResource,
  diagnostics: ProjectionDiagnostic[],
): string | null {
  const entity = resolved.entity;
  const properties = entity.properties;

  if (properties.length === 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'EMPTY_TABLE',
      message: `Entity '${entity.name}' has no properties. Skipping table resource.`,
      entity: entity.name,
    });
    return null;
  }

  const lines: string[] = [];
  lines.push(`resource "aws_db_instance_table" ${hclString(resourceName)} {`);

  // Generate columns for each stored property.
  for (const prop of properties) {
    const colType = irTypeToHclColumnType(prop.type, 'aws');
    if (!colType) {
      diagnostics.push({
        severity: 'error',
        code: 'UNKNOWN_TYPE',
        message: `Property '${entity.name}.${prop.name}' has unknown type '${prop.type.name}'. Cannot emit column.`,
        entity: entity.name,
      });
      continue;
    }

    const isPk = entity.key?.includes(prop.name) ?? prop.name === 'id';
    const modifiers = prop.modifiers;
    const isUnique = modifiers.includes('unique') || isPk;
    const isNotNull = !colType.nullable || modifiers.includes('required') || isPk;

    lines.push(`  column {`);
    lines.push(`    name = ${hclString(prop.name)}`);
    lines.push(`    type = ${hclString(colType.hcl)}`);
    if (isPk) lines.push(`    primary_key = true`);
    if (isUnique && !isPk) lines.push(`    unique = true`);
    if (isNotNull) lines.push(`    nullable = false`);
    lines.push(`  }`);
  }

  lines.push(`}`);
  lines.push('');
  return lines.join('\n');
}

function emitAwsBucket(bucket: TerraformBucket): string {
  const resourceName = terraformResourceName(bucket.name);
  const versioning = bucket.versioning !== false; // default true
  const encryption = bucket.encryption !== false; // default true

  const comment = bucket.entity ? `  # Backs entity: ${bucket.entity}\n` : '';
  return [
    comment,
    `resource "aws_s3_bucket" ${hclString(resourceName)} {`,
    `  bucket = ${hclString(bucket.name)}`,
    '}',
    '',
    `resource "aws_s3_bucket_versioning" ${hclString(`${resourceName}_versioning`)} {`,
    `  bucket = aws_s3_bucket.${resourceName}.id`,
    `  versioning_configuration {`,
    `    status = ${versioning ? '"Enabled"' : '"Disabled"'}`,
    `  }`,
    '}',
    '',
    `resource "aws_s3_bucket_server_side_encryption_configuration" ${hclString(`${resourceName}_encryption`)} {`,
    `  bucket = aws_s3_bucket.${resourceName}.id`,
    `  rule {`,
    `    apply_server_side_encryption_by_default {`,
    `      sse_algorithm = ${encryption ? '"AES256"' : '"none"'}`,
    `    }`,
    `  }`,
    '}',
    '',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

function emitAwsSnsTopic(event: IREvent): string {
  const topicName = toSnakeCase(event.name);
  const resourceName = `topic_${topicName}`;
  return [
    `resource "aws_sns_topic" ${hclString(resourceName)} {`,
    `  name = ${hclString(topicName)}`,
    '}',
    '',
  ].join('\n');
}

// ============================================================================
// HCL emission — GCP
// ============================================================================

function emitGcpProviderConfig(config: ResolvedDatabaseConfig): string {
  return [
    'terraform {',
    '  required_version = ">= 1.0"',
    '  required_providers {',
    '    google = {',
    '      source  = "hashicorp/google"',
    '      version = "~> 5.0"',
    '    }',
    '  }',
    '}',
    '',
    'provider "google" {',
    `  project = var.gcp_project`,
    `  region  = ${hclString(config.region)}`,
    '}',
    '',
  ].join('\n');
}

function emitGcpDatabaseInstance(
  resourceName: string,
  dbConfig: ResolvedDatabaseConfig,
): string {
  return [
    `resource "google_sql_database_instance" ${hclString(resourceName)} {`,
    `  name             = ${hclString(resourceName)}`,
    `  database_version = ${hclString(dbConfig.engineVersion)}`,
    `  region           = ${hclString(dbConfig.region)}`,
    ``,
    `  settings {`,
    `    tier = ${hclString(dbConfig.instanceClass)}`,
    ``,
    `    ip_configuration {`,
    `      ipv4_enabled = true`,
    `    }`,
    `  }`,
    '}',
    '',
    `resource "google_sql_database" ${hclString(`${resourceName}_db`)} {`,
    `  name     = ${hclString(dbConfig.databaseName)}`,
    `  instance = google_sql_database_instance.${resourceName}.name`,
    '}',
    '',
    `resource "google_sql_user" ${hclString(`${resourceName}_user`)} {`,
    `  name     = ${hclString(dbConfig.masterUsername)}`,
    `  instance = google_sql_database_instance.${resourceName}.name`,
    `  password = var.db_password`,
    '}',
    '',
  ].join('\n');
}

function emitGcpTable(
  resourceName: string,
  resolved: ResolvedDatabaseResource,
  diagnostics: ProjectionDiagnostic[],
): string | null {
  const entity = resolved.entity;
  const properties = entity.properties;

  if (properties.length === 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'EMPTY_TABLE',
      message: `Entity '${entity.name}' has no properties. Skipping table resource.`,
      entity: entity.name,
    });
    return null;
  }

  const lines: string[] = [];
  lines.push(`resource "google_sql_table" ${hclString(resourceName)} {`);

  for (const prop of properties) {
    const colType = irTypeToHclColumnType(prop.type, 'gcp');
    if (!colType) {
      diagnostics.push({
        severity: 'error',
        code: 'UNKNOWN_TYPE',
        message: `Property '${entity.name}.${prop.name}' has unknown type '${prop.type.name}'. Cannot emit column.`,
        entity: entity.name,
      });
      continue;
    }

    const isPk = entity.key?.includes(prop.name) ?? prop.name === 'id';
    const modifiers = prop.modifiers;
    const isUnique = modifiers.includes('unique') || isPk;
    const isNotNull = !colType.nullable || modifiers.includes('required') || isPk;

    lines.push(`  column {`);
    lines.push(`    name = ${hclString(prop.name)}`);
    lines.push(`    type = ${hclString(colType.hcl)}`);
    if (isPk) lines.push(`    primary_key = true`);
    if (isUnique && !isPk) lines.push(`    unique = true`);
    if (isNotNull) lines.push(`    nullable = false`);
    lines.push(`  }`);
  }

  lines.push(`}`);
  lines.push('');
  return lines.join('\n');
}

function emitGcpBucket(bucket: TerraformBucket): string {
  const resourceName = terraformResourceName(bucket.name);
  const versioning = bucket.versioning !== false;
  const encryption = bucket.encryption !== false;

  const comment = bucket.entity ? `  # Backs entity: ${bucket.entity}\n` : '';
  return [
    comment,
    `resource "google_storage_bucket" ${hclString(resourceName)} {`,
    `  name     = ${hclString(bucket.name)}`,
    `  location = "US"`,
    ``,
    `  versioning {`,
    `    enabled = ${versioning}`,
    `  }`,
    ``,
    `  encryption {`,
    `    default_kms_key_name = ${encryption ? 'google_kms_crypto_key_iam_member.bucket_encryptor.id' : 'null'}`,
    `  }`,
    '}',
    '',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

function emitGcpPubSubTopic(event: IREvent): string {
  const topicName = toSnakeCase(event.name);
  const resourceName = `topic_${topicName}`;
  return [
    `resource "google_pubsub_topic" ${hclString(resourceName)} {`,
    `  name = ${hclString(topicName)}`,
    '}',
    '',
  ].join('\n');
}

// ============================================================================
// HCL emission — Supabase
// ============================================================================

function emitSupabaseProviderConfig(): string {
  return [
    'terraform {',
    '  required_version = ">= 1.0"',
    '  required_providers {',
    '    supabase = {',
    '      source  = "supabase/supabase"',
    '      version = "~> 1.0"',
    '    }',
    '  }',
    '}',
    '',
    'provider "supabase" {',
    '  access_token = var.supabase_access_token',
    '}',
    '',
  ].join('\n');
}

function emitSupabaseProject(): string {
  return [
    '# Supabase provisions and manages the PostgreSQL database.',
    '# Tables are created via the Supabase dashboard or SQL editor,',
    '# or by applying a Supabase migration via the supabase CLI.',
    'resource "supabase_project" "main" {',
    '  name       = "manifest-app"',
    '  organization_id = var.supabase_organization_id',
    '  region     = "us-east-1"',
    '  database_password = var.db_password',
    '',
    '  lifecycle {',
    '    ignore_changes = [database_password]',
    '  }',
    '}',
    '',
  ].join('\n');
}

function emitSupabaseTable(
  resourceName: string,
  resolved: ResolvedDatabaseResource,
  diagnostics: ProjectionDiagnostic[],
): string | null {
  const entity = resolved.entity;
  const properties = entity.properties;

  if (properties.length === 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'EMPTY_TABLE',
      message: `Entity '${entity.name}' has no properties. Skipping table resource.`,
      entity: entity.name,
    });
    return null;
  }

  const lines: string[] = [];
  lines.push(`# Supabase tables are typically managed via SQL migrations.`);
  lines.push(`# This resource documents the expected schema for entity '${entity.name}'.`);
  lines.push(`resource "null_resource" ${hclString(resourceName)} {`);
  lines.push(`  # Table: ${resolved.tableName}`);
  lines.push(`  # Entity: ${entity.name}`);

  for (const prop of properties) {
    const colType = irTypeToHclColumnType(prop.type, 'supabase');
    if (!colType) {
      diagnostics.push({
        severity: 'error',
        code: 'UNKNOWN_TYPE',
        message: `Property '${entity.name}.${prop.name}' has unknown type '${prop.type.name}'. Cannot emit column.`,
        entity: entity.name,
      });
      continue;
    }

    const isPk = entity.key?.includes(prop.name) ?? prop.name === 'id';
    const isNotNull = !colType.nullable || prop.modifiers.includes('required') || isPk;
    const suffix = isPk ? ' PRIMARY KEY' : isNotNull ? ' NOT NULL' : '';
    lines.push(`  #   ${prop.name}: ${colType.hcl}${suffix}`);
  }

  lines.push(`}`);
  lines.push('');
  return lines.join('\n');
}

// ============================================================================
// Provider dispatch
// ============================================================================

function emitProviderConfig(
  provider: TerraformProvider,
  dbConfig: ResolvedDatabaseConfig,
): string {
  switch (provider) {
    case 'aws':
      return emitAwsProviderConfig(dbConfig);
    case 'gcp':
      return emitGcpProviderConfig(dbConfig);
    case 'supabase':
      return emitSupabaseProviderConfig();
  }
}

function emitDatabaseInstance(
  provider: TerraformProvider,
  resourceName: string,
  dbConfig: ResolvedDatabaseConfig,
): string {
  switch (provider) {
    case 'aws':
      return emitAwsDatabaseInstance(resourceName, dbConfig);
    case 'gcp':
      return emitGcpDatabaseInstance(resourceName, dbConfig);
    case 'supabase':
      return ''; // Supabase manages database as part of project
  }
}

function emitTable(
  provider: TerraformProvider,
  resourceName: string,
  resolved: ResolvedDatabaseResource,
  diagnostics: ProjectionDiagnostic[],
): string | null {
  switch (provider) {
    case 'aws':
      return emitAwsTable(resourceName, resolved, diagnostics);
    case 'gcp':
      return emitGcpTable(resourceName, resolved, diagnostics);
    case 'supabase':
      return emitSupabaseTable(resourceName, resolved, diagnostics);
  }
}

function emitBucket(provider: TerraformProvider, bucket: TerraformBucket): string {
  if (provider === 'supabase') {
    return `# Supabase does not have a first-class bucket resource.\n# Use Supabase Storage via the dashboard or API.\n`;
  }
  return provider === 'aws' ? emitAwsBucket(bucket) : emitGcpBucket(bucket);
}

function emitMessagingTopic(provider: TerraformProvider, event: IREvent): string {
  if (provider === 'aws') return emitAwsSnsTopic(event);
  if (provider === 'gcp') return emitGcpPubSubTopic(event);
  // Supabase: note that realtime channels are used instead of pub/sub topics
  return [
    `# Supabase uses Realtime channels instead of dedicated pub/sub topics.`,
    `# Event: ${event.name}`,
    `# Channel: ${event.channel}`,
    `resource "null_resource" "channel_${toSnakeCase(event.name)}" {}`,
    '',
  ].join('\n');
}

// ============================================================================
// Resource collection
// ============================================================================

function collectAllResources(
  ir: IR,
  options: ReturnType<typeof normalizeOptions>,
  diagnostics: ProjectionDiagnostic[],
): HclResource[] {
  const provider = options.provider!;
  const dbConfig = resolveDatabaseConfig(options.databaseConfig, provider);
  const storeMap = buildStoreMap(ir);
  const resources: HclResource[] = [];

  // Database resources: one DB instance + one table per persistent entity.
  const dbResources = resolveDatabaseResources(ir, storeMap, diagnostics);
  if (dbResources.length > 0 && provider !== 'supabase') {
    const dbInstanceName = 'app_database';
    const dbBlock = emitDatabaseInstance(provider, dbInstanceName, dbConfig);
    resources.push({
      resourceType: 'database_instance',
      resourceName: dbInstanceName,
      block: dbBlock,
      category: 'database',
    });

    for (const resolved of dbResources) {
      const tableResourceName = `table_${toSnakeCase(resolved.entity.name)}`;
      const tableBlock = emitTable(provider, tableResourceName, resolved, diagnostics);
      if (tableBlock) {
        resources.push({
          resourceType: 'table',
          resourceName: tableResourceName,
          block: tableBlock,
          category: 'database',
          entity: resolved.entity.name,
        });
      }
    }
  } else if (dbResources.length > 0 && provider === 'supabase') {
    // Supabase: emit project resource + table documentation.
    resources.push({
      resourceType: 'supabase_project',
      resourceName: 'main',
      block: emitSupabaseProject(),
      category: 'database',
    });

    for (const resolved of dbResources) {
      const tableResourceName = `table_${toSnakeCase(resolved.entity.name)}`;
      const tableBlock = emitTable(provider, tableResourceName, resolved, diagnostics);
      if (tableBlock) {
        resources.push({
          resourceType: 'table',
          resourceName: tableResourceName,
          block: tableBlock,
          category: 'database',
          entity: resolved.entity.name,
        });
      }
    }
  }

  // Storage buckets (from options, not IR).
  const buckets = options.storageBuckets ?? [];
  for (const bucket of buckets) {
    const bucketResourceName = `bucket_${terraformResourceName(bucket.name)}`;
    resources.push({
      resourceType: 'bucket',
      resourceName: bucketResourceName,
      block: emitBucket(provider, bucket),
      category: 'storage',
      entity: bucket.entity,
    });
  }

  // Messaging topics: one per IR event.
  for (const event of ir.events) {
    const topicResourceName = `topic_${toSnakeCase(event.name)}`;
    resources.push({
      resourceType: 'topic',
      resourceName: topicResourceName,
      block: emitMessagingTopic(provider, event),
      category: 'messaging',
    });
  }

  return resources;
}

// ============================================================================
// Artifact emission
// ============================================================================

function emitSingleFileArtifact(
  resources: HclResource[],
  options: ReturnType<typeof normalizeOptions>,
): ProjectionArtifact {
  const lines: string[] = [];

  // Header comment.
  lines.push('# ============================================================');
  lines.push(`# Terraform HCL generated from Manifest IR`);
  lines.push(`# Provider: ${options.provider}`);
  lines.push(`# Resources: ${resources.length}`);
  lines.push('# ============================================================');
  lines.push('');

  // Provider config.
  if (options.emitProviderConfig) {
    const dbConfig = resolveDatabaseConfig(options.databaseConfig, options.provider!);
    lines.push(emitProviderConfig(options.provider!, dbConfig));
  }

  // Group resources by category with section comments.
  const categories: ResourceCategory[] = ['database', 'storage', 'messaging'];
  for (const category of categories) {
    const categoryResources = resources.filter((r) => r.category === category);
    if (categoryResources.length === 0) continue;

    lines.push(`# ---------- ${category} resources (${categoryResources.length}) ----------`);
    for (const resource of categoryResources) {
      lines.push(resource.block);
    }
  }

  return {
    id: 'terraform.hcl',
    pathHint: options.output,
    contentType: 'hcl',
    code: lines.join('\n'),
  };
}

function emitMultiFileArtifacts(
  resources: HclResource[],
  options: ReturnType<typeof normalizeOptions>,
): ProjectionArtifact[] {
  const artifacts: ProjectionArtifact[] = [];
  const provider = options.provider!;

  // Provider config artifact.
  if (options.emitProviderConfig) {
    const dbConfig = resolveDatabaseConfig(options.databaseConfig, provider);
    const providerConfig = emitProviderConfig(provider, dbConfig);
    artifacts.push({
      id: 'terraform.provider',
      pathHint: 'provider.tf',
      contentType: 'hcl',
      code: providerConfig,
    });
  }

  // One artifact per category.
  const categoryMap: Record<ResourceCategory, string> = {
    database: 'database.tf',
    storage: 'storage.tf',
    messaging: 'messaging.tf',
  };

  for (const category of ['database', 'storage', 'messaging'] as ResourceCategory[]) {
    const categoryResources = resources.filter((r) => r.category === category);
    if (categoryResources.length === 0) continue;

    const lines: string[] = [];
    lines.push(`# ${category} resources for ${provider}`);
    lines.push('');
    for (const resource of categoryResources) {
      lines.push(resource.block);
    }

    artifacts.push({
      id: `terraform.${category}`,
      pathHint: categoryMap[category],
      contentType: 'hcl',
      code: lines.join('\n'),
    });
  }

  return artifacts;
}

// ============================================================================
// ProjectionTarget implementation
// ============================================================================

export class TerraformProjection implements ProjectionTarget {
  readonly name = 'terraform';
  readonly description =
    'Generates Terraform HCL resource definitions from IR stores, entities, and events. ' +
    'Supports AWS (RDS + S3 + SNS), GCP (Cloud SQL + GCS + Pub/Sub), and Supabase providers. ' +
    'Enables one-click infrastructure provisioning aligned with the Manifest domain model.';
  readonly surfaces = SURFACES;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    const allDiagnostics: ProjectionDiagnostic[] = [];

    if (!SURFACES.includes(request.surface as (typeof SURFACES)[number])) {
      allDiagnostics.push({
        severity: 'error',
        code: 'UNKNOWN_SURFACE',
        message: `Terraform projection does not support surface '${request.surface}'. Supported: ${SURFACES.join(', ')}.`,
      });
      return { artifacts: [], diagnostics: allDiagnostics };
    }

    const options = normalizeOptions(request.options);
    const resources = collectAllResources(ir, options, allDiagnostics);

    // Check if there's anything to emit.
    const hasAnyResources =
      resources.length > 0 ||
      options.storageBuckets !== undefined ||
      ir.events.length > 0 ||
      ir.entities.length > 0;

    if (!hasAnyResources) {
      allDiagnostics.push({
        severity: 'warning',
        code: 'NO_RESOURCES',
        message:
          'No infrastructure resources found in IR. No stores, entities, events, or storage buckets declared.',
      });
    }

    // Emit artifacts.
    const artifacts = options.emitSingleFile
      ? [emitSingleFileArtifact(resources, options)]
      : emitMultiFileArtifacts(resources, options);

    return { artifacts, diagnostics: allDiagnostics };
  }
}
