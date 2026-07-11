#!/usr/bin/env node
/**
 * generate-config-schema
 *
 * Regenerates the `properties.projections.properties` block of
 * docs/spec/config/manifest.config.schema.json from the REAL projection
 * registry (src/manifest/projections/registry.ts, loaded via jiti — the same
 * no-build strategy as the CLI bin and check-doc-snippets).
 *
 * Why this exists: the 2026-07-01 reconciliation audit found the config schema
 * hard-coded projections to a closed set of four {nextjs, routes, prisma,
 * prisma-store} with additionalProperties:false, so configuring any of the
 * other ~23 registered projections (zod, kysely, drizzle, express, …) failed
 * `manifest config validate` even though `manifest generate --all` happily
 * consumes them. This script closes that gap by deriving the allowed projection
 * names from the registry itself.
 *
 * What it rewrites:
 *   - ONLY properties.projections.properties. Every other byte of the schema
 *     (all the hand-authored definitions, formatting, inline $ref objects) is
 *     preserved verbatim via a scoped string splice.
 *   - Projections that already have a hand-written detailed sub-schema (the four
 *     with a $ref) keep that $ref verbatim.
 *   - Every other registered projection gets a GENERIC entry: an object with
 *     optional `output` (string) and `options` (open object). That mirrors the
 *     exact shape `generateAllFromConfig` reads (packages/cli generate.ts reads
 *     only `projection.output` and `projection.options`) and the ManifestConfig
 *     TS type (`projections?: Record<string, { output?; options? }>`). Per-
 *     projection option keys are TypeScript interfaces, not runtime schemas, so
 *     `options` stays open (additionalProperties: true) — closing it would
 *     falsely reject valid config we cannot enumerate without a heavy dep.
 *   - projections.additionalProperties stays false, so an UNKNOWN projection
 *     name is still caught by `manifest config validate`.
 *
 * Output is deterministic: entries are emitted in sorted (alphabetical) name
 * order for a stable diff regardless of registry declaration order.
 *
 * Run after adding or renaming a projection:
 *   node scripts/generate-config-schema.mjs
 *
 * The drift test (src/manifest/config-schema-registry.test.ts) fails CI if the
 * committed schema falls out of sync with the registry.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
export const SCHEMA_PATH = path.join(ROOT, 'docs', 'spec', 'config', 'manifest.config.schema.json');

/**
 * The generic schema entry for a projection that has no hand-written detailed
 * sub-schema. Kept in one place so the drift test and the writer agree.
 */
export function genericProjectionEntry(name) {
  return {
    type: 'object',
    additionalProperties: false,
    description:
      `Configuration for the '${name}' projection. Consumed by \`manifest generate --all\`, ` +
      `which reads \`output\` (the target directory/path) and \`options\` (passed verbatim to the ` +
      `projection generator). Option keys are projection-specific TypeScript interfaces and are not ` +
      `individually validated here.`,
    properties: {
      output: {
        type: 'string',
        description:
          "Directory or path hint where this projection's artifacts are written. A projection with no `output` is skipped by `manifest generate --all`.",
      },
      options: {
        type: 'object',
        additionalProperties: true,
        description: 'Projection-specific options passed verbatim to the projection generator.',
      },
    },
  };
}

/**
 * Build the `properties.projections.properties` object from the current schema
 * (source of the verbatim detailed $ref entries) and the registered projection
 * names. Pure — the drift test calls this with the committed schema + registry
 * names and asserts deep-equality with the committed block.
 */
export function buildProjectionsProperties(currentSchema, projectionNames) {
  const existing = currentSchema?.properties?.projections?.properties ?? {};
  const out = {};
  for (const name of [...projectionNames].sort()) {
    const current = existing[name];
    // Keep a hand-written detailed sub-schema ($ref) verbatim; generate the
    // generic entry for everything else.
    if (current && typeof current.$ref === 'string' && Object.keys(current).length === 1) {
      out[name] = current;
    } else {
      out[name] = genericProjectionEntry(name);
    }
  }
  return out;
}

