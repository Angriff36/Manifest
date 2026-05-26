/**
 * Manifest Plugin API — stable contract for third-party extensions.
 *
 * Exposes five extension points that map 1:1 to existing internal interfaces:
 *   1. Projection targets  (code generators)
 *   2. Store adapters       (persistence backends)
 *   3. Audit sinks          (audit trail consumers)
 *   4. Builtin functions    (expression evaluation extensions)
 *   5. CLI commands         (CLI extensions)
 *
 * Plugins are loaded via `@angriff36/manifest/plugin-loader` and declared in
 * `manifest.config.yaml` under the `plugins` key.
 *
 * IR-FIRST: This API has no IR mutation hooks. Plugins extend tooling and
 * runtime, never language semantics.
 */

import type { ProjectionTarget } from './projections/interface';
import type { AuditSink } from './audit/audit-sink';
import type { IR } from './ir';

// ---------------------------------------------------------------------------
// API Versioning
// ---------------------------------------------------------------------------

/** Current Plugin API version. Plugins must declare this exact value. */
export const PLUGIN_API_VERSION = '1';

// ---------------------------------------------------------------------------
// Shared Types
// ---------------------------------------------------------------------------

/**
 * Minimal CLI program interface — decoupled from commander.js so plugins
 * don't need to import commander as a dependency.
 */
export interface CliProgramLike {
  command(name: string): { description(d: string): { action(fn: (...args: unknown[]) => void | Promise<void>): unknown } };
}

/**
 * Entity instance shape — matches runtime-engine.ts EntityInstance.
 */
export interface EntityInstance {
  id: string;
  [key: string]: unknown;
}

/**
 * Store interface — matches runtime-engine.ts Store<T>.
 */
