/**
 * Unit proofs for MigrationToolRunner — no live Prisma/Postgres required.
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { MigrationToolRunner } from './migrate-tool-runner.js';

describe('MigrationToolRunner', () => {
  it('writes SQL + prisma notes under a stamped migration folder (dry-run)', async () => {
    const writes = new Map<string, string>();
    const mkdirs: string[] = [];
    const runner = new MigrationToolRunner({
      now: () => new Date(Date.UTC(2026, 6, 22, 12, 0, 0)),
      mkdir: async (dir) => {
        mkdirs.push(dir);
      },
      writeFile: async (filePath, body) => {
        writes.set(filePath, body);
      },
      runCommand: async () => {
        throw new Error('should not run on dry-run');
      },
    });

    const result = await runner.apply(
      {
        sql: ['CREATE TABLE "Widget" (id text)'],
        prisma: ['+ model Widget'],
        summary: ['Add entity Widget'],
      },
      {
        tool: 'prisma',
        cwd: '/app',
        migrationsDir: 'prisma/migrations',
        dryRun: true,
      },
    );

    expect(result.appliedVia).toBe('dry-run');
    expect(result.migrationDir.replace(/\\/g, '/')).toContain(
      'prisma/migrations/20260722120000_manifest',
    );
    expect(writes.get(result.sqlPath)).toContain('CREATE TABLE "Widget"');
    expect(result.prismaNotesPath).toBeTruthy();
    expect(writes.get(result.prismaNotesPath!)).toContain('+ model Widget');
    expect(mkdirs.length).toBeGreaterThan(0);
  });

  it('runs prisma migrate deploy after writing artifacts', async () => {
    const calls: { cmd: string; args: readonly string[] }[] = [];
    const runner = new MigrationToolRunner({
      now: () => new Date(Date.UTC(2026, 6, 22, 12, 0, 1)),
      mkdir: async () => {},
      writeFile: async () => {},
      runCommand: async (cmd, args) => {
        calls.push({ cmd, args });
        return { code: 0, stdout: 'All migrations applied', stderr: '' };
      },
    });

    const result = await runner.apply(
      { sql: ['SELECT 1'], prisma: [], summary: ['noop'] },
      { tool: 'prisma', cwd: '/app', migrationsDir: 'prisma/migrations' },
    );

    expect(result.appliedVia).toBe('prisma-migrate-deploy');
    expect(calls).toEqual([{ cmd: 'npx', args: ['prisma', 'migrate', 'deploy'] }]);
    expect(result.command?.stdout).toContain('All migrations applied');
  });

  it('applies drizzle/SQL via DATABASE_URL', async () => {
    let applied: { sql: string; url: string } | undefined;
    const runner = new MigrationToolRunner({
      now: () => new Date(Date.UTC(2026, 6, 22, 12, 0, 2)),
      mkdir: async () => {},
      writeFile: async () => {},
      applySql: async (sql, databaseUrl) => {
        applied = { sql, url: databaseUrl };
      },
      env: { DATABASE_URL: 'postgres://local/test' },
    });

    const result = await runner.apply(
      { sql: ['CREATE TABLE t (id int)'], prisma: [], summary: ['t'] },
      { tool: 'drizzle', cwd: '/app', migrationsDir: 'drizzle/migrations' },
    );

    expect(result.appliedVia).toBe('sql-database-url');
    expect(applied?.url).toBe('postgres://local/test');
    expect(applied?.sql).toContain('CREATE TABLE t');
  });

  it('fails drizzle apply when DATABASE_URL is missing', async () => {
    const runner = new MigrationToolRunner({
      now: () => new Date(Date.UTC(2026, 6, 22, 12, 0, 3)),
      mkdir: async () => {},
      writeFile: async () => {},
      env: {},
    });

    await expect(
      runner.apply(
        { sql: ['SELECT 1'], prisma: [], summary: ['x'] },
        { tool: 'drizzle', cwd: '/app', migrationsDir: 'drizzle/migrations' },
      ),
    ).rejects.toThrow(/DATABASE_URL/);
  });

  it('surfaces prisma migrate deploy failures', async () => {
    const runner = new MigrationToolRunner({
      now: () => new Date(Date.UTC(2026, 6, 22, 12, 0, 4)),
      mkdir: async () => {},
      writeFile: async () => {},
      runCommand: async () => ({ code: 1, stdout: '', stderr: 'P3005' }),
    });

    await expect(
      runner.apply(
        { sql: ['SELECT 1'], prisma: [], summary: ['x'] },
        { tool: 'prisma', cwd: '/app', migrationsDir: 'prisma/migrations' },
      ),
    ).rejects.toThrow(/prisma migrate deploy failed/);
  });

  it('resolves sqlPath under cwd + migrationsDir', async () => {
    const runner = new MigrationToolRunner({
      now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
      mkdir: async () => {},
      writeFile: async () => {},
    });
    const result = await runner.apply(
      { sql: ['SELECT 1'], prisma: [], summary: ['x'] },
      { tool: 'prisma', cwd: path.join('C:', 'proj'), migrationsDir: 'm', dryRun: true },
    );
    expect(result.sqlPath.endsWith(`${path.sep}migration.sql`)).toBe(true);
  });
});
