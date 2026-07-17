import type { IR, IRCommand, IREntity } from '../../ir';

function cap(value: string): string {
  return value.length ? value[0]!.toUpperCase() + value.slice(1) : value;
}

function isNullLiteral(expression: IRCommand['guards'][number]): boolean {
  return expression.kind === 'literal' && expression.value.kind === 'null';
}

function isSelfProperty(expression: IRCommand['guards'][number], property: string): boolean {
  return (
    expression.kind === 'member' &&
    expression.property === property &&
    expression.object.kind === 'identifier' &&
    (expression.object.name === 'self' || expression.object.name === 'this')
  );
}

function guardsPropertyUnset(command: IRCommand, property: string): boolean {
  return command.guards.some(
    (guard) =>
      guard.kind === 'binary' &&
      (guard.operator === '==' || guard.operator === 'is') &&
      ((isSelfProperty(guard.left, property) && isNullLiteral(guard.right)) ||
        (isNullLiteral(guard.left) && isSelfProperty(guard.right, property))),
  );
}

function initializesLifecycleTimestamp(command: IRCommand): boolean {
  return (command.actions ?? []).some(
    (action) =>
      action.kind === 'mutate' &&
      action.target?.endsWith('At') &&
      action.target !== 'updatedAt' &&
      action.expression.kind === 'call' &&
      action.expression.callee.kind === 'identifier' &&
      action.expression.callee.name === 'now' &&
      guardsPropertyUnset(command, action.target),
  );
}

/** Infer the broad command that initializes a command-created entity.
 *
 * Multi-file IR is canonically sorted, so source declaration order is not
 * available here. Creation commands are distinguished by both a creation
 * signal (they initialize a required/default-less field or an initialization
 * timestamp) and the widest property initialization footprint.
 */
export function commandCreationEntry(ir: IR, entity: IREntity): IRCommand | undefined {
  const commands = ir.commands.filter((command) => command.entity === entity.name);
  if (commands.some((command) => command.name === 'create')) return undefined;

  const properties = new Map(entity.properties.map((property) => [property.name, property]));
  const candidates = commands
    .map((command) => {
      const targets = new Set(
        (command.actions ?? [])
          .filter(
            (action) => action.kind === 'mutate' && action.target && properties.has(action.target),
          )
          .map((action) => action.target!),
      );
      const requiredValuesInitialized = [...targets].filter((target) => {
        const property = properties.get(target)!;
        return (
          property.modifiers.includes('required') &&
          property.defaultValue === undefined &&
          !property.autoNow &&
          target !== 'id'
        );
      }).length;
      const initializesAt = initializesLifecycleTimestamp(command);
      return {
        command,
        score: targets.size,
        requiredValuesInitialized,
        hasCreationSignal: requiredValuesInitialized > 0 || initializesAt,
      };
    })
    .filter((candidate) => candidate.hasCreationSignal && candidate.score > 0)
    .sort(
      (left, right) =>
        right.requiredValuesInitialized - left.requiredValuesInitialized ||
        right.score - left.score ||
        left.command.name.localeCompare(right.command.name),
    );
  return candidates[0]?.command;
}

export function commandRunnerName(entity: string, command: string): string {
  return `__run${cap(entity)}${cap(command)}`;
}

export function commandCreationExportName(entity: string, command: string): string {
  return `${entity}_createVia${cap(command)}`;
}
