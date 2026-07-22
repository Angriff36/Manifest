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
 * (see docs/spec/config/manifest.config.md). Config G5 (`projections.enabled` /
 * `projections.defaults`), Config G2 (`validation.failOn`), Config G3
 * (`mergeIntegrity`), Config G4 (`provenance`), Config G8 (`hooks.lifecycle`),
 * Config G9 (`plugins.order`/`capabilities`), and Config G10 (`driftGates`)
 * are modelled. Still proposed only: G2 rule registries / requireDescriptions,
 * G7 runtime config (see manifest-config-vnext.md). The JSON schema at
 * docs/spec/config/manifest.config.schema.json remains the executable contract
 * that `manifest config validate` enforces for the YAML/build config.
 */

import type { NamingConventionInput } from './projections/shared/naming.js';
import {
  resolveNamingConfig,
  extractNamingConvention,
  type ManifestNamingInput,
  type ResolvedNamingConfig,
} from './naming-config.js';
import type { ManifestMergeIntegrityConfig } from './merge-integrity.js';
import type { ManifestProvenanceConfig } from './provenance-config.js';

export type { NamingConventionInput };
export type {
  ManifestMergeIntegrityConfig,
  MergeDuplicatePolicy,
  ResolvedMergeIntegrity,
} from './merge-integrity.js';
export { resolveMergeIntegrity, dedupeLastByKey } from './merge-integrity.js';
export type {
  ManifestProvenanceConfig,
  ProvenanceFieldToken,
  ProvenanceLockfile,
  ResolvedProvenanceConfig,
} from './provenance-config.js';
export {
  DETERMINISTIC_COMPILED_AT,
  buildProvenanceLockfile,
  checkProvenanceLockfileStale,
  resolveCompiledAt,
  resolveProvenanceConfig,
} from './provenance-config.js';
export {
  resolveNamingConfig,
  extractNamingConvention,
  validateNamingConfig,
  type ManifestNamingInput,
  type ResolvedNamingConfig,
  type NamingRuleSeverity,
  type NamingCasing,
  type NamingNormalizationConfig,
} from './naming-config.js';
export {
  detectStorageNameChanges,
  type PriorStorageSnapshot,
  type ProposedStorageNames,
} from './naming-storage-guard.js';
export {
  nameKey,
  canonicalEntityName,
  canonicalFieldName,
  canonicalTableName,
  relationshipIdField,
  CanonicalNameRegistry,
} from './canonical-names.js';

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

/** Config G8 — build lifecycle scripts around compile / generate. */
export interface ManifestLifecycleHooksConfig {
  /** Scripts (paths relative to cwd) run before `manifest compile`. */
  beforeCompile?: string[];
  /** Scripts run after a successful `manifest generate` / `generate --all`. */
  afterGenerate?: string[];
}

/**
 * Hook settings: git pre-commit (`manifest install-hooks`) plus optional
 * Config G8 build lifecycle scripts.
 */
export interface ManifestHooksConfig {
  /** Skip running the generated hook in CI environments. Default: true. */
  skipInCi?: boolean;
  /** Git hook manager the pre-commit hook is installed into. Default: 'husky'. */
  provider?: 'husky' | 'simple-git-hooks';
  /** Run `manifest fmt` from the generated pre-commit hook. Default: true. */
  runFmt?: boolean;
  /** Run `manifest validate` from the generated pre-commit hook. Default: true. */
  runValidate?: boolean;
  /** Config G8 — build lifecycle hooks (not git hooks). */
  lifecycle?: ManifestLifecycleHooksConfig;
}

/** Declares a Manifest plugin for the CLI to load. */
export interface ManifestPluginDeclaration {
  /** npm package name or relative file path to the plugin module. */
  module: string;
  /** Plugin-specific options passed at load time. */
  options?: Record<string, unknown>;
  /** Whether the plugin is active. Default: true. */
  enabled?: boolean;
  /**
   * Config G9 — load priority (lower first). Omitted entries sort after ordered ones.
   */
  order?: number;
  /**
   * Config G9 — capability tags (`storeAdapter`, `auditSink`, `builtin`,
   * `cliCommand`, `projection`, or host-defined tags).
   */
  capabilities?: string[];
}

