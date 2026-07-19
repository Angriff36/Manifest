/**
 * Authoritative IR-level initialization plan.
 *
 * Construction semantics (docs/spec/semantics.md § Initialization Commands):
 * validate input → virtual draft → auth + dynamic guards → mutate draft →
 * validate final entity document → persist once. Nothing is persisted on failure.
 *
 * Projections and the reference runtime MUST consume this plan. They MUST NOT
 * invent separate creation heuristics.
 */

import type {
  IR,
  IRCommand,
  IREntity,
  IRExpression,
  IRInitializationPlan,
  IRTenant,
  IRValue,
} from './ir.js';

function isNullLiteral(expression: IRExpression): boolean {
  return expression.kind === 'literal' && expression.value.kind === 'null';
}

function isSelfProperty(expression: IRExpression, property: string): boolean {
  return (
    expression.kind === 'member' &&
    expression.property === property &&
    expression.object.kind === 'identifier' &&
    (expression.object.name === 'self' || expression.object.name === 'this')
  );
}

/** True when a guard asserts `self.<property> == null` / `is null`. */
export function guardAssertsPropertyUnset(guard: IRExpression, property: string): boolean {
  return (
    guard.kind === 'binary' &&
    (guard.operator === '==' || guard.operator === 'is') &&
    ((isSelfProperty(guard.left, property) && isNullLiteral(guard.right)) ||
      (isNullLiteral(guard.left) && isSelfProperty(guard.right, property)))
  );
}

function isNowCall(expression: IRExpression): boolean {
  return (
    expression.kind === 'call' &&
    expression.callee.kind === 'identifier' &&
    expression.callee.name === 'now'
  );
}

function initializesLifecycleTimestamp(command: IRCommand): boolean {
  return (command.actions ?? []).some(
    (action) =>
      action.kind === 'mutate' &&
      !!action.target &&
      action.target.endsWith('At') &&
      action.target !== 'updatedAt' &&
      isNowCall(action.expression) &&
      command.guards.some((guard) => guardAssertsPropertyUnset(guard, action.target!)),
  );
}

/**
 * True when a mutate action is an allocating write for a required field:
 * same-named parameter, literal, or lifecycle `now()` — not an arbitrary
 * compute/local expression (those are ordinary instance updates).
 */
function allocatesRequiredField(command: IRCommand, entity: IREntity, target: string): boolean {
  const property = entity.properties.find((item) => item.name === target);
  if (!property) return false;
  if (
    !property.modifiers.includes('required') ||
    property.defaultValue !== undefined ||
    property.autoNow ||
    target === 'id'
  ) {
    return false;
  }
  const action = (command.actions ?? []).find(
    (item) => item.kind === 'mutate' && item.target === target,
  );
  if (!action) return false;
  if (action.expression.kind === 'literal') return true;
  if (action.expression.kind === 'identifier') {
    const paramName = action.expression.name;
    if ((command.parameters ?? []).some((parameter) => parameter.name === paramName)) {
      return true;
    }
  }
  if (isNowCall(action.expression)) return true;
  return false;
}

function commandOwnedFields(command: IRCommand, entity: IREntity): string[] {
  const properties = new Set(entity.properties.map((property) => property.name));
  const owned = new Set<string>();
  for (const action of command.actions ?? []) {
    if (
      action.target &&
      properties.has(action.target) &&
      (action.kind === 'mutate' || action.kind === 'compute' || action.kind === 'persist')
    ) {
      owned.add(action.target);
    }
  }
  return [...owned].sort((left, right) => left.localeCompare(right));
}

function initialLifecycleState(entity: IREntity): IRInitializationPlan['initialLifecycleState'] {
  const state: IRInitializationPlan['initialLifecycleState'] = [];
  for (const property of entity.properties) {
    if (!property.defaultValue) continue;
    const hasTransition = (entity.transitions ?? []).some(
      (transition) => transition.property === property.name,
    );
    if (!hasTransition && property.name !== 'status') continue;
    state.push({ property: property.name, value: property.defaultValue });
  }
  return state;
}

function declaredDefaults(
  entity: IREntity,
  commandOwned: Set<string>,
): IRInitializationPlan['declaredDefaults'] {
  const defaults: IRInitializationPlan['declaredDefaults'] = [];
  for (const property of entity.properties) {
    if (commandOwned.has(property.name)) continue;
    if (property.defaultValue !== undefined) {
      defaults.push({ property: property.name, source: 'defaultValue' });
    } else if (property.autoNow) {
      defaults.push({ property: property.name, source: 'autoNow' });
    }
  }
  if (entity.timestamps) {
    defaults.push({ property: 'createdAt', source: 'timestamps' });
    defaults.push({ property: 'updatedAt', source: 'timestamps' });
  }
  if (entity.versionProperty) {
    defaults.push({ property: entity.versionProperty, source: 'version' });
  }
  if (entity.versionAtProperty) {
    defaults.push({ property: entity.versionAtProperty, source: 'version' });
  }
  return defaults;
}

function classifyGuards(
  command: IRCommand,
  commandOwned: Set<string>,
): { dynamicGuardIndexes: number[]; redundantGuardIndexes: number[] } {
  const dynamicGuardIndexes: number[] = [];
  const redundantGuardIndexes: number[] = [];
  command.guards.forEach((guard, index) => {
    const redundantOwned = [...commandOwned].some((property) =>
      guardAssertsPropertyUnset(guard, property),
    );
    if (redundantOwned) {
      redundantGuardIndexes.push(index);
      return;
    }
    dynamicGuardIndexes.push(index);
  });
  return { dynamicGuardIndexes, redundantGuardIndexes };
}

