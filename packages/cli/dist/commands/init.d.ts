/**
 * manifest init command
 *
 * Creates a manifest.config.yaml for Manifest projects.
 * Asks for the final output paths - no guessing, no doubling.
 */
import { type ManifestConfig } from '../utils/config.js';
interface InitOptions {
    force?: boolean;
}
interface InitAnswers {
    sourcePattern: string;
    outputDir: string;
    enableCodegen: boolean;
    projectionTarget?: string;
    codeOutputDir?: string;
}
/**
 * Create config from answers
 *
 * No `$schema` is emitted: Manifest does not publish a resolvable schema URL,
 * and `manifest config validate` loads the schema bundled with the package
 * (docs/spec/config/manifest.config.schema.json), not from a URL. For editor
 * IntelliSense, map the bundled schema in .vscode/settings.json instead — see
 * docs/spec/config/manifest.config.md.
 */
export declare function createConfigFromAnswers(answers: InitAnswers): ManifestConfig;
/**
 * Init command handler
 */
export declare function initCommand(options?: InitOptions): Promise<void>;
export {};
//# sourceMappingURL=init.d.ts.map