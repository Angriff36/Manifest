/**
 * OpenAPI 3.1 projection types.
 *
 * Configuration and output types for the OpenAPI 3.1.0 spec projection.
 * Generates a complete OpenAPI spec from Manifest IR entities, commands,
 * and routes with JSON Schema-typed request/response bodies.
 */

/**
 * Security scheme definition for OpenAPI components.
 */
export interface OpenApiSecurityScheme {
  /** Reference to a security scheme defined in components.securitySchemes */
  ref: string;
}

/**
 * Configuration options for the OpenAPI projection.
 */
export interface OpenApiProjectionOptions {
  /** Base path prefix for all routes (default: "/api") */
  basePath?: string;

  /** OpenAPI info section overrides */
  info?: {
    /** API title (default: derived from IR modules or "Manifest API") */
    title?: string;
    /** API version (default: IR provenance schemaVersion or "1.0.0") */
    version?: string;
    /** API description */
    description?: string;
    /** Contact information */
    contact?: {
      name?: string;
      email?: string;
      url?: string;
    };
    /** License information */
    license?: {
      name: string;
      url?: string;
    };
  };

  /** Server URLs to include in the spec */
  servers?: Array<{
    url: string;
    description?: string;
    variables?: Record<string, { default: string; description?: string; enum?: string[] }>;
  }>;

  /** Security schemes to include in components */
  securitySchemes?: Record<
    string,
    {
      type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
      description?: string;
      name?: string;
      in?: 'query' | 'header' | 'cookie';
      scheme?: string;
      bearerFormat?: string;
      flows?: Record<string, unknown>;
      openIdConnectUrl?: string;
    }
  >;

  /** Global security requirements applied to all operations */
  security?: OpenApiSecurityScheme[];

  /** Whether to include authentication on routes (default: true) */
  includeAuth?: boolean;

  /** Whether to include tenant context (default: true) */
  includeTenant?: boolean;

  /** Whether to include constraint error response schemas (default: true) */
  includeConstraintErrors?: boolean;

  /** Whether to include policy-level security on operations (default: true) */
  includePolicySecurity?: boolean;

  /**
   * Command write-path shape in the OpenAPI spec.
   * - `dispatcher` — canonical `POST {base}/manifest/{entity}/commands/{command}`
   * - `legacy` — older `POST {base}/{entity}/{command-kebab}` only
   * - `both` (default) — dispatcher + deprecated legacy alias
   */
  commandPathStyle?: 'legacy' | 'dispatcher' | 'both';
}
