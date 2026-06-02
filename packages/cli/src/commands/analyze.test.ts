/**
 * Tests for the manifest analyze command.
 *
 * Validates:
 * - IR loading from .ir.json files
 * - Entity, command, and store-adapter size reporting
 * - Flagging of large output
 * - JSON output format
 * - Error handling for missing source
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { analyzeCommand } from './analyze.js';
import type { IR } from '@angriff36/manifest/ir';

// ---------- IR fixtures ----------

function buildSimpleIR(): IR {
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
          { name: 'name', type: { name: 'string', nullable: false }, modifiers: ['required'] },
          { name: 'price', type: { name: 'number', nullable: false }, modifiers: [] },
        ],
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [],
        policies: [],
      },
      {
        name: 'Category',
        properties: [
          { name: 'label', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        ],
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [],
        policies: [],
      },
    ],
    enums: [],
    stores: [
      { entity: 'Product', target: 'memory', config: {} },
      { entity: 'Category', target: 'memory', config: {} },
    ],
    events: [],
    commands: [
      {
        name: 'create',
        entityName: 'Product',
        guards: [],
        mutations: [{ kind: 'set', property: 'name', value: { kind: 'string', value: 'test' } }],
        emits: [],
      },
    ],
    policies: [],
  };
}

function buildLargeEntityIR(): IR {
  // Entity with many properties to potentially trigger flag threshold
  const properties = Array.from({ length: 50 }, (_, i) => ({
    name: `field${i}`,
    type: { name: 'string' as const, nullable: false },
    modifiers: ['required'],
  }));

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
        name: 'WideEntity',
        properties,
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [],
        policies: [],
      },
    ],
    enums: [],
    stores: [{ entity: 'WideEntity', target: 'postgresql', config: {} }],
    events: [],
    commands: [],
    policies: [],
  };
}

// ---------- Test infra ----------

let tmpDir: string;
const originalCwd = process.cwd();

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-analyze-test-'));
});

afterAll(async () => {
  process.chdir(originalCwd);
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

async function writeIR(ir: IR, name: string): Promise<string> {
  const filePath = path.join(tmpDir, name);
  await fs.writeFile(filePath, JSON.stringify(ir, null, 2), 'utf-8');
  return filePath;
}

// ---------- Tests ----------

describe('manifest analyze command', () => {
  it('analyzes a simple IR and reports entity sizes', async () => {
    const irPath = await writeIR(buildSimpleIR(), 'simple.ir.json');
    process.chdir(tmpDir);

    // Capture stdout to avoid noise in test output
    const originalLog = console.log;
    console.log = () => {};

    try {
      const result = await analyzeCommand({
        source: irPath,
        projection: 'nextjs',
        format: 'text',
        json: false,
        flagThreshold: 10240,
      });

      expect(result).toBeDefined();
      expect(result.projection).toBe('nextjs');
      expect(result.entityCount).toBe(2);
      expect(result.commandCount).toBe(1);
      expect(result.storeCount).toBe(2);
      expect(result.entities.length).toBe(2);
      expect(result.commands.length).toBe(1);
      expect(result.stores.length).toBe(2);

      // Each entity should have a report
      const productEntity = result.entities.find((e) => e.name === 'Product');
      expect(productEntity).toBeDefined();
      expect(productEntity!.propertyCount).toBe(2);
    } finally {
      console.log = originalLog;
    }
  });

  it('reports per-store-adapter sizes', async () => {
    const irPath = await writeIR(buildSimpleIR(), 'stores.ir.json');
    process.chdir(tmpDir);

    const originalLog = console.log;
    console.log = () => {};

    try {
      const result = await analyzeCommand({
        source: irPath,
        projection: 'nextjs',
        format: 'text',
        flagThreshold: 10240,
      });

      expect(result.stores.length).toBe(2);
      for (const store of result.stores) {
        expect(store.target).toBeDefined();
        expect(store.entity).toBeDefined();
        expect(store.artifactCount).toBeGreaterThanOrEqual(0);
      }
    } finally {
      console.log = originalLog;
    }
  });

  it('flags entities that exceed the size threshold', async () => {
    const irPath = await writeIR(buildLargeEntityIR(), 'large.ir.json');
    process.chdir(tmpDir);

    const originalLog = console.log;
    console.log = () => {};

    try {
      // Set a very low threshold to force flagging
      const result = await analyzeCommand({
        source: irPath,
        projection: 'nextjs',
        format: 'text',
        flagThreshold: 100, // 100 bytes — very low
      });

      // At least one entity should be flagged with such a low threshold
      const hasFlags = result.flaggedCount > 0 || result.flags.length > 0;
      expect(hasFlags).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  it('emits valid JSON when --json flag is set', async () => {
    const irPath = await writeIR(buildSimpleIR(), 'json-test.ir.json');
    process.chdir(tmpDir);

    // Capture stdout
    const originalLog = console.log;
    const captured: string[] = [];
    console.log = (msg: string) => { captured.push(msg); };

    try {
      await analyzeCommand({
        source: irPath,
        projection: 'nextjs',
        format: 'json',
        json: true,
        flagThreshold: 10240,
      });

      // Should have outputted JSON to stdout
      const jsonOutput = captured.find((line) => line.startsWith('{'));
      expect(jsonOutput).toBeDefined();
      const parsed = JSON.parse(jsonOutput!);
      expect(parsed.projection).toBe('nextjs');
      expect(parsed.entityCount).toBe(2);
      expect(parsed.entities).toBeDefined();
      expect(Array.isArray(parsed.entities)).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  it('handles a .manifest source file by compiling to IR', async () => {
    const manifestPath = path.join(tmpDir, 'test.manifest');
    await fs.writeFile(
      manifestPath,
      `entity TestEntity {
  name: string
  count: number
}
`,
      'utf-8'
    );
    process.chdir(tmpDir);

    const originalLog = console.log;
    console.log = () => {};

    try {
      const result = await analyzeCommand({
        source: manifestPath,
        projection: 'nextjs',
        format: 'text',
        flagThreshold: 10240,
      });

      expect(result).toBeDefined();
      expect(result.entityCount).toBeGreaterThanOrEqual(0);
    } finally {
      console.log = originalLog;
    }
  });

  it('exits with code 1 when source is missing', async () => {
    process.chdir(tmpDir);

    const originalExit = process.exit;
    let exitCode: number | undefined;
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
      throw new Error('__exit__');
    }) as never;

    try {
      await analyzeCommand({
        source: '/nonexistent/path/file.ir.json',
        projection: 'nextjs',
        format: 'text',
        flagThreshold: 10240,
      });
    } catch {
      // Expected — process.exit throws
    } finally {
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
  });
});
