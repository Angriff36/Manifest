/**
 * IR Diff Engine — Compare two versions of Manifest IR and produce a
 * structured diff report highlighting added/removed/changed entities,
 * properties, commands, constraints, policies, events, stores, and relationships.
 *
 * Can also generate database migration scripts (SQL and Prisma) from schema diffs.
 *
 * Design notes:
 *   - Deterministic: same inputs always produce same output (sorted, no random IDs).
 *   - IR is the authority — diffs are computed purely from IR, never from source.
 *   - Migration generation is advisory: the consumer decides whether to apply.
 */

import type {
  IR,
  IRProperty,
  IRComputedProperty,
  IRRelationship,
  IRCommand,
  IRConstraint,
  IRPolicy,
  IRStore,
  IREvent,
  IRType,
  IRValue,
  PropertyModifier,
} from './ir';

// ============================================================================
// Diff result types
// ============================================================================

export type DiffChangeKind = 'added' | 'removed' | 'changed';

export interface PropertyDiff {
  name: string;
  change: DiffChangeKind;
  /** For 'changed': what changed */
  details?: {
    type?: { from: string; to: string };
    modifiers?: { from: PropertyModifier[]; to: PropertyModifier[] };
    defaultValue?: { from: string; to: string };
  };
}

export interface ComputedPropertyDiff {
  name: string;
  change: DiffChangeKind;
  details?: {
    type?: { from: string; to: string };
    expression?: { from: string; to: string };
    dependencies?: { from: string[]; to: string[] };
  };
}

export interface RelationshipDiff {
  name: string;
  change: DiffChangeKind;
  details?: {
    kind?: { from: string; to: string };
    target?: { from: string; to: string };
    foreignKeyChanged?: boolean;
    through?: { from: string | undefined; to: string | undefined };
    onDelete?: { from: string | undefined; to: string | undefined };
    onUpdate?: { from: string | undefined; to: string | undefined };
  };
}

export interface ConstraintDiff {
  name: string;
  change: DiffChangeKind;
  details?: {
    severity?: { from: string; to: string };
    message?: { from: string | undefined; to: string | undefined };
  };
}

export interface CommandDiff {
  name: string;
  change: DiffChangeKind;
  details?: {
    entity?: { from: string | undefined; to: string | undefined };
    parametersAdded?: string[];
    parametersRemoved?: string[];
    guardsChanged?: boolean;
    actionsChanged?: boolean;
    emitsChanged?: boolean;
    returnsChanged?: boolean;
  };
}

export interface PolicyDiff {
  name: string;
  change: DiffChangeKind;
  details?: {
    entity?: { from: string | undefined; to: string | undefined };
    action?: { from: string; to: string };
    expressionChanged?: boolean;
  };
}

export interface StoreDiff {
  entity: string;
  change: DiffChangeKind;
  details?: {
    target?: { from: string; to: string };
    configChanged?: boolean;
  };
}

export interface EventDiff {
  name: string;
  change: DiffChangeKind;
  details?: {
    channel?: { from: string; to: string };
    payloadChanged?: boolean;
  };
}

export interface EntityDiff {
  name: string;
  change: DiffChangeKind;
  module?: { from: string | undefined; to: string | undefined };
  properties: PropertyDiff[];
  computedProperties: ComputedPropertyDiff[];
  relationships: RelationshipDiff[];
  constraints: ConstraintDiff[];
  commands: string[];
  policies: string[];
  versionProperty?: { from: string | undefined; to: string | undefined };
}

export interface ModuleDiff {
  name: string;
  change: DiffChangeKind;
  entities: { added: string[]; removed: string[] };
  commands: { added: string[]; removed: string[] };
  stores: { added: string[]; removed: string[] };
  events: { added: string[]; removed: string[] };
  policies: { added: string[]; removed: string[] };
}

export interface IRDiffReport {
  /** Top-level summary */
  summary: {
    entitiesAdded: number;
    entitiesRemoved: number;
    entitiesChanged: number;
    commandsAdded: number;
    commandsRemoved: number;
    commandsChanged: number;
    policiesAdded: number;
    policiesRemoved: number;
    policiesChanged: number;
    eventsAdded: number;
    eventsRemoved: number;
    eventsChanged: number;
    storesAdded: number;
    storesRemoved: number;
    storesChanged: number;
    modulesAdded: number;
    modulesRemoved: number;
    hasChanges: boolean;
  };
  modules: ModuleDiff[];
  entities: EntityDiff[];
  commands: CommandDiff[];
  policies: PolicyDiff[];
  stores: StoreDiff[];
  events: EventDiff[];
}

