/**
 * Manifest DX Proof Kit — core (no convex-test dependency).
 *
 * Runtime Convex helpers: `@angriff36/manifest/proof-kit/convex-test`
 */

export * from './types.js';
export { emitCapabilityCatalog, reactionProofId, type EmitCatalogOptions } from './emit-catalog.js';
export {
  emitProofRegistry,
  type EmitRegistryOptions,
  type ProofTestBinding,
} from './emit-registry.js';
export {
  validateProofRegistry,
  assertProofRegistryValid,
  type ValidateProofRegistryOptions,
  type ProofValidationIssue,
} from './validate-registry.js';
export { formatCapabilityCatalogMarkdown } from './format-catalog.js';
export { emitIntegrationGuardConfig, type EmitGuardConfigOptions } from './emit-guard-config.js';
export { runManifestIntegrationGuard } from './guard/engine.js';
