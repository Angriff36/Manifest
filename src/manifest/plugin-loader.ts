/**
 * Manifest Plugin Loader — resolves, validates, and loads plugins.
 *
 * Plugins are declared in `manifest.config.yaml` under `plugins` and loaded
 * via dynamic import. The loader validates plugin shape, checks compatibility
 * versions, registers projections, and builds composite registries for stores,
 * audit sinks, builtins, and CLI commands.
 *
 * Usage:
 * ```ts
 * import { loadPlugins } from '@angriff36/manifest/plugin-loader';
 * const result = await loadPlugins(declarations, { manifestVersion: '1.0.5' });
 * ```
 */

import { pathToFileURL } from 'node:url';
import { resolve, isAbsolute } from 'node:path';
import { createRequire } from 'node:module';
import {
  PLUGIN_API_VERSION,
  RESERVED_BUILTIN_NAMES,
  BUILTIN_STORE_TARGETS,
  type ManifestPlugin,
  type Store,
  type PluginContext,
  type StoreAdapterPlugin,
  type AuditSinkPlugin,
  type CliCommandPlugin,
  type CliProgramLike,
} from './plugin-api.js';
import type { AuditSink, AuditRecord } from './audit/audit-sink.js';
import { registerProjection } from './projections/registry.js';

// ---------------------------------------------------------------------------
// Plugin Declaration (from config)
// ---------------------------------------------------------------------------

/**
 * A plugin declaration from manifest.config.yaml.
 */
export interface PluginDeclaration {
  /** npm package name or relative file path. */
  module: string;
  /** Plugin-specific options (forwarded to onLoad and factories). */
  options?: Record<string, unknown>;
  /** Whether the plugin is active (default: true). */
  enabled?: boolean;
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export type PluginDiagnosticSeverity = 'error' | 'warning' | 'info';

export interface PluginDiagnostic {
  severity: PluginDiagnosticSeverity;
  pluginName?: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Loader Options
// ---------------------------------------------------------------------------

export interface PluginLoaderOptions {
  /** Current Manifest package version for compatibility checks. */
  manifestVersion: string;
  /** Base directory for resolving relative plugin paths. */
  cwd?: string;
}

// ---------------------------------------------------------------------------
// Loaded Plugin Registries (composite result)
// ---------------------------------------------------------------------------

/**
 * Composite store provider built from all loaded store adapter plugins.
 * Maps entity names to stores via scheme lookup.
 */
export type CompositeStoreProvider = (entityName: string, scheme?: string) => Store | undefined;

/**
 * Composite audit sink that fans out to all loaded sink plugins.
 */
export interface CompositeAuditSink {
  emit(record: AuditRecord): Promise<void>;
  readonly sinkIds: string[];
}

/**
 * Result of loading all plugins.
 */
export interface LoadedPluginRegistries {
  /** Store provider aggregating all loaded store adapters. */
  storeProvider: CompositeStoreProvider;
  /** Builtins map from all loaded plugins. */
  builtins: Map<string, (...args: unknown[]) => unknown>;
  /** Audit sink factories by id. */
  auditSinkFactories: Map<string, (options?: Record<string, unknown>) => AuditSink | Promise<AuditSink>>;
  /** CLI command registrations from all loaded plugins. */
  cliCommands: Array<{ pluginName: string; command: CliCommandPlugin }>;
  /** All loaded plugins (for inspection). */
  loadedPlugins: ManifestPlugin[];
  /** Diagnostics from the loading process. */
  diagnostics: PluginDiagnostic[];
}

// ---------------------------------------------------------------------------
// SemVer Range Matching (minimal, no external deps)
// ---------------------------------------------------------------------------

/**
 * Minimal SemVer range check. Supports:
 *   - Exact: "1.0.5"
 *   - GTE: ">=1.0.0"
 *   - Caret: "^1.0.0" (>=1.0.0 <2.0.0), "^0.3.0" (>=0.3.0 <0.4.0)
 *   - Tilde: "~1.0.0" (>=1.0.0 <1.1.0)
 *   - Compound: ">=1.0.0 <2.0.0"
 */
function satisfiesSemVerRange(version: string, range: string): boolean {
  const parts = parseVersion(version);
  if (!parts) return false;

  // Split compound ranges by space
  const constraints = range.trim().split(/\s+/);

  return constraints.every((constraint) => {
    const trimmed = constraint.trim();
    if (trimmed.startsWith('>=')) {
      const target = parseVersion(trimmed.slice(2));
      return target ? compareVersion(parts, target) >= 0 : false;
    }
    if (trimmed.startsWith('<')) {
      const target = parseVersion(trimmed.slice(1));
      return target ? compareVersion(parts, target) < 0 : false;
    }
    if (trimmed.startsWith('^')) {
      const target = parseVersion(trimmed.slice(1));
      if (!target) return false;
      if (compareVersion(parts, target) < 0) return false;
      if (target.major > 0) return parts.major === target.major;
      if (target.minor > 0) return parts.major === 0 && parts.minor === target.minor;
      return parts.major === 0 && parts.minor === 0;
    }
    if (trimmed.startsWith('~')) {
      const target = parseVersion(trimmed.slice(1));
      if (!target) return false;
      if (compareVersion(parts, target) < 0) return false;
      return parts.major === target.major && parts.minor === target.minor;
    }
    // Exact match
    const target = parseVersion(trimmed);
    return target ? compareVersion(parts, target) === 0 : false;
  });
}

interface SemVerParts { major: number; minor: number; patch: number }

function parseVersion(v: string): SemVerParts | null {
  const m = v.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: parseInt(m[1], 10), minor: parseInt(m[2], 10), patch: parseInt(m[3], 10) };
}

function compareVersion(a: SemVerParts, b: SemVerParts): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

// ---------------------------------------------------------------------------
// Plugin Shape Validation
// ---------------------------------------------------------------------------

function validatePluginShape(raw: unknown, moduleName: string): { plugin: ManifestPlugin; errors: string[] } {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return { plugin: raw as ManifestPlugin, errors: [`Plugin "${moduleName}" did not export an object`] };
  }

