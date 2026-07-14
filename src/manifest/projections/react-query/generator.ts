/**
 * TanStack Query (React Query) projection.
 *
 * Generates typed hooks for each entity and command in the IR:
 *   - useEntityQuery (list) — wraps GET /api/{entity}/list
 *   - useEntityQuery (detail) — wraps GET /api/{entity}/{id}
 *   - useCommandMutation — wraps POST /api/manifest/{entity}/commands/{command}
 *
 * All hooks include:
 *   - Typed query keys for deterministic cache identity
 *   - Automatic cache invalidation on mutations
 *   - Optimistic update helpers for entity mutations
 *   - Error boundary integration via throwOnError option
 *
 * Surfaces:
 *   - react-query.hooks — hooks + query key factories
 *   - react-query.provider — QueryClient + QueryClientProvider setup
 */

import type { IR, IREntity, IRCommand, IRParameter, IRType, IREnum } from '../../ir';
import type {
  ProjectionTarget,
  ProjectionRequest,
  ProjectionResult,
  ProjectionDiagnostic,
} from '../interface';
import { type RouteCasing } from '../shared/naming.js';
import { resolveRouteContract, type RouteContract } from '../shared/route-contract.js';
import { irTypeToTypeScript } from '../shared/typescript-types.js';
import { REACT_QUERY_DESCRIPTOR_META } from './descriptor-meta.js';


// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Per-entity route base overrides (preserves original casing / domain routes). */
export interface EntityRouteOverride {
  /** Replaces `${apiBasePath}/${lowercased}` for list + detail reads. */
  readBase?: string;
  /** Replaces `${dispatcherBasePath}/${lowercased}/commands` for command writes. */
  writeBase?: string;
}

/** Per-entity read-envelope key overrides (replaces hardcoded pluralization). */
export interface ReadEnvelopeOverride {
  /** Key holding the array in a list response (default: `${camelEntity}s`). */
  listKey?: string;
  /** Key holding the object in a detail response (default: `${camelEntity}`). */
  detailKey?: string;
  /** Optional secondary key to fall back to (emits `data.x ?? data.fallback`). */
  fallbackKey?: string;
}

/** Import a host-provided fetch adapter instead of the inline `apiFetch`. */
export interface FetchAdapterOption {
  /** Module to import the adapter from, e.g. '@/lib/api'. */
  importPath: string;
  /** Exported name of the adapter (default: 'apiFetch'). Aliased to apiFetch. */
  importName?: string;
}

