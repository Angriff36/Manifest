import type { IR, IRCommand, IREntity } from '../../ir.js';
import { selectInitializationCommand } from '../../initialization-plan.js';

function cap(value: string): string {
  return value.length ? value[0]!.toUpperCase() + value.slice(1) : value;
}

/**
 * Initialization command for an entity. Authority is the IR `initialization`
 * plan attached by the compiler — not projection-local heuristics.
 */
export function commandCreationEntry(ir: IR, entity: IREntity): IRCommand | undefined {
  const selected = selectInitializationCommand(ir, entity);
  if (!selected) return undefined;
  // Literal `create` already emits Entity_create; do not also emit createVia*.
  if (selected.name === 'create') return undefined;
  return selected;
}

export function commandRunnerName(entity: string, command: string): string {
  return `__run${cap(entity)}${cap(command)}`;
}

export function commandCreationExportName(entity: string, command: string): string {
  return `${entity}_createVia${cap(command)}`;
}
