/**
 * Sync src/manifest/version.ts COMPILER_VERSION from package.json.
 *
 * Wired into the `version` lifecycle script so `npm version …` (including
 * the cut-release workflow's bump step) can never desync the compiler
 * version from the package version again. A guard test
 * (src/manifest/version.test.ts) fails the suite if they ever drift.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const versionFile = join(root, 'src', 'manifest', 'version.ts');

const source = readFileSync(versionFile, 'utf8');
const updated = source.replace(
  /export const COMPILER_VERSION = '[^']*';/,
  `export const COMPILER_VERSION = '${pkg.version}';`
);

if (updated === source) {
  console.log(`version.ts already at ${pkg.version}`);
} else {
  writeFileSync(versionFile, updated, 'utf8');
  console.log(`version.ts synced to ${pkg.version}`);
}
