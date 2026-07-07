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
 *   2. Tarball contents — pack the package to a temporary directory and
 *      list the resulting `.tgz` to confirm the SQL schemas, CLI bin,
 *      and dist/manifest tree are included. Failures here mean the
 *      published tarball is missing files the runtime needs.
 *
 * The subpath layer runs in every invocation. The tarball layer requires
 * `pnpm` (or `npm`) on PATH plus a writable temp directory, so callers
 * can opt out via the `skipTarball` option (e.g. when running inside a
 * sandboxed CI step that does not have a packing toolchain available).
 *
 * Tarball tool selection: prefers `pnpm pack` over `npm pack --dry-run`.
 *
 *   - `pnpm pack` is deterministic on this repo's layout (pnpm-managed
 *     node_modules) and produces an actual .tgz which we then list via
 *     `tar -tzf` to read the file inventory.
 *   - `npm pack --dry-run` has a known upstream bug
 *     (`@npmcli/arborist#findMissingEdges` crashes with
 *     "Cannot read properties of null (reading 'package')") that triggers
 *     intermittently when it walks a pnpm-style `node_modules/.pnpm` store
 *     on Windows. Reproduced at ~40% failure rate locally with
 *     npm 10.9.3 + Node 22.18 on Windows 11. CI publishes have worked so
 *     far because CI installs are fresh and the bug is timing-sensitive,
 *     but relying on it for a verification check is not safe.
 *
 * If pnpm is not available we fall back to npm — and the caller is
 * responsible for treating a non-zero exit as a real failure (the
 * `tarball.error` field carries the diagnostic).
 */

import { spawn, spawnSync } from 'node:child_process';
import { promises as fs, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

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
  /** Which packer produced the file list (`'pnpm'` or `'npm'`). */
  packer?: 'pnpm' | 'npm';
  /** Files included in the published tarball, repo-relative. */
  files: string[];
  /** Expected entries that were missing from the tarball. */
  missingExpectedEntries: string[];
  /** Raw error if the packer failed. */
  error?: string;
}

export interface PackageShapeResult {
  ok: boolean;
  /**
   * True only if the tarball sub-check was intentionally skipped via
   * `skipTarball: true`. Distinguishes a deliberate skip from
   * "we tried to run `npm pack` and it failed to spawn".
   */
  tarballSkipped: boolean;
  subpathImports: SubpathImportResult[];
  tarball: TarballContentResult;
}

export interface PublicSubpathExpectation {
  subpath: string;
  expectedExports: string[];
}

const IGNORED_EXPORT_KEYS = new Set(['./package.json']);

/**
 * Resolution-only subpaths use an empty array: the load-bearing assertion is
 * simply that the module imports without throwing.
 */
const EXPECTED_EXPORTS_BY_SUBPATH: Record<string, string[]> = {
  '@angriff36/manifest': ['RuntimeEngine'],
  '@angriff36/manifest/runtime-engine': ['RuntimeEngine'],
  '@angriff36/manifest/ir-compiler': ['compileToIR'],
  '@angriff36/manifest/audit/memory': ['MemoryAuditSink'],
  '@angriff36/manifest/audit/postgres': ['PostgresAuditSink'],
  '@angriff36/manifest/outbox/memory': ['MemoryOutboxStore'],
  '@angriff36/manifest/outbox/postgres': ['PostgresOutboxStore'],
  '@angriff36/manifest/outbox/redis': ['RedisOutboxStore'],
  '@angriff36/manifest/outbox/worker': ['runOutboxWorker'],
  '@angriff36/manifest/jobs/postgres': ['PostgresJobQueue'],
  '@angriff36/manifest/jobs/worker': ['runJobWorker'],
  '@angriff36/manifest/schedule-worker': ['startScheduleWorker'],
  '@angriff36/manifest/approval/memory': ['MemoryApprovalStore'],
  '@angriff36/manifest/approval/postgres': ['PostgresApprovalStore'],
  '@angriff36/manifest/idempotency/memory': ['MemoryIdempotencyStore'],
  '@angriff36/manifest/idempotency/postgres': ['PostgresIdempotencyStore'],
  '@angriff36/manifest/transactions/postgres': ['PostgresTransactionProvider'],
  '@angriff36/manifest/webhooks': ['handleWebhookRequest'],
  '@angriff36/manifest/events': ['MemoryEventBus'],
  '@angriff36/manifest/events/redis': ['RedisEventBus'],
  '@angriff36/manifest/federation': ['FederationRegistry'],
  '@angriff36/manifest/agent-sdk': [
    'AgentRuntime',
    'toAnthropicTools',
    'toOpenAITools',
    'toVercelAITools',
    'findMatchingCommands',
    'irTypeToJsonSchema',
  ],
  '@angriff36/manifest/stores': ['PostgresStore'],
  '@angriff36/manifest/projections': ['getProjection'],
  '@angriff36/manifest/plugin-api': ['definePlugin'],
  '@angriff36/manifest/plugin-loader': ['loadPlugins'],
  '@angriff36/manifest/parser': ['Parser'],
  '@angriff36/manifest/lexer': ['Lexer'],
  '@angriff36/manifest/config': ['resolveProjectionOptions'],
};

