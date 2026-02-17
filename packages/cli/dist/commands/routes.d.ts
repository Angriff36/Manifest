/**
 * manifest routes command
 *
 * Compiles all .manifest files, runs the RoutesProjection, and outputs
 * the canonical route manifest as JSON.
 *
 * This is the agent-accessible equivalent of the DevTools Route Surface tab.
 * Same data, CLI output.
 *
 * Usage:
 *   manifest routes                     # JSON route manifest to stdout
 *   manifest routes --format summary    # Human-readable summary
 *   manifest routes --src path/to/dir   # Custom source directory
 *
 * See docs/spec/manifest-vnext.md § "Canonical Routes (Normative)".
 */
interface RoutesCommandOptions {
    src?: string;
    format?: 'json' | 'summary';
    basePath?: string;
}
export declare function routesCommand(options?: RoutesCommandOptions): Promise<void>;
export {};
//# sourceMappingURL=routes.d.ts.map