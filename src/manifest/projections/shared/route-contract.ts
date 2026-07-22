/**
 * Cross-projection route + envelope + name contract.
 *
 * Three server/client generators independently derive URL layout, response
 * envelope keys, and validation-schema names — and they drift (the 2026-07-01
 * reconciliation audit, "No single source of truth for cross-projection
 * contracts"). This module is that single source: pure, deterministic helpers
 * plus a normalized `RouteContract` object that every projection resolves from
 * the SAME options, so the routes a client calls always exist and the fields it
 * reads always match what the server returns.
 *
 * Everything here is a pure string transform — identical input always yields
 * identical output (house-style determinism invariant). No framework imports,
 * so nextjs / react-query / routes / zod / hono / express can all consume it
 * without a dependency cycle.
 */

import { applyRouteCasing, type RouteCasing } from './naming.js';
import { moduleDirSegment } from './module-path.js';

// ---------------------------------------------------------------------------
// Param placeholder styles
// ---------------------------------------------------------------------------

/**
 * How a dynamic path segment is rendered in a URL *template*:
 *   - `'nextjs'`  → `[id]`   (App Router file-convention + the URL it serves)
 *   - `'colon'`   → `:id`    (Express / Hono / most Node routers)
 *   - `'literal'` → `id`     (bare name; for callers that interpolate a value)
 */
export type ParamStyle = 'nextjs' | 'colon' | 'literal';

function paramSlot(name: string, style: ParamStyle): string {
  switch (style) {
    case 'colon':
      return `:${name}`;
    case 'literal':
      return name;
    case 'nextjs':
    default:
      return `[${name}]`;
  }
}

// ---------------------------------------------------------------------------
// Pure name/segment/key helpers (usable without a full contract)
// ---------------------------------------------------------------------------

/** Lowercase only the first character. Deliberately NOT word-splitting camelCase. */
function lowerFirst(value: string): string {
  return value ? value[0].toLowerCase() + value.slice(1) : value;
}