/**
 * Derive the public subpaths directly from package.json so this check stays in
 * sync with the published library surface. The only intentional omission here
 * is `./package.json` because JSON import semantics differ by host.
 */
export async function getPackageShapeSubpaths(packageRoot: string): Promise<PublicSubpathExpectation[]> {
  const packageJsonPath = path.join(packageRoot, 'package.json');
  const raw = await fs.readFile(packageJsonPath, 'utf8');
  const pkg = JSON.parse(raw) as { name?: string; exports?: Record<string, unknown> };
  if (!pkg.name) {
    throw new Error(`package.json at ${packageJsonPath} is missing a package name`);
  }
  if (!pkg.exports || typeof pkg.exports !== 'object' || Array.isArray(pkg.exports)) {
    throw new Error(`package.json at ${packageJsonPath} is missing an object-shaped exports field`);
  }

  return Object.keys(pkg.exports)
    .filter(key => !IGNORED_EXPORT_KEYS.has(key))
    .map<PublicSubpathExpectation>(key => {
      const subpath = key === '.' ? pkg.name! : `${pkg.name!}/${key.slice(2)}`;
      return {
        subpath,
        expectedExports: EXPECTED_EXPORTS_BY_SUBPATH[subpath] ?? [],
      };
    })
    .sort((a, b) => a.subpath.localeCompare(b.subpath));
}

