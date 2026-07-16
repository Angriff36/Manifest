/**
 * Optional Convex runtime proof adapter.
 *
 * Peer dependencies (optional): `convex-test`, `convex`
 * Do not import this subpath from production application code.
 */

export {
  createManifestTestContext,
  ManifestConvexProofHarness,
  type ConvexTestFactory,
  type CreateManifestTestContextOptions,
  type ManifestConvexDb,
  type ManifestConvexTestHarness,
  type ManifestIdentity,
} from './harness.js';
