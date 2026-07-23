/**
 * Express artifact path hints — optional per-module directory nesting.
 *
 * Entity-scoped routes/types with an IR `module` emit under `routes|types/<module>/…`.
 * Module-less names and monolith routers/types keep the historical flat layout.
 */

import { moduleDirSegment } from '../shared/module-path.js';

function toEntitySegment(name: string): string {
  return name.toLowerCase();
}

export function expressEntityRoutePathHint(args: { entityName: string; module?: string }): string {
  const file = `${toEntitySegment(args.entityName)}.ts`;
  const mod = moduleDirSegment(args.module);
  return mod ? `routes/${mod}/${file}` : `routes/${file}`;
}

export function expressManifestRouterPathHint(): string {
  return 'routes/manifest-router.ts';
}

export function expressEntityTypesPathHint(args: { entityName: string; module?: string }): string {
  const file = `${toEntitySegment(args.entityName)}.ts`;
  const mod = moduleDirSegment(args.module);
  return mod ? `types/${mod}/${file}` : `types/${file}`;
}

export function expressManifestTypesPathHint(): string {
  return 'types/manifest-types.ts';
}
