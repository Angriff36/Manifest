/**
 * Product wiring contract types — machine-readable descriptors that let
 * applications and agents wire UI to Manifest commands without guessing.
 *
 * This is NOT a UI generator. It describes inputs, ownership, constraints,
 * lifecycle transitions, invalidation, and coverage — nothing visual.
 */

/** Schema id for the wiring-contract artifact. */
export const WIRING_CONTRACT_SCHEMA = 'manifest-wiring-contract/v1' as const;

/** Schema id for an application capability-consumer registry. */
export const WIRING_CONSUMERS_SCHEMA = 'manifest-wiring-consumers/v1' as const;

/** How a parameter value is owned at the transport boundary. */
export type ParameterOwnership = 'client' | 'server';

/** Kind of trusted server-owned source (derived from context path, not names). */
export type TrustedSourceKind =
  'actor' | 'tenant' | 'org' | 'request' | 'routeEntityId' | 'context' | 'unknown';

/** Statically known input constraints (never runtime-only guards). */
export interface WiringInputConstraints {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  /** True when a non-empty string is statically required (minLength >= 1). */
  nonEmpty?: boolean;
  /** Finite allowed values when derivable from an IR enum. */
  enumValues?: string[];
  /** True when the scalar is date or datetime. */
  dateLike?: boolean;
  /** Reject empty string for required date/datetime client inputs. */
  rejectEmptyString?: boolean;
}

export interface WiringParameterDescriptor {
  name: string;
  /** Exact TypeScript type string for generated bindings. */
  tsType: string;
  /** IR type name (e.g. string, number, array, Status). */
  irTypeName: string;
  required: boolean;
  nullable: boolean;
  /** Element IR type name when irTypeName is array/list. */
  arrayElementType?: string;
  ownership: ParameterOwnership;
  /** Present only when ownership === 'server'. */
  trustedSource?: string;
  trustedSourceKind?: TrustedSourceKind;
  constraints: WiringInputConstraints;
  /** Runtime-only: command has guards/policies that may further restrict this. */
  hasRuntimeGuards: boolean;
}

export interface WiringLifecycleTransition {
  property: string;
  from: string;
  to: string;
  /** True when derived from a literal mutate of a transition-governed property. */
  proven: true;
}

export interface WiringInvalidationTarget {
  kind: 'entityList' | 'entityDetail' | 'custom';
  entity: string;
  /** Query-key hint aligned with react-query projection naming. */
  queryKeyHint: string;
  /** Optional declared extension label. */
  label?: string;
}

export interface WiringCommandResultStates {
  success: true;
  /** Structured failure modes the caller must handle. */
  errors: Array<
    | 'policy_denial'
    | 'guard_failure'
    | 'constraint_block'
    | 'concurrency_conflict'
    | 'missing_required_parameter'
    | 'missing_trusted_context'
    | 'unknown'
  >;
}

export interface WiringCommandDescriptor {
  entity: string;
  command: string;
  /** Dispatcher identity: Entity.command */
  capabilityId: string;
  /** Canonical dispatcher invocation path. */
  route: string;
  /** True when the command mutates an existing instance (not create/static). */
  instanceCommand: boolean;
  parameters: WiringParameterDescriptor[];
  /** Client-owned parameter names only (browser input surface). */
  clientParameterNames: string[];
  /** Server-owned parameter names (injected, never from browser). */
  serverParameterNames: string[];
  returnTsType: string;
  emits: string[];
  affectedEntity: string;
  lifecycleTransitions: WiringLifecycleTransition[];
  invalidation: WiringInvalidationTarget[];
  resultStates: WiringCommandResultStates;
}

export interface WiringContract {
  $schema: typeof WIRING_CONTRACT_SCHEMA;
  meta: {
    compilerVersion: string;
    schemaVersion: string;
    contentHash: string;
    projection: 'wiring';
  };
  capabilities: WiringCommandDescriptor[];
}

/** Application-declared consumer of a Manifest capability. */
export interface WiringConsumerEntry {
  /** Entity.command capability id. */
  capabilityId: string;
  /**
   * How the app treats this capability:
   * - consumed: intentionally wired in product code
   * - backend-only: intentionally not exposed to UI
   * - deferred: known gap, not a defect yet
   */
  disposition: 'consumed' | 'backend-only' | 'deferred';
  /** Optional note for humans/agents. */
  note?: string;
}

export interface WiringConsumersRegistry {
  $schema: typeof WIRING_CONSUMERS_SCHEMA;
  consumers: WiringConsumerEntry[];
}

export type WiringCoverageStatus =
  'exposed' | 'backend-only' | 'deferred' | 'unwired' | 'stale-consumer';

export interface WiringCoverageFinding {
  capabilityId: string;
  status: WiringCoverageStatus;
  /** True when this finding is a gate defect (unwired or stale). */
  defect: boolean;
  message: string;
}

export interface WiringCoverageReport {
  $schema: 'manifest-wiring-coverage/v1';
  ok: boolean;
  summary: {
    totalCapabilities: number;
    exposed: number;
    backendOnly: number;
    deferred: number;
    unwired: number;
    staleConsumers: number;
  };
  findings: WiringCoverageFinding[];
}

export interface WiringProjectionOptions {
  /** App Router / API base used for route identity (default via route contract). */
  appDir?: string;
  apiBasePath?: string;
  dispatcherBasePath?: string;
  routeSegments?: Record<string, string>;
  routeCasing?: 'lowercase' | 'kebab-case' | 'snake_case' | 'preserve';
  /** How date/datetime appear in generated TS (default iso-string for wire). */
  dateSerialization?: 'date' | 'iso-string';
  /** Import path for RuntimeEngine / runCommand helper in server bindings. */
  runtimeImportPath?: string;
  /** Output path hint for the contract JSON. */
  contractPathHint?: string;
  /** Output path hint for generated TypeScript bindings. */
  bindingsPathHint?: string;
}
