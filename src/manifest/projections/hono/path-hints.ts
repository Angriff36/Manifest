/**
 * Hono artifact path hints — optional per-module directory nesting.
 *
 * Entity-scoped routes/types with an IR `module` emit under `routes|types/<module>/…`.
 * Module-less names and monolith routers/types keep the historical flat layout.
 */

import { moduleDirSegment } from '../shared/module-path.js';

function toEntitySegment(name: string): string {
  return name.toLowerCase();
}

export function honoEntityRoutePathHint(args: { entityName: string; module?: string }): string {
  const file = `${toEntitySegment(args.entityName)}.ts`;
  const mod = moduleDirSegment(args.module);
  return mod ? `routes/${mod}/${file}` : `routes/${file}`;
}

export function honoManifestRouterPathHint(): string {
  return 'src/routes.ts';
}

export function honoEntityTypesPathHint(args: { entityName: string; module?: string }): string {
  const file = `${toEntitySegment(args.entityName)}.ts`;
  const mod = moduleDirSegment(args.module);
  return mod ? `types/${mod}/${file}` : `types/${file}`;
}

export function honoManifestTypesPathHint(): string {
  return 'types/manifest-types.ts';
}
