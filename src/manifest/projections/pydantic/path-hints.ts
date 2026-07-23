/**
 * Pydantic artifact path hints — optional per-module directory nesting.
 *
 * Entities/commands with an IR `module` emit under `models/<module>/…`.
 * Module-less names keep the historical flat `models/…` layout.
 */

import { moduleDirSegment } from '../shared/module-path.js';

export function pydanticEntityPathHint(entity: { name: string; module?: string }): string {
  const mod = moduleDirSegment(entity.module);
  return mod ? `models/${mod}/${entity.name}.py` : `models/${entity.name}.py`;
}

export function pydanticCommandPathHint(command: { name: string; module?: string }): string {
  const mod = moduleDirSegment(command.module);
  return mod ? `models/${mod}/commands/${command.name}.py` : `models/commands/${command.name}.py`;
}
