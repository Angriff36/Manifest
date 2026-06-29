/**
 * Domain completeness diagnostics — product-wiring checks beyond syntax/semantics.
 * Surfaces half-wired owned-child models (manual FK params with no belongsTo),
 * one-sided relationships, and orphan entities so they fail at compile time, not in the app.
 */

import type { IRCommand, IREntity, IRProperty, IRReactionRule, IRStore, IRTenant } from './ir.js';

/** Params the runtime/session provides — never required on user-facing create forms. */
const CONTEXT_INJECTED_CREATE_PARAMS = new Set([
  'tenantId',
  'orgId',
  'organizationId',
  'userId',
  'createdById',
  'updatedById',
  'actorId',
  'requestId',
  'correlationId',
  'causationId',
]);

/** Cross-cutting FK params — not required to declare belongsTo to a domain entity. */
const GLOBAL_FK_PARAMS = new Set([
  'tenantId',
  'orgId',
  'organizationId',
  'userId',
  'ownerId',
  'createdById',
  'updatedById',
  'requestId',
  'correlationId',
  'causationId',
]);

/** Fields legitimately child-specific or infrastructure — not parent-context propagation. */
export const PARENT_CONTEXT_EXCLUDED_FIELDS = new Set([
  'id',
  'tenantId',
  'status',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'name',
  'title',
  'notes',
  'description',
  'tags',
  'type',
  'version',
]);

function scalarTypeName(type: IRProperty['type']): string | null {
  const name = type?.name;
  if (!name || name === 'array' || name === 'list') return null;
  return name;
}

export type DomainCompletenessEmit = (
  severity: 'error' | 'warning' | 'info',
  message: string,
) => void;

function qualifyEntity(entity: IREntity): string {
  return entity.module ? `${entity.module}.${entity.name}` : entity.name;
}

function toCamelCase(entityName: string): string {
  return entityName.charAt(0).toLowerCase() + entityName.slice(1);
}

/** Map `disciplinaryActionId` → `DisciplinaryAction` when that entity exists. */
export function resolveEntityForFkField(
  fieldName: string,
  entityNames: ReadonlySet<string>,
): string | null {
  if (!fieldName.endsWith('Id') || fieldName.length <= 2) return null;
  if (GLOBAL_FK_PARAMS.has(fieldName)) return null;
  const stem = fieldName.slice(0, -2);
  for (const name of entityNames) {
    if (toCamelCase(name) === stem) return name;
  }
  return null;
}

function defaultFkField(relationshipName: string): string {
  return `${relationshipName}Id`;
}

function entityHasBelongsToTarget(entity: IREntity, targetEntity: string, fkField?: string): boolean {
  return entity.relationships.some(r => {
    if (r.kind !== 'belongsTo' && r.kind !== 'ref') return false;
    if (r.target !== targetEntity) return false;
    if (!fkField) return true;
    const fields = r.foreignKey?.fields ?? [defaultFkField(r.name)];
    return fields.includes(fkField);
  });
}

function parentHasInverseRelation(parent: IREntity, childEntity: string): boolean {
  return parent.relationships.some(
    r => (r.kind === 'hasMany' || r.kind === 'hasOne') && r.target === childEntity,
  );
}

function parentHasNestedChildCreate(parent: IREntity, childEntity: string, commands: IRCommand[]): boolean {
  return commands.some(cmd => {
    if (cmd.entity !== parent.name || cmd.module !== parent.module) return false;
    if (cmd.name === 'create') return false;
    return cmd.actions.some(a => {
      if (a.kind !== 'persist' && a.kind !== 'mutate') return false;
      const target = a.target ?? '';
      return target.toLowerCase().includes(childEntity.toLowerCase());
    });
  });
}

function reactionWiresParentIdForCreate(
  reactions: IRReactionRule[],
  childEntity: string,
  childModule: string | undefined,
  fkField: string,
): boolean {
  return reactions.some(r => {
    if (r.targetEntity !== childEntity) return false;
    if (r.targetCommand !== 'create') return false;
    if ((childModule ?? undefined) !== (r.module ?? undefined)) return false;
    return r.params?.some(p => p.name === fkField) ?? false;
  });
}

function collectFkFieldsForEntity(entity: IREntity, createCmd: IRCommand | undefined): string[] {
  const fields = new Set<string>();
  for (const p of entity.properties) {
    if (p.name.endsWith('Id') && p.name !== 'id') fields.add(p.name);
  }
  if (createCmd) {
    for (const p of createCmd.parameters) {
      if (p.required && p.name.endsWith('Id')) fields.add(p.name);
    }
  }
  return [...fields];
}

