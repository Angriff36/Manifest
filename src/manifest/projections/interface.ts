/**
 * Projection targets consume Manifest IR and emit platform/tooling artifacts.
 *
 * Projections are TOOLING, not runtime semantics.
 * They must not redefine execution order or policy/guard semantics.
 */

import type { IR } from '../ir';
import type { NamingConventionInput } from './shared/naming';

export interface ProjectionRequest {
  /**
   * Surface identifier (capability name).
   * Examples: "nextjs.route", "nextjs.command", "ts.types", "ts.client", "zod.schema", "docs.markdown"
   */
  surface: string;

  /**
   * Entity name when the surface is entity-scoped.
   * Example: "Recipe" for "nextjs.route" or "nextjs.command"
   */
  entity?: string;

  /**
   * Command name when the surface is command-scoped.
   * Example: "create" for "nextjs.command"
   * Promoted to first-class field because it is a routing key, not a configuration option.
   */
  command?: string;

  /**
   * Surface-specific options.
   * Keep this generic at the interface boundary; projections cast internally.
   */
  options?: Record<string, unknown>;
}

export interface ProjectionArtifact {
  /** Stable identifier for this artifact (for caching, diffing, or tooling) */
  id: string;

  /**
   * Suggested output path (caller decides where/if to write).
   * Example: "app/api/recipes/route.ts" or "src/types/manifest.ts"
   */
  pathHint?: string;

  /** Content type hint: "typescript", "json", "markdown", etc. */
  contentType?: string;

  /** The generated content */
  code: string;
}

export interface ProjectionDiagnostic {
  severity: 'error' | 'warning' | 'info';
  /** Machine-readable error code for programmatic handling */
  code?: string;
  message: string;
  entity?: string;
}

export interface ProjectionResult {
  artifacts: ProjectionArtifact[];
  diagnostics: ProjectionDiagnostic[];
}

/**
 * Projection target for platform-specific code generation and IR-derived artifacts.
 *
 * CRITICAL: Projections are TOOLING, not semantics.
 * - Reads (GET operations) MAY bypass runtime entirely
 * - Writes (POST/PUT/DELETE) MUST use runtime.executeCommand()
 *
 * See docs/guides/writing-projections.md for detailed rationale.
 */
export interface ProjectionTarget {
  /** Unique identifier (e.g., "nextjs", "hono", "express") */
  readonly name: string;

  /** Human-readable description of what this projection generates */
  readonly description: string;

  /** Declares which surfaces this target can generate */
  readonly surfaces: readonly string[];

  /**
   * Generate artifacts for a requested surface.
   *
   * @param ir - Compiled Manifest IR
   * @param request - Surface + optional entity + options
   */
  generate(ir: IR, request: ProjectionRequest): ProjectionResult;
}

/**
 * Configuration options specific to Next.js projections.
 *
 * Note: outputPath is NOT part of the projection API.
 * The projection returns artifacts; the CLI layer handles file writing.
 */
export interface NextJsProjectionOptions {
  /** Auth provider: 'clerk', 'nextauth', 'custom', or 'none' */
  authProvider?: 'clerk' | 'nextauth' | 'custom' | 'none';

  /** Custom import path for auth utilities (default: '@/lib/auth') */
  authImportPath?: string;

  /** Custom import path for database client (default: '@/lib/database') */
  databaseImportPath?: string;

  /** Custom import path for response helpers (default: '@/lib/manifest-response') */
  responseImportPath?: string;

  /** Whether to include tenant filtering (default: true) */
  includeTenantFilter?: boolean;

  /** Whether to include soft delete filtering (default: true) */
  includeSoftDeleteFilter?: boolean;

  /** Name of tenant ID property (default: 'tenantId') */
  tenantIdProperty?: string;

  /** Name of soft delete timestamp property (default: 'deletedAt') */
  deletedAtProperty?: string;

  /** App Router directory (default: 'app/api') */
  appDir?: string;

  /** Whether to generate TypeScript strict mode code (default: true) */
  strictMode?: boolean;

  /** Whether to include comments in generated code */
  includeComments?: boolean;

  /** Custom import path for Manifest runtime factory (default: '@/lib/manifest-runtime') */
  runtimeImportPath?: string;

  /**
   * Pluggable tenant resolution strategy.
   * When provided, replaces the default userTenantMapping.findUnique pattern.
   * Example: { importPath: '@repo/database', functionName: 'getTenantIdForOrg', lookupKey: 'orgId' }
   */
  tenantProvider?: {
    /** Import path for the tenant lookup function */
    importPath: string;
    /** Function name to call (e.g. 'getTenantIdForOrg') */
    functionName: string;
    /** Which auth field to pass as the lookup key */
    lookupKey: 'orgId' | 'userId';
  };

  /** Custom indentation (default: 2 spaces) */
  indentSize?: number;

  /**
   * HTTP status returned when the auth helper rejects the request OR when
   * it throws (e.g. invalid/expired token). Default 401. Configurable so
   * apps that standardise on 403 to avoid leaking user-existence can
   * override without forking the generator.
   *
   * Auth failures MUST NEVER surface as 500.
   */
  unauthorizedStatus?: number;

