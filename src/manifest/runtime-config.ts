/**
 * Config G7 — central runtime build knobs (generation fan-in).
 *
 * Shipped: executionMode → nextjs dispatcher; deterministicMode / stores /
 * forbidWallClock+seed (now/generateId) / defaultContext → web factories;
 * concurrency.maxParallelCommands → RuntimeOptions.maxParallelCommands.
 */

export const RUNTIME_EXECUTION_MODES = ['inline', 'externalExecutor'] as const;
export type RuntimeExecutionMode = (typeof RUNTIME_EXECUTION_MODES)[number];

/** Projections that honor `runtime.stores` → `runtimeConfigImport` fan-in. */
export const RUNTIME_STORE_FANIN_PROJECTIONS = [
  'nextjs',
  'express',
  'hono',
  'remix',
  'sveltekit',
] as const;

export interface ManifestRuntimeDeterminismConfig {
  /** Maps to RuntimeOptions.deterministicMode on the generated factory. */
  deterministicMode?: boolean;
  /** When true, factory injects RuntimeOptions.now (no Date.now fallback). */
  forbidWallClock?: boolean;
  /** Fixed clock ms when forbidWallClock; also seeds generateId sequence. */
  seed?: number;
}

export interface ManifestRuntimeConcurrencyConfig {
  /**
   * Maps to RuntimeOptions.maxParallelCommands on the generated factory.
   * Positive integer only; invalid values are ignored (unlimited).
   */
  maxParallelCommands?: number;
}

export interface ManifestRuntimeBuildConfig {
  /** Single source for dispatcher execution mode (nextjs). Default: inline. */
  executionMode?: RuntimeExecutionMode;
  determinism?: ManifestRuntimeDeterminismConfig;
  /**
   * Import path for store bindings (`ManifestRuntimeConfig` module).
   * Fans into projection `runtimeConfigImport` when that key is unset.
   */
  stores?: string;
  /** Merged under caller context in createManifestRuntime (caller wins). */
  defaultContext?: Record<string, unknown>;
  /** Top-level parallel runCommand budget for generated factories. */
  concurrency?: ManifestRuntimeConcurrencyConfig;
}

export interface ResolvedRuntimeConfig {
  executionMode: RuntimeExecutionMode;
  deterministicMode: boolean;
  storesPath: string | undefined;
  forbidWallClock: boolean;
  seed: number | undefined;
  defaultContext: Record<string, unknown> | undefined;
  maxParallelCommands: number | undefined;
}

/** Internal bag key injected by resolveProjectionOptions. */
export const MANIFEST_RUNTIME_BAG_KEY = '__manifestRuntime';

export interface ManifestRuntimeBagMeta {
  executionMode: RuntimeExecutionMode;
  deterministicMode: boolean;
  storesPath?: string;
  forbidWallClock: boolean;
  seed?: number;
  defaultContext?: Record<string, unknown>;
  maxParallelCommands?: number;
}

export function isRuntimeExecutionMode(value: unknown): value is RuntimeExecutionMode {
  return (
    typeof value === 'string' && (RUNTIME_EXECUTION_MODES as readonly string[]).includes(value)
  );
}

function resolveSeed(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
}

function resolveMaxParallelCommands(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 ? raw : undefined;
}

function resolveDefaultContext(
  raw: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  try {
    return JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export function resolveRuntimeConfig(
  raw: ManifestRuntimeBuildConfig | undefined,
): ResolvedRuntimeConfig {
  const storesPath =
    typeof raw?.stores === 'string' && raw.stores.trim().length > 0 ? raw.stores.trim() : undefined;
  return {
    executionMode: isRuntimeExecutionMode(raw?.executionMode) ? raw.executionMode : 'inline',
    deterministicMode: raw?.determinism?.deterministicMode === true,
    storesPath,
    forbidWallClock: raw?.determinism?.forbidWallClock === true,
    seed: resolveSeed(raw?.determinism?.seed),
    defaultContext: resolveDefaultContext(raw?.defaultContext),
    maxParallelCommands: resolveMaxParallelCommands(raw?.concurrency?.maxParallelCommands),
  };
}

/**
 * Apply top-level `runtime` onto a projection option bag.
 * Per-projection `dispatcher.executionMode` / `runtimeConfigImport` win when set.
 */
export function applyRuntimeConfigToProjectionOptions(
  runtime: ManifestRuntimeBuildConfig | undefined,
  projectionName: string,
  bag: Record<string, unknown>,
): void {
  const resolved = resolveRuntimeConfig(runtime);
  const meta: ManifestRuntimeBagMeta = {
    executionMode: resolved.executionMode,
    deterministicMode: resolved.deterministicMode,
    storesPath: resolved.storesPath,
    forbidWallClock: resolved.forbidWallClock,
    seed: resolved.seed,
    defaultContext: resolved.defaultContext,
    maxParallelCommands: resolved.maxParallelCommands,
  };
  bag[MANIFEST_RUNTIME_BAG_KEY] = meta;

  if (
    resolved.storesPath &&
    (RUNTIME_STORE_FANIN_PROJECTIONS as readonly string[]).includes(projectionName) &&
    bag.runtimeConfigImport === undefined
  ) {
    bag.runtimeConfigImport = resolved.storesPath;
  }

  if (projectionName !== 'nextjs') return;
  if (runtime?.executionMode === undefined) return;

  const existing = bag.dispatcher;
  const dispatcher =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  if (dispatcher.executionMode === undefined) {
    dispatcher.executionMode = resolved.executionMode;
    bag.dispatcher = dispatcher;
  }
}

/** Read injected meta from a projection options / normalized bag. */
export function readManifestRuntimeMeta(
  options: Record<string, unknown> | undefined,
): ManifestRuntimeBagMeta | undefined {
  const raw = options?.[MANIFEST_RUNTIME_BAG_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const rec = raw as Record<string, unknown>;
  const storesPath =
    typeof rec.storesPath === 'string' && rec.storesPath.trim().length > 0
      ? rec.storesPath.trim()
      : undefined;
  return {
    executionMode: isRuntimeExecutionMode(rec.executionMode) ? rec.executionMode : 'inline',
    deterministicMode: rec.deterministicMode === true,
    storesPath,
    forbidWallClock: rec.forbidWallClock === true,
    seed: resolveSeed(rec.seed),
    defaultContext: resolveDefaultContext(
      rec.defaultContext as Record<string, unknown> | undefined,
    ),
    maxParallelCommands: resolveMaxParallelCommands(rec.maxParallelCommands),
  };
}

export interface RuntimeFactoryFanIn {
  deterministicMode: boolean;
  runtimeConfigImport: string | undefined;
  forbidWallClock: boolean;
  seed: number | undefined;
  defaultContext: Record<string, unknown> | undefined;
  maxParallelCommands: number | undefined;
}

/** Factory knobs for companions — reads bag meta + optional explicit import. */
export function resolveRuntimeFactoryFanIn(
  options: Record<string, unknown> | undefined,
): RuntimeFactoryFanIn {
  const meta = readManifestRuntimeMeta(options);
  const explicit =
    typeof options?.runtimeConfigImport === 'string' &&
    options.runtimeConfigImport.trim().length > 0
      ? options.runtimeConfigImport.trim()
      : undefined;
  return {
    deterministicMode: meta?.deterministicMode === true,
    runtimeConfigImport: explicit ?? meta?.storesPath,
    forbidWallClock: meta?.forbidWallClock === true,
    seed: meta?.seed,
    defaultContext: meta?.defaultContext,
    maxParallelCommands: meta?.maxParallelCommands,
  };
}
