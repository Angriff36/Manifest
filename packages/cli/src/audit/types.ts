/**
 * Shared types for the governance audit suite.
 *
 * Each detector returns a uniform finding shape. The `manifest
 * audit-governance` umbrella aggregates findings across detectors and
 * decides the process exit code based on severity counts plus the
 * `--strict` flag.
 */

export type AuditSeverity = 'error' | 'warning';

export interface AuditFinding {
  severity: AuditSeverity;
  code: string;
  message: string;
  /** Repo-root-relative file the finding refers to, if any. */
  file?: string;
  /** Detector that produced the finding. */
  detector: string;
}

export interface DetectorContext {
  /** Absolute path to the repo root being audited. */
  root: string;
  /** Optional path to a commands registry JSON (commands.json). */
  commandsRegistry?: string;
  /** Optional path to a bypass registry JSON (bypasses.json). */
  bypassRegistry?: string;
}

export interface Detector {
  name: string;
  description: string;
  run(ctx: DetectorContext): Promise<AuditFinding[]>;
}
