/**
 * Automatic application consumer inspection types.
 *
 * Manifest does not design the interface. These types describe whether
 * application source correctly consumes declared wiring capabilities.
 *
 * Adapted from codebase-explorer featureCompleteness tracing models.
 */

import type { WiringConsumersRegistry } from '../types.js';

export const WIRING_INSPECT_REPORT_SCHEMA = 'manifest-wiring-inspect/v1' as const;

/** How a consumer was proven (or why it was not). */
export type ConsumerProofLevel = 'proven' | 'ambiguous' | 'override' | 'none';

/** Trace form that attributed a capability to application code. */
export type ConsumerTraceVia =
  | 'generated_client'
  | 'execute_command'
  | 'server_action'
  | 'api_route'
  | 'imported_helper'
  | 'runtime_run_command';

/** Coverage classification for one capability after automatic inspection. */
export type InspectCoverageStatus =
  'consumed' | 'unwired' | 'backend-only' | 'deferred' | 'stale-consumer' | 'ambiguous';

/** Human-readable product-reality bucket. */
export type ProductRealityBucket =
  | 'WORKING'
  | 'FEATURE_THEATRE'
  | 'BUILT_BUT_UNWIRED'
  | 'BROKEN_UNPROVEN'
  | 'DUPLICATE_PARALLEL_MODEL';

export interface SourceLocation {
  file: string;
  line?: number;
  endLine?: number;
}

export interface TraceHop {
  label: string;
  file?: string;
  line?: number;
}

export interface ConsumerEvidence {
  capabilityId: string;
  entity: string;
  command: string;
  classification: ConsumerTraceVia;
  proofLevel: ConsumerProofLevel;
  source: SourceLocation;
  /** Component / action / helper symbol when known. */
  consumerSymbol?: string;
  /** Ordered hops from UI toward Manifest runtime. */
  trace: TraceHop[];
  confidence: 'high' | 'medium' | 'low';
}

export type ContractMismatchKind =
  | 'missing_required_input'
  | 'wrong_input_shape'
  | 'invalid_finite_literal'
  | 'invalid_date_sentinel'
  | 'trusted_field_spoofing'
  | 'stale_capability'
  | 'lifecycle_model_mismatch';

export interface ContractMismatch {
  kind: ContractMismatchKind;
  capabilityId: string;
  parameter?: string;
  message: string;
  source: SourceLocation;
  /** True when static evidence is strong enough to gate CI. */
  defect: boolean;
}

export interface InspectCoverageFinding {
  capabilityId: string;
  status: InspectCoverageStatus;
  defect: boolean;
  message: string;
  evidence: ConsumerEvidence[];
  productReality: ProductRealityBucket;
}

export interface WiringInspectConfig {
  /** Application source roots (absolute or cwd-relative). */
  roots: string[];
  /** Glob-like path substrings to include (empty = all under roots). */
  include?: string[];
  /** Path substrings excluded from product consumers. */
  exclude?: string[];
  /** Generated artifact directories (definitions here are not consumers). */
  generated?: string[];
  /** Test directories (excluded by default). */
  tests?: string[];
  /** Docs/examples directories (excluded by default). */
  docs?: string[];
  /** Framework adapter id (currently only nextjs-app-router). */
  framework?: 'nextjs-app-router';
  /** Optional explicit overrides (backend-only / deferred / accepted ambiguous). */
  overrides?: WiringConsumersRegistry;
  /**
   * When true, capabilities with no proven consumer and no override are defects.
   * Default false to avoid massive noise on first adoption.
   */
  strictCoverage?: boolean;
  /** Fail CI on these defect classes (defaults applied by inspector). */
  failOn?: Array<'stale-consumer' | 'contract-mismatch' | 'unwired'>;
}

export interface WiringInspectReport {
  $schema: typeof WIRING_INSPECT_REPORT_SCHEMA;
  ok: boolean;
  summary: {
    totalCapabilities: number;
    consumed: number;
    unwired: number;
    backendOnly: number;
    deferred: number;
    staleConsumers: number;
    ambiguous: number;
    mismatches: number;
    mismatchDefects: number;
  };
  findings: InspectCoverageFinding[];
  mismatches: ContractMismatch[];
  unresolved: Array<{
    message: string;
    source?: SourceLocation;
  }>;
  overridesApplied: Array<{
    capabilityId: string;
    disposition: string;
    note?: string;
  }>;
}