  const obj = raw as Record<string, unknown>;

  // Support both default export and named `plugin` export
  const candidate = (obj.default && typeof obj.default === 'object' ? obj.default : obj) as Record<string, unknown>;

  if (!candidate.manifest || typeof candidate.manifest !== 'object') {
    errors.push(`Plugin "${moduleName}" is missing required "manifest" property`);
  } else {
    const m = candidate.manifest as Record<string, unknown>;
    if (!m.name || typeof m.name !== 'string') errors.push(`Plugin "${moduleName}" manifest.name is missing or not a string`);
    if (!m.version || typeof m.version !== 'string') errors.push(`Plugin "${moduleName}" manifest.version is missing or not a string`);
    if (m.pluginApiVersion !== PLUGIN_API_VERSION) {
      errors.push(`Plugin "${moduleName}" manifest.pluginApiVersion is "${m.pluginApiVersion}" but current API version is "${PLUGIN_API_VERSION}"`);
    }
  }

  return { plugin: candidate as unknown as ManifestPlugin, errors };
}

// ---------------------------------------------------------------------------
// Module Resolution
// ---------------------------------------------------------------------------

async function resolvePluginModule(moduleSpecifier: string, cwd: string): Promise<string> {
  // Absolute path or relative path starting with ./
  if (isAbsolute(moduleSpecifier) || moduleSpecifier.startsWith('./') || moduleSpecifier.startsWith('../')) {
    return pathToFileURL(resolve(cwd, moduleSpecifier)).href;
  }

  // npm package — resolve via createRequire
  try {
    const req = createRequire(resolve(cwd, 'package.json'));
    return pathToFileURL(req.resolve(moduleSpecifier)).href;
  } catch {
    // Fall back to bare specifier (some runtimes handle this)
    return moduleSpecifier;
  }
}

// ---------------------------------------------------------------------------
// Composite Helpers
// ---------------------------------------------------------------------------

