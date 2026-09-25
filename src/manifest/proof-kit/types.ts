/**
 * DX Proof Kit — shared catalog + registry types.
 * Core proof-kit must stay free of convex-test imports.
 */

export const CAPABILITY_CATALOG_SCHEMA = 'manifest-capability-catalog/v1' as const;
export const PROOF_REGISTRY_SCHEMA = 'manifest-proof-registry/v1' as const;
export const GUARD_CONFIG_SCHEMA = 'manifest-integration-guard/v1' as const;

export type ProofStatus =
  | 'declared'
  | 'generated'
  | 'structurally_proven'
  | 'runtime_proven'
  | 'intentionally_unavailable'
  | 'blocked_by_product_decision';

export interface ProofKitVersions {
  manifestVersion: string;
  projection?: string;
  preset?: { id: string; version: string };
}

export interface CommandCapability {
  name: string;
  mutation: string;
  inputs: string[];
  emits: string[];
  requiredCapabilities: string[];
  useCreateAlias?: string;
  allocating: boolean;
}

export interface LifecycleTransition {
  property: string;
  from: string;
  to: string[];
}

export interface ReactionCapability {
  id: string;
  event: string;
  targetEntity: string;
  targetCommand: string;
  expectedConsequence: string;
  structuralProofStatus: ProofStatus;
  runtimeProofStatus: ProofStatus;
}

export interface EntityCapability {
  entity: string;
  table: string;
  listOperation?: string;
  detailOperation?: string;
  allocatingCreate?: {
    command: string;
    mutation: string;
    useCreateAlias: string;
  };
  commands: CommandCapability[];
  lifecycle: LifecycleTransition[];
  reactions: ReactionCapability[];
  requiredRolesOrCapabilities: string[];
  structuralProofStatus: ProofStatus;
  runtimeProofStatus: ProofStatus;
}

export interface CapabilityCatalog {
  schemaVersion: typeof CAPABILITY_CATALOG_SCHEMA;
  irHash: string;
  versions: ProofKitVersions;
  entities: EntityCapability[];
}

export interface ProofRegistryEntry {
  id: string;
  kind: 'command' | 'reaction';
  entity: string;
  command?: string;
  event?: string;
  expectedConsequence?: string;
  structuralTest?: string;
  runtimeTest?: string;
  status: ProofStatus;
  versions: ProofKitVersions;
  lastVerifiedCommit?: string;
}

export interface ProofRegistry {
  schemaVersion: typeof PROOF_REGISTRY_SCHEMA;
  irHash: string;
  versions: ProofKitVersions;
  proofs: ProofRegistryEntry[];
}

export interface IntegrationGuardException {
  pathIncludes: string;
  rule?: string;
  reason: string;
}

/**
 * Narrow per-file permission (2026-09-25): the named imports / Convex hooks are
 * allowed in files ending with `pathSuffix`; every other rule still applies.
 */
export interface IntegrationGuardAllowance {
  pathSuffix: string;
  /** Import specifiers exempt from forbiddenImportPatterns in this file. */
  imports?: string[];
  /** Convex hooks this file may call directly. */
  hooks?: Array<'useQuery' | 'useMutation' | 'useAction'>;
  reason: string;
}

/**
 * Precise authored-write detection (2026-09-25). Without it, any
 * patch/replace/delete in a file that mentions an owned table is a violation.
 * With it, only a patch/replace/delete whose target is an owned document id
 * is: a local typed `Id<"table">` (directly, via a type alias, or a simple
 * `const a = b` alias), a name in `idNames`, or `<root>._id` for a root in
 * `memberRoots` (case-insensitive).
 */
export interface IntegrationGuardWriteTargets {
  /** Tables whose `Id<"…">` typed locals are owned-document ids. */
  typedIdTables: string[];
  /** Untyped argument names that conventionally hold owned ids. */
  idNames: string[];
  /** Roots whose `._id` is an owned document id (e.g. `event`). */
  memberRoots: string[];
}

export interface IntegrationGuardLifecyclePolicy {
  pathSuffix: string;
  bindingsImport: string;
  requiredSymbols: string[];
}

export interface IntegrationGuardConfig {
  schemaVersion: typeof GUARD_CONFIG_SCHEMA;
  versions: ProofKitVersions;
  featureRoots: string[];
  convexLibRoot: string;
  ownedTables: string[];
  forbidDirectConvexHooks: boolean;
  forbiddenImportPatterns: string[];
  lifecycleLiteralPattern?: string;
  lifecyclePolicies: IntegrationGuardLifecyclePolicy[];
  exceptions: IntegrationGuardException[];
  allowances?: IntegrationGuardAllowance[];
  writeTargets?: IntegrationGuardWriteTargets;
}

export interface GuardViolation {
  file: string;
  line?: number;
  rule: string;
  detail: string;
}
