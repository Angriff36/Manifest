/**
 * JSON-schema validation for manifest.config.yaml (build config).
 *
 * The runtime-level TypeScript config (manifest.config.ts) is validated
 * structurally by the loader because it contains JavaScript functions and
 * class references that cannot be expressed in JSON Schema.
 *
 * The schema itself lives at docs/spec/config/manifest.config.schema.json
 * and ships with the package via package.json#files. Validation always loads
 * this bundled copy (see locateConfigSchema) — it never fetches a URL, so the
 * `$schema` line in a user's config is decorative as far as the CLI is
 * concerned. Manifest publishes no resolvable schema URL; for editor
 * IntelliSense, downstream repos should map the bundled file in
 * .vscode/settings.json rather than point `$schema` at a public URL.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv, { type ErrorObject } from 'ajv';

import type { ManifestConfig } from './config.js';

export interface ConfigValidationDiagnostic {
  /** Dotted JSON pointer to the offending value, e.g. "projections.nextjs.options.appDir". Empty string at the root. */
  path: string;
  /** Human-readable message. */
  message: string;
  /** Allowed values, when the violation is an enum/const check. */
  allowed?: readonly unknown[];
  /** The offending value, when available. */
  value?: unknown;
}

export interface ConfigValidationResult {
  ok: boolean;
  diagnostics: ConfigValidationDiagnostic[];
}

/**
 * Locate the build-config JSON schema. Mirrors the walk-up pattern used by
 * emit-registries so the locator works in both dev (running from src/) and
 * installed-package mode (running from packages/cli/dist/).
 */
async function locateConfigSchema(): Promise<object> {
  let dir: string;
  try {
    dir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    dir = process.cwd();
  }
  for (let prev = ''; dir !== prev; prev = dir, dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'docs', 'spec', 'config', 'manifest.config.schema.json');
    try {
      await fs.access(candidate);
      const raw = await fs.readFile(candidate, 'utf-8');
      return JSON.parse(raw) as object;
    } catch {
      // keep walking up
    }
  }
  throw new Error(
    'Could not locate docs/spec/config/manifest.config.schema.json. Reinstall @angriff36/manifest or run from a Manifest checkout.'
  );
}

let cachedSchema: object | null = null;

/**
 * Load and cache the build-config schema. The schema is small and the file
 * walk is the slow part — cache once per process.
 */
export async function loadConfigSchema(): Promise<object> {
  if (cachedSchema) return cachedSchema;
  cachedSchema = await locateConfigSchema();
  return cachedSchema;
}

/**
 * Translate an Ajv error into a config-grade diagnostic. The instance
 * pointer ('/foo/bar') becomes a dotted path ('foo.bar') for legibility
 * in CLI output.
 */
function toDiagnostic(error: ErrorObject): ConfigValidationDiagnostic {
  const dotted = error.instancePath
    ? error.instancePath.replace(/^\//, '').replace(/\//g, '.')
    : '';
  const params = (error.params ?? {}) as Record<string, unknown>;
  let message = error.message ?? 'invalid value';
  // Annotate additionalProperties violations with the offending key for
  // discoverability (Ajv puts it in params.additionalProperty).
  if (error.keyword === 'additionalProperties' && typeof params.additionalProperty === 'string') {
    message = `unknown property "${params.additionalProperty}" (additionalProperties: false)`;
  }
  const allowed = Array.isArray(params.allowedValues)
    ? (params.allowedValues as readonly unknown[])
    : undefined;
  return {
    path: dotted,
    message,
    allowed,
    value: undefined,
  };
}

/**
 * Validate a Manifest build config against the JSON schema.
 *
 * Always returns a result — never throws — so the caller (CLI or test)
 * decides how to surface failures.
 */
export async function validateConfig(
  config: ManifestConfig | null | undefined
): Promise<ConfigValidationResult> {
  if (config === null || config === undefined) {
    // A missing config is valid; defaults apply. Surfaced as ok so callers
    // can distinguish "no config" from "invalid config".
    return { ok: true, diagnostics: [] };
  }

  const schema = await loadConfigSchema();
  const ajv = new Ajv({ allErrors: true, strict: false, useDefaults: false });
  const validate = ajv.compile(schema);
  const valid = validate(config);
  if (valid) {
    return { ok: true, diagnostics: [] };
  }
  return {
    ok: false,
    diagnostics: (validate.errors ?? []).map(toDiagnostic),
  };
}

/**
 * Format a validation diagnostic for terminal output. Pure (no chalk) so
 * callers can decorate as they wish.
 */
export function formatDiagnostic(d: ConfigValidationDiagnostic): string {
  const where = d.path ? d.path : '<root>';
  const allowed = d.allowed && d.allowed.length > 0 ? ` (allowed: ${d.allowed.join(', ')})` : '';
  return `  - ${where}: ${d.message}${allowed}`;
}
