/**
 * Config G9 — deterministic plugin load order + capability declarations.
 *
 * Hosts may set `order` on each plugin declaration. Lower numbers load first.
 * Ties break by `module` string (localeCompare). Missing `order` sorts after
 * any explicit order (stable relative to other unordered entries by module).
 */

/** Minimal declaration shape needed for ordering (avoids circular imports). */
export interface OrderablePluginDeclaration {
  module: string;
  order?: number;
  capabilities?: string[];
  enabled?: boolean;
  options?: Record<string, unknown>;
}

/** Well-known capability tags plugins may advertise in config. */
export const PLUGIN_CAPABILITY_KINDS = [
  'storeAdapter',
  'auditSink',
  'builtin',
  'cliCommand',
  'projection',
] as const;

export type PluginCapabilityKind = (typeof PLUGIN_CAPABILITY_KINDS)[number];

const UNORDERED = Number.POSITIVE_INFINITY;

/**
 * Return a new array sorted for deterministic `loadPlugins` application.
 * Does not mutate the input.
 */
export function sortPluginDeclarations<T extends OrderablePluginDeclaration>(
  declarations: readonly T[],
): T[] {
  return [...declarations].sort((a, b) => {
    const ao = a.order ?? UNORDERED;
    const bo = b.order ?? UNORDERED;
    if (ao !== bo) return ao - bo;
    return a.module.localeCompare(b.module);
  });
}

/**
 * Normalize capability tags from a declaration. Unknown tags are kept (host
 * extension) but returned separately so the loader can emit an info diagnostic.
 */
export function normalizePluginCapabilities(raw: readonly string[] | undefined): {
  capabilities: string[];
  unknown: string[];
} {
  if (!raw || raw.length === 0) return { capabilities: [], unknown: [] };
  const known = new Set<string>(PLUGIN_CAPABILITY_KINDS);
  const capabilities: string[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const tag of raw) {
    const trimmed = tag.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    capabilities.push(trimmed);
    if (!known.has(trimmed)) unknown.push(trimmed);
  }
  return { capabilities, unknown };
}