/**
 * Build the authoritative initialization plan for a command, or undefined when
 * the command is not an allocating initialization command.
 */
export function buildInitializationPlan(
  entity: IREntity,
  command: IRCommand,
  tenant?: IRTenant,
): IRInitializationPlan | undefined {
  if (command.entity !== entity.name) return undefined;

  const owned = commandOwnedFields(command, entity);
  const ownedSet = new Set(owned);
  const propertyNames = new Set(entity.properties.map((property) => property.name));

  const isLiteralCreate = command.name === 'create';
  const requiredValuesInitialized = owned.filter((target) =>
    allocatesRequiredField(command, entity, target),
  ).length;
  const hasCreationSignal =
    isLiteralCreate || requiredValuesInitialized > 0 || initializesLifecycleTimestamp(command);
  if (!hasCreationSignal || (owned.length === 0 && !isLiteralCreate)) return undefined;

  const initializationInputs = (command.parameters ?? [])
    .filter((parameter) => !parameter.trustedSource)
    .map((parameter) => parameter.name)
    .sort((left, right) => left.localeCompare(right));

  const authenticatedOwnershipFields: string[] = [];
  if (tenant?.property && propertyNames.has(tenant.property)) {
    authenticatedOwnershipFields.push(tenant.property);
  }
  for (const parameter of command.parameters ?? []) {
    if (parameter.trustedSource && propertyNames.has(parameter.name)) {
      authenticatedOwnershipFields.push(parameter.name);
    }
  }
  authenticatedOwnershipFields.sort((left, right) => left.localeCompare(right));

  const defaults = declaredDefaults(entity, ownedSet);
  const lifecycle = initialLifecycleState(entity);
  const draftFieldSet = new Set<string>(['id', ...authenticatedOwnershipFields]);
  for (const item of defaults) draftFieldSet.add(item.property);
  for (const item of lifecycle) draftFieldSet.add(item.property);
  for (const input of initializationInputs) {
    if (propertyNames.has(input) && !ownedSet.has(input)) draftFieldSet.add(input);
  }
  // Same-named init inputs that the command also mutates are available on the
  // draft for precondition evaluation (input seeding), then overwritten by mutate.
  for (const input of initializationInputs) {
    if (propertyNames.has(input)) draftFieldSet.add(input);
  }

  const finalDocumentRequirements = entity.properties
    .filter(
      (property) =>
        property.modifiers.includes('required') &&
        !property.type.nullable &&
        property.name !== 'id',
    )
    .map((property) => property.name)
    .sort((left, right) => left.localeCompare(right));

  const { dynamicGuardIndexes, redundantGuardIndexes } = classifyGuards(command, ownedSet);

  return {
    initializationInputs,
    authenticatedOwnershipFields,
    declaredDefaults: defaults,
    initialLifecycleState: lifecycle,
    commandOwnedFields: owned,
    draftFields: [...draftFieldSet].sort((left, right) => left.localeCompare(right)),
    finalDocumentRequirements,
    dynamicGuardIndexes,
    redundantGuardIndexes,
  };
}

/**
 * Select the entity's initialization command. Prefer an explicit `create`
 * command; otherwise choose the allocating command with the strongest
 * creation signal (required-field footprint, then total owned fields).
 *
 * Plans are attached when missing so hand-built IR (tests) and legacy IR
 * still resolve through the same authority function.
 */
export function selectInitializationCommand(ir: IR, entity: IREntity): IRCommand | undefined {
  const commands = ir.commands.filter((command) => command.entity === entity.name);
  for (const command of commands) {
    if (!command.initialization) {
      const plan = buildInitializationPlan(entity, command, ir.tenant);
      if (plan) command.initialization = plan;
    }
  }

  const create = commands.find((command) => command.name === 'create' && command.initialization);
  if (create) return create;

  // When create exists without a plan, named peers must not allocate.
  if (commands.some((command) => command.name === 'create')) return undefined;

  const candidates = commands
    .filter((command) => command.initialization)
    .map((command) => {
      const plan = command.initialization!;
      const requiredOwned = plan.commandOwnedFields.filter((field) =>
        plan.finalDocumentRequirements.includes(field),
      ).length;
      return {
        command,
        requiredOwned,
        owned: plan.commandOwnedFields.length,
      };
    })
    .sort(
      (left, right) =>
        right.requiredOwned - left.requiredOwned ||
        right.owned - left.owned ||
        left.command.name.localeCompare(right.command.name),
    );
  return candidates[0]?.command;
}

/** Attach initialization plans to every allocating command on the IR. */
export function attachInitializationPlans(
  entities: IREntity[],
  commands: IRCommand[],
  tenant?: IRTenant,
): void {
  const byEntity = new Map(entities.map((entity) => [entity.name, entity]));
  for (const command of commands) {
    if (!command.entity) continue;
    const entity = byEntity.get(command.entity);
    if (!entity) continue;
    const plan = buildInitializationPlan(entity, command, tenant);
    if (plan) command.initialization = plan;
  }

  // When an entity has an explicit `create`, named peers must not also allocate.
  for (const entity of entities) {
    const entityCommands = commands.filter((command) => command.entity === entity.name);
    if (!entityCommands.some((command) => command.name === 'create' && command.initialization)) {
      continue;
    }
    for (const command of entityCommands) {
      if (command.name !== 'create') delete command.initialization;
    }
  }
}

/** Default IRValue lookup helper for projections/runtime draft builders. */
export function defaultValueForProperty(
  entity: IREntity,
  propertyName: string,
): IRValue | undefined {
  return entity.properties.find((property) => property.name === propertyName)?.defaultValue;
}

export function commandHasInitialization(command: IRCommand): boolean {
  return command.initialization !== undefined;
}
