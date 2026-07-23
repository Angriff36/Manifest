/**
 * Zod artifact path hints — optional per-module directory nesting.
 *
 * Entities/commands with an IR `module` emit under `schemas/<module>/…`.
 * Module-less names keep the historical flat `schemas/…` layout.
 */

import { moduleDirSegment } from '../shared/module-path.js';

/** @deprecated Prefer {@link moduleDirSegment} from shared/module-path. */
export const zodModuleDirSegment = moduleDirSegment;

export function zodEntitySchemaPathHint(entity: { name: string; module?: string }): string {
  const mod = moduleDirSegment(entity.module);
  return mod ? `schemas/${mod}/${entity.name}.schema.ts` : `schemas/${entity.name}.schema.ts`;
}

export function zodCommandSchemaPathHint(args: {
  commandName: string;
  entityName?: string;
  moduleName?: string;
}): string {
  const entityPart = args.entityName ? `${args.entityName}_` : '';
  const file = `${entityPart}${args.commandName}.schema.ts`;
  const mod = moduleDirSegment(args.moduleName);
  return mod ? `schemas/${mod}/${file}` : `schemas/${file}`;
}
