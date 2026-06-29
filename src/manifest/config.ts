/**
 * Public, typed configuration surface for `manifest.config.ts`.
 *
 * This module is the import target for end users authoring a TypeScript
 * Manifest config:
 *
 * ```ts
 * // manifest.config.ts
 * import { defineConfig } from "@angriff36/manifest/config";
 *
 * export default defineConfig({
 *   stores: { Order: { implementation: PrismaOrderStore } },
 *   resolveUser: async (auth) => ({ id: auth.userId! }),
 *   build: { src: "modules/**\/*.manifest", output: "ir/" },
 * });
 * ```
 *
 * `defineConfig` is an identity function: it returns its argument unchanged at
 * runtime and exists purely so authors get autocomplete and compile-time
 * checking for the config shape.
 *
 * Scope note: these types describe the config surface that ACTUALLY ships today
 * (see docs/spec/config/manifest.config.md). The richer vNext sections proposed
 * in docs/internal/proposals/config/manifest-config-vnext.md (validation,
 * mergeIntegrity, provenance, runtime, driftGates, …) are NOT modelled here —
 * they are not implemented. The JSON schema at
 * docs/spec/config/manifest.config.schema.json remains the executable contract
 * that `manifest config validate` enforces for the YAML/build config.
 */

import type { NamingConventionInput } from './projections/shared/naming.js';

export type { NamingConventionInput };

/** A single environment-variable declaration used by `manifest preflight`. */
export interface ManifestEnvVarDefinition {
  name: string;
  description?: string;
  required?: boolean;
  default?: string;
  example?: string;
}

/** Grouped environment-variable declarations. */
export interface ManifestEnvMapping {
  stores?: Record<string, ManifestEnvVarDefinition>;
  auth?: Record<string, ManifestEnvVarDefinition>;
  adapters?: Record<string, ManifestEnvVarDefinition>;
  custom?: Record<string, ManifestEnvVarDefinition>;
}

/** Git pre-commit hook settings consumed by `manifest install-hooks`. */
export interface ManifestHooksConfig {
  /** Skip running the generated hook in CI environments. Default: true. */
  skipInCi?: boolean;
  /** Git hook manager the pre-commit hook is installed into. Default: 'husky'. */
  provider?: 'husky' | 'simple-git-hooks';
  /** Run `manifest fmt` from the generated pre-commit hook. Default: true. */
  runFmt?: boolean;
  /** Run `manifest validate` from the generated pre-commit hook. Default: true. */
  runValidate?: boolean;
}

/** Declares a Manifest plugin for the CLI to load. */
export interface ManifestPluginDeclaration {
  /** npm package name or relative file path to the plugin module. */
  module: string;
  /** Plugin-specific options passed at load time. */
  options?: Record<string, unknown>;
  /** Whether the plugin is active. Default: true. */
  enabled?: boolean;
}

/** Per-projection config block (e.g. nextjs, routes, prisma). */
export interface ManifestProjectionConfig {
  /** Directory where this projection's artifacts are written. */
  output?: string;
  /** Surface-specific options. See the projection's option reference. */
  options?: Record<string, unknown>;
}

/**
 * Foreign-key override for a `belongsTo`/`ref` relation in the Prisma
 * projection. Mirrors `PrismaProjectionOptions.foreignKeys` in the JSON schema.
 */
export interface ManifestPrismaForeignKeyConfig {
  fields: string[];
  references?: string[];
  onDelete?: string;
  onUpdate?: string;
}

/**
 * Multi-schema layout for the Prisma projection. Mirrors `multiSchema` in
 * `docs/spec/config/manifest.config.schema.json`. PostgreSQL / CockroachDB /
 * SQL Server only. Per-model resolution: `entitySchema[name]` → IR module →
 * `defaultSchema`.
 */
export interface ManifestPrismaMultiSchemaConfig {
  /** Master switch. Default false (flat layout). */
  enabled?: boolean;
  /** Explicit datasource schema list; missing-but-used schemas are appended. */
  schemas?: string[];
  /** Per-entity schema override (entity name → schema). Wins over IR module. */
  entitySchema?: Record<string, string>;
  /** Schema for entities with neither an override nor a module. Default 'public'. */
  defaultSchema?: string;
}

/**
 * Typed surface for `projections.prisma.options`. Mirrors
 * `definitions.PrismaProjectionOptions` in the JSON schema (the executable
 * contract `manifest config validate` enforces). Authors may annotate a
 * `manifest.config.ts` projection's `options` with this for autocomplete;
 * `ManifestProjectionConfig.options` stays `Record<string, unknown>` so the
 * surface remains permissive and back-compatible.
 */
export interface ManifestPrismaProjectionOptions {
  provider?: 'postgresql' | 'mysql' | 'sqlite' | 'sqlserver' | 'mongodb' | 'cockroachdb';
  /** Path hint for the emitted schema.prisma artifact. Default 'schema.prisma'. */
  output?: string;
  /** Env var for the DB URL in the emitted prisma.config.ts companion. Default 'DATABASE_URL'. */
  urlEnvVar?: string;
  /** Datasource `relationMode`. */
  relationMode?: 'prisma' | 'foreignKeys';
  /** `generator client { ... }` fields, emitted verbatim as `key = "value"`. */
  generator?: Record<string, string>;
  /** Preserve module layout as DB schemas via `@@schema(...)`. */
  multiSchema?: ManifestPrismaMultiSchemaConfig;
  /** Automatic identifier-casing convention (adds @map/@@map only). */
  naming?: NamingConventionInput;
  tableMappings?: Record<string, string>;
  columnMappings?: Record<string, Record<string, string>>;
  precision?: Record<string, Record<string, { precision: number; scale: number }>>;
  indexes?: Record<string, Array<string[] | { fields: string[]; name?: string }>>;
  typeMappings?: Record<string, Record<string, string>>;
  foreignKeys?: Record<string, Record<string, string | ManifestPrismaForeignKeyConfig>>;
  dbAttributes?: Record<string, Record<string, string>>;
  fieldAttributes?: Record<string, Record<string, string[]>>;
}

