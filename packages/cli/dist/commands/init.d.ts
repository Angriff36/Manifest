/**
 * manifest init command
 *
 * Interactive setup for Manifest projects.
 * Creates manifest.config.yaml with project-specific settings.
 */
interface InitOptions {
    force?: boolean;
}
/**
 * Init command handler
 */
export declare function initCommand(options?: InitOptions): Promise<void>;
export {};
//# sourceMappingURL=init.d.ts.map