function findEntity(entities: IREntity[], name: string, module?: string): IREntity | undefined {
  return entities.find(e => e.name === name && e.module === module);
}

function findCreateCommand(entity: IREntity, commands: IRCommand[]): IRCommand | undefined {
  return commands.find(
    c => c.name === 'create' && c.entity === entity.name && c.module === entity.module,
  );
}

function entityHasDomainWiringSignals(
  entity: IREntity,
  createCmd: IRCommand | undefined,
  entityNames: ReadonlySet<string>,
): boolean {
  if (entity.relationships.some(r => r.kind === 'belongsTo' || r.kind === 'ref')) return true;
  return collectFkFieldsForEntity(entity, createCmd).some(
    fk => resolveEntityForFkField(fk, entityNames) != null,
  );
}

function isAutoProvidedCreateParam(
  paramName: string,
  entity: IREntity,
  tenant: IRTenant | undefined,
): boolean {
  if (tenant?.property && paramName === tenant.property) return true;
  if (CONTEXT_INJECTED_CREATE_PARAMS.has(paramName)) return true;
  if (entity.timestamps && (paramName === 'createdAt' || paramName === 'updatedAt')) return true;
  if (entity.versionProperty && paramName === entity.versionProperty) return true;
  if (entity.versionAtProperty && paramName === entity.versionAtProperty) return true;
  return false;
}

function checkEntityReachability(
  entity: IREntity,
  entities: IREntity[],
  stores: IRStore[],
  commands: IRCommand[],
  entityNames: ReadonlySet<string>,
  emit: DomainCompletenessEmit,
): void {
  const qualified = qualifyEntity(entity);
  const hasStore = stores.some(s => s.entity === entity.name);
  const isRelationshipTarget = entities.some(e =>
    e.relationships.some(r => r.target === entity.name),
  );
  const hasCommands = commands.some(c => c.entity === entity.name);
  const createCmd = findCreateCommand(entity, commands);
  const isUnused =
    !hasCommands && !isRelationshipTarget && entity.computedProperties.length === 0;

  if (hasStore && isUnused) {
    const msg = `Entity '${qualified}' is persisted (has store) but has no commands and is not referenced by any relationship — it is unreachable in the product. Add commands or relationships, or remove the entity.`;
    const strictOrphan =
      entity.constraints.length === 0 && entityHasDomainWiringSignals(entity, createCmd, entityNames);
    emit(strictOrphan ? 'error' : 'warning', msg);
    return;
  }

  if (!hasStore && isUnused) {
    emit(
      'warning',
      `Entity '${qualified}' is declared but unused: no store, no entity-scoped commands, and not referenced by any relationship. Remove it or wire it into the domain.`,
    );
  }
}

function checkCreateCommandParams(
  entity: IREntity,
  createCmd: IRCommand,
  entities: IREntity[],
  tenant: IRTenant | undefined,
  emit: DomainCompletenessEmit,
): void {
  const qualified = qualifyEntity(entity);

  for (const param of createCmd.parameters) {
    if (!param.required) continue;
    if (isAutoProvidedCreateParam(param.name, entity, tenant)) {
      emit(
        'error',
        `Command '${qualified}.create' requires '${param.name}' but the runtime or compiler auto-provides that field — remove it from create parameters so callers are not forced to supply a value they cannot access.`,
      );
    }
  }

  const childProps = new Map(entity.properties.map(p => [p.name, scalarTypeName(p.type)]));
  for (const rel of entity.relationships) {
    if (rel.kind !== 'belongsTo' && rel.kind !== 'ref') continue;
    const parent = findEntity(entities, rel.target);
    if (!parent) continue;
    // A self-referential relationship (e.g. `belongsTo previous: Self` for a
    // reversal/version chain) does NOT make the entity's own fields "owned by a
    // parent" — the entity is not its own parent. Without this guard every
    // create param that is also a property of the entity is falsely flagged.
    if (parent.name === entity.name && parent.module === entity.module) continue;
    const parentQualified = qualifyEntity(parent);
    const parentProps = new Map(parent.properties.map(p => [p.name, scalarTypeName(p.type)]));
    const fkFields = new Set(rel.foreignKey?.fields ?? [defaultFkField(rel.name)]);

    for (const param of createCmd.parameters) {
      if (!param.required) continue;
      const name = param.name;
      if (PARENT_CONTEXT_EXCLUDED_FIELDS.has(name)) continue;
      if (fkFields.has(name)) continue;
      // Only identifier-shaped fields are genuine parent re-entry. A child that
      // re-asks for a parent's FK/identity (e.g. a board's `venueId`) is the real
      // anti-pattern this catches. A generic VALUE field that merely shares a name
      // with a parent field (a contact's own `firstName`/`email`, an area's own
      // `code`, an alert's own `severity`) is coincidental, not propagated — value
      // fields actually worth catching (status/name/type/…) are already excluded
      // above. Restricting to `*Id` removes those false positives.
      if (!name.endsWith('Id') || name.length <= 2) continue;
      const paramType = scalarTypeName(param.type);
      if (!paramType || !parentProps.has(name) || parentProps.get(name) !== paramType) continue;
      if (!childProps.has(name)) continue;
      // Advisory, not blocking: a child taking a parent/scope identifier
      // directly (instead of inheriting it via a create-from-parent command) is
      // a common, valid pattern. Nudge toward parent-context propagation, but do
      // not fail the build.
      emit(
        'warning',
        `Command '${qualified}.create' takes '${name}', which is also owned by parent '${parentQualified}' — consider populating it via parent-context propagation (create from the parent) instead of re-entering it.`,
      );
    }
  }
}

