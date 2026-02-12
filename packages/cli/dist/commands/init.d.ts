/**
 * manifest init command
 *
 * Creates a manifest.config.yaml for Manifest projects.
 * Asks for the final output paths - no guessing, no doubling.
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