export interface ReactQueryProjectionOptions {
  /**
   * URL prefix for list/detail read paths. Default: derived from `appDir` via the
   * shared route contract (the Next.js routing roots `src`/`app` are stripped, so
   * `app/api` → `/api`). Deriving it from the same `appDir` as the nextjs routes
   * keeps the hooks and the emitted routes on one prefix. Set explicitly only to
   * target a different origin prefix.
   */
  apiBasePath?: string;
  /**
   * Dispatcher URL prefix for command mutations. Default: `${apiBasePath}/manifest`
   * (from the contract) — matches where the `nextjs.dispatcher` route is served.
   */
  dispatcherBasePath?: string;
  /**
   * App Router base directory the read/dispatcher URL bases are derived from
   * (mirrors the nextjs projection's `appDir`). Default `'app/api'` ⇒ `/api`.
   * Change it and both the read paths and the dispatcher paths follow, so the
   * hooks cannot desync from routes generated with the same `appDir`.
   */
  appDir?: string;
  /** Whether to generate optimistic update helpers (default: true) */
  optimisticUpdates?: boolean;
  /** Whether to generate error boundary integration (default: true) */
  errorBoundaryIntegration?: boolean;
  /** Import path for entity types (default: '@/types/manifest-generated') */
  typesImportPath?: string;
  /** Default staleTime in ms (default: 30_000) */
  defaultStaleTime?: number;
  /**
   * Per-entity route base overrides keyed by entity name. Lets a consumer route
   * reads/writes to domain paths with original casing (e.g. Event →
   * `/api/events/event`) instead of the default flattened lowercase path.
   */
  entityRoutes?: Record<string, EntityRouteOverride>;
  /**
   * Per-entity read-envelope key overrides keyed by entity name. Replaces the
   * default `+s` pluralization (which breaks on irregulars like Dish→dishes) and
   * supports a fallback key (e.g. `data.events ?? data.data`).
   */
  readEnvelope?: Record<string, ReadEnvelopeOverride>;
  /**
   * When set, the generated hooks import an existing fetch adapter (for auth /
   * credentials) instead of emitting the inline `apiFetch`.
   */
  fetchAdapter?: FetchAdapterOption;
  /**
   * EXPLICIT DEVIATION KNOB. By default command mutations type their response as
   * `ManifestCommandResponse<T>` — the real wire body the Next.js dispatcher
   * returns (`{ data, events, diagnostics }`; on non-2xx `apiFetch` throws with
   * the `error` field). Set this to `true` only for a server that instead returns
   * the legacy sync envelope `{ success, result, events }`; it emits and uses a
   * `CommandEnvelope<T>` type in place of the default. Default: false.
   */
  commandEnvelope?: boolean;
  /**
   * How `date`/`datetime` scalars are typed. `'date'` (default) emits `Date`;
   * `'iso-string'` emits `string`, matching JSON/HTTP transport where dates
   * serialize to ISO-8601 strings. Non-breaking — defaults to `'date'`.
   */
  dateSerialization?: 'date' | 'iso-string';
  /**
   * Explicit per-entity URL path segment overrides (mirrors the nextjs
   * projection's `routeSegments`). Takes precedence over `routeCasing`. e.g.
   * `{ OrderLine: 'order-lines' }` → `/api/order-lines/list`.
   */
  routeSegments?: Record<string, string>;
  /**
   * Casing for the default entity URL segment in fetch paths (when no
   * `entityRoutes` override is given). Must match the nextjs projection's
   * `routeCasing` so hooks call the routes that exist. `'lowercase'` (default,
   * legacy) flattens `PrepTask` → `preptask`; `'kebab-case'` → `prep-task`, etc.
   */
  routeCasing?: RouteCasing;
}

interface NormalizedOptions {
  /** Cross-projection route contract — the single source for URL bases + segments. */
  contract: RouteContract;
  optimisticUpdates: boolean;
  errorBoundaryIntegration: boolean;
  typesImportPath: string;
  defaultStaleTime: number;
  entityRoutes: Record<string, EntityRouteOverride>;
  readEnvelope: Record<string, ReadEnvelopeOverride>;
  fetchAdapter?: { importPath: string; importName: string };
  commandEnvelope: boolean;
  dateSerialization: 'date' | 'iso-string';
}

function normalizeOptions(opts?: ReactQueryProjectionOptions): NormalizedOptions {
  // One contract, resolved from the same option names the nextjs projection
  // uses, so the read/dispatcher URLs the hooks call can never drift from the
  // routes emitted with the same appDir/routeSegments/routeCasing.
  const contract = resolveRouteContract({
    appDir: opts?.appDir,
    apiBasePath: opts?.apiBasePath,
    dispatcherBasePath: opts?.dispatcherBasePath,
    routeSegments: opts?.routeSegments,
    routeCasing: opts?.routeCasing,
  });
  return {
    contract,
    optimisticUpdates: opts?.optimisticUpdates ?? true,
    errorBoundaryIntegration: opts?.errorBoundaryIntegration ?? true,
    typesImportPath: opts?.typesImportPath ?? '@/types/manifest-generated',
    defaultStaleTime: opts?.defaultStaleTime ?? 30_000,
    entityRoutes: opts?.entityRoutes ?? {},
    readEnvelope: opts?.readEnvelope ?? {},
    fetchAdapter: opts?.fetchAdapter
      ? {
          importPath: opts.fetchAdapter.importPath,
          importName: opts.fetchAdapter.importName ?? 'apiFetch',
        }
      : undefined,
    commandEnvelope: opts?.commandEnvelope ?? false,
    dateSerialization: opts?.dateSerialization ?? 'date',
  };
}

