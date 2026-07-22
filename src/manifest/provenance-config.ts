/**
 * Config G4 — IR provenance policy (deterministic stamps + lockfile).
 *
 * IR always carries required provenance fields (schema). This config controls
 * wall-clock vs fixed timestamps, optional lockfile write, and staleness checks.
 */

import type { IRProvenance, IRProvenanceSource } from './ir.js';

/** Fixed timestamp used when `provenance.deterministic` is true. */
export const DETERMINISTIC_COMPILED_AT = '1970-01-01T00:00:00.000Z';

export const PROVENANCE_FIELD_TOKENS = [
  'sourceHash',
  'generatorVersion',
  'irSchemaVersion',
  'gitSha',
] as const;

export type ProvenanceFieldToken = (typeof PROVENANCE_FIELD_TOKENS)[number];

export interface ManifestProvenanceConfig {
  /** When false, skip lockfile write (IR still stamped — required by schema). Default true. */
  stamp?: boolean;
  /**
   * Requested stamp fields. Required IR fields always stamp.
   * `gitSha` is accepted but not written yet (no IR field — deferred).
   */
  fields?: ProvenanceFieldToken[];
  /** Use a fixed compiledAt (no wall clock). Default false. */
  deterministic?: boolean;
  /** Path for provenance lockfile (relative to cwd). */
  lockfile?: string;
  /**
   * When true and a lockfile exists: if source contentHash matches the lock
   * but irHash differs under deterministic mode, fail (hand-edited / non-deterministic IR).
   */
  failIfStale?: boolean;
}

export interface ResolvedProvenanceConfig {
  stamp: boolean;
  fields: ProvenanceFieldToken[];
  deterministic: boolean;
  lockfile: string | undefined;
  failIfStale: boolean;
}

export interface ProvenanceLockfile {
  contentHash: string;
  irHash?: string;
  compilerVersion: string;
  schemaVersion: string;
  compiledAt?: string;
  sources?: IRProvenanceSource[];
}

export function resolveProvenanceConfig(
  raw: ManifestProvenanceConfig | undefined,
): ResolvedProvenanceConfig {
  const fields = Array.isArray(raw?.fields)
    ? raw!.fields.filter((f): f is ProvenanceFieldToken =>
        (PROVENANCE_FIELD_TOKENS as readonly string[]).includes(f),
      )
    : [...PROVENANCE_FIELD_TOKENS];

  return {
    stamp: raw?.stamp !== false,
    fields,
    deterministic: raw?.deterministic === true,
    lockfile: typeof raw?.lockfile === 'string' && raw.lockfile.trim() ? raw.lockfile.trim() : undefined,
    failIfStale: raw?.failIfStale === true,
  };
}

/** Pick compiledAt per policy. */
export function resolveCompiledAt(deterministic: boolean, now: () => string = () => new Date().toISOString()): string {
  return deterministic ? DETERMINISTIC_COMPILED_AT : now();
}

export function buildProvenanceLockfile(provenance: IRProvenance): ProvenanceLockfile {
  const entry: ProvenanceLockfile = {
    contentHash: provenance.contentHash,
    compilerVersion: provenance.compilerVersion,
    schemaVersion: provenance.schemaVersion,
  };
  if (provenance.irHash) entry.irHash = provenance.irHash;
  if (provenance.compiledAt) entry.compiledAt = provenance.compiledAt;
  if (provenance.sources && provenance.sources.length > 0) entry.sources = provenance.sources;
  return entry;
}

/**
 * Staleness: sources unchanged (same contentHash) but IR hash drifted under
 * deterministic mode → fail. Sources changed → not stale (caller should refresh lock).
 */
export function checkProvenanceLockfileStale(
  lock: ProvenanceLockfile,
  current: IRProvenance,
  opts: { deterministic: boolean },
): string | null {
  if (lock.contentHash !== current.contentHash) {
    return null; // sources changed — expected refresh
  }
  if (!opts.deterministic) {
    return null; // wall-clock compiles always change irHash
  }
  if (lock.irHash && current.irHash && lock.irHash !== current.irHash) {
    return `PROVENANCE_STALE: contentHash matches lockfile but irHash drifted (${lock.irHash} → ${current.irHash})`;
  }
  if (lock.compilerVersion !== current.compilerVersion) {
    return `PROVENANCE_STALE: compilerVersion drifted (${lock.compilerVersion} → ${current.compilerVersion})`;
  }
  if (lock.schemaVersion !== current.schemaVersion) {
    return `PROVENANCE_STALE: schemaVersion drifted (${lock.schemaVersion} → ${current.schemaVersion})`;
  }
  return null;
}
