/**
 * Canonical route surface types.
 *
 * These types define the route manifest shape — the deterministic,
 * IR-derived description of all transport endpoints.
 *
 * Routes are projection artifacts, not application concerns.
 * See docs/spec/manifest-vnext.md § "Canonical Routes (Normative)".
 */
/**
 * Source of a route entry.
 *
 * - entity-read: Derived from an IR entity (GET list/detail)
 * - command: Derived from an IR command (POST)
 * - manual: Declared in project config, not IR-derived
 */
export type RouteSource = {
    kind: 'entity-read';
    entity: string;
} | {
    kind: 'command';
    entity: string;
    command: string;
} | {
    kind: 'manual';
    id: string;
};
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
    generatedAt: string;
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
 */
export interface RoutesProjectionOptions {
    /** Base path prefix for all routes (default: "/api") */
    basePath?: string;
    /** Whether to include auth expectations (default: true) */
    includeAuth?: boolean;
    /** Whether to include tenant expectations (default: true) */
    includeTenant?: boolean;
    /** Manual route declarations to merge into the surface */
    manualRoutes?: ManualRouteDeclaration[];
    /** ISO timestamp override for deterministic output (testing) */
    generatedAt?: string;
}
//# sourceMappingURL=types.d.ts.map