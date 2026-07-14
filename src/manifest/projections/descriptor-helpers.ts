/**
 * Helpers for authoring projection descriptor meta beside each projection.
 */

import type {
  ProjectionDescriptorMeta,
  ProjectionOptionDescriptor,
  ProjectionSurfaceMeta,
} from './descriptor-types.js';

/** Aggregate surface: whole IR, no entity/command selection. */
export function aggregateSurface(id: string): ProjectionSurfaceMeta {
  return {
    id,
    scope: 'aggregate',
    requiresEntity: false,
    requiresCommand: false,
  };
}

/** Entity-scoped surface that errors without `request.entity`. */
export function entitySurface(id: string): ProjectionSurfaceMeta {
  return {
    id,
    scope: 'entity',
    requiresEntity: true,
    requiresCommand: false,
  };
}

/** Command-scoped surface that errors without entity + command. */
export function commandSurface(id: string): ProjectionSurfaceMeta {
  return {
    id,
    scope: 'command',
    requiresEntity: true,
    requiresCommand: true,
  };
}

/** Configuration-driven surface (options bag selects work, not request.entity). */
export function configurationSurface(id: string): ProjectionSurfaceMeta {
  return {
    id,
    scope: 'configuration-driven',
    requiresEntity: false,
    requiresCommand: false,
  };
}

/** Optional entity filter on an otherwise aggregate surface. */
export function optionalEntitySurface(id: string): ProjectionSurfaceMeta {
  return {
    id,
    scope: 'entity',
    requiresEntity: false,
    requiresCommand: false,
    entityOptional: true,
  };
}

/** Optional command filter (zod.command-style). */
export function optionalCommandSurface(id: string): ProjectionSurfaceMeta {
  return {
    id,
    scope: 'command',
    requiresEntity: false,
    requiresCommand: false,
    commandOptional: true,
  };
}

export function optionalOption(
  name: string,
  type: ProjectionOptionDescriptor['type'],
  extras: Partial<Omit<ProjectionOptionDescriptor, 'name' | 'type' | 'required'>> = {},
): ProjectionOptionDescriptor {
  return { name, type, required: false, ...extras };
}

export function requiredOption(
  name: string,
  type: ProjectionOptionDescriptor['type'],
  extras: Partial<Omit<ProjectionOptionDescriptor, 'name' | 'type' | 'required'>> = {},
): ProjectionOptionDescriptor {
  return { name, type, required: true, ...extras };
}

/**
 * Meta for projections whose generate() scopes are not yet audited.
 * Descriptor exists (parity) but `safelyInvokable` stays false.
 */
export function unresolvedDescriptorMeta(
  surfaceIds: readonly string[],
  artifactCategories: readonly string[],
): ProjectionDescriptorMeta {
  return {
    surfaces: surfaceIds.map((id) => aggregateSurface(id)),
    artifactCategories,
    options: [],
    resolved: false,
  };
}
