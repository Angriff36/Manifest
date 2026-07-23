/**
 * Dart artifact path hints — optional per-module directory nesting.
 *
 * Entities/commands with an IR `module` emit under `lib/models|<commands>/<module>/…`.
 * Module-less names keep the historical flat layout.
 */

import { moduleDirSegment } from '../shared/module-path.js';

/** Convert PascalCase to snake_case for Dart file paths. */
export function dartSnakeCase(name: string): string {
  return name
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

export function dartEntityPathHint(entity: { name: string; module?: string }): string {
  const file = `${dartSnakeCase(entity.name)}.dart`;
  const mod = moduleDirSegment(entity.module);
  return mod ? `lib/models/${mod}/${file}` : `lib/models/${file}`;
}

export function dartCommandPathHint(command: { name: string; module?: string }): string {
  const file = `${dartSnakeCase(command.name)}_params.dart`;
  const mod = moduleDirSegment(command.module);
  return mod ? `lib/commands/${mod}/${file}` : `lib/commands/${file}`;
}
