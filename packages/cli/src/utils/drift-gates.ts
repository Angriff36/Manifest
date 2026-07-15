/**
 * Config G10 — declarative drift-gate resolution for `manifest ci-gate`.
 */

export interface DriftGatesConfig {
  /** Path to a committed effective-config snapshot (from `manifest config inspect --json`). */
  effectiveConfigSnapshot?: string;
  /** Compare live effective config to the snapshot. Default true when snapshot path is set. */
  failOnConfigDrift?: boolean;
  /** Run `generate --all --check` and fail on artifact drift. Default false. */
  failOnGeneratedDrift?: boolean;
  /** When set, every `*.ir.json` under the IR output must declare this `version`. */
  pinIrSchemaVersion?: string;
}

export interface ResolvedDriftGates {
  effectiveConfigSnapshot: string | null;
  failOnConfigDrift: boolean;
  failOnGeneratedDrift: boolean;
  pinIrSchemaVersion: string | null;
}

/** Normalize raw config / CLI overrides into an executable gate plan. */
export class DriftGatesResolver {
  resolve(
    fromConfig: DriftGatesConfig | undefined,
    cli: Partial<DriftGatesConfig> = {},
  ): ResolvedDriftGates {
    const merged: DriftGatesConfig = { ...(fromConfig ?? {}), ...stripUndefined(cli) };
    const snapshot =
      typeof merged.effectiveConfigSnapshot === 'string' &&
      merged.effectiveConfigSnapshot.length > 0
        ? merged.effectiveConfigSnapshot
        : null;

    return {
      effectiveConfigSnapshot: snapshot,
      failOnConfigDrift:
        merged.failOnConfigDrift !== undefined
          ? Boolean(merged.failOnConfigDrift)
          : snapshot !== null,
      failOnGeneratedDrift: Boolean(merged.failOnGeneratedDrift),
      pinIrSchemaVersion:
        typeof merged.pinIrSchemaVersion === 'string' && merged.pinIrSchemaVersion.length > 0
          ? merged.pinIrSchemaVersion
          : null,
    };
  }
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}
