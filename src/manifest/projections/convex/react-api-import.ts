/**
 * Resolve the Convex `api` import for the react client from emitted paths.
 *
 * Artifact path (e.g. `src/lib/manifest-convex-react.ts`) and the Convex
 * codegen module (`convex/_generated/api`) are both project-root-relative.
 * The import string is the relative module path between them — never a
 * hard-coded `../` depth that breaks when either side moves.
 */

/** Project-root path of Convex's generated `api` module (no extension). */
export const CONVEX_API_MODULE_PATH = 'convex/_generated/api';

/** Default Builder / Capsule client artifact path. */
export const DEFAULT_REACT_CLIENT_PATH = 'src/lib/manifest-convex-react.ts';

/** Schema-surface `output` values that must not be treated as the react path. */
const SCHEMA_OUTPUT_RE = /(^|\/)schema\.ts$/;

function normalizeRepoPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Relative TypeScript import from one project-root file to another module path.
 * `toModule` may omit `.ts` (Convex `api` import style).
 */
export function relativeImportBetweenArtifacts(fromArtifact: string, toModule: string): string {
  const from = normalizeRepoPath(fromArtifact);
  const to = normalizeRepoPath(toModule).replace(/\.(tsx?|jsx?)$/, '');
  const fromDir = from.split('/');
  fromDir.pop();
  const toParts = to.split('/');
  let i = 0;
  while (i < fromDir.length && i < toParts.length && fromDir[i] === toParts[i]) {
    i += 1;
  }
  const up = fromDir.length - i;
  const down = toParts.slice(i).join('/');
  if (up === 0) return `./${down}`;
  return `${'../'.repeat(up)}${down}`;
}

/**
 * Choose the react client pathHint. Ignores schema-surface `output` when the
 * shared options bag carries `convex/schema.ts` (or similar).
 */
export function resolveReactClientPathHint(outputOption: string | undefined): string {
  if (typeof outputOption !== 'string' || outputOption.length === 0) {
    return DEFAULT_REACT_CLIENT_PATH;
  }
  const normalized = normalizeRepoPath(outputOption);
  if (SCHEMA_OUTPUT_RE.test(normalized)) return DEFAULT_REACT_CLIENT_PATH;
  return normalized;
}

/**
 * Explicit `apiImportPath` wins; otherwise derive from pathHint → API module.
 */
export function resolveReactApiImportPath(
  pathHint: string,
  apiImportPathOption: string | undefined,
): string {
  if (typeof apiImportPathOption === 'string' && apiImportPathOption.length > 0) {
    return apiImportPathOption;
  }
  return relativeImportBetweenArtifacts(pathHint, CONVEX_API_MODULE_PATH);
}
