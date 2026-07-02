/**
 * Type declarations for generate-config-schema.mjs so the drift test
 * (src/manifest/config-schema-registry.test.ts) can import its builder under
 * tsc without allowJs. Keep in sync with the .mjs exports.
 */

/** JSON-Schema fragment for one `projections.<name>` entry. */
export type ProjectionSchemaEntry = Record<string, unknown>;

/** The generic schema entry for a projection with no hand-written sub-schema. */
export function genericProjectionEntry(name: string): ProjectionSchemaEntry;

/** Build the `properties.projections.properties` object from a schema + names. */
export function buildProjectionsProperties(
  currentSchema: unknown,
  projectionNames: readonly string[],
): Record<string, ProjectionSchemaEntry>;

/** Absolute path to docs/spec/config/manifest.config.schema.json. */
export const SCHEMA_PATH: string;

/** Absolute path to the repository root. */
export const ROOT: string;
