/**
 * Applies IR-diff migration plans via Prisma Migrate or Drizzle/SQL execution.
 *
 * Prisma: write `migration.sql` under a migrate folder, then `prisma migrate deploy`.
 * Drizzle: write SQL artifact, then apply against DATABASE_URL (pg), matching db-init.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

export type MigrationTool = 'prisma' | 'drizzle';

export interface MigrationArtifactPlan {
  sql: string[];
  prisma: string[];
  summary: string[];
}

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (
  command: string,
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
) => Promise<CommandResult>;

export type SqlApplier = (sql: string, databaseUrl: string) => Promise<void>;

export interface MigrationToolRunnerDeps {
  writeFile?: (filePath: string, body: string) => Promise<void>;
  mkdir?: (dir: string) => Promise<void>;
  runCommand?: CommandRunner;
  applySql?: SqlApplier;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
}

export interface ApplyMigrationOptions {
  tool: MigrationTool;
  cwd: string;
  migrationsDir: string;
  databaseUrl?: string;
  /** When true, write artifacts but skip tool/SQL execution. */
  dryRun?: boolean;
}

export interface ApplyMigrationResult {
  migrationDir: string;
  sqlPath: string;
  prismaNotesPath: string | null;
  command?: CommandResult;
  appliedVia: 'prisma-migrate-deploy' | 'sql-database-url' | 'dry-run';
}

function defaultRunCommand(
  command: string,
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      shell: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function defaultApplySql(sql: string, databaseUrl: string): Promise<void> {
  let Pool: new (config: { connectionString: string }) => {
    query: (text: string) => Promise<unknown>;
    end: () => Promise<void>;
  };
  try {
    const mod = await import('pg');
    Pool = mod.Pool as typeof Pool;
  } catch {
    throw new Error(
      "Drizzle/SQL apply requires the 'pg' package. Install it or pass an injected applySql.",
    );
  }
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query(sql);
  } finally {
    await pool.end();
  }
}

function stamp(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`
  );
}

export class MigrationToolRunner {
  private readonly writeFile: (filePath: string, body: string) => Promise<void>;
  private readonly mkdir: (dir: string) => Promise<void>;
  private readonly runCommand: CommandRunner;
  private readonly applySql: SqlApplier;
  private readonly now: () => Date;
  private readonly env: NodeJS.ProcessEnv;

  constructor(deps: MigrationToolRunnerDeps = {}) {
    this.writeFile = deps.writeFile ?? ((p, b) => fs.writeFile(p, b, 'utf8'));
    this.mkdir = deps.mkdir ?? ((d) => fs.mkdir(d, { recursive: true }).then(() => undefined));
    this.runCommand = deps.runCommand ?? defaultRunCommand;
    this.applySql = deps.applySql ?? defaultApplySql;
    this.now = deps.now ?? (() => new Date());
    this.env = deps.env ?? process.env;
  }

  async apply(plan: MigrationArtifactPlan, options: ApplyMigrationOptions): Promise<ApplyMigrationResult> {
    if (plan.sql.length === 0 && plan.prisma.length === 0) {
      throw new Error('Nothing to apply — migration plan is empty.');
    }

    const folder = `${stamp(this.now())}_manifest`;
    const migrationDir = path.resolve(options.cwd, options.migrationsDir, folder);
    await this.mkdir(migrationDir);

    const sqlBody =
      plan.sql.length > 0
        ? plan.sql.map((s) => (s.endsWith(';') ? s : `${s};`)).join('\n') + '\n'
        : '-- No SQL DDL generated for this IR diff.\n';
    const sqlPath = path.join(migrationDir, 'migration.sql');
    await this.writeFile(sqlPath, sqlBody);

    let prismaNotesPath: string | null = null;
    if (plan.prisma.length > 0) {
      prismaNotesPath = path.join(migrationDir, 'prisma-steps.txt');
      await this.writeFile(prismaNotesPath, plan.prisma.join('\n') + '\n');
    }

    if (options.dryRun) {
      return {
        migrationDir,
        sqlPath,
        prismaNotesPath,
        appliedVia: 'dry-run',
      };
    }

    if (options.tool === 'prisma') {
      const command = await this.runCommand(
        'npx',
        ['prisma', 'migrate', 'deploy'],
        { cwd: options.cwd, env: this.env },
      );
      if (command.code !== 0) {
        throw new Error(
          `prisma migrate deploy failed (exit ${command.code}): ${command.stderr || command.stdout}`,
        );
      }
      return {
        migrationDir,
        sqlPath,
        prismaNotesPath,
        command,
        appliedVia: 'prisma-migrate-deploy',
      };
    }

    const databaseUrl = options.databaseUrl ?? this.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(
        'Drizzle/SQL apply requires DATABASE_URL (or --database-url). SQL was written to ' +
          sqlPath,
      );
    }
    await this.applySql(sqlBody, databaseUrl);
    return {
      migrationDir,
      sqlPath,
      prismaNotesPath,
      appliedVia: 'sql-database-url',
    };
  }
}
