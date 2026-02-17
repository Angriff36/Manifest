/**
 * manifest lint-routes command
 *
 * Scans configured client directories for hardcoded route strings.
 * Fails CI when violations are found.
 *
 * This is the enforcement layer for the Canonical Routes invariant.
 * Documentation does not stop AI. Failing CI does.
 *
 * See docs/spec/manifest-vnext.md § "Canonical Routes (Normative)".
 */
export interface LintRoutesConfig {
    /** Directories to scan for hardcoded route strings */
    dirs: string[];
    /** Route prefixes to match (e.g. ["/api/", "/v1/"]) */
    prefixes: string[];
    /** Exact paths to allowlist (won't trigger violations) */
    allowlist: string[];
    /** File glob patterns to exclude from scanning */
    exclude: string[];
}
export interface LintViolation {
    file: string;
    line: number;
    column: number;
    match: string;
    suggestion?: string;
}
export interface LintResult {
    violations: LintViolation[];
    filesScanned: number;
    config: LintRoutesConfig;
}
/**
 * Load lint-routes config from manifest.config.yaml or use defaults.
 */
export declare function loadLintRoutesConfig(cwd: string): Promise<LintRoutesConfig>;
/**
 * Scan a single file for hardcoded route strings.
 */
export declare function scanFileForRoutes(content: string, filePath: string, config: LintRoutesConfig): LintViolation[];
/**
 * Scan all configured directories for hardcoded route strings.
 */
export declare function scanDirectories(cwd: string, config: LintRoutesConfig): Promise<LintResult>;
interface LintRoutesOptions {
    config?: string;
    format?: 'text' | 'json';
    fix?: boolean;
}
/**
 * lint-routes command handler
 */
export declare function lintRoutesCommand(options?: LintRoutesOptions): Promise<void>;
export {};
//# sourceMappingURL=lint-routes.d.ts.map