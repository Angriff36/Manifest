/**
 * OpenAPI command path shapes — canonical dispatcher vs legacy alias.
 *
 * Binding: `docs/internal/plans/2026-07-17-command-api-surface-boundary.md`
 * Canonical write path: `POST {basePath}/manifest/{entity}/commands/{command}`
 * Legacy (deprecated alias): `POST {basePath}/{entity}/{command-kebab}`
 */

export type OpenApiCommandPathStyle = 'legacy' | 'dispatcher' | 'both';

export type OpenApiCommandPathKind = 'dispatcher' | 'legacy';

export interface OpenApiCommandPathEntry {
  path: string;
  kind: OpenApiCommandPathKind;
}

/**
 * Resolve command path style. Default `both` so OpenAPI documents the
 * canonical dispatcher and keeps the legacy alias (deprecated).
 */
export function resolveCommandPathStyle(
  style: OpenApiCommandPathStyle | undefined,
): OpenApiCommandPathStyle {
  return style ?? 'both';
}

/**
 * Concrete OpenAPI paths for one command (entity/command segments already
 * lowercased / kebab-cased).
 */
export function buildCommandPathEntries(
  basePath: string,
  entitySegment: string,
  commandSegment: string,
  style: OpenApiCommandPathStyle,
): OpenApiCommandPathEntry[] {
  const legacy = `${basePath}/${entitySegment}/${commandSegment}`;
  const dispatcher = `${basePath}/manifest/${entitySegment}/commands/${commandSegment}`;
  switch (style) {
    case 'legacy':
      return [{ path: legacy, kind: 'legacy' }];
    case 'dispatcher':
      return [{ path: dispatcher, kind: 'dispatcher' }];
    case 'both':
      return [
        { path: dispatcher, kind: 'dispatcher' },
        { path: legacy, kind: 'legacy' },
      ];
  }
}

/** Unique operationId: canonical on dispatcher; `…Legacy` on the alias. */
export function commandOperationId(baseOperationId: string, kind: OpenApiCommandPathKind): string {
  return kind === 'legacy' ? `${baseOperationId}Legacy` : baseOperationId;
}
