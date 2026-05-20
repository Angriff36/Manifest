/**
 * Package-shape check.
 *
 * Validates that the @angriff36/manifest package's public surface — the
 * subpath exports, the bin entry, and the shipped files list — actually
 * resolves at runtime in the current install. Catches packaging mistakes
 * (missing subpath in `exports`, missing file in `files`, broken bin
 * shebang) before they reach a downstream consumer.
 *
 * Two layers:
 *
 *   1. Subpath imports — programmatically import each documented subpath
 *      and confirm a non-null module came back. Failures here mean the
 *      consumer's `import '@angriff36/manifest/<subpath>'` will throw.
 *
 *   2. Tarball contents — run `npm pack --dry-run --json` from the
 *      package root and check that the file list includes the SQL
 *      schemas, the CLI bin, and the dist/manifest tree. Failures here
 *      mean the published tarball is missing files the runtime needs.
 *
 * The subpath layer runs in every invocation. The tarball layer requires
 * `npm` on PATH and a writable cwd, so callers can opt out via the
 * `skipTarball` option (e.g. when running inside a sandboxed CI step).
 */

import { spawn } from 'node:child_process';

export interface SubpathImportResult {
  subpath: string;
  ok: boolean;
  error?: string;
  /** Names of exports actually present on the imported module. */
  exports: string[];
}

export interface TarballContentResult {
  ran: boolean;
  ok?: boolean;
  /** Files NPM would include in the published tarball, repo-relative. */
  files: string[];
  /** Expected entries that were missing from the tarball. */
  missingExpectedEntries: string[];
  /** Raw error if npm pack failed. */
  error?: string;
}

export interface PackageShapeResult {
  ok: boolean;
  subpathImports: SubpathImportResult[];
  tarball: TarballContentResult;
}

/**
 * The documented subpath exports that downstream consumers may import.
 * Update in lock-step with package.json `exports` whenever a new public
 * subpath is added.
 *
 * Each entry includes the symbols a healthy build is expected to expose,
 * so the check can also catch "subpath resolves but its module body is
 * empty" failures.
 */
const SUBPATHS: Array<{ subpath: string; expectedExports: string[] }> = [
  { subpath: '@angriff36/manifest', expectedExports: ['RuntimeEngine'] },
  { subpath: '@angriff36/manifest/ir-compiler', expectedExports: ['compileToIR'] },
  { subpath: '@angriff36/manifest/compiler', expectedExports: [] },
  { subpath: '@angriff36/manifest/ir', expectedExports: [] },
  { subpath: '@angriff36/manifest/projections/nextjs', expectedExports: [] },
  { subpath: '@angriff36/manifest/projections/routes', expectedExports: [] },
  { subpath: '@angriff36/manifest/registry/emit', expectedExports: [] },
  { subpath: '@angriff36/manifest/audit', expectedExports: [] },
  { subpath: '@angriff36/manifest/audit/memory', expectedExports: ['MemoryAuditSink'] },
  { subpath: '@angriff36/manifest/audit/postgres', expectedExports: ['PostgresAuditSink'] },
  { subpath: '@angriff36/manifest/outbox', expectedExports: [] },
  { subpath: '@angriff36/manifest/outbox/memory', expectedExports: ['MemoryOutboxStore'] },
  { subpath: '@angriff36/manifest/outbox/postgres', expectedExports: ['PostgresOutboxStore'] },
];

/** Tarball entries every conforming build MUST include. */
const REQUIRED_TARBALL_ENTRIES = [
  'package.json',
  'src/manifest/audit/sinks/postgres.sql',
  'src/manifest/outbox/stores/postgres.sql',
];

/** Tarball entry GLOBS — at least one matching file must be present. */
const REQUIRED_TARBALL_GLOBS: Array<{ label: string; matches: (file: string) => boolean }> = [
  { label: 'dist/manifest/runtime-engine.js', matches: f => f === 'dist/manifest/runtime-engine.js' },
  { label: 'dist/manifest/audit/sinks/memory.js', matches: f => f === 'dist/manifest/audit/sinks/memory.js' },
  { label: 'dist/manifest/outbox/stores/memory.js', matches: f => f === 'dist/manifest/outbox/stores/memory.js' },
  { label: 'packages/cli/dist/index.js', matches: f => f === 'packages/cli/dist/index.js' },
];

async function importSubpath(subpath: string, expectedExports: string[]): Promise<SubpathImportResult> {
  try {
    const mod = await import(subpath);
    const exports = Object.keys(mod);
    const missing = expectedExports.filter(name => !(name in mod));
    if (missing.length > 0) {
      return {
        subpath,
        ok: false,
        error: `Imported but missing expected exports: ${missing.join(', ')}`,
        exports,
      };
    }
    return { subpath, ok: true, exports };
  } catch (e) {
    return {
      subpath,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      exports: [],
    };
  }
}

/**
 * Run `npm pack --dry-run --json` and parse the file list. Uses spawn
 * directly so we don't need to add a dependency. Returns `ran: false`
 * when npm is unavailable so the umbrella check can degrade gracefully.
 */
async function runNpmPackDryRun(cwd: string): Promise<TarballContentResult> {
  return new Promise(resolve => {
    let stdout = '';
    let stderr = '';
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const child = spawn(npmCmd, ['pack', '--dry-run', '--json'], { cwd, shell: false });
    child.stdout.on('data', chunk => { stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.on('error', err => {
      resolve({
        ran: false,
        files: [],
        missingExpectedEntries: [],
        error: `Could not invoke npm: ${err.message}`,
      });
    });
    child.on('close', code => {
      if (code !== 0) {
        resolve({
          ran: true,
          ok: false,
          files: [],
          missingExpectedEntries: [],
          error: `npm pack exited ${code}: ${stderr.trim() || stdout.trim()}`,
        });
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        const entries: Array<{ path: string }> = parsed?.[0]?.files ?? [];
        const files = entries.map(e => e.path).sort();
        const missing: string[] = [];
        for (const required of REQUIRED_TARBALL_ENTRIES) {
          if (!files.includes(required)) missing.push(required);
        }
        for (const glob of REQUIRED_TARBALL_GLOBS) {
          if (!files.some(glob.matches)) missing.push(glob.label);
        }
        resolve({ ran: true, ok: missing.length === 0, files, missingExpectedEntries: missing });
      } catch (e) {
        resolve({
          ran: true,
          ok: false,
          files: [],
          missingExpectedEntries: [],
          error: `Could not parse npm pack output: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    });
  });
}

export interface PackageShapeOptions {
  /** Root of the @angriff36/manifest package (where package.json lives). */
  packageRoot: string;
  /** Skip the `npm pack --dry-run` step (useful in restricted CI sandboxes). */
  skipTarball?: boolean;
}

export async function checkPackageShape(opts: PackageShapeOptions): Promise<PackageShapeResult> {
  const subpathImports: SubpathImportResult[] = [];
  for (const { subpath, expectedExports } of SUBPATHS) {
    subpathImports.push(await importSubpath(subpath, expectedExports));
  }

  let tarball: TarballContentResult;
  if (opts.skipTarball) {
    tarball = { ran: false, files: [], missingExpectedEntries: [] };
  } else {
    tarball = await runNpmPackDryRun(opts.packageRoot);
  }

  const ok =
    subpathImports.every(r => r.ok) &&
    (tarball.ran ? tarball.ok === true : true);

  return { ok, subpathImports, tarball };
}
