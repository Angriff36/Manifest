/**
 * Mermaid artifact path hints — optional per-module directory nesting.
 *
 * State/sequence diagrams with an IR `module` emit under `diagrams/<module>/…`.
 * Module-less names keep the historical flat `diagrams/…` layout.
 * The combined ER diagram stays at `diagrams/er-diagram.mmd`.
 */

import { moduleDirSegment } from '../shared/module-path.js';

export function mermaidErPathHint(): string {
  return 'diagrams/er-diagram.mmd';
}

export function mermaidStatePathHint(args: {
  entityName: string;
  module?: string;
}): string {
  const file = `state-${args.entityName}.mmd`;
  const mod = moduleDirSegment(args.module);
  return mod ? `diagrams/${mod}/${file}` : `diagrams/${file}`;
}

export function mermaidSequencePathHint(args: {
  entityName: string;
  commandName: string;
  module?: string;
}): string {
  const file = `sequence-${args.entityName}-${args.commandName}.mmd`;
  const mod = moduleDirSegment(args.module);
  return mod ? `diagrams/${mod}/${file}` : `diagrams/${file}`;
}
