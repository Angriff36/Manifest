/**
 * Projection descriptor contract for Builder and other platform consumers.
 *
 * Descriptors publish only facts Manifest can prove from registration,
 * surface behavior, options schemas, and capability matrices. A registered
 * projection is not necessarily safely invokable — see `safelyInvokable`.
 */

import type { ProjectionCapability } from './interface.js';

/** How a surface addresses IR when generating. */
export type ProjectionInvocationScope =
  | 'aggregate'
  | 'entity'
  | 'command'
  | 'configuration-driven';

/** JSON-ish option type for Builder forms and validation. */
export type ProjectionOptionValueType =
  | 'string'
  | 'boolean'
  | 'number'
  | 'enum'
  | 'object'
  | 'array'
  | 'record'
  | 'unknown';

export interface ProjectionSurfaceDescriptor {
  /** Stable surface id (e.g. `nextjs.route`, `convex.schema`). */
  id: string;
  scope: ProjectionInvocationScope;
  /** Request must supply `entity` or validation fails. */
  requiresEntity: boolean;
  /** Request must supply `command` or validation fails. */
  requiresCommand: boolean;
  /**
   * When true and `requiresEntity` is false, `entity` may filter output
   * (omit = whole IR). Proven from generate() behavior.
   */
  entityOptional: boolean;
  /**
   * When true and `requiresCommand` is false, `command` may filter output.
   */
  commandOptional: boolean;
}

export interface ProjectionOptionDescriptor {
  name: string;
  required: boolean;
  type: ProjectionOptionValueType;
  description?: string;
  default?: unknown;
  enumValues?: readonly string[];
}

export type ProjectionPrerequisiteKind =
  | 'schedules'
  | 'webhooks'
  | 'realtime'
  | 'configured-views'
  | 'ir-feature'
  | 'options';

export interface ProjectionPrerequisiteDescriptor {
  kind: ProjectionPrerequisiteKind;
  description: string;
  /** When true, generation is empty/error without the prerequisite. */
  required: boolean;
  /** Surfaces this prerequisite applies to (empty = all). */
  surfaces?: readonly string[];
}

export interface ProjectionCapabilityGroups {
  /** True when the projection declared a capability matrix. */
  declared: boolean;
  supported: readonly ProjectionCapability[];
  partial: readonly ProjectionCapability[];
  unsupported: readonly ProjectionCapability[];
}

/**
 * Public descriptor: registry facts + authored meta + capability matrix.
 * `safelyInvokable` is false until scope and options are fully resolved.
 */
export interface ProjectionDescriptor {
  name: string;
  displayName: string;
  description: string;
  surfaces: readonly ProjectionSurfaceDescriptor[];
  /** Flat list of surface ids (derived from `surfaces`). */
  surfaceIds: readonly string[];
  requiredOptions: readonly ProjectionOptionDescriptor[];
  optionalOptions: readonly ProjectionOptionDescriptor[];
  prerequisites: readonly ProjectionPrerequisiteDescriptor[];
  artifactCategories: readonly string[];
  runtimeDependencies: readonly string[];
  packageDependencies: readonly string[];
  /**
   * Companion projection names whose contracts are known to align.
   * Empty unless Manifest has evidence — never guessed.
   */
  compatibleCompanions: readonly string[];
  /** Known incompatible projection combinations (empty when unproven). */
  incompatibleWith: readonly string[];
  capabilities: ProjectionCapabilityGroups;
  /**
   * True only when every registered surface has resolved scope and the
   * options schema is declared. Registration alone never implies this.
   */
  safelyInvokable: boolean;
}

/**
 * Author-supplied meta living beside the owning projection.
 * Combined with `ProjectionTarget` fields by `describeProjection`.
 */
export type ProjectionSurfaceMeta = {
  id: string;
  scope: ProjectionInvocationScope;
  requiresEntity: boolean;
  requiresCommand: boolean;
  entityOptional?: boolean;
  commandOptional?: boolean;
};

export interface ProjectionDescriptorMeta {
  displayName?: string;
  surfaces: readonly ProjectionSurfaceMeta[];
  options?: readonly ProjectionOptionDescriptor[];
  prerequisites?: readonly ProjectionPrerequisiteDescriptor[];
  artifactCategories: readonly string[];
  runtimeDependencies?: readonly string[];
  packageDependencies?: readonly string[];
  compatibleCompanions?: readonly string[];
  incompatibleWith?: readonly string[];
  /**
   * Author attestation that surface scopes and options are complete.
   * `describeProjection` also checks structural coverage of `surfaces`.
   */
  resolved: boolean;
}

export class UnknownProjectionError extends Error {
  readonly code = 'UNKNOWN_PROJECTION' as const;
  readonly projectionName: string;

  constructor(projectionName: string) {
    super(
      `Unknown projection "${projectionName}". It is not in the Manifest registry. ` +
        `Call listProjectionDescriptors() / listProjections() for registered names.`,
    );
    this.name = 'UnknownProjectionError';
    this.projectionName = projectionName;
  }
}

export interface ProjectionInvocationRequest {
  surface: string;
  entity?: string;
  command?: string;
  options?: Record<string, unknown>;
}

export interface ProjectionInvocationValidation {
  ok: boolean;
  blockers: string[];
  descriptor: ProjectionDescriptor;
}