// Indentation the hand-authored schema uses inside properties.projections:
// entries sit at 8 spaces, the closing brace of the properties object at 6.
const ENTRY_INDENT = ' '.repeat(8);
const CLOSE_INDENT = ' '.repeat(6);

/**
 * Serialize the projections.properties object to a JSON text block that matches
 * the surrounding file's indentation. $ref entries stay on one line (verbatim
 * style); generic entries are pretty-printed and re-indented under the entry.
 */
function serializeProjectionsProperties(props) {
  const lines = Object.keys(props).map((name) => {
    const entry = props[name];
    if (entry && typeof entry.$ref === 'string' && Object.keys(entry).length === 1) {
      return `${ENTRY_INDENT}${JSON.stringify(name)}: { "$ref": ${JSON.stringify(entry.$ref)} }`;
    }
    const body = JSON.stringify(entry, null, 2)
      .split('\n')
      .map((line, idx) => (idx === 0 ? line : ENTRY_INDENT + line))
      .join('\n');
    return `${ENTRY_INDENT}${JSON.stringify(name)}: ${body}`;
  });
  return `{\n${lines.join(',\n')}\n${CLOSE_INDENT}}`;
}

/**
 * Find the [start, end) span of the `{...}` value of the projections block's
 * inner `properties` key, so we can splice only that region. String-aware brace
 * matching; touches nothing else in the file.
 */
function findProjectionsPropertiesSpan(text) {
  const projIdx = text.indexOf('"projections": {');
  if (projIdx === -1) throw new Error('Could not locate the "projections" property in the schema.');
  const propKey = '"properties": {';
  const propIdx = text.indexOf(propKey, projIdx);
  if (propIdx === -1) throw new Error('Could not locate projections."properties" in the schema.');
  const braceStart = propIdx + propKey.length - 1; // index of the '{'

  let depth = 0;
  let inStr = false;
  let esc = false;
  let i = braceStart;
  for (; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        i++; // make end exclusive of the closing brace
        break;
      }
    }
  }
  if (depth !== 0) throw new Error('Unbalanced braces while scanning projections.properties.');
  return { start: braceStart, end: i };
}

/** Load the registered projection names from the real registry via jiti. */
async function loadProjectionNames() {
  const jiti = createJiti(import.meta.url);
  // Import with the `.js` specifier so jiti resolves to the SAME module
  // instance that builtins.ts imports internally — importing `registry.ts`
  // directly splits the module graph and the registry Map reads back empty.
  const reg = await jiti.import(path.join(ROOT, 'src', 'manifest', 'projections', 'registry.js'));
  return reg.getProjectionNames();
}

async function main() {
  const text = await readFile(SCHEMA_PATH, 'utf-8');
  const schema = JSON.parse(text);
  const names = await loadProjectionNames();
  const props = buildProjectionsProperties(schema, names);

  const { start, end } = findProjectionsPropertiesSpan(text);
  const next = text.slice(0, start) + serializeProjectionsProperties(props) + text.slice(end);

  // Round-trip safety: the spliced file must parse and reproduce the object.
  const reparsed = JSON.parse(next);
  const roundTripped = JSON.stringify(reparsed.properties.projections.properties);
  if (roundTripped !== JSON.stringify(props)) {
    throw new Error('Serialized projections block did not round-trip — aborting without writing.');
  }

  if (next === text) {
    console.log(
      `generate-config-schema: no change (${names.length} projections, schema already in sync).`,
    );
    return;
  }
  await writeFile(SCHEMA_PATH, next, 'utf-8');
  console.log(
    `generate-config-schema: rewrote projections block with ${names.length} projection(s): ${[...names].sort().join(', ')}`,
  );
}

// Only run when invoked directly (node scripts/generate-config-schema.mjs), not
// when imported by the drift test.
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error('generate-config-schema crashed:', err);
    process.exit(1);
  });
}
