/**
 * Canonical Routes projection for Manifest IR.
 *
 * Generates the route surface artifact — a deterministic, IR-derived
 * description of all transport endpoints plus typed path builders.
 *
 * Routes are projection artifacts, not application concerns.
 * No filesystem scanning. No framework inference. No implicit discovery.
 *
 * Surfaces:
 *   - routes.manifest  → routes.manifest.json (canonical route list)
 *   - routes.ts        → routes.ts (typed path builders)
 *
 * See docs/spec/manifest-vnext.md § "Canonical Routes (Normative)".
 */

import type { IR, IREntity, IRCommand, IRParameter } from '../../ir';
import type {
  ProjectionTarget,
  ProjectionRequest,
  ProjectionResult,
  ProjectionDiagnostic,
} from '../interface';
import type {
  RouteEntry,
  RouteManifest,
  RouteParam,
  RoutesProjectionOptions,
  ManualRouteDeclaration,
} from './types';

// ============================================================================
// Helpers
// ============================================================================

function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

function toEntitySegment(value: string): string {
  return value.toLowerCase();
}

function toCamelCase(value: string): string {
  if (!value) return value;
  return value[0].toLowerCase() + value.slice(1);
}

function toPascalCase(value: string): string {
  if (!value) return value;
  return value[0].toUpperCase() + value.slice(1);
}

/**
 * Map IR type name to a TypeScript type string for route params.
 */
function irTypeToTsParam(typeName: string): string {
  const map: Record<string, string> = {
    string: 'string',
    number: 'number',
    boolean: 'boolean',
    date: 'string',
    datetime: 'string',
    any: 'string',
  };
  return map[typeName] || 'string';
}

/**
 * Derive a stable route ID from source information.
 * Deterministic: same input always produces same ID.
 */
function deriveRouteId(
  source: RouteEntry['source'],
  method: string,
  pathSuffix: string
): string {
  switch (source.kind) {
    case 'entity-read':
      return `${source.entity}.${method.toLowerCase()}.${pathSuffix}`;
    case 'command':
      return `${source.entity}.${source.command}`;
    case 'manual':
      return `manual.${source.id}`;
  }
}

// ============================================================================
// Route Derivation from IR
// ============================================================================

/**
 * Derive route entries from a single IR entity (read endpoints).
 */
function deriveEntityReadRoutes(
  entity: IREntity,
  basePath: string,
  includeAuth: boolean,
  includeTenant: boolean
): RouteEntry[] {
  const segment = toEntitySegment(entity.name);
  const routes: RouteEntry[] = [];

  // GET /basePath/{entity}/list — list all
  const listSource = { kind: 'entity-read' as const, entity: entity.name };
  routes.push({
    id: deriveRouteId(listSource, 'GET', 'list'),
    path: `${basePath}/${segment}/list`,
    method: 'GET',
    params: [],
    source: listSource,
    auth: includeAuth,
    tenant: includeTenant,
  });

  // GET /basePath/{entity}/:id — get by ID
  const detailSource = { kind: 'entity-read' as const, entity: entity.name };
  routes.push({
    id: deriveRouteId(detailSource, 'GET', 'detail'),
    path: `${basePath}/${segment}/:id`,
    method: 'GET',
    params: [{ name: 'id', type: 'string', location: 'path' as const }],
    source: detailSource,
    auth: includeAuth,
    tenant: includeTenant,
  });

  return routes;
}

/**
 * Derive route entries from a single IR command (write endpoint).
 */
function deriveCommandRoute(
  command: IRCommand,
  basePath: string,
  includeAuth: boolean,
  includeTenant: boolean
): RouteEntry | null {
  if (!command.entity) return null;

  const segment = toEntitySegment(command.entity);
  const commandSegment = toKebabCase(command.name);

  const params: RouteParam[] = command.parameters.map((p: IRParameter) => ({
    name: p.name,
    type: irTypeToTsParam(p.type.name),
    location: 'body' as const,
    required: p.required,
  }));

  const source = {
    kind: 'command' as const,
    entity: command.entity,
    command: command.name,
  };

  return {
    id: deriveRouteId(source, 'POST', commandSegment),
    path: `${basePath}/${segment}/${commandSegment}`,
    method: 'POST',
    params,
    source,
    auth: includeAuth,
    tenant: includeTenant,
  };
}

/**
 * Convert a manual route declaration to a RouteEntry.
 */
function manualToRouteEntry(decl: ManualRouteDeclaration): RouteEntry {
  return {
    id: deriveRouteId({ kind: 'manual', id: decl.id }, decl.method, decl.id),
    path: decl.path,
    method: decl.method,
    params: decl.params ?? [],
    source: { kind: 'manual', id: decl.id },
    auth: decl.auth ?? false,
    tenant: decl.tenant ?? false,
  };
}

// ============================================================================
// Artifact Generation
// ============================================================================

