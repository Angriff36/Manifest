/**
 * Zod artifact path hints — optional per-module directory nesting.
 *
 * Entities/commands with an IR `module` emit under `schemas/<module>/…`.
 * Module-less names keep the historical flat `schemas/…` layout.
 */

/** Sanitize an IR module name into a single path segment. */
export function zodModuleDirSegment(moduleName: string | undefined): string | undefined {
  if (typeof moduleName !== 'string') return undefined;
  const cleaned = moduleName
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned.length > 0 ? cleaned : undefined;
}

export function zodEntitySchemaPathHint(entity: {
  name: string;
  module?: string;
}): string {
  const mod = zodModuleDirSegment(entity.module);
  return mod ? `schemas/${mod}/${entity.name}.schema.ts` : `schemas/${entity.name}.schema.ts`;
}

export function zodCommandSchemaPathHint(args: {
  commandName: string;
  entityName?: string;
  moduleName?: string;
}): string {
  const entityPart = args.entityName ? `${args.entityName}_` : '';
  const file = `${entityPart}${args.commandName}.schema.ts`;
  const mod = zodModuleDirSegment(args.moduleName);
  return mod ? `schemas/${mod}/${file}` : `schemas/${file}`;
}
