/**
 * `manifest db init` — apply or print the Postgres adapter schemas shipped
 * with `@angriff36/manifest` (approval, audit, outbox, jobs, idempotency,
 * rate-limit).
 *
 * Default is print-only (safe). Pass `--apply` with `DATABASE_URL` (or
 * `--database-url`) to execute against Postgres via optional peer `pg`.
 */

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import chalk from 'chalk';

export interface DbSchemaSpec {
  id: string;
  /** Path relative to the `@angriff36/manifest` package root. */
  rel: string;
}

/** Canonical adapter schemas shipped in the npm package `files` list. */
export const MANIFEST_DB_SCHEMAS: readonly DbSchemaSpec[] = [
  { id: 'audit', rel: 'src/manifest/audit/sinks/postgres.sql' },
  { id: 'outbox', rel: 'src/manifest/outbox/stores/postgres.sql' },
  { id: 'approval', rel: 'src/manifest/approval/stores/postgres.sql' },
  { id: 'jobs', rel: 'src/manifest/jobs/stores/postgres.sql' },
  { id: 'idempotency', rel: 'src/manifest/idempotency/stores/postgres.sql' },
  { id: 'rate-limit', rel: 'src/manifest/rate-limit/stores/postgres.sql' },
] as const;

export interface DbInitOptions {
  /** Execute SQL against Postgres (requires `pg` + connection string). */
  apply?: boolean;
  /** Connection string; falls back to process.env.DATABASE_URL. */
  databaseUrl?: string;
  /** Preview file/DB writes without applying them. */
  dryRun?: boolean;
  /** Write concatenated SQL to this path instead of stdout. */
  out?: string;
  /** Only list schema ids and resolved paths. */
  list?: boolean;
  /** Comma-separated schema ids to include (default: all). */
  only?: string;
  /** Injected for tests — override package-root resolution. */
  packageRoot?: string;
  /** Injected for tests — override SQL apply. */
  applySql?: (sql: string, databaseUrl: string) => Promise<void>;
}

export interface ResolvedSchema {
  id: string;
  rel: string;
  absolutePath: string;
  sql: string;
}

export function resolveManifestPackageRoot(override?: string): string {
  if (override) return override;
  const require = createRequire(import.meta.url);
  const pkgJson = require.resolve('@angriff36/manifest/package.json');
  return dirname(pkgJson);
}

function selectedSpecs(only?: string): DbSchemaSpec[] {
  if (!only || only.trim() === '') return [...MANIFEST_DB_SCHEMAS];
  const wanted = new Set(
    only
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const selected = MANIFEST_DB_SCHEMAS.filter((s) => wanted.has(s.id));
  const missing = [...wanted].filter((id) => !selected.some((s) => s.id === id));
  if (missing.length > 0) {
    throw new Error(
      `Unknown schema id(s): ${missing.join(', ')}. Valid: ${MANIFEST_DB_SCHEMAS.map((s) => s.id).join(', ')}`,
    );
  }
  return selected;
}

export function resolveDbSchemas(packageRoot: string, only?: string): ResolvedSchema[] {
  const specs = selectedSpecs(only);
  const resolved: ResolvedSchema[] = [];
  for (const spec of specs) {
    const absolutePath = join(packageRoot, spec.rel);
    if (!existsSync(absolutePath)) {
      throw new Error(
        `Missing schema file for '${spec.id}': ${absolutePath} (package root: ${packageRoot})`,
      );
    }
    resolved.push({
      id: spec.id,
      rel: spec.rel,
      absolutePath,
      sql: readFileSync(absolutePath, 'utf-8'),
    });
  }
  return resolved;
}

export function concatenateSchemas(schemas: ResolvedSchema[]): string {
  const parts = schemas.map(
    (s) =>
      `-- =============================================================================\n` +
      `-- Manifest db init: ${s.id}\n` +
      `-- Source: ${s.rel}\n` +
      `-- =============================================================================\n` +
      s.sql.trimEnd() +
      '\n',
  );
  return parts.join('\n');
}

async function defaultApplySql(sql: string, databaseUrl: string): Promise<void> {
  type PgClient = {
    connect(): Promise<void>;
    query(text: string): Promise<unknown>;
    end(): Promise<void>;
  };
  type PgModule = { Client: new (config: { connectionString: string }) => PgClient };

  let pg: PgModule;
  try {
    pg = (await import('pg')) as unknown as PgModule;
  } catch {
    throw new Error(
      'Applying schemas requires the `pg` package. Install it in your app (`pnpm add pg`) and retry.',
    );
  }
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

/**
 * Core `manifest db init` implementation. Returns exit code 0 on success.
 */
export async function dbInitCommand(options: DbInitOptions = {}): Promise<number> {
  try {
    const packageRoot = resolveManifestPackageRoot(options.packageRoot);
    const schemas = resolveDbSchemas(packageRoot, options.only);

    if (options.list) {
      for (const s of schemas) {
        console.log(`${s.id}\t${s.absolutePath}`);
      }
      return 0;
    }

    const sql = concatenateSchemas(schemas);

    if (options.apply) {
      if (options.dryRun) {
        process.stdout.write(sql);
        if (!sql.endsWith('\n')) process.stdout.write('\n');
        const { logWouldApply } = await import('../utils/dry-run-fs.js');
        logWouldApply(
          `${schemas.length} Manifest Postgres schema(s): ${schemas.map((s) => s.id).join(', ')}`,
        );
        return 0;
      }
      const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
      if (!databaseUrl) {
        console.error(
          chalk.red('DATABASE_URL is required for --apply (or pass --database-url <url>).'),
        );
        return 1;
      }
      const apply = options.applySql ?? defaultApplySql;
      await apply(sql, databaseUrl);
      console.log(
        chalk.green(
          `Applied ${schemas.length} Manifest Postgres schema(s): ${schemas.map((s) => s.id).join(', ')}`,
        ),
      );
      return 0;
    }

    if (options.out) {
      const { writeTextFileSync } = await import('../utils/dry-run-fs.js');
      writeTextFileSync(options.out, sql, { dryRun: options.dryRun });
      if (!options.dryRun) {
        console.log(chalk.green(`Wrote combined schema SQL to ${options.out}`));
      }
      return 0;
    }

    // Default: print SQL to stdout so operators can pipe / review.
    process.stdout.write(sql);
    if (!sql.endsWith('\n')) process.stdout.write('\n');
    console.error(
      chalk.dim(
        `\n(--print is the default. Re-run with --apply --database-url … to execute, or --out <file> to save.)`,
      ),
    );
    return 0;
  } catch (err) {
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    return 1;
  }
}
