/**
 * JSON Schema artifact path hints — optional per-module directory nesting.
 *
 * Entities with an IR `module` emit under `schemas/<module>/…`.
 * Module-less names keep the historical flat `schemas/…` layout.
 */

import { moduleDirSegment } from '../shared/module-path.js';

export function jsonSchemaEntityPathHint(entity: { name: string; module?: string }): string {
  const mod = moduleDirSegment(entity.module);
  return mod ? `schemas/${mod}/${entity.name}.schema.json` : `schemas/${entity.name}.schema.json`;
}