function checkFkDomainWiring(
  entity: IREntity,
  createCmd: IRCommand | undefined,
  entities: IREntity[],
  commands: IRCommand[],
  reactions: IRReactionRule[],
  entityNames: ReadonlySet<string>,
  emit: DomainCompletenessEmit,
): void {
  const qualified = qualifyEntity(entity);

  for (const fkField of collectFkFieldsForEntity(entity, createCmd)) {
    const parentName = resolveEntityForFkField(fkField, entityNames);
    if (!parentName || parentName === entity.name) continue;

    const parent = findEntity(entities, parentName);
    if (!parent) continue;

    const parentQualified = qualifyEntity(parent);

    if (!entityHasBelongsToTarget(entity, parentName, fkField)) {
      emit(
        'error',
        `Entity '${qualified}' references parent '${parentName}' via '${fkField}' but declares no belongsTo/ref relationship to '${parentName}'. Add 'belongsTo ${fkField.slice(0, -2)}: ${parentName}' (or rename the FK), or add a nested command on '${parentQualified}' that sets the FK from self.id.`,
      );
      continue;
    }

    if (!parentHasInverseRelation(parent, entity.name)) {
      emit(
        'warning',
        `Entity '${qualified}' belongsTo '${parentName}' but '${parentQualified}' has no hasMany/hasOne back to '${entity.name}'. Add 'hasMany ${toCamelCase(entity.name)}s: ${entity.name}' on the parent, or a nested create command on the parent so the child FK is implicit.`,
      );
    }

    const manualParentId =
      createCmd?.parameters.some(p => p.required && p.name === fkField) ?? false;
    const nestedCreate = parentHasNestedChildCreate(parent, entity.name, commands);
    const reactionWired = reactionWiresParentIdForCreate(
      reactions,
      entity.name,
      entity.module,
      fkField,
    );

    if (manualParentId && !nestedCreate && !reactionWired) {
      // Advisory, not blocking: the child declares belongsTo and takes the FK
      // explicitly. Creating it from a parent command (or via a reaction) is the
      // safer pattern, but a manual FK is valid — nudge, do not fail the build.
      emit(
        'warning',
        `Command '${qualified}.create' takes a manual '${fkField}' with no nested create on '${parentQualified}' (e.g. addMilestone) and no event reaction that supplies it. Consider a parent command that sets the FK from self.id, or an on Event reaction with params { ${fkField}: ... }.`,
      );
    }
  }
}

export function checkDomainCompleteness(
  entities: IREntity[],
  commands: IRCommand[],
  stores: IRStore[],
  emit: DomainCompletenessEmit,
  reactions: IRReactionRule[] = [],
  tenant?: IRTenant,
): void {
  const entityNames = new Set(entities.map(e => e.name));

  for (const entity of entities) {
    if (entity.external) continue;

    checkEntityReachability(entity, entities, stores, commands, entityNames, emit);

    const createCmd = findCreateCommand(entity, commands);
    if (createCmd) {
      checkCreateCommandParams(entity, createCmd, entities, tenant, emit);
    }

    checkFkDomainWiring(entity, createCmd, entities, commands, reactions, entityNames, emit);
  }
}