// ============================================================================
// SQL/Prisma migration types
// ============================================================================

export interface MigrationColumnChange {
  columnName: string;
  change: DiffChangeKind;
  details?: {
    type?: { from: string; to: string };
    nullable?: { from: boolean; to: boolean };
    default?: { from: string | undefined; to: string | undefined };
    unique?: { from: boolean; to: boolean };
  };
}

export interface MigrationTableChange {
  tableName: string;
  change: DiffChangeKind;
  columns: MigrationColumnChange[];
}

export interface MigrationReport {
  /** SQL DDL statements (PostgreSQL) */
  sql: string[];
  /** Prisma schema migration steps */
  prisma: string[];
  /** Human-readable summary */
  summary: string[];
  /** Warnings about potentially destructive changes */
  warnings: string[];
}

// ============================================================================
// Helpers
// ============================================================================

function byName<T extends { name: string }>(items: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(item.name, item);
  }
  return map;
}

function serializeIRValue(v: IRValue | undefined): string {
  if (!v) return '';
  switch (v.kind) {
    case 'string':
      return `"${v.value}"`;
    case 'number':
      return String(v.value);
    case 'boolean':
      return String(v.value);
    case 'null':
      return 'null';
    case 'array':
      return `[${v.elements.map(serializeIRValue).join(', ')}]`;
    case 'object': {
      const entries = Object.entries(v.properties).map(
        ([k, val]) => `${k}: ${serializeIRValue(val)}`,
      );
      return `{${entries.join(', ')}}`;
    }
  }
}

function serializeIRType(t: IRType): string {
  let base = t.name;
  if (t.generic) base = `${base}<${serializeIRType(t.generic)}>`;
  if (t.nullable) base = `${base}?`;
  return base;
}

function modifiersEqual(a: PropertyModifier[], b: PropertyModifier[]): boolean {
  if (a.length !== b.length) return false;
  const sorted = (arr: PropertyModifier[]) => [...arr].sort((a, b) => a.localeCompare(b));
  const sa = sorted(a);
  const sb = sorted(b);
  return sa.every((v, i) => v === sb[i]);
}

// ============================================================================
// Property diffing
// ============================================================================

