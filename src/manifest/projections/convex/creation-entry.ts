import type { IR, IRCommand, IREntity } from '../../ir';

function cap(value: string): string {
  return value.length ? value[0]!.toUpperCase() + value.slice(1) : value;
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
      const initializesRequiredValue = [...targets].some((target) => {
        const property = properties.get(target)!;
        return (
          property.modifiers.includes('required') &&
          property.defaultValue === undefined &&
          !property.autoNow &&
          target !== 'id'
        );
      });
      const initializesAt = [...targets].some(
        (target) => target.endsWith('At') && target !== 'updatedAt',
      );
      return {
        command,
        score: targets.size,
        hasCreationSignal: initializesRequiredValue || initializesAt,
      };
    })
    .filter((candidate) => candidate.hasCreationSignal && candidate.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.command.name.localeCompare(right.command.name),
    );
  return candidates[0]?.command;
}

export function commandRunnerName(entity: string, command: string): string {
  return `__run${cap(entity)}${cap(command)}`;
}

export function commandCreationExportName(entity: string, command: string): string {
  return `${entity}_createVia${cap(command)}`;
}
