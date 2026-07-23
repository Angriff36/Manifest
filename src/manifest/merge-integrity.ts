/**
 * Config G3 — multi-module merge collision policy.
 *
 * Defaults match today's strict behavior (`error` on duplicate names).
 * `lastWins` keeps the declaration from the last file in topological order.
 */

export const MERGE_DUPLICATE_POLICIES = ['error', 'lastWins'] as const;
export type MergeDuplicatePolicy = (typeof MERGE_DUPLICATE_POLICIES)[number];

export interface ManifestMergeIntegrityConfig {
  /** Duplicate entity names across files. Default: `error`. */
  onDuplicateEntity?: MergeDuplicatePolicy;
  /** Duplicate command names (entity-qualified) across files. Default: `error`. */
  onDuplicateCommand?: MergeDuplicatePolicy;
  /**
   * Module compile order. Only `lexicographic` topo order is supported
   * (already how `resolveModuleGraph` orders files).
   */
  moduleOrder?: 'lexicographic';
  /** Cross-file relationship / store targets. Default: true. */
  allowCrossModuleRefs?: boolean;
  /**
   * Cycle detection in `use` graphs. Must be true (default); `false` is rejected.
   */
  forbidCycles?: boolean;
}

export interface ResolvedMergeIntegrity {
  onDuplicateEntity: MergeDuplicatePolicy;
  onDuplicateCommand: MergeDuplicatePolicy;
  moduleOrder: 'lexicographic';
  allowCrossModuleRefs: boolean;
  forbidCycles: true;
}

export function isMergeDuplicatePolicy(value: unknown): value is MergeDuplicatePolicy {
  return (
    typeof value === 'string' && (MERGE_DUPLICATE_POLICIES as readonly string[]).includes(value)
  );
}

/**
 * Resolve config to a concrete policy. Invalid `forbidCycles: false` throws —
 * cycles are a language invariant, not a CI knob.
 */
export function resolveMergeIntegrity(
  raw: ManifestMergeIntegrityConfig | undefined,
): ResolvedMergeIntegrity {
  if (raw?.forbidCycles === false) {
    throw new Error(
      'MERGE_INTEGRITY_FORBID_CYCLES: mergeIntegrity.forbidCycles cannot be false — cycle detection is required',
    );
  }
  if (raw?.moduleOrder !== undefined && raw.moduleOrder !== 'lexicographic') {
    throw new Error(
      `MERGE_INTEGRITY_MODULE_ORDER: unsupported moduleOrder '${String(raw.moduleOrder)}' (only 'lexicographic')`,
    );
  }

  return {
    onDuplicateEntity: isMergeDuplicatePolicy(raw?.onDuplicateEntity)
      ? raw.onDuplicateEntity
      : 'error',
    onDuplicateCommand: isMergeDuplicatePolicy(raw?.onDuplicateCommand)
      ? raw.onDuplicateCommand
      : 'error',
    moduleOrder: 'lexicographic',
    allowCrossModuleRefs: raw?.allowCrossModuleRefs !== false,
    forbidCycles: true,
  };
}

/** Keep the last item per key (topo order / concatenation order). */
export function dedupeLastByKey<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(keyOf(item), item);
  }
  return [...map.values()];
}