/**
 * Typed surface for `projections.prisma-store.options`. Inherits every Prisma
 * projection option (provider, naming, multiSchema, …) and adds the
 * store-metadata/registry-owned keys. Mirrors `PrismaStoreProjectionOptions`
 * in the JSON schema.
 */
export interface ManifestPrismaStoreProjectionOptions extends ManifestPrismaProjectionOptions {
  accessorNames?: Record<string, string>;
  metadataOutput?: string;
  registryOutput?: string;
  storeImportPath?: string;
  metadataImportPath?: string;
  softDelete?: Record<string, { field: string; deletedValue: string }>;
}

/**
 * Build-level configuration — the YAML-equivalent surface, also expressible as
 * the `build` block of a TypeScript config. Validated by the JSON schema.
 */
export interface ManifestBuildConfig {
  /** Optional pointer to the config JSON schema for editor IntelliSense. Prefer a local path; Manifest publishes no resolvable schema URL. */
  $schema?: string;
  /** Glob for source `.manifest` files. Default: '**\/*.manifest'. */
  src?: string;
  /** Directory for compiled IR JSON. Default: 'ir/'. */
  output?: string;
  /** Optional path to a Prisma schema for property-alignment scans. */
  prismaSchema?: string;
  /** Per-projection config blocks, keyed by projection name. */
  projections?: Record<string, ManifestProjectionConfig>;
  /** Environment-variable declarations for `manifest preflight`. */
  env?: ManifestEnvMapping;
  /** Git pre-commit hook settings for `manifest install-hooks`. */
  hooks?: ManifestHooksConfig;
  /** Third-party plugin declarations loaded by the CLI. */
  plugins?: ManifestPluginDeclaration[];
  /**
   * Global identifier-casing convention inherited by projections that map IR
   * names to physical database names (currently the Prisma projection). Opt-in;
   * when omitted, projections emit IR names verbatim.
   *
   * A per-projection `projections.<name>.options.naming` always overrides this
   * global default. See {@link resolveProjectionOptions}.
   *
   * Example:
   *   naming: 'snake_case'   # createdAt → @map("created_at"), Widget → @@map("widgets")
   */
  naming?: NamingConventionInput;
}

/** User context resolved from authentication. */
export interface ManifestUserContext {
  id: string;
  role?: string;
  tenantId?: string;
  [key: string]: unknown;
}

/** Authentication context passed to `resolveUser`. */
export interface ManifestAuthContext {
  userId?: string;
  claims?: Record<string, unknown>;
  headers?: Record<string, string>;
  [key: string]: unknown;
}

/** Store binding for an entity (runtime config). */
export interface ManifestStoreBinding {
  /** Store implementation: class, factory function, or instance. */
  implementation: unknown;
  /** Optional Prisma model name for property-alignment checks. */
  prismaModel?: string;
  /** Optional manifest-property → database-column mapping. */
  propertyMapping?: Record<string, string>;
}

/**
 * Runtime-level configuration — the shape of a `manifest.config.ts` default
 * export. Carries store bindings, user resolution, and an optional `build`
 * block that is merged over `manifest.config.yaml`.
 */
export interface ManifestRuntimeConfig {
  /** Per-entity store implementation bindings. */
  stores?: Record<string, ManifestStoreBinding>;
  /** Resolve user context from authentication for generated routes. */
  resolveUser?: (auth: ManifestAuthContext) => Promise<ManifestUserContext | null>;
  /** Build-level settings, merged over manifest.config.yaml and validated identically. */
  build?: ManifestBuildConfig;
}

/**
 * Identity helper that types a `manifest.config.ts` default export.
 *
 * Returns its argument unchanged; exists only to provide editor autocomplete
 * and compile-time checking. Use it for the runtime config authored in
 * TypeScript:
 *
 * ```ts
 * export default defineConfig({ build: { src: "**\/*.manifest" } });
 * ```
 */
export function defineConfig(config: ManifestRuntimeConfig): ManifestRuntimeConfig {
  return config;
}

/**
 * Resolve the option bag a projection receives, layering the build-level global
 * `naming` default UNDER the projection's own `options`. A per-projection
 * `options.naming` always wins; the global only fills in when the projection
 * did not specify its own.
 *
 * This is the single inheritance contract for the global `naming` default:
 * dispatchers should build `request.options` from this helper so the projection
 * sees one merged bag and its `normalizeOptions` remains the only defaults
 * source for everything else.
 *
 * Returns a shallow copy; the input config is never mutated. All non-`naming`
 * keys pass through untouched.
 */
export function resolveProjectionOptions(
  build: ManifestBuildConfig | undefined,
  projectionName: string,
): Record<string, unknown> {
  const projectionOptions = { ...(build?.projections?.[projectionName]?.options ?? {}) };
  if (build?.naming !== undefined && projectionOptions.naming === undefined) {
    projectionOptions.naming = build.naming;
  }
  return projectionOptions;
}
