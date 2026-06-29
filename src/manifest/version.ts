/**
 * Version constants for the Manifest compiler.
 * Single source of truth for version information.
 */

/**
 * Compiler version — always matches package.json.
 *
 * Synced by scripts/sync-version.mjs via the `version` lifecycle script
 * (runs on every `npm version` bump, incl. the cut-release workflow).
 * Guarded by src/manifest/version.test.ts. Do not edit by hand.
 */
export const COMPILER_VERSION = '2.20.0';

/** IR schema version */
export const SCHEMA_VERSION = '1.0';
