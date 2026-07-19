/**
 * Canonical route surface types.
 *
 * These types define the route manifest shape — the deterministic,
 * IR-derived description of all transport endpoints.
 *
 * Routes are projection artifacts, not application concerns.
 * See docs/spec/manifest-vnext.md § "Canonical Routes (Normative)".
 */

import type { RouteCasing } from '../shared/naming';

/**
 * Source of a route entry.
 *
 * - entity-read: Derived from an IR entity (GET list/detail)
 * - command: Derived from an IR command (POST). `variant` distinguishes the
 *   canonical dispatcher invocation path (`dispatcher`, default) from the
 *   deprecated per-command concrete path (`concrete`, only when opted in) so the
 *   two never collide on route id / builder name.
 * - manual: Declared in project config, not IR-derived
 */
export type RouteSource =
  | { kind: 'entity-read'; entity: string }
  | { kind: 'command'; entity: string; command: string; variant?: 'dispatcher' | 'concrete' }
  | { kind: 'manual'; id: string };

/**
 * Parameter location in the transport layer.
 */
export type ParamLocation = 'path' | 'query' | 'body';

/**
 * A single route parameter.
 */
export interface RouteParam {
  name: string;
  type: string;
  location: ParamLocation;
  required?: boolean;
}

/**
 * A single route entry in the route manifest.
 */
export interface RouteEntry {
  /** Stable identifier for this route (deterministic, derived from source) */
  id: string;
  /** URL path template (e.g. "/api/recipe/list", "/api/recipe/:id") */
  path: string;
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Route parameters */
  params: RouteParam[];
  /** Source of this route */
  source: RouteSource;
  /** Whether this route requires authentication */
  auth: boolean;
  /** Whether this route requires tenant context */
  tenant: boolean;
}

/**
 * The complete route manifest artifact.
 */
export interface RouteManifest {
  $schema: string;
  version: '1.0';
  basePath: string;
  routes: RouteEntry[];
}

/**
 * Manual route declaration in project config.
 *
 * Users declare these in manifest.config.yaml under `manualRoutes`.
 */
export interface ManualRouteDeclaration {
  /** Unique identifier for this manual route */
  id: string;
  /** URL path template */
  path: string;
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Route parameters */
  params?: RouteParam[];
  /** Whether this route requires authentication (default: false) */
  auth?: boolean;
  /** Whether this route requires tenant context (default: false) */
  tenant?: boolean;
}

/**
 * Configuration options for the routes projection.
 *
 * The URL-shaping options (`appDir`/`apiBasePath`/`dispatcherBasePath`/
 * `routeSegments`/`routeCasing`/`dispatcher`/`concreteCommandRoutes`) mirror the
 * nextjs projection's option names and are resolved through the SAME shared route
 * contract, so the paths this surface describes match the routes nextjs emits
 * byte-for-byte under identical options.
 */
export interface RoutesProjectionOptions {
  /**
   * URL prefix for read/detail paths. Legacy alias for `apiBasePath`; when both
   * are set `apiBasePath` wins. Default: derived from `appDir` (so `app/api` →
   * `/api`, preserving the historical `/api` default).
   */
  basePath?: string;
  /** URL prefix for read/detail paths (overrides `basePath`). Default: derived from `appDir`. */
  apiBasePath?: string;
  /** Dispatcher URL prefix. Default: `${apiBasePath}/manifest`. */
  dispatcherBasePath?: string;
  /** App Router base directory the URL bases derive from. Default `'app/api'` ⇒ `/api`. */
  appDir?: string;
  /** Explicit per-entity URL segment overrides. Takes precedence over `routeCasing`. */
  routeSegments?: Record<string, string>;
  /** Casing for the default entity URL segment. Default `'lowercase'` (legacy flatten). */
  routeCasing?: RouteCasing;
  /**
   * Canonical dispatcher policy (mirrors nextjs `dispatcher`). When `enabled`
   * (default), each command is described by its dispatcher invocation path
   * (`/api/manifest/<Entity>/commands/<command>`, raw names). `path` overrides
   * the dispatcher route template relative to `appDir`.
   */
  dispatcher?: {
    enabled?: boolean;
    path?: string;
  };
  /**
   * Deprecated per-command concrete routes policy (mirrors nextjs
   * `concreteCommandRoutes`). When `enabled`, concrete `${apiBasePath}/<entity>/
   * <kebab-command>` entries are ADDED alongside the dispatcher entries — the
   * same URLs the `nextjs.command` surface emits when opted in. Default: off.
   */
  concreteCommandRoutes?: {
    enabled?: boolean;
    legacyAliasesOnly?: boolean;
  };
  /** Whether to include auth expectations (default: true) */
  includeAuth?: boolean;
  /** Whether to include tenant expectations (default: true) */
  includeTenant?: boolean;
  /** Manual route declarations to merge into the surface */
  manualRoutes?: ManualRouteDeclaration[];
  /** ISO timestamp override for deterministic output (testing) */
}
