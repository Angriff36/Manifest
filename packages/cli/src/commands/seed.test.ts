/**
 * Tests for the manifest seed command.
 *
 * Validates:
 * - Deterministic output with a fixed seed
 * - Profile-based record counts
 * - Property type-based value generation
 * - Relationship FK consistency
 * - JSON / SQL / Supabase output formats
 * - Unique property constraint enforcement
 * - Topological sort handles FK dependencies
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { seedCommand } from './seed.js';
import type { IR } from '@angriff36/manifest/ir';

// ---------- IR fixtures ----------

function buildProductIR(): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'test',
      compilerVersion: '1.0.0',
      schemaVersion: '1.0',
      compiledAt: '2024-01-01T00:00:00.000Z',
    },
    modules: [],
    values: [],
    entities: [
      {
        name: 'Product',
        properties: [
          { name: 'name', type: { name: 'string', nullable: false }, modifiers: ['required', 'unique'] },
          { name: 'price', type: { name: 'number', nullable: false }, modifiers: [] },
          { name: 'inStock', type: { name: 'boolean', nullable: false }, modifiers: [] },
        ],
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [],
        policies: [],
      },
    ],
    enums: [],
    stores: [{ entity: 'Product', target: 'memory', config: {} }],
    events: [],
    commands: [],
    policies: [],
  };
}

function buildAuthorBookIR(): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'test',
      compilerVersion: '1.0.0',
      schemaVersion: '1.0',
      compiledAt: '2024-01-01T00:00:00.000Z',
    },
    modules: [],
    values: [],
    entities: [
      {
        name: 'Author',
        properties: [
          { name: 'name', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        ],
        computedProperties: [],
        relationships: [{ name: 'books', kind: 'hasMany', target: 'Book' }],
        commands: [],
        constraints: [],
        policies: [],
      },
      {
        name: 'Book',
        properties: [
          { name: 'title', type: { name: 'string', nullable: false }, modifiers: ['required'] },
          { name: 'year', type: { name: 'int', nullable: false }, defaultValue: { kind: 'number', value: 2024 }, modifiers: [] },
        ],
        computedProperties: [],
        relationships: [{ name: 'author', kind: 'belongsTo', target: 'Author' }],
        commands: [],
        constraints: [],
        policies: [],
      },
    ],
    enums: [],
    stores: [
      { entity: 'Author', target: 'memory', config: {} },
      { entity: 'Book', target: 'memory', config: {} },
    ],
    events: [],
    commands: [],
    policies: [],
  };
}

// ---------- Test infra ----------

let tmpDir: string;
const originalCwd = process.cwd();

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-seed-test-'));
});

afterAll(async () => {
  process.chdir(originalCwd);
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

async function writeIR(ir: IR, name: string): Promise<string> {
  const filePath = path.join(tmpDir, `${name}.ir.json`);
  await fs.writeFile(filePath, JSON.stringify(ir, null, 2), 'utf-8');
  return filePath;
}

// ---------- Tests ----------

describe('seedCommand', () => {
  it('writes a JSON seed file with the requested count', async () => {
    const ir = buildProductIR();
    const irPath = await writeIR(ir, 'product');
    const out = path.join(tmpDir, 'product-seed.json');

    process.chdir(tmpDir);
    await seedCommand({
      source: irPath,
      output: out,
      profile: 'dev',
      format: 'json',
      count: 7,
      seed: 42,
    });

    const written = JSON.parse(await fs.readFile(out, 'utf-8')) as Record<string, unknown[]>;
    expect(Array.isArray(written['Product'])).toBe(true);
    expect((written['Product'] as unknown[]).length).toBe(7);
  });

  it('uses profile default count when --count is omitted', async () => {
    const ir = buildProductIR();
    const irPath = await writeIR(ir, 'product-profile');
    const out = path.join(tmpDir, 'product-profile.json');

    process.chdir(tmpDir);
    await seedCommand({
      source: irPath,
      output: out,
      profile: 'demo',
      format: 'json',
      seed: 1,
    });

    const written = JSON.parse(await fs.readFile(out, 'utf-8')) as Record<string, unknown[]>;
    expect((written['Product'] as unknown[]).length).toBe(50);
  });

  it('produces deterministic output with a fixed seed', async () => {
    const ir = buildProductIR();
    const irPath = await writeIR(ir, 'product-deterministic');
    const outA = path.join(tmpDir, 'det-A.json');
    const outB = path.join(tmpDir, 'det-B.json');

    process.chdir(tmpDir);
    await seedCommand({ source: irPath, output: outA, profile: 'dev', count: 5, seed: 12345 });
    await seedCommand({ source: irPath, output: outB, profile: 'dev', count: 5, seed: 12345 });

    const a = await fs.readFile(outA, 'utf-8');
    const b = await fs.readFile(outB, 'utf-8');
    expect(a).toBe(b);
  });

  it('emits valid SQL for PostgreSQL stores', async () => {
    const ir = buildProductIR();
    const irPath = await writeIR(ir, 'product-sql');
    const out = path.join(tmpDir, 'product.sql');

    process.chdir(tmpDir);
    await seedCommand({
      source: irPath,
      output: out,
      profile: 'dev',
      format: 'sql',
      count: 3,
      seed: 7,
    });

    const sql = await fs.readFile(out, 'utf-8');
    expect(sql).toContain('INSERT INTO product');
    expect(sql).toContain('::jsonb');
    expect(sql).toMatch(/VALUES\s+[\s\S]+;/);
  });

  it('emits Supabase-formatted JSON', async () => {
    const ir = buildProductIR();
    const irPath = await writeIR(ir, 'product-supabase');
    const out = path.join(tmpDir, 'product.supabase.json');

    process.chdir(tmpDir);
    await seedCommand({
      source: irPath,
      output: out,
      profile: 'dev',
      format: 'supabase',
      count: 2,
      seed: 9,
    });

    const written = JSON.parse(await fs.readFile(out, 'utf-8')) as { tables: Record<string, unknown[]> };
    expect(written.tables).toBeDefined();
    expect(Array.isArray(written.tables['Product'])).toBe(true);
    expect((written.tables['Product'] as unknown[]).length).toBe(2);
  });

  it('generates belongsTo FK references that point at generated parent ids', async () => {
    const ir = buildAuthorBookIR();
    const irPath = await writeIR(ir, 'authorbook');
    const out = path.join(tmpDir, 'authorbook.json');

    process.chdir(tmpDir);
    await seedCommand({
      source: irPath,
      output: out,
      profile: 'dev',
      count: 5,
      seed: 100,
    });

    const written = JSON.parse(await fs.readFile(out, 'utf-8')) as {
      Author: Array<{ id: string }>;
      Book: Array<{ id: string; author: string }>;
    };

    const authorIds = new Set(written.Author.map((a) => a.id));
    expect(authorIds.size).toBe(5);

    for (const book of written.Book) {
      expect(authorIds.has(book.author)).toBe(true);
    }
  });

  it('enforces uniqueness on properties with the unique modifier', async () => {
    const ir = buildProductIR();
    const irPath = await writeIR(ir, 'product-unique');
    const out = path.join(tmpDir, 'product-unique.json');

    process.chdir(tmpDir);
    await seedCommand({
      source: irPath,
      output: out,
      profile: 'dev',
      count: 20,
      seed: 999,
    });

    const written = JSON.parse(await fs.readFile(out, 'utf-8')) as {
      Product: Array<{ name: string }>;
    };

    const names = written.Product.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('emits structured JSON to stdout when --json is set', async () => {
    const ir = buildProductIR();
    const irPath = await writeIR(ir, 'product-stdout');
    const out = path.join(tmpDir, 'product-stdout-should-not-exist.json');

    process.chdir(tmpDir);
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      await seedCommand({
        source: irPath,
        output: out,
        profile: 'dev',
        format: 'json',
        count: 2,
        seed: 11,
        json: true,
      });
    } finally {
      console.log = originalLog;
    }

    // File should not have been written
    await expect(fs.access(out)).rejects.toThrow();

    // At least one console.log call should contain a JSON object with the result envelope
    const combined = logs.join('\n');
    const parsed = JSON.parse(combined) as {
      profile: string;
      format: string;
      seed: number;
      entities: Record<string, number>;
      total: number;
      body: string;
    };
    expect(parsed.profile).toBe('dev');
    expect(parsed.format).toBe('json');
    expect(parsed.total).toBe(2);
    expect(parsed.body).toContain('Product');
  });

  it('seeds only the named entity when --entity is provided', async () => {
    const ir = buildAuthorBookIR();
    const irPath = await writeIR(ir, 'authorbook-filter');
    const out = path.join(tmpDir, 'authorbook-filter.json');

    process.chdir(tmpDir);
    await seedCommand({
      source: irPath,
      output: out,
      profile: 'dev',
      count: 3,
      entity: ['Author'],
      seed: 55,
    });

    const written = JSON.parse(await fs.readFile(out, 'utf-8')) as Record<string, unknown[]>;
    expect(written['Author']).toBeDefined();
    expect((written['Author'] as unknown[]).length).toBe(3);
    // Book is in the output envelope with an empty array (entity appears in IR order)
    expect(written['Book']).toBeDefined();
    expect((written['Book'] as unknown[]).length).toBe(0);
  });

  it('rejects an unknown profile', async () => {
    const ir = buildProductIR();
    const irPath = await writeIR(ir, 'product-bad-profile');

    process.chdir(tmpDir);
    const originalExit = process.exit;
    let exitCode: number | undefined;
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
      throw new Error('__exit__');
    }) as typeof process.exit;

    try {
      await seedCommand({
        source: irPath,
        output: path.join(tmpDir, 'bad.json'),
        profile: 'production' as 'dev',
        seed: 1,
      });
    } catch (e) {
      if (!(e instanceof Error) || e.message !== '__exit__') throw e;
    } finally {
      process.exit = originalExit;
    }
    expect(exitCode).toBe(1);
  });
});