function buildCompositeStoreProvider(
  adapters: Array<{ plugin: StoreAdapterPlugin; options?: Record<string, unknown> }>
): CompositeStoreProvider {
  const schemeMap = new Map<string, StoreAdapterPlugin>();
  const optionsMap = new Map<string, Record<string, unknown> | undefined>();
  for (const entry of adapters) {
    if (schemeMap.has(entry.plugin.scheme)) {
      // First registered wins — duplicate schemes are skipped
      continue;
    }
    schemeMap.set(entry.plugin.scheme, entry.plugin);
    optionsMap.set(entry.plugin.scheme, entry.options);
  }

  const instanceCache = new Map<string, Store>();

  return (entityName: string, scheme?: string): Store | undefined => {
    if (!scheme) return undefined;
    const adapter = schemeMap.get(scheme);
    if (!adapter) return undefined;

    const cacheKey = `${scheme}:${entityName}`;
    const cached = instanceCache.get(cacheKey);
    if (cached) return cached;

    const opts = optionsMap.get(scheme);
    const store = adapter.createStore(entityName, opts) as Store;
    instanceCache.set(cacheKey, store);
    return store;
  };
}

function buildCompositeAuditSinks(
  sinkPlugins: Array<{ plugin: AuditSinkPlugin; options?: Record<string, unknown> }>
): { factories: Map<string, (options?: Record<string, unknown>) => AuditSink | Promise<AuditSink>>; sinkIds: string[] } {
  const factories = new Map<string, (options?: Record<string, unknown>) => AuditSink | Promise<AuditSink>>();
  const sinkIds: string[] = [];

  for (const entry of sinkPlugins) {
    if (factories.has(entry.plugin.id)) continue;
    sinkIds.push(entry.plugin.id);
    factories.set(entry.plugin.id, (opts) => entry.plugin.createSink(opts ?? entry.options));
  }

  return { factories, sinkIds };
}

// ---------------------------------------------------------------------------
// Main Loader
// ---------------------------------------------------------------------------

/**
 * Load and validate all declared plugins.
 *
 * @param declarations - Plugin declarations from manifest.config.yaml
 * @param opts - Loader options
 * @returns Composite registries and diagnostics
 */