/** Config G2 — CI exit policy (does not alter language severities). */
export type ManifestValidationFailOn = 'block' | 'warn' | 'never';

export interface ManifestValidationConfig {
  /**
   * When compile/validate should exit non-zero after reporting diagnostics.
   * - `block` (default): errors only
   * - `warn`: errors or warnings
   * - `never`: always exit 0 (report-only)
   */
  failOn?: ManifestValidationFailOn;
}

/** Config G10 — declarative CI drift gates (`manifest ci-gate`). */
export interface ManifestDriftGatesConfig {
  /** Committed effective-config snapshot path (`manifest config inspect --json`). */
  effectiveConfigSnapshot?: string;
  /** Compare live effective config to the snapshot. Default true when path set. */
  failOnConfigDrift?: boolean;
  /** Fail when `generate --all --check` reports artifact drift. Default false. */
  failOnGeneratedDrift?: boolean;
  /** Require every IR file's `version` to equal this string. */
  pinIrSchemaVersion?: string;
}

/** Per-projection config block (e.g. nextjs, routes, prisma). */
export interface ManifestProjectionConfig {
  /** Directory where this projection's artifacts are written. */
  output?: string;
  /** Surface-specific options. See the projection's option reference. */
  options?: Record<string, unknown>;
}

/**
 * Meta keys under `projections` that are not projection targets (Config G5).
 * `manifest generate --all` must skip these when iterating configured names.
 */
export const PROJECTION_META_KEYS = ['enabled', 'defaults'] as const;

export type ProjectionMetaKey = (typeof PROJECTION_META_KEYS)[number];

/** True for `projections.enabled` / `projections.defaults` (not a target name). */
export function isProjectionMetaKey(name: string): name is ProjectionMetaKey {
  return name === 'enabled' || name === 'defaults';
}

/**
 * Projection map plus Config G5 controls:
 * - `enabled` — when set, `manifest generate --all` runs only these names (order preserved)
 * - `defaults` — shared options merged under each projection's own `options`
 *
 * Named projection blocks remain `{ output?, options? }`.
 */
export type ManifestProjectionsConfig = {
  /** Explicit opt-in list for `manifest generate --all`. Absent = all declared targets. */
  enabled?: string[];
  /** Shared options merged under each projection's `options` (per-projection wins). */
  defaults?: Record<string, unknown>;
} & {
  [projectionName: string]:
    ManifestProjectionConfig | string[] | Record<string, unknown> | undefined;
};

/**
 * Names `manifest generate --all` should run for this projections map.
 * When `enabled` is set, returns that list (order preserved); otherwise every
 * non-meta key. Does not require each name to have an `output` block — the
 * generate driver still skips missing outputs with a warning.
 */
export function listConfiguredProjectionNames(
  projections: ManifestProjectionsConfig | Record<string, unknown> | undefined | null,
): string[] {
  if (!projections || typeof projections !== 'object') return [];
  const enabled = (projections as ManifestProjectionsConfig).enabled;
  if (Array.isArray(enabled)) {
    return enabled.filter((name): name is string => typeof name === 'string' && name.length > 0);
  }
  return Object.keys(projections).filter((key) => !isProjectionMetaKey(key));
}

