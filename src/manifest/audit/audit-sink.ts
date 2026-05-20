/**
 * Audit sink contract.
 *
 * Every governed command attempt produces or connects to an audit record
 * covering who, what, tenant, outcome, and diagnostics. The runtime exposes
 * this as an `AuditSink` adapter — applications wire in a concrete sink
 * (Postgres, file, OpenTelemetry, …) via RuntimeOptions.
 *
 * This module defines the contract only. Concrete sinks live in
 * `src/manifest/audit/sinks/<name>.ts` (memory + postgres land in a
 * follow-on; the contract surface is shipped now so downstream consumers
 * can implement against it).
 */

export type CommandOutcome =
  | 'success'
  | 'guard_denied'
  | 'policy_denied'
  | 'constraint_failed'
  | 'concurrency_conflict'
  | 'missing_tenant_context'
  | 'error';

export interface AuditRecord {
  /** Stable record id. Caller MAY pre-generate or leave to the sink. */
  recordId?: string;
  /** Wall-clock timestamp (milliseconds since epoch). */
  occurredAt: number;
  /** Tenant the command ran against (when known). */
  tenantId?: string;
  /** Organization the actor belonged to (e.g. Clerk orgId). */
  orgId?: string;
  /** Acting user id. */
  actorId?: string;
  /** Caller-supplied request id, useful for trace correlation. */
  requestId?: string;
  /** Origin surface ('route', 'job', 'cli', ...). */
  source?: string;
  /** Entity name the command targeted, when entity-scoped. */
  entity?: string;
  /** Command name. */
  command: string;
  /** Canonical "<entity>.<command>" identifier, when available. */
  commandId?: string;
  /** Outcome classification. */
  outcome: CommandOutcome;
  /** Diagnostics returned by the runtime, if any. */
  diagnostics?: unknown;
  /** Names of semantic events emitted by the command, if any. */
  emittedEventNames?: string[];
  /** IR provenance hash at execution time, for drift detection. */
  irHash?: string;
}

/**
 * AuditSink: the runtime calls `emit` exactly once per command attempt,
 * regardless of outcome. Sinks MUST be idempotent against `recordId` when
 * provided so retries don't double-write.
 */
export interface AuditSink {
  emit(record: AuditRecord): Promise<void>;
}
