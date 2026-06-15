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
  /** 1-based line number when AST-located. */
  line?: number;
  /** 1-based column when AST-located. */
  column?: number;
  /** Governed entity inferred from the finding, if any. */
  entity?: string;
  /** Governed command inferred from the finding, if any. */
  command?: string;
  /** Remediation hint shown to humans and agents. */
  suggestion?: string;
}

export interface DetectorContext {
  /** Absolute path to the repo root being audited. */
  root: string;
  /** Optional path to a commands registry JSON (commands.json). */
  commandsRegistry?: string;
  /** Optional path to an entities registry JSON (entities.json). */
  entitiesRegistry?: string;
  /** Optional path to a bypass registry JSON (bypasses.json). */
  bypassRegistry?: string;
  /**
   * Extra glob patterns appended to every detector's scan list. Repo-root
   * relative; allows callers to widen the surface beyond the detector's
   * built-in globs.
   */
  includeGlobs?: string[];
  /**
   * Extra glob patterns appended to every detector's ignore list. Repo-root
   * relative; allows callers to suppress noisy or generated paths without
   * editing each detector.
   */
  excludeGlobs?: string[];
  /**
   * The ORM client identifier that direct-write detectors match on (the
   * variable a write is called against, e.g. `prisma.user.create`). Defaults to
   * `prisma`. Set this when the consumer re-exports its client under another
   * name (e.g. `database`) so governed-write detection still fires.
   */
  writeReceiver?: string;
}

export interface Detector {
  name: string;
  description: string;
  run(ctx: DetectorContext): Promise<AuditFinding[]>;
}