export async function loadPlugins(
  declarations: PluginDeclaration[],
  opts: PluginLoaderOptions,
): Promise<LoadedPluginRegistries> {
  const cwd = opts.cwd ?? process.cwd();
  const diagnostics: PluginDiagnostic[] = [];
  const loadedPlugins: ManifestPlugin[] = [];
  const storeAdapters: Array<{ plugin: StoreAdapterPlugin; options?: Record<string, unknown> }> = [];
  const auditSinkPlugins: Array<{ plugin: AuditSinkPlugin; options?: Record<string, unknown> }> = [];
  const builtinMap = new Map<string, (...args: unknown[]) => unknown>();
  const cliCommands: Array<{ pluginName: string; command: CliCommandPlugin }> = [];
  const auditSinkFactories = new Map<string, (options?: Record<string, unknown>) => AuditSink | Promise<AuditSink>>();

  for (const decl of declarations) {
    // Skip disabled plugins
    if (decl.enabled === false) {
      diagnostics.push({ severity: 'info', pluginName: decl.module, message: `Plugin "${decl.module}" is disabled, skipping` });
      continue;
    }

    try {
      // 1. Resolve module path
      const moduleUrl = await resolvePluginModule(decl.module, cwd);

      // 2. Dynamic import
      const rawModule = await import(moduleUrl);

      // 3. Validate shape
      const { plugin, errors } = validatePluginShape(rawModule, decl.module);
      if (errors.length > 0) {
        for (const err of errors) {
          diagnostics.push({ severity: 'error', pluginName: decl.module, message: err });
        }
        continue;
      }

      // 4. Check Manifest version compatibility
      const manifestMeta = plugin.manifest as { name: string; version: string; manifestVersion: string };
      if (!satisfiesSemVerRange(opts.manifestVersion, manifestMeta.manifestVersion)) {
        diagnostics.push({
          severity: 'warning',
          pluginName: manifestMeta.name,
          message: `Plugin "${manifestMeta.name}" requires Manifest ${manifestMeta.manifestVersion} but current version is ${opts.manifestVersion}`,
        });
        continue;
      }

      // 5. Register projections
      if (plugin.projections) {
        for (const proj of plugin.projections) {
          try {
            registerProjection(proj);
          } catch (err) {
            diagnostics.push({
              severity: 'warning',
              pluginName: manifestMeta.name,
              message: `Projection "${proj.name}" registration failed: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
        }
      }

      // 6. Collect store adapters — reject schemes that collide with built-ins
      if (plugin.storeAdapters) {
        for (const adapter of plugin.storeAdapters) {
          if (BUILTIN_STORE_TARGETS.has(adapter.scheme)) {
            diagnostics.push({
              severity: 'error',
              pluginName: manifestMeta.name,
              message: `Store adapter scheme "${adapter.scheme}" from plugin "${manifestMeta.name}" collides with a built-in store target`,
            });
            continue;
          }
          storeAdapters.push({ plugin: adapter, options: decl.options });
        }
      }

      // 7. Collect audit sinks
      if (plugin.auditSinks) {
        for (const sink of plugin.auditSinks) {
          auditSinkPlugins.push({ plugin: sink, options: decl.options });
        }
      }

      // 8. Collect builtins — reject reserved name collisions
      if (plugin.builtins) {
        for (const builtin of plugin.builtins) {
          if (RESERVED_BUILTIN_NAMES.has(builtin.name)) {
            diagnostics.push({
              severity: 'error',
              pluginName: manifestMeta.name,
              message: `Builtin function "${builtin.name}" is reserved and cannot be overridden by plugin "${manifestMeta.name}"`,
            });
            continue;
          }
          if (builtinMap.has(builtin.name)) {
            diagnostics.push({
              severity: 'warning',
              pluginName: manifestMeta.name,
              message: `Builtin function "${builtin.name}" was already registered by another plugin; skipping duplicate from "${manifestMeta.name}"`,
            });
            continue;
          }
          builtinMap.set(builtin.name, builtin.fn);
        }
      }

      // 9. Collect CLI commands
      if (plugin.cliCommands) {
        for (const cmd of plugin.cliCommands) {
          cliCommands.push({ pluginName: manifestMeta.name, command: cmd });
        }
      }

      // 10. onLoad lifecycle hook
      if (plugin.onLoad) {
        const ctx: PluginContext = {
          options: decl.options ?? {},
          manifestVersion: opts.manifestVersion,
        };
        await plugin.onLoad(ctx);
      }

      loadedPlugins.push(plugin);
      diagnostics.push({
        severity: 'info',
        pluginName: manifestMeta.name,
        message: `Plugin "${manifestMeta.name}" v${manifestMeta.version} loaded successfully`,
      });
    } catch (err) {
      diagnostics.push({
        severity: 'error',
        pluginName: decl.module,
        message: `Failed to load plugin "${decl.module}": ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // Build composite registries
  const storeProvider = buildCompositeStoreProvider(storeAdapters);
  const { factories: sinkFactories } = buildCompositeAuditSinks(auditSinkPlugins);
  for (const [id, factory] of sinkFactories) {
    auditSinkFactories.set(id, factory);
  }

  return {
    storeProvider,
    builtins: builtinMap,
    auditSinkFactories,
    cliCommands,
    loadedPlugins,
    diagnostics,
  };
}

/**
 * Register all plugin CLI commands with a CLI program.
 */
export function registerPluginCliCommands(
  cliCommands: Array<{ pluginName: string; command: CliCommandPlugin }>,
  program: CliProgramLike,
): void {
  for (const { command } of cliCommands) {
    command.register(program);
  }
}

// ---------------------------------------------------------------------------
// Exported for testing
// ---------------------------------------------------------------------------

export { satisfiesSemVerRange, validatePluginShape };
