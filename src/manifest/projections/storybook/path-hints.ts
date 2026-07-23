/**
 * Storybook artifact path hints — optional per-module directory nesting.
 *
 * Entities/commands with an IR `module` emit under `stories/<module>/…`.
 * Module-less names keep the historical flat / entity-folder layout.
 */

import { moduleDirSegment } from '../shared/module-path.js';

function pascalCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function storybookEntityPathHint(entity: { name: string; module?: string }): string {
  const file = `${entity.name}.stories.tsx`;
  const mod = moduleDirSegment(entity.module);
  return mod ? `stories/${mod}/${file}` : `stories/${file}`;
}

export function storybookCommandPathHint(args: {
  commandName: string;
  entityName?: string;
  module?: string;
}): string {
  const entityFolder = args.entityName ?? 'Global';
  const file = `${pascalCase(args.commandName)}.stories.tsx`;
  const nested = `${entityFolder}/${file}`;
  const mod = moduleDirSegment(args.module);
  return mod ? `stories/${mod}/${nested}` : `stories/${nested}`;
}
