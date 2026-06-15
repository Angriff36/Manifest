import {
  EntityNode, PropertyNode, ComputedPropertyNode, RelationshipNode, ConstraintNode,
  PolicyNode, ManifestProgram
} from './types';

/**
 * Entity composition expander: resolves entity inheritance (extends) and mixins,
 * merging properties, relationships, constraints, policies, and command names.
 *
 * Precedence: parent → mixins → own; own wins on name conflict.
 * Own-only: transitions, approvals, reactions, store, key, alternateKeys,
 *           versionProperty, versionAtProperty, timestamps, realtime.
 */

export interface EntityIndex {
  [name: string]: EntityNode;
}

export function expandEntityComposition(
  program: ManifestProgram,
  emitDiagnostic: (severity: 'error' | 'warning', message: string) => void,
  /**
   * Optional project-wide index of entities declared in OTHER files of the same
   * compile unit. Used by the multi-file compiler so that an entity can `extends`
   * or `mixin` a base declared in a different file. These external entities are
   * only consulted for composition resolution (parent/mixin lookup); the local
   * file's own entities always take precedence, and externals never count toward
   * the local duplicate-declaration check (cross-file duplicates are validated
   * separately by the multi-compiler).
   */
  externalEntities?: EntityIndex
): ManifestProgram {
  // Build index of all entities by name from root and modules
  const entityIndex: EntityIndex = {};

  for (const entity of program.entities) {
    if (entityIndex[entity.name]) {
      emitDiagnostic('error', `Duplicate entity declaration '${entity.name}'`);
      continue;
    }
    entityIndex[entity.name] = entity;
  }

  for (const module of program.modules) {
    for (const entity of module.entities) {
      if (entityIndex[entity.name]) {
        emitDiagnostic('error', `Duplicate entity declaration '${entity.name}'`);
        continue;
      }
      entityIndex[entity.name] = entity;
    }
  }

  // Merge external (cross-file) entities as a fallback for composition lookups.
  // Local entities win; externals fill in only names not declared locally. This
  // lets `extends`/`mixin` resolve a base declared in another file without
  // affecting which entities this file actually emits.
  const localNames = new Set(Object.keys(entityIndex));
  if (externalEntities) {
    for (const name of Object.keys(externalEntities)) {
      if (!entityIndex[name]) {
        entityIndex[name] = externalEntities[name];
      }
    }
  }

  // Validate and resolve extends/mixin graph (cycle detection).
  // Only LOCAL entities are validated/expanded here; cross-file bases are reached
  // transitively through recursion and validated within their own file's compile.
  const validated = new Set<string>();
  const inProgress = new Set<string>();

  for (const name of localNames) {
    validateEntityGraph(name, entityIndex, validated, inProgress, emitDiagnostic);
  }

  // Expand composition for all local entities
  for (const name of localNames) {
    const entity = entityIndex[name];
    expandComposition(entity, entityIndex, new Set<string>(), emitDiagnostic);
  }

  return program;
}

/**
 * Validate extends/mixin graph for unknown parents and cycles.
 * Uses DFS coloring (WHITE=0, GRAY=1, BLACK=2).
 */
function validateEntityGraph(
  name: string,
  entityIndex: EntityIndex,
  validated: Set<string>,
  inProgress: Set<string>,
  emitDiagnostic: (severity: 'error' | 'warning', message: string) => void
): void {
  if (validated.has(name)) return;
  if (inProgress.has(name)) {
    emitDiagnostic('error', `Cycle detected in entity inheritance involving '${name}'`);
    return;
  }

  const entity = entityIndex[name];
  if (!entity) return; // Already reported as unknown

  inProgress.add(name);

  // Validate parent exists
  if (entity.parent) {
    if (!entityIndex[entity.parent]) {
      emitDiagnostic('error', `Entity '${name}' extends unknown entity '${entity.parent}'`);
    } else {
      validateEntityGraph(entity.parent, entityIndex, validated, inProgress, emitDiagnostic);
    }
  }

  // Validate mixins exist
  if (entity.mixins) {
    for (const mixin of entity.mixins) {
      if (!entityIndex[mixin]) {
        emitDiagnostic('error', `Entity '${name}' mixes unknown entity '${mixin}'`);
      } else {
        validateEntityGraph(mixin, entityIndex, validated, inProgress, emitDiagnostic);
      }
    }
  }

  inProgress.delete(name);
  validated.add(name);
}