/**
 * Build the complete route manifest from IR + options.
 */
function buildRouteManifest(
  ir: IR,
  options: RoutesProjectionOptions
): { manifest: RouteManifest; diagnostics: ProjectionDiagnostic[] } {
  const diagnostics: ProjectionDiagnostic[] = [];
  const basePath = options.basePath ?? '/api';
  const includeAuth = options.includeAuth ?? true;
  const includeTenant = options.includeTenant ?? true;
  const manualRoutes = options.manualRoutes ?? [];

  const routes: RouteEntry[] = [];

  // 1. Derive entity read routes (sorted by entity name for determinism)
  const sortedEntities = [...ir.entities].sort((a, b) => a.name.localeCompare(b.name));
  for (const entity of sortedEntities) {
    routes.push(...deriveEntityReadRoutes(entity, basePath, includeAuth, includeTenant));
  }

  // 2. Derive command routes (sorted by entity.command for determinism)
  const sortedCommands = [...ir.commands].sort((a, b) => {
    const aKey = `${a.entity ?? ''}.${a.name}`;
    const bKey = `${b.entity ?? ''}.${b.name}`;
    return aKey.localeCompare(bKey);
  });
  for (const command of sortedCommands) {
    const route = deriveCommandRoute(command, basePath, includeAuth, includeTenant);
    if (route) {
      routes.push(route);
    } else if (!command.entity) {
      diagnostics.push({
        severity: 'warning',
        code: 'COMMAND_NO_ENTITY',
        message: `Command "${command.name}" has no entity — skipped in route manifest.`,
      });
    }
  }

  // 3. Merge manual routes (sorted by id for determinism)
  const sortedManual = [...manualRoutes].sort((a, b) => a.id.localeCompare(b.id));

  // Validate manual routes: no duplicate IDs
  const seenManualIds = new Set<string>();
  for (const decl of sortedManual) {
    if (seenManualIds.has(decl.id)) {
      diagnostics.push({
        severity: 'error',
        code: 'DUPLICATE_MANUAL_ROUTE',
        message: `Duplicate manual route id "${decl.id}".`,
      });
      continue;
    }
    seenManualIds.add(decl.id);
    routes.push(manualToRouteEntry(decl));
  }

  // 4. Check for path collisions
  const pathMethodSet = new Set<string>();
  for (const route of routes) {
    const key = `${route.method} ${route.path}`;
    if (pathMethodSet.has(key)) {
      diagnostics.push({
        severity: 'warning',
        code: 'ROUTE_COLLISION',
        message: `Route collision: ${key} appears more than once.`,
      });
    }
    pathMethodSet.add(key);
  }

  const manifest: RouteManifest = {
    $schema: 'https://manifest.lang/spec/routes-v1.schema.json',
    version: '1.0',
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    basePath,
    routes,
  };

  return { manifest, diagnostics };
}

/**
 * Generate typed path builder TypeScript code from route entries.
 */
