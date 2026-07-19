/**
 * Tests for `manifest db init`.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  MANIFEST_DB_SCHEMAS,
  concatenateSchemas,
  resolveDbSchemas,
  dbInitCommand,
} from './db-init.js';

function makeFakePackageRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'manifest-db-init-'));
  for (const spec of MANIFEST_DB_SCHEMAS) {
    const abs = join(root, spec.rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(
      abs,
      `-- ${spec.id}\nCREATE TABLE IF NOT EXISTS ${spec.id}_t (id TEXT);\n`,
      'utf-8',
    );
  }
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: '@angriff36/manifest' }),
    'utf-8',
  );
  return root;
}

describe('db init', () => {
  it('lists all canonical schema ids', () => {
    expect(MANIFEST_DB_SCHEMAS.map((s) => s.id)).toEqual([
      'audit',
      'outbox',
      'approval',
      'jobs',
      'idempotency',
      'rate-limit',
    ]);
  });

  it('resolves schemas from a package root', () => {
    const root = makeFakePackageRoot();
    try {
      const resolved = resolveDbSchemas(root);
      expect(resolved).toHaveLength(6);
      expect(resolved[0].sql).toContain('-- audit');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('filters with --only', () => {
    const root = makeFakePackageRoot();
    try {
      const resolved = resolveDbSchemas(root, 'outbox,jobs');
      expect(resolved.map((s) => s.id)).toEqual(['outbox', 'jobs']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects unknown --only ids', () => {
    const root = makeFakePackageRoot();
    try {
      expect(() => resolveDbSchemas(root, 'nope')).toThrow(/Unknown schema id/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('concatenates with section headers', () => {
    const root = makeFakePackageRoot();
    try {
      const sql = concatenateSchemas(resolveDbSchemas(root, 'audit'));
      expect(sql).toContain('Manifest db init: audit');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS audit_t');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('writes --out file', async () => {
    const root = makeFakePackageRoot();
    const out = join(root, 'combined.sql');
    try {
      const code = await dbInitCommand({
        packageRoot: root,
        out,
        only: 'idempotency',
      });
      expect(code).toBe(0);
      expect(readFileSync(out, 'utf-8')).toContain('idempotency_t');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('--apply invokes applySql with DATABASE_URL', async () => {
    const root = makeFakePackageRoot();
    const calls: Array<{ sql: string; url: string }> = [];
    try {
      const code = await dbInitCommand({
        packageRoot: root,
        apply: true,
        databaseUrl: 'postgres://test',
        only: 'outbox',
        applySql: async (sql, url) => {
          calls.push({ sql, url });
        },
      });
      expect(code).toBe(0);
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe('postgres://test');
      expect(calls[0].sql).toContain('outbox_t');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('--apply without URL fails closed', async () => {
    const root = makeFakePackageRoot();
    const prev = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const code = await dbInitCommand({
        packageRoot: root,
        apply: true,
      });
      expect(code).toBe(1);
    } finally {
      if (prev !== undefined) process.env.DATABASE_URL = prev;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('resolves real @angriff36/manifest package schemas on disk', async () => {
    const { resolveManifestPackageRoot } = await import('./db-init.js');
    const root = resolveManifestPackageRoot();
    const resolved = resolveDbSchemas(root);
    expect(resolved).toHaveLength(6);
    for (const s of resolved) {
      expect(s.sql.length).toBeGreaterThan(20);
      expect(s.sql.toUpperCase()).toContain('CREATE');
    }
  });
});
