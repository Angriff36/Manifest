/**
 * Tests for the manifest load-test command.
 *
 * Validates:
 * - Ramp-up profile parsing
 * - SLO threshold parsing
 * - k6 script generation
 * - Artillery config + processor generation
 * - Faker data generation patterns
 * - Profiler integration flag
 * - JSON output mode
 * - Command/entity filtering
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadTestCommand } from './load-test.js';
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
          { name: 'name', type: { name: 'string', nullable: false }, modifiers: ['required'] },
          { name: 'email', type: { name: 'string', nullable: false }, modifiers: [] },
          { name: 'price', type: { name: 'number', nullable: false }, modifiers: [] },
          { name: 'inStock', type: { name: 'boolean', nullable: false }, modifiers: [] },
          { name: 'quantity', type: { name: 'int', nullable: false }, modifiers: [] },
        ],
        computedProperties: [],
        relationships: [],
        commands: [
          {
            name: 'createProduct',
            guards: [],
            mutations: [
              { kind: 'set', property: 'name', value: { kind: 'string', value: '' } },
              { kind: 'set', property: 'email', value: { kind: 'string', value: '' } },
              { kind: 'set', property: 'price', value: { kind: 'number', value: 0 } },
            ],
            emits: [],
          },
        ],
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

// ---------- Test infrastructure ----------

let tmpDir: string;
const originalCwd = process.cwd();
let originalExit: typeof process.exit;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-loadtest-'));
});

afterAll(async () => {
  process.chdir(originalCwd);
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
  if (originalExit) {
    process.exit = originalExit;
  }
});

// Helper: write an IR fixture to disk and return its path
async function writeIRFile(ir: IR, name: string): Promise<string> {
  const filePath = path.join(tmpDir, name);
  await fs.writeFile(filePath, JSON.stringify(ir), 'utf-8');
  return filePath;
}

// ---------- Tests ----------

describe('load-test', () => {
  it('generates a k6 script for a command', async () => {
    const irPath = await writeIRFile(buildProductIR(), 'product.ir.json');
    const outDir = path.join(tmpDir, 'out-k6');

    const result = await loadTestCommand({
      source: irPath,
      output: outDir,
      format: 'k6',
      baseUrl: 'http://api.test:4000',
      json: true,
    });

    expect(result.format).toBe('k6');
    expect(result.baseUrl).toBe('http://api.test:4000');
    expect(result.commands).toContain('Product.createProduct');
    expect(Object.keys(result.files).length).toBeGreaterThan(0);

    // In json mode, files are in memory — read from result.files
    const fileEntries = Object.entries(result.files);
    const jsFilePath = fileEntries.find(([p]) => p.endsWith('.js'))!;
    const content = jsFilePath[1];

    expect(content).toContain('import http from');
    expect(content).toContain('export const options');
    expect(content).toContain('stages:');
    expect(content).toContain('http.post');
    expect(content).toContain('http://api.test:4000');
    expect(content).toContain('faker.email()'); // Email field should use faker
  });

  it('generates an Artillery config and processor', async () => {
    const irPath = await writeIRFile(buildProductIR(), 'product2.ir.json');
    const outDir = path.join(tmpDir, 'out-artillery');

    const result = await loadTestCommand({
      source: irPath,
      output: outDir,
      format: 'artillery',
      baseUrl: 'http://api.test:5000',
      json: true,
    });

    expect(result.format).toBe('artillery');
    expect(result.baseUrl).toBe('http://api.test:5000');

    // Artillery generates 2 files per command: .yml and .processor.js
    const fileEntries = Object.entries(result.files);
    const ymlEntry = fileEntries.find(([p]) => p.endsWith('.yml'))!;
    const procEntry = fileEntries.find(([p]) => p.endsWith('.processor.js'))!;
    expect(ymlEntry).toBeDefined();
    expect(procEntry).toBeDefined();

    const ymlContent = ymlEntry[1];
    expect(ymlContent).toContain('config:');
    expect(ymlContent).toContain('phases:');
    expect(ymlContent).toContain('http://api.test:5000');
    expect(ymlContent).toContain('scenarios:');

    const procContent = procEntry[1];
    expect(procContent).toContain('module.exports');
    expect(procContent).toContain('generateRequestBody');
    expect(procContent).toContain('faker');
  });

  it('parses ramp-up profiles correctly', async () => {
    const irPath = await writeIRFile(buildProductIR(), 'ramp.ir.json');
    const outDir = path.join(tmpDir, 'out-ramp');

    const result = await loadTestCommand({
      source: irPath,
      output: outDir,
      format: 'k6',
      rampUp: '5s:10,1m:50,10m:200',
      json: true,
    });

    expect(result.rampUp).toEqual([
      { duration: '5s', target: 10 },
      { duration: '1m', target: 50 },
      { duration: '10m', target: 200 },
    ]);
  });

  it('parses SLO thresholds correctly', async () => {
    const irPath = await writeIRFile(buildProductIR(), 'slo.ir.json');
    const outDir = path.join(tmpDir, 'out-slo');

    const result = await loadTestCommand({
      source: irPath,
      output: outDir,
      format: 'k6',
      slo: 'p95:<:500ms,error_rate:<=:0.01,p99:<:2s:abort',
      json: true,
    });

    expect(result.slo).toEqual([
      { metric: 'p95', op: '<', value: 500, abortOnFail: false },
      { metric: 'error_rate', op: '<=', value: 0.01, abortOnFail: false },
      { metric: 'p99', op: '<', value: 2000, abortOnFail: true },
    ]);

    // Verify thresholds appear in the generated k6 script
    const fileEntries = Object.entries(result.files);
    const jsEntry = fileEntries.find(([p]) => p.endsWith('.js'))!;
    const content = jsEntry[1];
    expect(content).toContain('thresholds:');
    expect(content).toContain('abortOnFail: true');
  });

  it('uses default ramp-up when none specified', async () => {
    const irPath = await writeIRFile(buildProductIR(), 'default.ir.json');
    const outDir = path.join(tmpDir, 'out-default');

    const result = await loadTestCommand({
      source: irPath,
      output: outDir,
      format: 'k6',
      json: true,
    });

    expect(result.rampUp.length).toBeGreaterThan(0);
    expect(result.rampUp[0]).toHaveProperty('duration');
    expect(result.rampUp[0]).toHaveProperty('target');
  });

  it('rejects invalid ramp-up format', async () => {
    const irPath = await writeIRFile(buildProductIR(), 'bad-ramp.ir.json');
    const outDir = path.join(tmpDir, 'out-bad-ramp');

    await expect(
      loadTestCommand({
        source: irPath,
        output: outDir,
        format: 'k6',
        rampUp: 'invalid-format',
        json: true,
      }),
    ).rejects.toThrow(/ramp-up/i);
  });

  it('rejects invalid SLO format', async () => {
    const irPath = await writeIRFile(buildProductIR(), 'bad-slo.ir.json');
    const outDir = path.join(tmpDir, 'out-bad-slo');

    await expect(
      loadTestCommand({
        source: irPath,
        output: outDir,
        format: 'k6',
        slo: 'p95:500ms', // missing operator
        json: true,
      }),
    ).rejects.toThrow(/SLO/i);
  });

  it('emits profiler integration when --profile is set', async () => {
    const irPath = await writeIRFile(buildProductIR(), 'profile.ir.json');
    const outDir = path.join(tmpDir, 'out-profile');

    const result = await loadTestCommand({
      source: irPath,
      output: outDir,
      format: 'k6',
      profile: true,
      json: true,
    });

    expect(result.profilerIntegration).toBe(true);

    const fileEntries = Object.entries(result.files);
    const jsEntry = fileEntries.find(([p]) => p.endsWith('.js'))!;
    const content = jsEntry[1];
    expect(content).toContain('profile phase=action');
  });

  it('filters by command name', async () => {
    const irPath = await writeIRFile(buildProductIR(), 'filter.ir.json');
    const outDir = path.join(tmpDir, 'out-filter');

    const result = await loadTestCommand({
      source: irPath,
      output: outDir,
      format: 'k6',
      command: ['createProduct'],
      json: true,
    });

    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]).toBe('Product.createProduct');
  });

  it('rejects unknown command filter', async () => {
    const irPath = await writeIRFile(buildProductIR(), 'unknown.ir.json');
    const outDir = path.join(tmpDir, 'out-unknown');

    await expect(
      loadTestCommand({
        source: irPath,
        output: outDir,
        format: 'k6',
        command: ['nonexistent'],
        json: true,
      }),
    ).rejects.toThrow(/No matching commands/);
  });

  it('writes files to disk by default (not JSON mode)', async () => {
    const irPath = await writeIRFile(buildProductIR(), 'disk.ir.json');
    const outDir = path.join(tmpDir, 'out-disk');

    // Suppress console output during this test
    const originalLog = console.log;
    console.log = () => {};

    try {
      await loadTestCommand({
        source: irPath,
        output: outDir,
        format: 'k6',
      });

      const stat = await fs.stat(outDir);
      expect(stat.isDirectory()).toBe(true);
      const files = await fs.readdir(outDir);
      expect(files.length).toBeGreaterThan(0);
    } finally {
      console.log = originalLog;
    }
  });
});
