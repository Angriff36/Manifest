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
  /** Base API path prefix (default: '/api') */
  apiBasePath?: string;
  /** Dispatcher route prefix (default: '/api/manifest') */
  dispatcherBasePath?: string;
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
   * When true, command mutations type their response as the dispatcher/sync
   * envelope `{ success, result, events }` via a generated `CommandEnvelope<T>`
   * instead of the bare command return type. Default: false.
   */
  commandEnvelope?: boolean;
}

interface NormalizedOptions {
  apiBasePath: string;
  dispatcherBasePath: string;
  optimisticUpdates: boolean;
  errorBoundaryIntegration: boolean;
  typesImportPath: string;
  defaultStaleTime: number;
  entityRoutes: Record<string, EntityRouteOverride>;
  readEnvelope: Record<string, ReadEnvelopeOverride>;
  fetchAdapter?: { importPath: string; importName: string };
  commandEnvelope: boolean;
}

function normalizeOptions(opts?: ReactQueryProjectionOptions): NormalizedOptions {
  return {
    apiBasePath: opts?.apiBasePath ?? '/api',
    dispatcherBasePath: opts?.dispatcherBasePath ?? '/api/manifest',
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
  };
}

// Route + envelope resolvers. Each falls back to the historical default so
// output is byte-identical when no override is supplied.
function resolveReadBase(entityName: string, opts: NormalizedOptions): string {
  return opts.entityRoutes[entityName]?.readBase ?? `${opts.apiBasePath}/${entityName.toLowerCase()}`;
}

function resolveWriteBase(entityName: string, opts: NormalizedOptions): string {
  return (
    opts.entityRoutes[entityName]?.writeBase ??
    `${opts.dispatcherBasePath}/${entityName.toLowerCase()}/commands`
  );
}

function resolveListKey(entityName: string, camelName: string, opts: NormalizedOptions): string {
  return opts.readEnvelope[entityName]?.listKey ?? `${camelName}s`;
}