/** Tarball entries every conforming build MUST include. */
const REQUIRED_TARBALL_ENTRIES = [
  'package.json',
  'src/manifest/audit/sinks/postgres.sql',
  'src/manifest/outbox/stores/postgres.sql',
  'src/manifest/approval/stores/postgres.sql',
  'src/manifest/jobs/stores/postgres.sql',
  'src/manifest/idempotency/stores/postgres.sql',
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
 * Detect whether a packer binary is on PATH by calling it with `--version`
 * and checking the exit code. Uses spawnSync for simplicity — this runs
 * once per check, not per-file.
 */
function hasBinary(name: string): boolean {
  try {
    const r = spawnSync(name, ['--version'], { shell: true, stdio: 'pipe' });
    return r.status === 0;
  } catch {
    return false;
  }
}

function validateEntries(files: string[]): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const required of REQUIRED_TARBALL_ENTRIES) {
    if (!files.includes(required)) missing.push(required);
  }
  for (const glob of REQUIRED_TARBALL_GLOBS) {
    if (!files.some(glob.matches)) missing.push(glob.label);
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Pack via `pnpm pack` to a temp directory, list the resulting tarball
 * with `tar -tzf`, then delete the tarball. Returns the file list with
 * the standard `package/` prefix stripped so the path comparison matches
 * the `files` field that npm pack --dry-run --json would have returned.
 *
 * This path is preferred over `npm pack --dry-run --json` because it
 * sidesteps the intermittent `@npmcli/arborist#findMissingEdges` crash
 * documented at the top of this file.
 */
async function runPnpmPack(cwd: string): Promise<TarballContentResult> {
  const dir = mkdtempSync(path.join(tmpdir(), 'manifest-pack-'));
  return new Promise(resolve => {
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn('pnpm', ['pack', '--pack-destination', dir], { cwd, shell: true });
    } catch (err) {
      resolve({
        ran: false,
        packer: 'pnpm',
        files: [],
        missingExpectedEntries: [],
        error: `Could not invoke pnpm (sync throw): ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }
    child.stdout.on('data', c => { stdout += String(c); });
    child.stderr.on('data', c => { stderr += String(c); });
    child.on('error', err => {
      resolve({
        ran: false,
        packer: 'pnpm',
        files: [],
        missingExpectedEntries: [],
        error: `Could not invoke pnpm: ${err.message}`,
      });
    });
    child.on('close', async code => {
      if (code !== 0) {
        resolve({
          ran: true,
          ok: false,
          packer: 'pnpm',
          files: [],
          missingExpectedEntries: [],
          error: `pnpm pack exited ${code}: ${stderr.trim() || stdout.trim()}`,
        });
        return;
      }
      try {
        const entries = await fs.readdir(dir);
        const tgz = entries.find(f => f.endsWith('.tgz'));
        if (!tgz) {
          resolve({
            ran: true,
            ok: false,
            packer: 'pnpm',
            files: [],
            missingExpectedEntries: [],
            error: `pnpm pack succeeded but produced no .tgz in ${dir}`,
          });
          return;
        }
        const tgzPath = path.join(dir, tgz);
        const files = await listTarball(tgzPath);
        await fs.rm(tgzPath, { force: true }).catch(() => {});
        await fs.rmdir(dir).catch(() => {});
        const { ok, missing } = validateEntries(files);
        resolve({
          ran: true,
          ok,
          packer: 'pnpm',
          files,
          missingExpectedEntries: missing,
        });
      } catch (e) {
        resolve({
          ran: true,
          ok: false,
          packer: 'pnpm',
          files: [],
          missingExpectedEntries: [],
          error: `Could not read pnpm pack output: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    });
  });
}

/**
 * Fallback: invoke `npm pack --dry-run --json`. See top-of-file comment
 * for the known intermittent failure mode this path exhibits on
 * pnpm-managed `node_modules`.
 */
async function runNpmPackDryRun(cwd: string): Promise<TarballContentResult> {
  return new Promise(resolve => {
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn('npm', ['pack', '--dry-run', '--json'], { cwd, shell: true });
    } catch (err) {
      resolve({
        ran: false,
        packer: 'npm',
        files: [],
        missingExpectedEntries: [],
        error: `Could not invoke npm (sync throw): ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }
    child.stdout.on('data', chunk => { stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.on('error', err => {
      resolve({
        ran: false,
        packer: 'npm',
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
          packer: 'npm',
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
        const { ok, missing } = validateEntries(files);
        resolve({ ran: true, ok, packer: 'npm', files, missingExpectedEntries: missing });
      } catch (e) {
        resolve({
          ran: true,
          ok: false,
          packer: 'npm',
          files: [],
          missingExpectedEntries: [],
          error: `Could not parse npm pack output: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    });
  });
}

/**
 * List the entries inside a .tgz using `tar -tzf`. Strips the
 * leading `package/` prefix that pnpm/npm pack always adds so the
 * resulting paths match the package's `files` array semantics.
 *
 * Windows quirk: GNU tar (the one shipping with Git Bash) interprets a
 * leading `C:` as a hostname for remote tape archives. Passing the
 * tarball as a bare filename plus a `cwd` avoids the colon entirely and
 * works for both GNU tar and bsdtar (the one shipping with native
 * Windows 10+).
 */
async function listTarball(tgzPath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(tgzPath);
    const file = path.basename(tgzPath);
    const child = spawn('tar', ['-tzf', file], { shell: true, cwd: dir });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', c => { stdout += String(c); });
    child.stderr.on('data', c => { stderr += String(c); });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(`tar -tzf exited ${code}: ${stderr.trim()}`));
        return;
      }
      const files = stdout
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0)
        // Skip directory entries (trailing slash).
        .filter(line => !line.endsWith('/'))
        // Strip leading `package/` so paths match what npm pack --dry-run would have emitted.
        .map(line => line.replace(/^package\//, ''))
        .sort();
      resolve(files);
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
  const expectedSubpaths = await getPackageShapeSubpaths(opts.packageRoot);
  const subpathImports: SubpathImportResult[] = [];
  for (const { subpath, expectedExports } of expectedSubpaths) {
    subpathImports.push(await importSubpath(subpath, expectedExports));
  }

  let tarball: TarballContentResult;
  const tarballSkipped = opts.skipTarball === true;
  if (tarballSkipped) {
    tarball = { ran: false, files: [], missingExpectedEntries: [] };
  } else if (hasBinary('pnpm')) {
    tarball = await runPnpmPack(opts.packageRoot);
  } else {
    tarball = await runNpmPackDryRun(opts.packageRoot);
  }

  // If the caller did NOT request a skip, the tarball check must actually
  // succeed. A spawn failure (`ran: false` + `error`) is treated as a
  // failure too — silently green-painting when `npm pack` couldn't run
  // would defeat the whole point of pre-publish verification. The only
  // way to skip the tarball check is explicit `skipTarball: true`.
  const tarballOk = tarballSkipped
    ? true
    : (tarball.ran && tarball.ok === true);

  const ok = subpathImports.every(r => r.ok) && tarballOk;

  return { ok, tarballSkipped, subpathImports, tarball };
}