export interface Store<T extends EntityInstance = EntityInstance> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | undefined>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T | undefined>;
  delete(id: string): Promise<boolean>;
  clear(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Plugin Manifest
// ---------------------------------------------------------------------------

/**
 * Static metadata every plugin must embed.
 */
export interface PluginManifest {
  /** Unique plugin identifier (npm-style: '@scope/name' or 'name'). */
  name: string;
  /** Plugin's own SemVer version. */
  version: string;
  /** Must match PLUGIN_API_VERSION exactly. */
  pluginApiVersion: typeof PLUGIN_API_VERSION;
  /** SemVer range for compatible Manifest package versions. */
  manifestVersion: string;
  /** Optional human-readable description. */
  description?: string;
}

// ---------------------------------------------------------------------------
// Extension Point: Store Adapters
// ---------------------------------------------------------------------------

/**
 * Store adapter plugin. Registered by URI scheme and used by the runtime
 * engine's storeProvider to create Store instances for entities.
 */
export interface StoreAdapterPlugin {
  /** URI scheme this adapter handles (e.g. 'redis', 'dynamodb'). */
  scheme: string;
  /**
   * Factory to create a Store for the given entity.
   * @param entityName - IR entity name
   * @param options - Plugin-specific options from manifest.config.yaml
   */
  createStore(entityName: string, options?: Record<string, unknown>): Store | Promise<Store>;
}

// ---------------------------------------------------------------------------
// Extension Point: Audit Sinks
// ---------------------------------------------------------------------------

/**
 * Audit sink plugin. Provides a named AuditSink factory.
 */
export interface AuditSinkPlugin {
  /** Unique sink identifier (e.g. 'opentelemetry', 'datadog'). */
  id: string;
  /**
   * Factory to create an AuditSink.
   * @param options - Plugin-specific options from manifest.config.yaml
   */
  createSink(options?: Record<string, unknown>): AuditSink | Promise<AuditSink>;
}

// ---------------------------------------------------------------------------
// Extension Point: Builtin Functions
// ---------------------------------------------------------------------------

/** Purity classification for builtin functions. */
export type BuiltinPurity = 'pure' | 'time-dependent' | 'random';

/**
 * Builtin function plugin. Extends the runtime engine's expression evaluator
 * with custom functions.
 *
 * RESERVED NAMES (cannot be overridden):
 *   now, uuid, trim, split, count, startsWith, endsWith, replace,
 *   toUpperCase, toLowerCase, length, substring, indexOf,
 *   abs, round, floor, ceil, min, max, between, sum,
 *   year, month, day, hours, minutes, seconds
 */
export interface BuiltinFunctionPlugin {
  /** Function name (must not collide with reserved builtins). */
  name: string;
  /** Purity declaration — enables future static analysis. */
  purity: BuiltinPurity;
  /** Number of required arguments (-1 for variadic). */
  arity: number;
  /** The function implementation. */
  fn: (...args: unknown[]) => unknown;
}

// ---------------------------------------------------------------------------
// Extension Point: CLI Commands
// ---------------------------------------------------------------------------

/**
 * CLI command plugin. Receives a minimal program interface to register
 * commands without coupling to commander.js.
 */
export interface CliCommandPlugin {
  /** Command name (e.g. 'my-command'). */
  name: string;
  /** Register the command with the CLI program. */
  register(program: CliProgramLike): void;
}

// ---------------------------------------------------------------------------
// Plugin Context
// ---------------------------------------------------------------------------

/**
 * Runtime context passed to plugin onLoad hooks.
 */
export interface PluginContext {
  /** Compiled IR (available after compile phase). */
  ir?: IR;
  /** Plugin-specific options from manifest.config.yaml. */
  options: Record<string, unknown>;
  /** Manifest package version. */
  manifestVersion: string;
}

// ---------------------------------------------------------------------------
// ManifestPlugin — Top-level Plugin Contract
// ---------------------------------------------------------------------------

/**
 * A Manifest plugin. Plugins export this interface (as default or named
 * `plugin` export) and the loader discovers and validates it.
 */
export interface ManifestPlugin {
  /** Required static metadata. */
  manifest: PluginManifest;
  /** Projection targets to register. */
  projections?: ProjectionTarget[];
  /** Store adapter factories. */
  storeAdapters?: StoreAdapterPlugin[];
  /** Audit sink factories. */
  auditSinks?: AuditSinkPlugin[];
  /** Expression builtin functions. */
  builtins?: BuiltinFunctionPlugin[];
  /** CLI command extensions. */
  cliCommands?: CliCommandPlugin[];
  /** Lifecycle hook — called after the plugin is loaded and validated. */
  onLoad?(ctx: PluginContext): void | Promise<void>;
}

// ---------------------------------------------------------------------------
// definePlugin Helper
// ---------------------------------------------------------------------------

/**
 * Type-safe helper for defining a Manifest plugin. Provides compile-time
 * validation of the plugin shape.
 *
 * @example
 * ```ts
 * import { definePlugin } from '@angriff36/manifest/plugin-api';
 *
 * export default definePlugin({
 *   manifest: {
 *     name: '@acme/manifest-plugin-hono',
 *     version: '1.0.0',
 *     pluginApiVersion: '1',
 *     manifestVersion: '>=1.0.0',
 *     description: 'Hono projection for Manifest',
 *   },
 *   projections: [honoProjection],
 *   storeAdapters: [redisStoreAdapter],
 * });
 * ```
 */
export function definePlugin(plugin: ManifestPlugin): ManifestPlugin {
  // Runtime shape validation
  if (!plugin.manifest) {
    throw new Error('Plugin must have a manifest property');
  }
  if (!plugin.manifest.name) {
    throw new Error('Plugin manifest must have a name');
  }
  if (!plugin.manifest.version) {
    throw new Error('Plugin manifest must have a version');
  }
  if (plugin.manifest.pluginApiVersion !== PLUGIN_API_VERSION) {
    throw new Error(
      `Plugin "${plugin.manifest.name}" declares pluginApiVersion "${plugin.manifest.pluginApiVersion}" ` +
      `but current API version is "${PLUGIN_API_VERSION}"`
    );
  }
  return plugin;
}

// ---------------------------------------------------------------------------
// Reserved Builtin Names
// ---------------------------------------------------------------------------

/**
 * Names reserved by Manifest's built-in expression functions.
 * Plugins cannot register builtins with these names.
 */
export const RESERVED_BUILTIN_NAMES: ReadonlySet<string> = new Set([
  'now', 'uuid',
  'trim', 'split', 'count', 'startsWith', 'endsWith', 'replace',
  'toUpperCase', 'toLowerCase', 'length', 'substring', 'indexOf',
  'abs', 'round', 'floor', 'ceil', 'min', 'max', 'between', 'sum',
  'year', 'month', 'day', 'hours', 'minutes', 'seconds',
]);