// Route + envelope resolvers. The default comes from the shared contract (so it
// matches the emitted routes byte-for-byte); the per-entity override is the
// explicit deviation knob.
function resolveReadBase(entityName: string, opts: NormalizedOptions): string {
  return opts.entityRoutes[entityName]?.readBase ?? opts.contract.entityBasePath(entityName);
}

function resolveListKey(entityName: string, opts: NormalizedOptions): string {
  return opts.readEnvelope[entityName]?.listKey ?? opts.contract.listEnvelopeKey(entityName);
}

function resolveDetailKey(entityName: string, opts: NormalizedOptions): string {
  return opts.readEnvelope[entityName]?.detailKey ?? opts.contract.detailEnvelopeKey(entityName);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toLowerCamelCase(value: string): string {
  if (!value) return value;
  return value[0].toLowerCase() + value.slice(1);
}

function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

function irTypeToTsType(irType: IRType, dateAsString = false): string {
  return irTypeToTypeScript(irType, dateAsString);
}

function parameterToTsType(param: IRParameter, dateAsString = false): string {
  const baseType = irTypeToTsType(param.type, dateAsString);
  return param.required ? baseType : `${baseType} | undefined`;
}

// ---------------------------------------------------------------------------
// Code generation internals
// ---------------------------------------------------------------------------

interface CodeResult {
  code: string;
  diagnostics: ProjectionDiagnostic[];
}

function generateEnumType(e: IREnum): string {
  const members = e.values.map((v) => JSON.stringify(v.name)).join(' | ');
  return `export type ${e.name} = ${members};`;
}

function generateEntityTypes(entity: IREntity, dateAsString = false): string {
  const lines: string[] = [];
  lines.push(`export interface ${entity.name} {`);
  for (const prop of entity.properties) {
    const tsType = irTypeToTsType(prop.type, dateAsString);
    const isOptional =
      prop.modifiers.includes('optional') || prop.defaultValue !== undefined || prop.type.nullable;
    const optional = isOptional ? '?' : '';
    lines.push(`  ${prop.name}${optional}: ${tsType};`);
  }
  lines.push('}');
  return lines.join('\n');
}

function generateCommandInputType(command: IRCommand, dateAsString = false): string | null {
  if (command.parameters.length === 0) return null;

  const entityPrefix = command.entity ?? '';
  const typeName = `${entityPrefix}${capitalize(command.name)}Input`;
  const lines: string[] = [];

  lines.push(`export interface ${typeName} {`);
  for (const param of command.parameters) {
    const tsType = parameterToTsType(param, dateAsString);
    const optional = param.required ? '' : '?';
    lines.push(`  ${param.name}${optional}: ${tsType};`);
  }
  lines.push('}');

  return lines.join('\n');
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Hooks generation
// ---------------------------------------------------------------------------

function generateHooks(ir: IR, opts: NormalizedOptions): CodeResult {
  const lines: string[] = [];
  const diagnostics: ProjectionDiagnostic[] = [];

  // Header
  lines.push('// Auto-generated TanStack Query hooks from Manifest IR');
  lines.push('// DO NOT EDIT - This file is generated from .manifest source');
  lines.push('');
  lines.push('import {');
  lines.push('  useQuery,');
  lines.push('  useMutation,');
  lines.push('  useQueryClient,');
  lines.push('  type UseQueryOptions,');
  lines.push('  type UseMutationOptions,');
  lines.push("} from '@tanstack/react-query';");
  // Optional host-provided fetch adapter (auth/credentials). Aliased to apiFetch
  // so call sites are identical to the inline-helper path.
  if (opts.fetchAdapter) {
    const { importPath, importName } = opts.fetchAdapter;
    const binding = importName === 'apiFetch' ? 'apiFetch' : `${importName} as apiFetch`;
    lines.push(`import { ${binding} } from '${importPath}';`);
  }
  lines.push('');

  // Types section — inline types so the hooks file is self-contained
  lines.push('// ============================================================');
  lines.push('// Entity types (from IR)');
  lines.push('// ============================================================');
  lines.push('');

  // Command response type. Default: ManifestCommandResponse — the real body the
  // Next.js dispatcher returns ({ data, events, diagnostics }; apiFetch throws on
  // non-2xx, surfacing the { error } envelope). commandEnvelope opts into the
  // legacy sync shape instead. Emitted only when entity-scoped commands exist.
  const hasCommandHooks = ir.commands.some(
    (c) => c.entity && ir.entities.some((e) => e.name === c.entity),
  );
  if (opts.commandEnvelope) {
    lines.push('export interface CommandEnvelope<T> {');
    lines.push('  success: boolean;');
    lines.push('  result: T;');
    lines.push('  events: unknown[];');
    lines.push('}');
    lines.push('');
  } else if (hasCommandHooks) {
    lines.push('/** The command response body returned by the Manifest dispatcher. */');
    lines.push('export interface ManifestCommandResponse<T = unknown> {');
    lines.push('  data?: T;');
    lines.push('  events?: unknown[];');
    lines.push(
      '  diagnostics?: Array<{ kind?: string; code?: string; message?: string; [key: string]: unknown }>;',
    );
    lines.push('  error?: string;');
    lines.push('}');
    lines.push('');
  }

  for (const e of ir.enums ?? []) {
    lines.push(generateEnumType(e));
    lines.push('');
  }

  const dateAsString = opts.dateSerialization === 'iso-string';

  for (const entity of ir.entities) {
    lines.push(generateEntityTypes(entity, dateAsString));
    lines.push('');
  }

  // Command input types
  const commandInputTypes = ir.commands
    .map((c) => generateCommandInputType(c, dateAsString))
    .filter((t): t is string => t !== null);

  if (commandInputTypes.length > 0) {
    lines.push('// ============================================================');
    lines.push('// Command input types (from IR)');
    lines.push('// ============================================================');
    lines.push('');
    for (const typeStr of commandInputTypes) {
      lines.push(typeStr);
      lines.push('');
    }
  }

  // Query key factories
  lines.push('// ============================================================');
  lines.push('// Query key factories');
  lines.push('// ============================================================');
  lines.push('');
  lines.push('export const queryKeys = {');
  for (const entity of ir.entities) {
    const camelName = toLowerCamelCase(entity.name);
    lines.push(`  ${camelName}: {`);
    lines.push(`    all: ['${camelName}'] as const,`);
    lines.push(`    lists: () => [...queryKeys.${camelName}.all, 'list'] as const,`);
    lines.push(
      `    detail: (id: string) => [...queryKeys.${camelName}.all, 'detail', id] as const,`,
    );
    lines.push(`  },`);
  }
  lines.push('} as const;');
  lines.push('');

  // API fetch helpers. When a fetchAdapter is configured, the import above
  // provides `apiFetch`; otherwise emit the inline default helper.
  if (!opts.fetchAdapter) {
    lines.push('// ============================================================');
    lines.push('// API fetch helpers');
    lines.push('// ============================================================');
    lines.push('');
    lines.push('async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {');
    lines.push('  const response = await fetch(url, init);');
    lines.push('  if (!response.ok) {');
    lines.push(
      '    const body = await response.json().catch(() => ({} as { error?: string; message?: string }));',
    );
    lines.push(
      '    throw new Error(body.error || body.message || `Request failed: ${response.status}`);',
    );
    lines.push('  }');
    lines.push('  return response.json();');
    lines.push('}');
    lines.push('');
  }

  // Entity query hooks
  lines.push('// ============================================================');
  lines.push('// Entity query hooks');
  lines.push('// ============================================================');
  lines.push('');

  for (const entity of ir.entities) {
    const name = entity.name;
    const camelName = toLowerCamelCase(name);
    const readBase = resolveReadBase(name, opts);
    const listKey = resolveListKey(name, opts);
    const detailKey = resolveDetailKey(name, opts);
    const fallbackKey = opts.readEnvelope[name]?.fallbackKey;

    // List hook
    const listType = fallbackKey
      ? `{ ${listKey}?: ${name}[]; ${fallbackKey}?: ${name}[] }`
      : `{ ${listKey}: ${name}[] }`;
    const listExtract = fallbackKey ? `data.${listKey} ?? data.${fallbackKey}` : `data.${listKey}`;
    lines.push(`export function use${name}List(`);
    lines.push(`  options?: Omit<UseQueryOptions<${name}[], Error>, 'queryKey' | 'queryFn'>,`);
    lines.push(`) {`);
    lines.push(`  return useQuery({`);
    lines.push(`    queryKey: queryKeys.${camelName}.lists(),`);
    lines.push(`    queryFn: () =>`);
    lines.push(`      apiFetch<${listType}>(\`${readBase}/list\`)`);
    lines.push(`        .then(data => ${listExtract}),`);
    lines.push(`    staleTime: ${opts.defaultStaleTime},`);
    lines.push(`    ...options,`);
    lines.push(`  });`);
    lines.push(`}`);
    lines.push('');

    // Detail hook
    const detailType = fallbackKey
      ? `{ ${detailKey}?: ${name}; ${fallbackKey}?: ${name} }`
      : `{ ${detailKey}: ${name} }`;
    const detailExtract = fallbackKey
      ? `data.${detailKey} ?? data.${fallbackKey}`
      : `data.${detailKey}`;
    lines.push(`export function use${name}Detail(`);
    lines.push(`  id: string,`);
    lines.push(`  options?: Omit<UseQueryOptions<${name}, Error>, 'queryKey' | 'queryFn'>,`);
    lines.push(`) {`);
    lines.push(`  return useQuery({`);
    lines.push(`    queryKey: queryKeys.${camelName}.detail(id),`);
    lines.push(`    queryFn: () =>`);
    lines.push(`      apiFetch<${detailType}>(\`${readBase}/\${encodeURIComponent(id)}\`)`);
    lines.push(`        .then(data => ${detailExtract}),`);
    lines.push(`    enabled: !!id,`);
    lines.push(`    staleTime: ${opts.defaultStaleTime},`);
    lines.push(`    ...options,`);
    lines.push(`  });`);
    lines.push(`}`);
    lines.push('');
  }

  // Command mutation hooks
  if (ir.commands.length > 0) {
    lines.push('// ============================================================');
    lines.push('// Command mutation hooks');
    lines.push('// ============================================================');
    lines.push('');
  }

  for (const command of ir.commands) {
    const entityName = command.entity;
    if (!entityName) {
      diagnostics.push({
        severity: 'warning',
        code: 'ORPHAN_COMMAND',
        message: `Command "${command.name}" has no entity — skipping mutation hook.`,
      });
      continue;
    }

    const entity = ir.entities.find((e) => e.name === entityName);
    if (!entity) continue;

    const hookName = `use${entityName}${capitalize(command.name)}`;
    const camelEntity = toLowerCamelCase(entityName);

    // Command URL: the entityRoutes.writeBase override keeps the historical
    // `${writeBase}/${kebab(command)}` shape; the default routes through the
    // contract's dispatcher invocation path — the RAW entity + command names the
    // generated dispatcher resolves (a lowercased/kebab URL misses the dispatcher).
    const writeOverride = opts.entityRoutes[entityName]?.writeBase;
    const commandUrl = writeOverride
      ? `${writeOverride}/${toKebabCase(command.name)}`
      : opts.contract.dispatcherInvocationPath(entityName, command.name);

    const hasParams = command.parameters.length > 0;
    const inputTypeName = hasParams ? `${entityName}${capitalize(command.name)}Input` : 'void';
    const bareReturnType = command.returns
      ? irTypeToTsType(command.returns, opts.dateSerialization === 'iso-string')
      : 'unknown';
    const returnTypeName = opts.commandEnvelope
      ? `CommandEnvelope<${bareReturnType}>`
      : `ManifestCommandResponse<${bareReturnType}>`;

    lines.push(`export function ${hookName}(`);
    lines.push(
      `  options?: Omit<UseMutationOptions<${returnTypeName}, Error, ${inputTypeName}>, 'mutationFn'>,`,
    );
    lines.push(`) {`);
    lines.push(`  const queryClient = useQueryClient();`);
    lines.push(`  return useMutation({`);
    lines.push(`    mutationFn: ${hasParams ? `(input: ${inputTypeName})` : '()'} =>`);
    lines.push(`      apiFetch<${returnTypeName}>(\`${commandUrl}\`, {`);
    lines.push(`        method: 'POST',`);
    lines.push(`        headers: { 'Content-Type': 'application/json' },`);
    lines.push(`        body: JSON.stringify(${hasParams ? 'input' : '{}'}),`);
    lines.push(`      }),`);

    // Cache invalidation on success
    lines.push(`    onSuccess: (...args) => {`);
    lines.push(
      `      void queryClient.invalidateQueries({ queryKey: queryKeys.${camelEntity}.all });`,
    );
    lines.push(`      options?.onSuccess?.(...args);`);
    lines.push(`    },`);
    lines.push(`    ...options,`);
    lines.push(`  });`);
    lines.push(`}`);
    lines.push('');
  }

  return { code: lines.join('\n'), diagnostics };
}

// ---------------------------------------------------------------------------
// Provider generation
// ---------------------------------------------------------------------------

function generateProvider(opts: NormalizedOptions): CodeResult {
  const lines: string[] = [];

  lines.push('// Auto-generated TanStack Query provider from Manifest IR');
  lines.push('// DO NOT EDIT - This file is generated from .manifest source');
  lines.push('');
  lines.push("'use client';");
  lines.push('');
  lines.push("import { QueryClient, QueryClientProvider } from '@tanstack/react-query';");
  lines.push("import { useState, type ReactNode } from 'react';");
  lines.push('');
  lines.push('export function ManifestQueryProvider({ children }: { children: ReactNode }) {');
  lines.push('  const [queryClient] = useState(');
  lines.push('    () =>');
  lines.push('      new QueryClient({');
  lines.push('        defaultOptions: {');
  lines.push('          queries: {');
  lines.push(`            staleTime: ${opts.defaultStaleTime},`);
  lines.push('            refetchOnWindowFocus: false,');
  if (opts.errorBoundaryIntegration) {
    lines.push('            throwOnError: true,');
  }
  lines.push('          },');
  lines.push('          mutations: {');
  if (opts.errorBoundaryIntegration) {
    lines.push('            throwOnError: true,');
  }
  lines.push('          },');
  lines.push('        },');
  lines.push('      }),');
  lines.push('  );');
  lines.push('');
  lines.push('  return (');
  lines.push('    <QueryClientProvider client={queryClient}>');
  lines.push('      {children}');
  lines.push('    </QueryClientProvider>');
  lines.push('  );');
  lines.push('}');

  return { code: lines.join('\n'), diagnostics: [] };
}

// ---------------------------------------------------------------------------
// Projection class
// ---------------------------------------------------------------------------

export class ReactQueryProjection implements ProjectionTarget {
  readonly name = 'react-query';
  readonly description =
    'TanStack Query (React Query) hooks with typed queries, mutations, and cache invalidation';
  readonly surfaces = ['react-query.hooks', 'react-query.provider'] as const;
  readonly descriptorMeta = REACT_QUERY_DESCRIPTOR_META;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    const options = request.options as ReactQueryProjectionOptions | undefined;
    const opts = normalizeOptions(options);

    switch (request.surface) {
      case 'react-query.hooks': {
        const result = generateHooks(ir, opts);
        return {
          artifacts: [
            {
              id: 'react-query.hooks',
              pathHint: 'src/hooks/manifest-hooks.ts',
              contentType: 'typescript',
              code: result.code,
            },
          ],
          diagnostics: result.diagnostics,
        };
      }

      case 'react-query.provider': {
        const result = generateProvider(opts);
        return {
          artifacts: [
            {
              id: 'react-query.provider',
              pathHint: 'src/providers/manifest-query-provider.tsx',
              contentType: 'typescript',
              code: result.code,
            },
          ],
          diagnostics: result.diagnostics,
        };
      }

      default:
        return {
          artifacts: [],
          diagnostics: [
            {
              severity: 'error',
              code: 'UNKNOWN_SURFACE',
              message: `Unknown surface: "${request.surface}"`,
            },
          ],
        };
    }
  }
}