/** Uppercase only the first character. Matches the hono/express/zod pascal helpers. */
function upperFirst(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

/** `createdAt` / `PublishRecipe` → `created-at` / `publish-recipe` (command URL slug). */
function toCommandSlug(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

/** Options that determine an entity's URL/route path segment. */
export interface EntitySegmentOptions {
  /** Explicit per-entity segment overrides (used verbatim, may contain `/`). */
  routeSegments?: Record<string, string>;
  /** Casing applied to the entity name when no override is present. Default `'lowercase'`. */
  routeCasing?: RouteCasing;
  /**
   * Optional IR module name per entity. When set (and no `routeSegments` override),
   * the sanitized module is prepended: `billing/order`. Explicit overrides win
   * unchanged so multi-segment `routeSegments` stay authoritative.
   */
  entityModules?: Record<string, string>;
}

/**
 * URL/route path segment for an entity: explicit `routeSegments` override →
 * else optional `entityModules` prefix + name normalized per `routeCasing`
 * (default `'lowercase'`, the legacy flattened form `PrepTask` → `preptask`).
 *
 * This is the ONE segment derivation. The nextjs generator's `resolveRouteSegment`
 * and the client both call it, so route pathHints and client fetch URLs cannot
 * disagree on casing or module nesting.
 */
export function resolveEntitySegment(entityName: string, opts: EntitySegmentOptions = {}): string {
  const override = opts.routeSegments?.[entityName];
  if (override !== undefined) return override;

  const base = applyRouteCasing(entityName, opts.routeCasing ?? 'lowercase');
  const mod = moduleDirSegment(opts.entityModules?.[entityName]);
  return mod ? `${mod}/${base}` : base;
}

/**
 * Envelope key holding the array in a list-read response. The historical, naive
 * derivation `${camelEntity}s` (e.g. `Recipe` → `recipes`, `OrderLine` →
 * `orderLines`). Kept as the documented default — server read routes and every
 * client share THIS helper, so the key they write and the key they read are the
 * same string by construction. Irregular plurals (`Dish` → `dishs`) are wrong by
 * design here; overrides live per-projection (react-query `readEnvelope`).
 */
export function listEnvelopeKey(entityName: string): string {
  return `${lowerFirst(entityName)}s`;
}

/** Envelope key holding the object in a detail-read response, e.g. `Recipe` → `recipe`. */
export function detailEnvelopeKey(entityName: string): string {
  return lowerFirst(entityName);
}

/**
 * Canonical Zod command-params schema export name: `${Entity}${Command}ParamsSchema`
 * (e.g. `Recipe` + `create` → `RecipeCreateParamsSchema`). Capitalize-first only
 * (NOT word-splitting) to match hono/express/convex.react import derivation.
 * Prefer the bundled `zod.schemas` module (`schemas/manifest-schemas.ts`) over
 * per-command microfiles (`zod.command`), which collide on shared command names.
 */
export function zodParamsSchemaName(entityName: string, commandName: string): string {
  return `${upperFirst(entityName)}${upperFirst(commandName)}ParamsSchema`;
}

/**
 * URL base path for reads/detail, derived from the App Router `appDir` by
 * stripping the routing-root segments Next.js does not put in the URL: a leading
 * `src` then a leading `app`. `app/api` → `/api`; `src/app/api` → `/api`;
 * `app/api/v2` → `/api/v2`; `app` → `''` (root). This is why a client generated
 * from the same `appDir` as the routes can never target a stale prefix.
 */
export function deriveApiBasePath(appDir: string): string {
  const segments = appDir.split('/').filter(Boolean);
  if (segments[0] === 'src') segments.shift();
  if (segments[0] === 'app') segments.shift();
  return segments.length ? `/${segments.join('/')}` : '';
}

// ---------------------------------------------------------------------------
// Response envelope type shapes (the server's wire contract)
// ---------------------------------------------------------------------------

/**
 * A single diagnostic in a Manifest response body. Mirrors the `ManifestDiagnostic`
 * the emitted `manifest-response` companion declares.
 */
export interface ManifestResponseDiagnostic {
  kind?: string;
  code?: string;
  message?: string;
  [key: string]: unknown;
}

/**
 * The command response body the Next.js dispatcher (and per-command routes) put
 * on the wire. Verified against the emitted code: success responds
 * `{ data, events, diagnostics }` and failure responds `{ error, diagnostics }`.
 * There is deliberately NO `success` field on the wire — callers branch on the
 * HTTP status. `data` is the command's return value.
 */
export interface ManifestCommandResponse<T = unknown> {
  data?: T;
  events?: unknown[];
  diagnostics?: ManifestResponseDiagnostic[];
  error?: string;
}

/*
 * List/detail read bodies are `{ [listEnvelopeKey(E)]: T[] }` and
 * `{ [detailEnvelopeKey(E)]: T }` respectively — the key is dynamic (per entity)
 * so it cannot be a fixed interface; use the key helpers above. Both the read
 * routes and the client resolve the key from the same helper.
 */

// ---------------------------------------------------------------------------
// The contract object
// ---------------------------------------------------------------------------

/**
 * Canonical dispatcher route path (relative to `appDir`). Mirrors
 * `DISPATCHER_DEFAULTS.path` in the nextjs projection — the one place the
 * dispatcher's `[entity]/commands/[command]` shape is defined.
 */
export const DEFAULT_DISPATCHER_ROUTE_PATH = '/manifest/[entity]/commands/[command]/route.ts';

/** Options for {@link resolveRouteContract}. All optional; defaults are coherent. */
export interface RouteContractOptions extends EntitySegmentOptions {
  /**
   * URL prefix for read/detail paths. Default: derived from `appDir` via
   * {@link deriveApiBasePath}, so it tracks the route filesystem layout and
   * cannot desync. Set explicitly only to point a client at a different origin
   * prefix than where the routes are emitted.
   */
  apiBasePath?: string;
  /** Dispatcher URL prefix. Default: `${apiBasePath}/manifest`. */
  dispatcherBasePath?: string;
  /** App Router base directory route pathHints are relative to. Default `'app/api'`. */
  appDir?: string;
  /** Dispatcher route path relative to `appDir`. Default {@link DEFAULT_DISPATCHER_ROUTE_PATH}. */
  dispatcherRoutePath?: string;
}

/**
 * Normalized, framework-agnostic route contract. Every path method is pure and
 * deterministic. URL methods (`listPath`, `detailPath`, `dispatcherPath`,
 * `dispatcherInvocationPath`, `concreteCommandPath`) describe what a CLIENT
 * calls; the `*RoutePathHint` methods describe where the SERVER emits the route
 * file — the two are derived from the same `appDir`/`apiBasePath` so they agree.
 */
export interface RouteContract {
  readonly apiBasePath: string;
  readonly dispatcherBasePath: string;
  readonly appDir: string;
  readonly dispatcherRoutePath: string;

  /** URL/route segment for an entity (override → casing). */
  entitySegment(entityName: string): string;
  /** `${apiBasePath}/${segment}` — the per-entity read/detail base. */
  entityBasePath(entityName: string): string;

  // ---- URLs a client calls ----
  /** `${entityBasePath}/list`. */
  listPath(entityName: string): string;
  /** `${entityBasePath}/[id]` (param style selects the placeholder). */
  detailPath(entityName: string, paramStyle?: ParamStyle): string;
  /** Deprecated per-command concrete URL: `${entityBasePath}/${command-slug}`. */
  concreteCommandPath(entityName: string, commandName: string): string;
  /** Dispatcher URL *template*: `${dispatcherBasePath}/[entity]/commands/[command]`. */
  dispatcherPath(paramStyle?: ParamStyle): string;
  /**
   * Concrete dispatcher invocation URL using the RAW entity/command names
   * (case-sensitive — the dispatcher resolves the command by its exact name):
   * `${dispatcherBasePath}/Recipe/commands/publishRecipe`.
   */
  dispatcherInvocationPath(entityName: string, commandName: string): string;

  // ---- Filesystem pathHints the server emits ----
  listRoutePathHint(entityName: string): string;
  detailRoutePathHint(entityName: string): string;
  concreteCommandRoutePathHint(entityName: string, commandName: string): string;
  dispatcherRoutePathHint(): string;

  // ---- Envelope keys (shared by server routes + clients) ----
  listEnvelopeKey(entityName: string): string;
  detailEnvelopeKey(entityName: string): string;
}

/**
 * Resolve a {@link RouteContract} from options. Defaults are chosen so the
 * client and routes are coherent with zero configuration: `apiBasePath` and
 * `dispatcherBasePath` are derived from `appDir`, and the entity segment uses
 * the same override/casing logic the route emitter uses.
 */
export function resolveRouteContract(options: RouteContractOptions = {}): RouteContract {
  const appDir = options.appDir ?? 'app/api';
  const apiBasePath = options.apiBasePath ?? deriveApiBasePath(appDir);
  const dispatcherBasePath = options.dispatcherBasePath ?? `${apiBasePath}/manifest`;
  const dispatcherRoutePath = options.dispatcherRoutePath ?? DEFAULT_DISPATCHER_ROUTE_PATH;
  const segOpts: EntitySegmentOptions = {
    routeSegments: options.routeSegments,
    routeCasing: options.routeCasing,
    entityModules: options.entityModules,
  };

  const entitySegment = (entityName: string): string => resolveEntitySegment(entityName, segOpts);
  const entityBasePath = (entityName: string): string =>
    `${apiBasePath}/${entitySegment(entityName)}`;

  return {
    apiBasePath,
    dispatcherBasePath,
    appDir,
    dispatcherRoutePath,

    entitySegment,
    entityBasePath,

    listPath: (entityName) => `${entityBasePath(entityName)}/list`,
    detailPath: (entityName, paramStyle = 'nextjs') =>
      `${entityBasePath(entityName)}/${paramSlot('id', paramStyle)}`,
    concreteCommandPath: (entityName, commandName) =>
      `${entityBasePath(entityName)}/${toCommandSlug(commandName)}`,
    dispatcherPath: (paramStyle = 'nextjs') =>
      `${dispatcherBasePath}/${paramSlot('entity', paramStyle)}/commands/${paramSlot('command', paramStyle)}`,
    dispatcherInvocationPath: (entityName, commandName) =>
      `${dispatcherBasePath}/${entityName}/commands/${commandName}`,

    listRoutePathHint: (entityName) => `${appDir}/${entitySegment(entityName)}/list/route.ts`,
    detailRoutePathHint: (entityName) => `${appDir}/${entitySegment(entityName)}/[id]/route.ts`,
    concreteCommandRoutePathHint: (entityName, commandName) =>
      `${appDir}/${entitySegment(entityName)}/${toCommandSlug(commandName)}/route.ts`,
    dispatcherRoutePathHint: () => `${appDir}${dispatcherRoutePath}`,

    listEnvelopeKey,
    detailEnvelopeKey,
  };
}