/** Read a named projection block, or undefined for meta keys / missing / wrong shape. */
export function getProjectionBlock(
  projections: ManifestProjectionsConfig | Record<string, unknown> | undefined | null,
  name: string,
): ManifestProjectionConfig | undefined {
  if (!projections || isProjectionMetaKey(name)) return undefined;
  const block = projections[name];
  if (!block || typeof block !== 'object' || Array.isArray(block)) return undefined;
  return block as ManifestProjectionConfig;
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
  /** Auto-emit inverse relation fields for one-sided belongsTo/ref. Default false. */
  autoBackRelations?: boolean;
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
  /**
   * Config G2 — CI exit policy for compile/validate.
   * Does not change language diagnostic severities.
   */
  validation?: ManifestValidationConfig;
  /**
   * Config G3 — cross-file name collision policy for multi-module compile.
   * Default: `error` (unchanged from historical strict merge).
   */
  mergeIntegrity?: ManifestMergeIntegrityConfig;
  /**
   * Config G4 — IR provenance stamps (deterministic compiledAt, lockfile,
   * failIfStale). IR always includes required provenance fields.
   */
  provenance?: ManifestProvenanceConfig;
  /** Config G10 — declarative drift gates for `manifest ci-gate`. */
  driftGates?: ManifestDriftGatesConfig;
  /**
   * Per-projection config blocks, keyed by projection name, plus optional
   * Config G5 `enabled` / `defaults` meta keys.
   */
  projections?: ManifestProjectionsConfig;
  /** Environment-variable declarations for `manifest preflight`. */
  env?: ManifestEnvMapping;
  /** Git pre-commit hook settings for `manifest install-hooks`. */
  hooks?: ManifestHooksConfig;
  /** Third-party plugin declarations loaded by the CLI. */
  plugins?: ManifestPluginDeclaration[];
  /**
   * Identifier naming policy.
   *
   * Legacy (still supported): `'snake_case'` or `{ table, column, pluralizeTables }`
   * — physical projection convention only; normalization stays off.
   *
   * Expanded: `{ normalization: true, entities: { casing: 'pascal', mismatch: 'fix' }, … }`
   * — see `docs/spec/config/manifest.config.md` § naming.
   */
  naming?: ManifestNamingInput;
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
 * Build a fail-soft user resolver from `ManifestRuntimeConfig.resolveUser`.
 * Missing/throwing resolvers yield `null` (caller decides fail-closed vs anonymous).
 */
export function createUserResolver(
  config: ManifestRuntimeConfig | null | undefined,
): (auth: ManifestAuthContext) => Promise<ManifestUserContext | null> {
  if (!config?.resolveUser) {
    return async () => null;
  }
  const resolveUser = config.resolveUser;
  return async (auth: ManifestAuthContext): Promise<ManifestUserContext | null> => {
    try {
      return await resolveUser(auth);
    } catch (error) {
      console.error('Failed to resolve user:', error instanceof Error ? error.message : error);
      return null;
    }
  };
}

/** True when config provides a `resolveUser` function. */
export function hasUserResolver(config: ManifestRuntimeConfig | null | undefined): boolean {
  return typeof config?.resolveUser === 'function';
}

/**
 * Resolve the option bag a projection receives, layering the build-level global
 * physical `naming` convention UNDER the projection's own `options` when the
 * projection did not set `options.naming`. When app-wide `naming.normalization`
 * is enabled, the resolved policy is also injected as internal
 * `__manifestNaming`; Convex ignores local `options.naming` in that case so
 * one projection cannot silently invent a second spelling.
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
  if (isProjectionMetaKey(projectionName)) {
    return {};
  }
  const sharedDefaults = readProjectionDefaults(build?.projections);
  const block = getProjectionBlock(build?.projections, projectionName);
  const projectionOptions = {
    ...sharedDefaults,
    ...(block?.options ?? {}),
  };
  const convention = extractNamingConvention(build?.naming);
  if (convention !== undefined && projectionOptions.naming === undefined) {
    projectionOptions.naming = convention;
  }
  // Surface resolved normalization policy for projections that honor legacy
  // storage mappings (e.g. Convex table/field remaps under naming.projections).
  const resolved = resolveNamingConfig(build?.naming);
  if (resolved.normalization || Object.keys(resolved.projections).length > 0) {
    projectionOptions.__manifestNaming = resolved;
  }
  return projectionOptions;
}

function readProjectionDefaults(
  projections: ManifestProjectionsConfig | undefined,
): Record<string, unknown> {
  const defaults = projections?.defaults;
  if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) {
    return {};
  }
  return { ...defaults };
}

/** Public helper for Builder / `manifest config inspect`. */
export function resolveBuildNaming(build: ManifestBuildConfig | undefined): ResolvedNamingConfig {
  return resolveNamingConfig(build?.naming);
}