/**
 * Recursively expand composition: merge properties, relationships, constraints, policies.
 * Own fields take precedence over parent/mixin fields on name collision.
 * Own-only fields (transitions, approvals, reactions, store, key, etc.) are never merged.
 */
function expandComposition(
  entity: EntityNode,
  entityIndex: EntityIndex,
  visited: Set<string>,
  emitDiagnostic: (severity: 'error' | 'warning', message: string) => void
): void {
  if (visited.has(entity.name)) return; // Already expanded or in progress
  visited.add(entity.name);

  // Collect inherited items in order: parent first, then mixins, then own
  const inheritedProps: PropertyNode[] = [];
  const inheritedComputed: ComputedPropertyNode[] = [];
  const inheritedRelationships: RelationshipNode[] = [];
  const inheritedConstraints: ConstraintNode[] = [];
  const inheritedPolicies: PolicyNode[] = [];
  const inheritedCommands: string[] = [];

  // Merge parent first
  if (entity.parent) {
    const parentEntity = entityIndex[entity.parent];
    if (parentEntity) {
      expandComposition(parentEntity, entityIndex, visited, emitDiagnostic);
      inheritedProps.push(...parentEntity.properties);
      inheritedComputed.push(...parentEntity.computedProperties);
      inheritedRelationships.push(...parentEntity.relationships);
      inheritedConstraints.push(...parentEntity.constraints);
      inheritedPolicies.push(...parentEntity.policies);
      inheritedCommands.push(...(parentEntity.inheritedCommandNames || []));
      inheritedCommands.push(...parentEntity.commands.map(c => c.name));
    }
  }

  // Merge mixins in order
  if (entity.mixins) {
    for (const mixinName of entity.mixins) {
      const mixinEntity = entityIndex[mixinName];
      if (mixinEntity) {
        expandComposition(mixinEntity, entityIndex, visited, emitDiagnostic);
        inheritedProps.push(...mixinEntity.properties);
        inheritedComputed.push(...mixinEntity.computedProperties);
        inheritedRelationships.push(...mixinEntity.relationships);
        inheritedConstraints.push(...mixinEntity.constraints);
        inheritedPolicies.push(...mixinEntity.policies);
        inheritedCommands.push(...(mixinEntity.inheritedCommandNames || []));
        inheritedCommands.push(...mixinEntity.commands.map(c => c.name));
      }
    }
  }

  // Build name sets from own fields (for conflict detection)
  const ownPropNames = new Set(entity.properties.map(p => p.name));
  const ownComputedNames = new Set(entity.computedProperties.map(c => c.name));
  const ownRelNames = new Set(entity.relationships.map(r => r.name));
  const ownConstraintNames = new Set(entity.constraints.map(c => c.name));
  const ownPolicyNames = new Set(entity.policies.map(p => p.name));

  // Prepend inherited items that don't collide with own
  entity.properties.unshift(
    ...inheritedProps.filter(p => !ownPropNames.has(p.name))
  );
  entity.computedProperties.unshift(
    ...inheritedComputed.filter(c => !ownComputedNames.has(c.name))
  );
  entity.relationships.unshift(
    ...inheritedRelationships.filter(r => !ownRelNames.has(r.name))
  );
  entity.constraints.unshift(
    ...inheritedConstraints.filter(c => !ownConstraintNames.has(c.name))
  );
  entity.policies.unshift(
    ...inheritedPolicies.filter(p => !ownPolicyNames.has(p.name))
  );

  // Build the full list of inherited command names (for IR generation)
  const ownCommandNames = new Set(entity.commands.map(c => c.name));
  entity.inheritedCommandNames = inheritedCommands.filter(
    name => !ownCommandNames.has(name)
  );
}