  /**
   * Dispatcher configuration for the canonical write surface at
   *   POST /api/manifest/[entity]/commands/[command]
   *
   * Defaults preserve the historical inline behaviour (the dispatcher
   * constructs a `createManifestRuntime` instance per request and calls
   * `runtime.runCommand`). Set `executionMode` to `'externalExecutor'` when
   * the downstream app owns runtime construction and the dispatcher should
   * be a thin transport adapter delegating to an app-supplied executor.
   *
   * See docs/spec/config/manifest.config.md for the full key reference and
   * an externalExecutor migration example.
   */
  dispatcher?: {
    /** Whether the dispatcher surface is emitted at all (default: true) */
    enabled?: boolean;
    /**
     * Where command execution happens:
     *   - 'inline' (default): emit `createManifestRuntime` + `runtime.runCommand`
     *   - 'externalExecutor': import the configured executor and call it,
     *     do NOT inline runtime construction
     */
    executionMode?: 'inline' | 'externalExecutor';
    /** Import path for the external executor (only used in externalExecutor mode) */
    executorImportPath?: string;
    /** Named export to call on the external executor module */
    executorImportName?: string;
    /**
     * When true (default), the dispatcher extracts an `instanceId` from
     * `body.instanceId` or `body.id` and forwards it to runCommand /
     * the configured executor. Non-create commands (update, archive,
     * release, …) need this to address the target instance; create
     * commands ignore it harmlessly.
     */
    deriveInstanceId?: boolean;
    /**
     * Dispatcher route path relative to `appDir`. Default
     * `/manifest/[entity]/commands/[command]/route.ts`. Override only
     * if your app uses a non-canonical prefix (e.g. `/api/v1/manifest/...`).
     */
    path?: string;
  };

  /**
   * Policy for the deprecated per-command "concrete" routes
   * (the `nextjs.command` surface).
   *
   * - `enabled: false` (default) — the canonical dispatcher is the single
   *   write surface. Concrete per-command routes are not emitted by
   *   `--surface all` and `manifest.command` requests return an info
   *   diagnostic. Apps that still need them for legacy callers must
   *   explicitly opt in with `enabled: true`.
   * - `legacyAliasesOnly: true` (default) — emitted concrete routes
   *   carry the DEPRECATED ALIAS banner pointing at the dispatcher.
   *   Set to `false` only if you intentionally treat per-command routes
   *   as a first-class surface.
   */
  concreteCommandRoutes?: {
    enabled?: boolean;
    legacyAliasesOnly?: boolean;
  };

  /**
   * Policy for direct database read routes (GET list, GET detail).
   *
   * Direct reads bypass the runtime engine for read performance.
   * They assume a Prisma-compatible client at `databaseImportPath`.
   *
   * - `enabled: false` suppresses both list and detail read routes
   *   (no GET handlers emitted for the entity).
   * - `directDbReads: false` emits read route stubs without inlining a
   *   Prisma call — useful for projects that route reads through a
   *   separate query layer.
   *
   * Defaults: { enabled: true, directDbReads: true } — preserves the
   * historical behaviour.
   */
  readRoutes?: {
    enabled?: boolean;
    directDbReads?: boolean;
  };

  /**
   * Base directory for generated non-route artifacts (types, client, hooks,
   * shared-runtime). Default: `'src'`.
   */
  generatedDir?: string;

  /**
   * Fine-grained overrides for individual artifact paths. Each value is
   * relative to project root. When set, it takes precedence over
   * `generatedDir`.
   */
  paths?: {
    /** pathHint for ts.types. Default: `${generatedDir}/types/manifest-generated.ts` */
    typesFile?: string;
    /** pathHint for ts.client. Default: `${generatedDir}/lib/manifest-client.ts` */
    clientFile?: string;
    /** Base dir for subscription hooks. Default: `${generatedDir}/hooks` */
    hooksDir?: string;
    /** pathHint for nextjs.sharedRuntime. Default: `${generatedDir}/lib/manifest-shared-runtime.ts` */
    sharedRuntimeFile?: string;
  };

  /**
   * Naming convention for database accessor names (`database.<accessor>` in
   * generated read routes). Same shape as the Prisma projection's `naming`
   * option: `'snake_case'` shorthand or `{ table, column, pluralizeTables }`.
   * Applies `resolveTableName` to the entity name — use this when the
   * database client exposes physical table names (Kysely, raw SQL) rather
   * than Prisma's model-derived delegates. Response field names and local
   * variables are NOT affected (they remain the camelCased entity name —
   * the API contract is independent of physical DB naming).
   */
  naming?: NamingConventionInput;

  /**
   * Explicit per-entity database accessor overrides. Takes precedence over
   * `naming`. e.g. `{ OrderLine: 'order_lines' }` →
   * `database.order_lines.findMany(...)`.
   */
  accessorNames?: Record<string, string>;

  /**
   * Explicit per-entity URL path segment overrides for generated routes and
   * the client SDK's fetch paths. Takes precedence over the default
   * lowercased entity name. e.g. `{ OrderLine: 'order-lines' }` →
   * `app/api/order-lines/list/route.ts` + `fetch('/api/order-lines/list')`.
   */
  routeSegments?: Record<string, string>;
}

/**
 * Configuration options for Remix projections.
 */
export interface RemixProjectionOptions {
  authProvider?: 'clerk' | 'remix-auth' | 'custom' | 'none';
  authImportPath?: string;
  databaseImportPath?: string;
  responseImportPath?: string;
  runtimeImportPath?: string;
  sessionStoragePath?: string;
  includeTenantFilter?: boolean;
  includeSoftDeleteFilter?: boolean;
  tenantIdProperty?: string;
  deletedAtProperty?: string;
  routesDir?: string;
  strictMode?: boolean;
  includeComments?: boolean;
  includeErrorBoundary?: boolean;
  unauthorizedStatus?: number;
  remixVersion?: 'v2' | 'v7';
  tenantProvider?: {
    importPath: string;
    functionName: string;
    lookupKey: 'orgId' | 'userId';
  };
}
