/**
 * Pure descriptor construction from a ProjectionTarget + its meta.
 * Does not import the registry (avoids circular deps).
 */

import type { ProjectionCapability, ProjectionTarget } from './interface.js';
import type {
  ProjectionCapabilityGroups,
  ProjectionDescriptor,
  ProjectionDescriptorMeta,
  ProjectionInvocationRequest,
  ProjectionInvocationValidation,
  ProjectionSurfaceDescriptor,
} from './descriptor-types.js';

function groupCapabilities(
  caps: readonly ProjectionCapability[] | undefined,
): ProjectionCapabilityGroups {
  if (!caps) {
    return { declared: false, supported: [], partial: [], unsupported: [] };
  }
  return {
    declared: true,
    supported: caps.filter((c) => c.status === 'supported'),
    partial: caps.filter((c) => c.status === 'partial'),
    unsupported: caps.filter((c) => c.status === 'unsupported'),
  };
}

function normalizeSurfaces(meta: ProjectionDescriptorMeta): ProjectionSurfaceDescriptor[] {
  return meta.surfaces.map((s) => ({
    id: s.id,
    scope: s.scope,
    requiresEntity: s.requiresEntity,
    requiresCommand: s.requiresCommand,
    entityOptional: s.entityOptional ?? false,
    commandOptional: s.commandOptional ?? false,
  }));
}

function surfacesCoverTarget(target: ProjectionTarget, meta: ProjectionDescriptorMeta): boolean {
  const registered = new Set(target.surfaces);
  const declared = new Set(meta.surfaces.map((s) => s.id));
  if (registered.size !== declared.size) return false;
  for (const id of registered) {
    if (!declared.has(id)) return false;
  }
  return true;
}

/** Build a public descriptor from a registered projection target. */
export function buildProjectionDescriptor(target: ProjectionTarget): ProjectionDescriptor {
  const meta = target.descriptorMeta;
  if (!meta) {
    throw new Error(
      `Projection "${target.name}" is registered without descriptorMeta. ` +
        `Add a descriptor declaration beside the owning projection.`,
    );
  }

  const surfaces = normalizeSurfaces(meta);
  const options = meta.options ?? [];
  const coverageOk = surfacesCoverTarget(target, meta);
  const safelyInvokable = meta.resolved === true && coverageOk;

  return {
    name: target.name,
    displayName: meta.displayName ?? target.name,
    description: target.description,
    surfaces,
    surfaceIds: [...target.surfaces],
    requiredOptions: options.filter((o) => o.required),
    optionalOptions: options.filter((o) => !o.required),
    prerequisites: meta.prerequisites ?? [],
    artifactCategories: [...meta.artifactCategories],
    runtimeDependencies: [...(meta.runtimeDependencies ?? [])],
    packageDependencies: [...(meta.packageDependencies ?? [])],
    compatibleCompanions: [...(meta.compatibleCompanions ?? [])],
    incompatibleWith: [...(meta.incompatibleWith ?? [])],
    capabilities: groupCapabilities(target.capabilities),
    safelyInvokable,
  };
}

/** Validate a request against an already-built descriptor. */
export function validateAgainstDescriptor(
  descriptor: ProjectionDescriptor,
  request: ProjectionInvocationRequest,
): ProjectionInvocationValidation {
  const blockers: string[] = [];

  if (!descriptor.safelyInvokable) {
    blockers.push(
      `Projection "${descriptor.name}" is registered but not safely invokable: ` +
        `scope and/or options metadata are unresolved. Do not guess invocation parameters.`,
    );
  }

  const surface = descriptor.surfaces.find((s) => s.id === request.surface);
  if (!surface) {
    blockers.push(
      `Surface "${request.surface}" is not registered on projection "${descriptor.name}". ` +
        `Available surfaces: ${descriptor.surfaceIds.join(', ') || '(none)'}.`,
    );
    return { ok: false, blockers, descriptor };
  }

  if (surface.requiresEntity && !request.entity) {
    blockers.push(
      `Surface "${request.surface}" requires an entity selection (scope: ${surface.scope}).`,
    );
  }
  if (surface.requiresCommand && !request.command) {
    blockers.push(
      `Surface "${request.surface}" requires a command selection (scope: ${surface.scope}).`,
    );
  }

  const opts = request.options ?? {};
  for (const option of descriptor.requiredOptions) {
    const value = opts[option.name];
    const missing =
      value === undefined || value === null || (Array.isArray(value) && value.length === 0);
    if (missing) {
      blockers.push(
        `Projection "${descriptor.name}" requires option "${option.name}" ` +
          `(type: ${option.type}).`,
      );
    }
  }

  return { ok: blockers.length === 0, blockers, descriptor };
}