function diffProperties(oldProps: IRProperty[], newProps: IRProperty[]): PropertyDiff[] {
  const result: PropertyDiff[] = [];
  const oldMap = byName(oldProps);
  const newMap = byName(newProps);

  // Removed properties
  for (const [name] of oldMap) {
    if (!newMap.has(name)) {
      result.push({ name, change: 'removed' });
    }
  }

  // Added + changed properties
  for (const [name, prop] of newMap) {
    const old = oldMap.get(name);
    if (!old) {
      result.push({ name, change: 'added' });
      continue;
    }

    const typeChanged = serializeIRType(old.type) !== serializeIRType(prop.type);
    const modifiersChanged = !modifiersEqual(old.modifiers, prop.modifiers);
    const defaultChanged =
      serializeIRValue(old.defaultValue) !== serializeIRValue(prop.defaultValue);

    if (typeChanged || modifiersChanged || defaultChanged) {
      result.push({
        name,
        change: 'changed',
        details: {
          ...(typeChanged
            ? { type: { from: serializeIRType(old.type), to: serializeIRType(prop.type) } }
            : {}),
          ...(modifiersChanged
            ? { modifiers: { from: [...old.modifiers], to: [...prop.modifiers] } }
            : {}),
          ...(defaultChanged
            ? {
                defaultValue: {
                  from: serializeIRValue(old.defaultValue),
                  to: serializeIRValue(prop.defaultValue),
                },
              }
            : {}),
        },
      });
    }
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

// ============================================================================
// Computed property diffing
// ============================================================================

function diffComputedProperties(
  oldProps: IRComputedProperty[],
  newProps: IRComputedProperty[],
): ComputedPropertyDiff[] {
  const result: ComputedPropertyDiff[] = [];
  const oldMap = byName(oldProps);
  const newMap = byName(newProps);

  for (const [name] of oldMap) {
    if (!newMap.has(name)) {
      result.push({ name, change: 'removed' });
    }
  }

  for (const [name, prop] of newMap) {
    const old = oldMap.get(name);
    if (!old) {
      result.push({ name, change: 'added' });
      continue;
    }

    const typeChanged = serializeIRType(old.type) !== serializeIRType(prop.type);
    const depsChanged =
      JSON.stringify([...old.dependencies].sort((a, b) => a.localeCompare(b))) !==
      JSON.stringify([...prop.dependencies].sort((a, b) => a.localeCompare(b)));
    // Expression comparison via JSON serialization (structural equality)
    const exprChanged = JSON.stringify(old.expression) !== JSON.stringify(prop.expression);

    if (typeChanged || depsChanged || exprChanged) {
      result.push({
        name,
        change: 'changed',
        details: {
          ...(typeChanged
            ? { type: { from: serializeIRType(old.type), to: serializeIRType(prop.type) } }
            : {}),
          ...(exprChanged ? { expression: { from: '[changed]', to: '[changed]' } } : {}),
          ...(depsChanged
            ? { dependencies: { from: old.dependencies, to: prop.dependencies } }
            : {}),
        },
      });
    }
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

// ============================================================================
// Relationship diffing
// ============================================================================

function diffRelationships(
  oldRels: IRRelationship[],
  newRels: IRRelationship[],
): RelationshipDiff[] {
  const result: RelationshipDiff[] = [];
  const oldMap = byName(oldRels);
  const newMap = byName(newRels);

  for (const [name] of oldMap) {
    if (!newMap.has(name)) {
      result.push({ name, change: 'removed' });
    }
  }

  for (const [name, rel] of newMap) {
    const old = oldMap.get(name);
    if (!old) {
      result.push({ name, change: 'added' });
      continue;
    }

    const kindChanged = old.kind !== rel.kind;
    const targetChanged = old.target !== rel.target;
    const fkChanged = JSON.stringify(old.foreignKey) !== JSON.stringify(rel.foreignKey);
    const throughChanged = old.through !== rel.through;
    const onDeleteChanged = old.onDelete !== rel.onDelete;
    const onUpdateChanged = old.onUpdate !== rel.onUpdate;

    if (
      kindChanged ||
      targetChanged ||
      fkChanged ||
      throughChanged ||
      onDeleteChanged ||
      onUpdateChanged
    ) {
      result.push({
        name,
        change: 'changed',
        details: {
          ...(kindChanged ? { kind: { from: old.kind, to: rel.kind } } : {}),
          ...(targetChanged ? { target: { from: old.target, to: rel.target } } : {}),
          ...(fkChanged ? { foreignKeyChanged: true } : {}),
          ...(throughChanged ? { through: { from: old.through, to: rel.through } } : {}),
          ...(onDeleteChanged ? { onDelete: { from: old.onDelete, to: rel.onDelete } } : {}),
          ...(onUpdateChanged ? { onUpdate: { from: old.onUpdate, to: rel.onUpdate } } : {}),
        },
      });
    }
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

// ============================================================================
// Constraint diffing
// ============================================================================

function diffConstraints(
  oldConstraints: IRConstraint[],
  newConstraints: IRConstraint[],
): ConstraintDiff[] {
  const result: ConstraintDiff[] = [];
  const oldMap = byName(oldConstraints);
  const newMap = byName(newConstraints);

  for (const [name] of oldMap) {
    if (!newMap.has(name)) {
      result.push({ name, change: 'removed' });
    }
  }

  for (const [name, c] of newMap) {
    const old = oldMap.get(name);
    if (!old) {
      result.push({ name, change: 'added' });
      continue;
    }

    const severityChanged = old.severity !== c.severity;
    const messageChanged = old.message !== c.message;
    const exprChanged = JSON.stringify(old.expression) !== JSON.stringify(c.expression);

    if (severityChanged || messageChanged || exprChanged) {
      result.push({
        name,
        change: 'changed',
        details: {
          ...(severityChanged
            ? { severity: { from: old.severity ?? 'block', to: c.severity ?? 'block' } }
            : {}),
          ...(messageChanged ? { message: { from: old.message, to: c.message } } : {}),
        },
      });
    }
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

// ============================================================================
// Entity diffing
// ============================================================================

function diffEntities(oldIR: IR, newIR: IR): EntityDiff[] {
  const result: EntityDiff[] = [];
  const oldMap = byName(oldIR.entities);
  const newMap = byName(newIR.entities);

  // Removed entities
  for (const [name, entity] of oldMap) {
    if (!newMap.has(name)) {
      result.push({
        name,
        change: 'removed',
        module: { from: entity.module, to: undefined },
        properties: entity.properties.map((p) => ({ name: p.name, change: 'removed' as const })),
        computedProperties: entity.computedProperties.map((p) => ({
          name: p.name,
          change: 'removed' as const,
        })),
        relationships: entity.relationships.map((r) => ({
          name: r.name,
          change: 'removed' as const,
        })),
        constraints: entity.constraints.map((c) => ({ name: c.name, change: 'removed' as const })),
        commands: [...entity.commands],
        policies: [...entity.policies],
        versionProperty: { from: entity.versionProperty, to: undefined },
      });
    }
  }

  // Added + changed entities
  for (const [name, entity] of newMap) {
    const old = oldMap.get(name);
    if (!old) {
      result.push({
        name,
        change: 'added',
        module: { from: undefined, to: entity.module },
        properties: entity.properties.map((p) => ({ name: p.name, change: 'added' as const })),
        computedProperties: entity.computedProperties.map((p) => ({
          name: p.name,
          change: 'added' as const,
        })),
        relationships: entity.relationships.map((r) => ({
          name: r.name,
          change: 'added' as const,
        })),
        constraints: entity.constraints.map((c) => ({ name: c.name, change: 'added' as const })),
        commands: [...entity.commands],
        policies: [...entity.policies],
        versionProperty: { from: undefined, to: entity.versionProperty },
      });
      continue;
    }

    const moduleChanged = old.module !== entity.module;
    const versionPropertyChanged = old.versionProperty !== entity.versionProperty;

    const properties = diffProperties(old.properties, entity.properties);
    const computedProperties = diffComputedProperties(
      old.computedProperties,
      entity.computedProperties,
    );
    const relationships = diffRelationships(old.relationships, entity.relationships);
    const constraints = diffConstraints(old.constraints, entity.constraints);

    const commandsDiff = diffStringArrays(old.commands, entity.commands);
    const policiesDiff = diffStringArrays(old.policies, entity.policies);

    const hasChanges =
      moduleChanged ||
      versionPropertyChanged ||
      properties.length > 0 ||
      computedProperties.length > 0 ||
      relationships.length > 0 ||
      constraints.length > 0 ||
      commandsDiff.added.length > 0 ||
      commandsDiff.removed.length > 0 ||
      policiesDiff.added.length > 0 ||
      policiesDiff.removed.length > 0;

    if (hasChanges) {
      result.push({
        name,
        change: 'changed',
        ...(moduleChanged ? { module: { from: old.module, to: entity.module } } : {}),
        properties,
        computedProperties,
        relationships,
        constraints,
        commands: [...commandsDiff.added, ...commandsDiff.removed],
        policies: [...policiesDiff.added, ...policiesDiff.removed],
        ...(versionPropertyChanged
          ? { versionProperty: { from: old.versionProperty, to: entity.versionProperty } }
          : {}),
      });
    }
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

// ============================================================================
// Command diffing
// ============================================================================

function diffCommands(oldCommands: IRCommand[], newCommands: IRCommand[]): CommandDiff[] {
  const result: CommandDiff[] = [];
  const oldMap = byName(oldCommands);
  const newMap = byName(newCommands);

  for (const [name] of oldMap) {
    if (!newMap.has(name)) {
      result.push({ name, change: 'removed' });
    }
  }

  for (const [name, cmd] of newMap) {
    const old = oldMap.get(name);
    if (!old) {
      result.push({ name, change: 'added' });
      continue;
    }

    const entityChanged = old.entity !== cmd.entity;
    const paramsDiff = diffStringArrays(
      old.parameters.map((p) => `${p.name}:${serializeIRType(p.type)}`),
      cmd.parameters.map((p) => `${p.name}:${serializeIRType(p.type)}`),
    );
    const guardsChanged = JSON.stringify(old.guards) !== JSON.stringify(cmd.guards);
    const actionsChanged = JSON.stringify(old.actions) !== JSON.stringify(cmd.actions);
    const emitsChanged =
      JSON.stringify([...old.emits].sort((a, b) => a.localeCompare(b))) !==
      JSON.stringify([...cmd.emits].sort((a, b) => a.localeCompare(b)));
    const returnsChanged =
      serializeIRType(old.returns ?? { name: 'void', nullable: false }) !==
      serializeIRType(cmd.returns ?? { name: 'void', nullable: false });

    if (
      entityChanged ||
      paramsDiff.added.length > 0 ||
      paramsDiff.removed.length > 0 ||
      guardsChanged ||
      actionsChanged ||
      emitsChanged ||
      returnsChanged
    ) {
      result.push({
        name,
        change: 'changed',
        details: {
          ...(entityChanged ? { entity: { from: old.entity, to: cmd.entity } } : {}),
          ...(paramsDiff.added.length > 0 ? { parametersAdded: paramsDiff.added } : {}),
          ...(paramsDiff.removed.length > 0 ? { parametersRemoved: paramsDiff.removed } : {}),
          ...(guardsChanged ? { guardsChanged: true } : {}),
          ...(actionsChanged ? { actionsChanged: true } : {}),
          ...(emitsChanged ? { emitsChanged: true } : {}),
          ...(returnsChanged ? { returnsChanged: true } : {}),
        },
      });
    }
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

// ============================================================================
// Policy diffing
// ============================================================================

function diffPolicies(oldPolicies: IRPolicy[], newPolicies: IRPolicy[]): PolicyDiff[] {
  const result: PolicyDiff[] = [];
  const oldMap = byName(oldPolicies);
  const newMap = byName(newPolicies);

  for (const [name] of oldMap) {
    if (!newMap.has(name)) {
      result.push({ name, change: 'removed' });
    }
  }

  for (const [name, pol] of newMap) {
    const old = oldMap.get(name);
    if (!old) {
      result.push({ name, change: 'added' });
      continue;
    }

    const entityChanged = old.entity !== pol.entity;
    const actionChanged = old.action !== pol.action;
    const exprChanged = JSON.stringify(old.expression) !== JSON.stringify(pol.expression);

    if (entityChanged || actionChanged || exprChanged) {
      result.push({
        name,
        change: 'changed',
        details: {
          ...(entityChanged ? { entity: { from: old.entity, to: pol.entity } } : {}),
          ...(actionChanged ? { action: { from: old.action, to: pol.action } } : {}),
          ...(exprChanged ? { expressionChanged: true } : {}),
        },
      });
    }
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

// ============================================================================
// Store diffing
// ============================================================================

function diffStores(oldStores: IRStore[], newStores: IRStore[]): StoreDiff[] {
  const result: StoreDiff[] = [];
  const oldMap = byName(oldStores.map((s) => ({ ...s, name: s.entity })));
  const newMap = byName(newStores.map((s) => ({ ...s, name: s.entity })));

  for (const [entity] of oldMap) {
    if (!newMap.has(entity)) {
      result.push({ entity, change: 'removed' });
    }
  }

  for (const [entity, store] of newMap) {
    const old = oldMap.get(entity);
    if (!old) {
      result.push({ entity, change: 'added' });
      continue;
    }

    const targetChanged = old.target !== store.target;
    const configChanged = JSON.stringify(old.config) !== JSON.stringify(store.config);

    if (targetChanged || configChanged) {
      result.push({
        entity,
        change: 'changed',
        details: {
          ...(targetChanged ? { target: { from: old.target, to: store.target } } : {}),
          ...(configChanged ? { configChanged: true } : {}),
        },
      });
    }
  }

  return result.sort((a, b) => a.entity.localeCompare(b.entity));
}

// ============================================================================
// Event diffing
// ============================================================================

function diffEvents(oldEvents: IREvent[], newEvents: IREvent[]): EventDiff[] {
  const result: EventDiff[] = [];
  const oldMap = byName(oldEvents);
  const newMap = byName(newEvents);

  for (const [name] of oldMap) {
    if (!newMap.has(name)) {
      result.push({ name, change: 'removed' });
    }
  }

  for (const [name, evt] of newMap) {
    const old = oldMap.get(name);
    if (!old) {
      result.push({ name, change: 'added' });
      continue;
    }

    const channelChanged = old.channel !== evt.channel;
    const payloadChanged = JSON.stringify(old.payload) !== JSON.stringify(evt.payload);

    if (channelChanged || payloadChanged) {
      result.push({
        name,
        change: 'changed',
        details: {
          ...(channelChanged ? { channel: { from: old.channel, to: evt.channel } } : {}),
          ...(payloadChanged ? { payloadChanged: true } : {}),
        },
      });
    }
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

// ============================================================================
// Module diffing
// ============================================================================

function diffModules(oldModules: IR['modules'], newModules: IR['modules']): ModuleDiff[] {
  const result: ModuleDiff[] = [];
  const oldMap = byName(oldModules);
  const newMap = byName(newModules);

  for (const [name, mod] of oldMap) {
    if (!newMap.has(name)) {
      result.push({
        name,
        change: 'removed',
        entities: { added: [], removed: mod.entities },
        commands: { added: [], removed: mod.commands },
        stores: { added: [], removed: mod.stores },
        events: { added: [], removed: mod.events },
        policies: { added: [], removed: mod.policies },
      });
    }
  }

  for (const [name, mod] of newMap) {
    const old = oldMap.get(name);
    if (!old) {
      result.push({
        name,
        change: 'added',
        entities: { added: mod.entities, removed: [] },
        commands: { added: mod.commands, removed: [] },
        stores: { added: mod.stores, removed: [] },
        events: { added: mod.events, removed: [] },
        policies: { added: mod.policies, removed: [] },
      });
      continue;
    }

    const entitiesDiff = diffStringArrays(old.entities, mod.entities);
    const commandsDiff = diffStringArrays(old.commands, mod.commands);
    const storesDiff = diffStringArrays(old.stores, mod.stores);
    const eventsDiff = diffStringArrays(old.events, mod.events);
    const policiesDiff = diffStringArrays(old.policies, mod.policies);

    const hasChanges =
      entitiesDiff.added.length > 0 ||
      entitiesDiff.removed.length > 0 ||
      commandsDiff.added.length > 0 ||
      commandsDiff.removed.length > 0 ||
      storesDiff.added.length > 0 ||
      storesDiff.removed.length > 0 ||
      eventsDiff.added.length > 0 ||
      eventsDiff.removed.length > 0 ||
      policiesDiff.added.length > 0 ||
      policiesDiff.removed.length > 0;

    if (hasChanges) {
      result.push({
        name,
        change: 'changed',
        entities: entitiesDiff,
        commands: commandsDiff,
        stores: storesDiff,
        events: eventsDiff,
        policies: policiesDiff,
      });
    }
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

// ============================================================================
// String array diffing helper
// ============================================================================

function diffStringArrays(
  oldArr: string[],
  newArr: string[],
): { added: string[]; removed: string[] } {
  const oldSet = new Set(oldArr);
  const newSet = new Set(newArr);
  return {
    added: newArr.filter((v) => !oldSet.has(v)).sort((a, b) => a.localeCompare(b)),
    removed: oldArr.filter((v) => !newSet.has(v)).sort((a, b) => a.localeCompare(b)),
  };
}

// ============================================================================
// Main diff function
// ============================================================================

/**
 * Compare two IR versions and produce a structured diff report.
 */
export function diffIR(oldIR: IR, newIR: IR): IRDiffReport {
  const entityDiffs = diffEntities(oldIR, newIR);
  const commandDiffs = diffCommands(oldIR.commands, newIR.commands);
  const policyDiffs = diffPolicies(oldIR.policies, newIR.policies);
  const storeDiffs = diffStores(oldIR.stores, newIR.stores);
  const eventDiffs = diffEvents(oldIR.events, newIR.events);
  const moduleDiffs = diffModules(oldIR.modules, newIR.modules);

  const entitiesAdded = entityDiffs.filter((d) => d.change === 'added').length;
  const entitiesRemoved = entityDiffs.filter((d) => d.change === 'removed').length;
  const entitiesChanged = entityDiffs.filter((d) => d.change === 'changed').length;
  const commandsAdded = commandDiffs.filter((d) => d.change === 'added').length;
  const commandsRemoved = commandDiffs.filter((d) => d.change === 'removed').length;
  const commandsChanged = commandDiffs.filter((d) => d.change === 'changed').length;
  const policiesAdded = policyDiffs.filter((d) => d.change === 'added').length;
  const policiesRemoved = policyDiffs.filter((d) => d.change === 'removed').length;
  const policiesChanged = policyDiffs.filter((d) => d.change === 'changed').length;
  const eventsAdded = eventDiffs.filter((d) => d.change === 'added').length;
  const eventsRemoved = eventDiffs.filter((d) => d.change === 'removed').length;
  const eventsChanged = eventDiffs.filter((d) => d.change === 'changed').length;
  const storesAdded = storeDiffs.filter((d) => d.change === 'added').length;
  const storesRemoved = storeDiffs.filter((d) => d.change === 'removed').length;
  const storesChanged = storeDiffs.filter((d) => d.change === 'changed').length;
  const modulesAdded = moduleDiffs.filter((d) => d.change === 'added').length;
  const modulesRemoved = moduleDiffs.filter((d) => d.change === 'removed').length;

  const hasChanges =
    entitiesAdded +
      entitiesRemoved +
      entitiesChanged +
      commandsAdded +
      commandsRemoved +
      commandsChanged +
      policiesAdded +
      policiesRemoved +
      policiesChanged +
      eventsAdded +
      eventsRemoved +
      eventsChanged +
      storesAdded +
      storesRemoved +
      storesChanged +
      modulesAdded +
      modulesRemoved >
    0;

  return {
    summary: {
      entitiesAdded,
      entitiesRemoved,
      entitiesChanged,
      commandsAdded,
      commandsRemoved,
      commandsChanged,
      policiesAdded,
      policiesRemoved,
      policiesChanged,
      eventsAdded,
      eventsRemoved,
      eventsChanged,
      storesAdded,
      storesRemoved,
      storesChanged,
      modulesAdded,
      modulesRemoved,
      hasChanges,
    },
    modules: moduleDiffs,
    entities: entityDiffs,
    commands: commandDiffs,
    policies: policyDiffs,
    stores: storeDiffs,
    events: eventDiffs,
  };
}

// ============================================================================
// Migration generation
// ============================================================================

/**
 * Manifest IR type to SQL type mapping.
 * This is the default mapping; consumers can override via the Prisma projection config.
 */
function irTypeToSql(type: IRType): string {
  const nullable = type.nullable ? '' : ' NOT NULL';
  const base =
    type.name === 'array' && type.generic
      ? 'JSONB' // Arrays stored as JSONB
      : sqlScalarForTypeName(type.name);
  return `${base}${nullable}`;
}

function sqlScalarForTypeName(name: string): string {
  switch (name) {
    case 'string':
      return 'TEXT';
    case 'boolean':
      return 'BOOLEAN';
    case 'int':
      return 'INTEGER';
    case 'bigint':
      return 'BIGINT';
    case 'float':
      return 'DOUBLE PRECISION';
    case 'decimal':
    case 'money':
      return 'DECIMAL(12,2)';
    case 'date':
      return 'DATE';
    case 'datetime':
      return 'TIMESTAMPTZ';
    case 'json':
      return 'JSONB';
    case 'uuid':
      return 'UUID';
    case 'text':
      return 'TEXT';
    case 'bytes':
      return 'BYTEA';
    default:
      return 'TEXT';
  }
}

function irTypeToPrisma(type: IRType): string {
  const base =
    type.name === 'array' && type.generic
      ? `${irScalarToPrisma(type.generic.name)}[]`
      : irScalarToPrisma(type.name);
  const nullable = type.nullable ? '?' : '';
  return `${base}${nullable}`;
}

function irScalarToPrisma(name: string): string {
  switch (name) {
    case 'string':
      return 'String';
    case 'boolean':
      return 'Boolean';
    case 'int':
      return 'Int';
    case 'bigint':
      return 'BigInt';
    case 'float':
      return 'Float';
    case 'decimal':
    case 'money':
      return 'Decimal';
    case 'date':
    case 'datetime':
      return 'DateTime';
    case 'json':
      return 'Json';
    case 'uuid':
      return 'String';
    case 'text':
      return 'String';
    case 'bytes':
      return 'Bytes';
    default:
      return 'String';
  }
}

/**
 * Generate migration scripts (SQL and Prisma) from an IR diff report.
 *
 * The migration is advisory — the consumer decides whether to apply.
 * Generated SQL targets PostgreSQL. Prisma output provides the equivalent
 * Prisma schema steps.
 */
export function generateMigration(diff: IRDiffReport, _oldIR: IR, newIR: IR): MigrationReport {
  const sql: string[] = [];
  const prisma: string[] = [];
  const summary: string[] = [];
  const warnings: string[] = [];

  // Process entity changes into table-level operations
  for (const entityDiff of diff.entities) {
    const tableName = entityDiff.name.toLowerCase();

    if (entityDiff.change === 'added') {
      sql.push(`-- Create table for entity: ${entityDiff.name}`);
      const newEntity = newIR.entities.find((e) => e.name === entityDiff.name)!;
      const columns = newEntity.properties.map((p) => {
        const colDef = `  ${p.name} ${irTypeToSql(p.type)}`;
        const isUnique = p.modifiers.includes('unique');
        const extra = [];
        if (p.name === 'id') extra.push('PRIMARY KEY');
        if (isUnique && p.name !== 'id') extra.push('UNIQUE');
        if (p.defaultValue) {
          const def = serializeIRValue(p.defaultValue);
          extra.push(`DEFAULT ${def}`);
        }
        return colDef + (extra.length ? ' ' + extra.join(' ') : '');
      });
      sql.push(`CREATE TABLE "${tableName}" (\n${columns.join(',\n')}\n);`);
      prisma.push(`// Create model: ${entityDiff.name}`);
      prisma.push(`model ${entityDiff.name} {`);
      for (const p of newEntity.properties) {
        const typeStr = irTypeToPrisma(p.type);
        const attrs: string[] = [];
        if (p.name === 'id') attrs.push('@id');
        if (p.modifiers.includes('unique') && p.name !== 'id') attrs.push('@unique');
        if (p.defaultValue) attrs.push(`@default(${serializeIRValue(p.defaultValue)})`);
        prisma.push(`  ${p.name} ${typeStr}${attrs.length ? ' ' + attrs.join(' ') : ''}`);
      }
      prisma.push('}');
      summary.push(`Added entity '${entityDiff.name}' (new table '${tableName}')`);
    } else if (entityDiff.change === 'removed') {
      warnings.push(`DROPPING TABLE '${tableName}' — all data will be lost!`);
      sql.push(`-- Drop table for removed entity: ${entityDiff.name}`);
      sql.push(`DROP TABLE IF EXISTS "${tableName}";`);
      prisma.push(`// Remove model: ${entityDiff.name}`);
      summary.push(`Removed entity '${entityDiff.name}' (drops table '${tableName}')`);
    } else if (entityDiff.change === 'changed') {
      sql.push(`-- Alter table for entity: ${entityDiff.name}`);
      prisma.push(`// Alter model: ${entityDiff.name}`);

      for (const propDiff of entityDiff.properties) {
        if (propDiff.change === 'added') {
          const newProp = newIR.entities
            .find((e) => e.name === entityDiff.name)!
            .properties.find((p) => p.name === propDiff.name)!;
          const colType = irTypeToSql(newProp.type);
          sql.push(`ALTER TABLE "${tableName}" ADD COLUMN "${propDiff.name}" ${colType};`);
          prisma.push(`// Add field: ${propDiff.name} ${irTypeToPrisma(newProp.type)}`);
          summary.push(`Added property '${entityDiff.name}.${propDiff.name}'`);
        } else if (propDiff.change === 'removed') {
          warnings.push(`DROPPING COLUMN '${tableName}.${propDiff.name}' — data will be lost!`);
          sql.push(`ALTER TABLE "${tableName}" DROP COLUMN IF EXISTS "${propDiff.name}";`);
          prisma.push(`// Remove field: ${propDiff.name}`);
          summary.push(`Removed property '${entityDiff.name}.${propDiff.name}'`);
        } else if (propDiff.change === 'changed' && propDiff.details) {
          if (propDiff.details.type) {
            sql.push(
              `ALTER TABLE "${tableName}" ALTER COLUMN "${propDiff.name}" TYPE ${propDiff.details.type.to};`,
            );
            prisma.push(
              `// Change field type: ${propDiff.name} from ${propDiff.details.type.from} to ${propDiff.details.type.to}`,
            );
            summary.push(
              `Changed type of '${entityDiff.name}.${propDiff.name}' from ${propDiff.details.type.from} to ${propDiff.details.type.to}`,
            );
          }
          if (propDiff.details.modifiers) {
            const oldUnique = propDiff.details.modifiers.from.includes('unique');
            const newUnique = propDiff.details.modifiers.to.includes('unique');
            if (!oldUnique && newUnique) {
              sql.push(`ALTER TABLE "${tableName}" ADD UNIQUE ("${propDiff.name}");`);
            } else if (oldUnique && !newUnique) {
              sql.push(
                `ALTER TABLE "${tableName}" DROP CONSTRAINT IF EXISTS "${tableName}_${propDiff.name}_key";`,
              );
            }
          }
        }
      }

      // Constraint changes
      for (const constraintDiff of entityDiff.constraints) {
        if (constraintDiff.change === 'added') {
          summary.push(`Added constraint '${entityDiff.name}.${constraintDiff.name}'`);
        } else if (constraintDiff.change === 'removed') {
          summary.push(`Removed constraint '${entityDiff.name}.${constraintDiff.name}'`);
        } else if (constraintDiff.change === 'changed') {
          summary.push(`Changed constraint '${entityDiff.name}.${constraintDiff.name}'`);
        }
      }
    }
  }

  // Store changes (may affect where data lives)
  for (const storeDiff of diff.stores) {
    if (storeDiff.change === 'added') {
      summary.push(`Added store for '${storeDiff.entity}'`);
    } else if (storeDiff.change === 'removed') {
      summary.push(`Removed store for '${storeDiff.entity}'`);
    } else if (storeDiff.change === 'changed') {
      summary.push(`Changed store for '${storeDiff.entity}'`);
    }
  }

  // Event changes
  for (const eventDiff of diff.events) {
    summary.push(`${eventDiff.change} event '${eventDiff.name}'`);
  }

  // Command changes
  for (const cmdDiff of diff.commands) {
    summary.push(`${cmdDiff.change} command '${cmdDiff.name}'`);
  }

  // Policy changes
  for (const policyDiff of diff.policies) {
    summary.push(`${policyDiff.change} policy '${policyDiff.name}'`);
  }

  return { sql, prisma, summary, warnings };
}