function generateTypedPathBuilders(manifest: RouteManifest): string {
  const lines: string[] = [];

  lines.push('// Auto-generated route helpers from Manifest IR');
  lines.push('// DO NOT EDIT — This file is generated by `manifest generate --surface routes.ts`');
  lines.push('// Clients MUST use these helpers. Hardcoded transport paths are non-conformant.');
  lines.push('// See docs/spec/manifest-vnext.md § "Canonical Routes (Normative)".');
  lines.push('');

  // Group routes by source for organized output
  const entityReadRoutes = manifest.routes.filter(r => r.source.kind === 'entity-read');
  const commandRoutes = manifest.routes.filter(r => r.source.kind === 'command');
  const manualRoutes = manifest.routes.filter(r => r.source.kind === 'manual');

  // --- Entity read helpers ---
  if (entityReadRoutes.length > 0) {
    lines.push('// ============================================================================');
    lines.push('// Entity Read Routes');
    lines.push('// ============================================================================');
    lines.push('');

    // Group by entity
    const byEntity = new Map<string, typeof entityReadRoutes>();
    for (const route of entityReadRoutes) {
      if (route.source.kind !== 'entity-read') continue;
      const entity = route.source.entity;
      if (!byEntity.has(entity)) byEntity.set(entity, []);
      byEntity.get(entity)!.push(route);
    }

    for (const [entity, routes] of byEntity) {
      const listRoute = routes.find(r => r.path.endsWith('/list'));
      const detailRoute = routes.find(r => r.params.some(p => p.name === 'id'));

      if (listRoute) {
        lines.push(`/** ${listRoute.method} ${listRoute.path} */`);
        lines.push(`export function ${toCamelCase(entity)}ListPath(): string {`);
        lines.push(`  return "${listRoute.path}";`);
        lines.push('}');
        lines.push('');
      }

      if (detailRoute) {
        lines.push(`/** ${detailRoute.method} ${detailRoute.path} */`);
        lines.push(`export function ${toCamelCase(entity)}DetailPath(id: string): string {`);
        lines.push(`  return "${detailRoute.path.replace(':id', '')}" + encodeURIComponent(id);`);
        lines.push('}');
        lines.push('');
      }
    }
  }

  // --- Command route helpers ---
  if (commandRoutes.length > 0) {
    lines.push('// ============================================================================');
    lines.push('// Command Routes');
    lines.push('// ============================================================================');
    lines.push('');

    for (const route of commandRoutes) {
      if (route.source.kind !== 'command') continue;
      const fnName = `${toCamelCase(route.source.entity)}${toPascalCase(route.source.command)}Path`;

      lines.push(`/** ${route.method} ${route.path} */`);
      lines.push(`export function ${fnName}(): string {`);
      lines.push(`  return "${route.path}";`);
      lines.push('}');
      lines.push('');
    }
  }

  // --- Manual route helpers ---
  if (manualRoutes.length > 0) {
    lines.push('// ============================================================================');
    lines.push('// Manual Routes');
    lines.push('// ============================================================================');
    lines.push('');

    for (const route of manualRoutes) {
      if (route.source.kind !== 'manual') continue;

      // Build function name from manual route id
      const fnName = route.source.id
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
        .join('') + 'Path';

      // Determine if route has path params
      const pathParams = route.params.filter(p => p.location === 'path');

      if (pathParams.length > 0) {
        const paramList = pathParams.map(p => `${p.name}: string`).join(', ');
        lines.push(`/** ${route.method} ${route.path} */`);
        lines.push(`export function ${fnName}(${paramList}): string {`);

        // Build path with replacements
        let pathExpr = `"${route.path}"`;
        for (const p of pathParams) {
          pathExpr += `.replace(":${p.name}", encodeURIComponent(${p.name}))`;
        }
        lines.push(`  return ${pathExpr};`);
        lines.push('}');
      } else {
        lines.push(`/** ${route.method} ${route.path} */`);
        lines.push(`export function ${fnName}(): string {`);
        lines.push(`  return "${route.path}";`);
        lines.push('}');
      }
      lines.push('');
    }
  }

  // --- Route metadata export (for DevTools, linting, etc.) ---
  lines.push('// ============================================================================');
  lines.push('// Route Metadata (for tooling)');
  lines.push('// ============================================================================');
  lines.push('');
  lines.push('export interface RouteMetadata {');
  lines.push('  readonly id: string;');
  lines.push('  readonly path: string;');
  lines.push("  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';");
  lines.push("  readonly source: 'entity-read' | 'command' | 'manual';");
  lines.push('  readonly auth: boolean;');
  lines.push('  readonly tenant: boolean;');
  lines.push('}');
  lines.push('');
  lines.push('export const ROUTE_MANIFEST: readonly RouteMetadata[] = [');
  for (const route of manifest.routes) {
    lines.push(`  { id: "${route.id}", path: "${route.path}", method: "${route.method}", source: "${route.source.kind}", auth: ${route.auth}, tenant: ${route.tenant} },`);
  }
  lines.push('] as const;');
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// Projection Implementation
// ============================================================================

/**
 * Canonical Routes projection.
 *
 * Surfaces:
 *   - routes.manifest → routes.manifest.json
 *   - routes.ts       → routes.ts (typed path builders)
 */
export class RoutesProjection implements ProjectionTarget {
  readonly name = 'routes';
  readonly description = 'Canonical route surface — deterministic route manifest and typed path builders';
  readonly surfaces = ['routes.manifest', 'routes.ts'] as const;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    const options = (request.options ?? {}) as RoutesProjectionOptions;

    switch (request.surface) {
      case 'routes.manifest': {
        const { manifest, diagnostics } = buildRouteManifest(ir, options);
        return {
          artifacts: [{
            id: 'routes.manifest',
            pathHint: 'routes.manifest.json',
            contentType: 'json',
            code: JSON.stringify(manifest, null, 2),
          }],
          diagnostics,
        };
      }

      case 'routes.ts': {
        const { manifest, diagnostics } = buildRouteManifest(ir, options);
        if (diagnostics.some(d => d.severity === 'error')) {
          return { artifacts: [], diagnostics };
        }
        const code = generateTypedPathBuilders(manifest);
        return {
          artifacts: [{
            id: 'routes.ts',
            pathHint: 'src/routes.ts',
            contentType: 'typescript',
            code,
          }],
          diagnostics,
        };
      }

      default:
        return {
          artifacts: [],
          diagnostics: [{
            severity: 'error',
            code: 'UNKNOWN_SURFACE',
            message: `Unknown surface: "${request.surface}". Available: routes.manifest, routes.ts`,
          }],
        };
    }
  }
}

// Re-export types for consumers
export type { RouteEntry, RouteManifest, RouteParam, RoutesProjectionOptions, ManualRouteDeclaration } from './types';
