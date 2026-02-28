type Severity = 'error' | 'warning';
export interface RouteAuditFinding {
    file: string;
    severity: Severity;
    code: string;
    message: string;
    suggestion?: string;
}
export interface RouteAuditFileResult {
    methods: string[];
    findings: RouteAuditFinding[];
}
/**
 * A single entry in the commands manifest (projection-agnostic).
 * Derived from IR commands — no URL paths, no framework conventions.
 */
export interface CommandsManifestEntry {
    entity: string;
    command: string;
    commandId: string;
}
/**
 * A single exemption in the exemption registry.
 * Manual write routes that legitimately exist outside Manifest ownership.
 */
export interface RouteExemption {
    /** Relative path from repo root to the route file */
    path: string;
    /** HTTP methods that are exempted */
    methods: string[];
    /** Human-readable reason for the exemption */
    reason: string;
    /** Category for reporting */
    category?: string;
}
export interface AuditRoutesOptions {
    root?: string;
    format?: 'text' | 'json';
    strict?: boolean;
    tenantField?: string;
    deletedField?: string;
    locationField?: string;
    /** Path to commands manifest JSON (e.g. kitchen.commands.json) */
    commandsManifest?: string;
    /** Path to exemptions registry JSON */
    exemptions?: string;
}
/**
 * Thrown for invalid CLI usage: malformed JSON, unreadable files (non-ENOENT), etc.
 * Distinguished from rule-violation failures so the CLI can exit with code 2.
 */
export declare class AuditUsageError extends Error {
    constructor(message: string);
}
/**
 * Load the commands manifest JSON.
 * Returns an empty array if the file doesn't exist (ENOENT).
 * Throws on malformed JSON or non-array content — a corrupted manifest
 * must fail loudly in CI, not silently disable enforcement.
 */
export declare function loadCommandsManifest(filePath: string): Promise<CommandsManifestEntry[]>;
/**
 * Load the exemptions registry JSON.
 * Returns an empty array if the file doesn't exist (ENOENT).
 * Throws on malformed JSON or non-array content — a corrupted exemptions
 * file must fail loudly, not silently disable all exemptions.
 */
export declare function loadExemptions(filePath: string): Promise<RouteExemption[]>;
/**
 * Check whether a file path is inside the commands namespace.
 */
export declare function isInCommandsNamespace(filePath: string): boolean;
/**
 * Check whether a file is exempted for a given HTTP method.
 * Paths are compared after normalizing separators and lowercasing.
 * Refuses to match files outside the root directory (path traversal guard).
 */
export declare function isExempted(filePath: string, method: string, exemptions: RouteExemption[], root: string): boolean;
/**
 * Extract the command name from a commands-namespace file path.
 * e.g. "app/api/kitchen/tasks/commands/create/route.ts" → "create"
 * Returns null if the path doesn't match the expected pattern.
 */
export declare function extractCommandFromPath(filePath: string): string | null;
/**
 * Extract the entity segment from a commands-namespace file path.
 * Looks for the segment immediately before /commands/.
 * e.g. "app/api/kitchen/tasks/commands/create/route.ts" → "tasks"
 */
export declare function extractEntitySegmentFromPath(filePath: string): string | null;
/**
 * Check if a command route has a backing entry in the commands manifest.
 * Matches by command name only (case-insensitive).
 *
 * Entity naming conventions differ between IR (PascalCase, e.g. "CrmClient")
 * and filesystem (lowercase/kebab, e.g. "clients"), so entity segment matching
 * is intentionally not used. The command name is the stable identifier.
 */
export declare function hasCommandManifestBacking(filePath: string, commandsManifest: CommandsManifestEntry[]): boolean;
/**
 * Context for commands-namespace ownership rules.
 * When provided, enables the three ownership enforcement rules.
 */
export interface OwnershipContext {
    /** Loaded commands manifest entries (from kitchen.commands.json or equivalent) */
    commandsManifest: CommandsManifestEntry[];
    /** Loaded exemptions registry */
    exemptions: RouteExemption[];
    /** Root directory for relative path resolution */
    root: string;
    /**
     * Rollout mode: when true, new ownership rules emit as errors.
     * When false (default), they emit as warnings for gradual adoption.
     */
    enforceOwnership: boolean;
    /**
     * Whether --commands-manifest was explicitly provided by the user.
     * When true and the manifest parsed to an empty array, orphan detection
     * emits a warning (or error in strict mode) instead of silently skipping.
     */
    manifestExplicitlyProvided: boolean;
}
export declare function auditRouteFileContent(content: string, file: string, options: Required<Pick<AuditRoutesOptions, 'tenantField' | 'deletedField' | 'locationField'>>, ownership?: OwnershipContext): RouteAuditFileResult;
export declare function auditRoutesCommand(options?: AuditRoutesOptions): Promise<void>;
export {};
//# sourceMappingURL=audit-routes.d.ts.map