function resolveDetailKey(entityName: string, camelName: string, opts: NormalizedOptions): string {
  return opts.readEnvelope[entityName]?.detailKey ?? camelName;
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

function irTypeToTsType(irType: IRType): string {
  const tsTypeMap: Record<string, string> = {
    string: 'string',
    number: 'number',
    boolean: 'boolean',
    date: 'Date',
    datetime: 'Date',
    any: 'unknown',
    void: 'void',
    // Numeric scalars with no TS equivalent map to number (matches runtime).
    money: 'number',
    decimal: 'number',
    int: 'number',
  };
  const baseType = tsTypeMap[irType.name] || irType.name;
  return irType.nullable ? `${baseType} | null` : baseType;
}

function parameterToTsType(param: IRParameter): string {
  const baseType = irTypeToTsType(param.type);
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
  const members = e.values.map(v => JSON.stringify(v.name)).join(' | ');
  return `export type ${e.name} = ${members};`;
}

function generateEntityTypes(entity: IREntity): string {
  const lines: string[] = [];
  lines.push(`export interface ${entity.name} {`);
  for (const prop of entity.properties) {
    const tsType = irTypeToTsType(prop.type);
    const isOptional =
      prop.modifiers.includes('optional') ||
      prop.defaultValue !== undefined ||
      prop.type.nullable;
    const optional = isOptional ? '?' : '';
    lines.push(`  ${prop.name}${optional}: ${tsType};`);
  }
  lines.push('}');
  return lines.join('\n');
}

function generateCommandInputType(command: IRCommand): string | null {
  if (command.parameters.length === 0) return null;

  const entityPrefix = command.entity ?? '';
  const typeName = `${entityPrefix}${capitalize(command.name)}Input`;
  const lines: string[] = [];

  lines.push(`export interface ${typeName} {`);
  for (const param of command.parameters) {
    const tsType = parameterToTsType(param);
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
  lines.push("// Auto-generated TanStack Query hooks from Manifest IR");
  lines.push("// DO NOT EDIT - This file is generated from .manifest source");
  lines.push("");
  lines.push("import {");
  lines.push("  useQuery,");
  lines.push("  useMutation,");
  lines.push("  useQueryClient,");
  lines.push("  type UseQueryOptions,");
  lines.push("  type UseMutationOptions,");
  lines.push("} from '@tanstack/react-query';");
  // Optional host-provided fetch adapter (auth/credentials). Aliased to apiFetch
  // so call sites are identical to the inline-helper path.
  if (opts.fetchAdapter) {
    const { importPath, importName } = opts.fetchAdapter;
    const binding = importName === 'apiFetch' ? 'apiFetch' : `${importName} as apiFetch`;
    lines.push(`import { ${binding} } from '${importPath}';`);
  }
  lines.push("");

  // Types section — inline types so the hooks file is self-contained
  lines.push("// ============================================================");
  lines.push("// Entity types (from IR)");
  lines.push("// ============================================================");
  lines.push("");

  // Command response envelope (opt-in): the dispatcher/sync write shape.
  if (opts.commandEnvelope) {
    lines.push("export interface CommandEnvelope<T> {");
    lines.push("  success: boolean;");
    lines.push("  result: T;");
    lines.push("  events: unknown[];");
    lines.push("}");
    lines.push("");
  }

  for (const e of ir.enums ?? []) {
    lines.push(generateEnumType(e));
    lines.push("");
  }

  for (const entity of ir.entities) {
    lines.push(generateEntityTypes(entity));
    lines.push("");
  }

  // Command input types
  const commandInputTypes = ir.commands
    .map(c => generateCommandInputType(c))
    .filter((t): t is string => t !== null);

  if (commandInputTypes.length > 0) {
    lines.push("// ============================================================");
    lines.push("// Command input types (from IR)");
    lines.push("// ============================================================");
    lines.push("");
    for (const typeStr of commandInputTypes) {
      lines.push(typeStr);
      lines.push("");
    }
  }

  // Query key factories
  lines.push("// ============================================================");
  lines.push("// Query key factories");
  lines.push("// ============================================================");
  lines.push("");
  lines.push("export const queryKeys = {");
  for (const entity of ir.entities) {
    const camelName = toLowerCamelCase(entity.name);
    lines.push(`  ${camelName}: {`);
    lines.push(`    all: ['${camelName}'] as const,`);
    lines.push(`    lists: () => [...queryKeys.${camelName}.all, 'list'] as const,`);
    lines.push(`    detail: (id: string) => [...queryKeys.${camelName}.all, 'detail', id] as const,`);
    lines.push(`  },`);
  }
  lines.push("} as const;");
  lines.push("");

  // API fetch helpers. When a fetchAdapter is configured, the import above
  // provides `apiFetch`; otherwise emit the inline default helper.
  if (!opts.fetchAdapter) {
    lines.push("// ============================================================");
    lines.push("// API fetch helpers");
    lines.push("// ============================================================");
    lines.push("");
    lines.push("async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {");
    lines.push("  const response = await fetch(url, init);");
    lines.push("  if (!response.ok) {");
    lines.push("    const error = await response.json().catch(() => ({ message: response.statusText }));");
    lines.push("    throw new Error(error.message || `Request failed: ${response.status}`);");
    lines.push("  }");
    lines.push("  return response.json();");
    lines.push("}");
    lines.push("");
  }

  // Entity query hooks
  lines.push("// ============================================================");
  lines.push("// Entity query hooks");
  lines.push("// ============================================================");
  lines.push("");

  for (const entity of ir.entities) {
    const name = entity.name;
    const camelName = toLowerCamelCase(name);
    const readBase = resolveReadBase(name, opts);
    const listKey = resolveListKey(name, camelName, opts);
    const detailKey = resolveDetailKey(name, camelName, opts);
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
    lines.push("");

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
    lines.push("");
  }

  // Command mutation hooks
  if (ir.commands.length > 0) {
    lines.push("// ============================================================");
    lines.push("// Command mutation hooks");
    lines.push("// ============================================================");
    lines.push("");
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

    const entity = ir.entities.find(e => e.name === entityName);
    if (!entity) continue;

    const hookName = `use${entityName}${capitalize(command.name)}`;
    const writeBase = resolveWriteBase(entityName, opts);
    const commandSlug = toKebabCase(command.name);
    const camelEntity = toLowerCamelCase(entityName);

    const hasParams = command.parameters.length > 0;
    const inputTypeName = hasParams
      ? `${entityName}${capitalize(command.name)}Input`
      : 'void';
    const bareReturnType = command.returns
      ? irTypeToTsType(command.returns)
      : 'unknown';
    const returnTypeName = opts.commandEnvelope
      ? `CommandEnvelope<${bareReturnType}>`
      : bareReturnType;

    lines.push(`export function ${hookName}(`);
    lines.push(`  options?: Omit<UseMutationOptions<${returnTypeName}, Error, ${inputTypeName}>, 'mutationFn'>,`);
    lines.push(`) {`);
    lines.push(`  const queryClient = useQueryClient();`);
    lines.push(`  return useMutation({`);
    lines.push(`    mutationFn: (${hasParams ? 'input' : ''}: ${inputTypeName}) =>`);
    lines.push(`      apiFetch<${returnTypeName}>(\`${writeBase}/${commandSlug}\`, {`);
    lines.push(`        method: 'POST',`);
    lines.push(`        headers: { 'Content-Type': 'application/json' },`);
    lines.push(`        body: JSON.stringify(${hasParams ? 'input' : '{}'}),`);
    lines.push(`      }),`);

    // Cache invalidation on success
    lines.push(`    onSuccess: (...args) => {`);
    lines.push(`      void queryClient.invalidateQueries({ queryKey: queryKeys.${camelEntity}.all });`);
    lines.push(`      options?.onSuccess?.(...args);`);
    lines.push(`    },`);
    lines.push(`    ...options,`);
    lines.push(`  });`);
    lines.push(`}`);
    lines.push("");
  }

  return { code: lines.join('\n'), diagnostics };
}

// ---------------------------------------------------------------------------
// Provider generation
// ---------------------------------------------------------------------------

function generateProvider(opts: NormalizedOptions): CodeResult {
  const lines: string[] = [];

  lines.push("// Auto-generated TanStack Query provider from Manifest IR");
  lines.push("// DO NOT EDIT - This file is generated from .manifest source");
  lines.push("");
  lines.push("'use client';");
  lines.push("");
  lines.push("import { QueryClient, QueryClientProvider } from '@tanstack/react-query';");
  lines.push("import { useState, type ReactNode } from 'react';");
  lines.push("");
  lines.push("export function ManifestQueryProvider({ children }: { children: ReactNode }) {");
  lines.push("  const [queryClient] = useState(");
  lines.push("    () =>");
  lines.push("      new QueryClient({");
  lines.push("        defaultOptions: {");
  lines.push("          queries: {");
  lines.push(`            staleTime: ${opts.defaultStaleTime},`);
  lines.push("            refetchOnWindowFocus: false,");
  if (opts.errorBoundaryIntegration) {
    lines.push("            throwOnError: true,");
  }
  lines.push("          },");
  lines.push("          mutations: {");
  if (opts.errorBoundaryIntegration) {
    lines.push("            throwOnError: true,");
  }
  lines.push("          },");
  lines.push("        },");
  lines.push("      }),");
  lines.push("  );");
  lines.push("");
  lines.push("  return (");
  lines.push("    <QueryClientProvider client={queryClient}>");
  lines.push("      {children}");
  lines.push("    </QueryClientProvider>");
  lines.push("  );");
  lines.push("}");

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
