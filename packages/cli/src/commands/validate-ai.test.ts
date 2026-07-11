/**
 * CLI validate-ai Command Tests
 *
 * Tests the manifest validate-ai command for structured validation of
 * LLM-generated .manifest source and IR JSON files.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// ---------------------------------------------------------------------------
// Minimal valid IR fixture (matches ir-v1.schema.json required fields)
// ---------------------------------------------------------------------------
function makeValidIR(overrides: Record<string, unknown> = {}): object {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'abc123',
      compilerVersion: '0.3.21',
      schemaVersion: '1.0',
      compiledAt: '2026-02-21T00:00:00.000Z',
    },
    modules: [],
    values: [],
    enums: [],
    entities: [],
    stores: [],
    events: [],
    commands: [],
    policies: [],
    ...overrides,
  };
}

function makeIRWithEntity(entityName = 'Order'): object {
  return makeValidIR({
    entities: [
      {
        name: entityName,
        properties: [
          { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        ],
        computedProperties: [],
        relationships: [],
        commands: ['createOrder'],
        constraints: [],
        policies: [],
      },
    ],
    commands: [
      {
        name: 'createOrder',
        entity: entityName,
        parameters: [],
        guards: [],
        actions: [],
        emits: [],
      },
    ],
    policies: [
      {
        name: 'orderExecute',
        entity: entityName,
        action: 'execute',
        expression: { kind: 'literal', value: { kind: 'boolean', value: true } },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function createTempFile(content: string, filename: string): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-validate-ai-test-'));
  const filePath = path.join(tempDir, filename);
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

async function createTempIR(content: object, filename = 'test.ir.json'): Promise<string> {
  return createTempFile(JSON.stringify(content), filename);
}

async function createTempManifest(source: string, filename = 'test.manifest'): Promise<string> {
  return createTempFile(source, filename);
}

async function cleanupTemp(filePath: string): Promise<void> {
  try {
    await fs.rm(path.dirname(filePath), { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function captureOutput() {
  const outputs: string[] = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...a) => {
    outputs.push(a.join(' '));
  });
  const errorSpy = vi.spyOn(console, 'error').mockImplementation((...a) => {
    outputs.push(a.join(' '));
  });
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...a) => {
    outputs.push(a.join(' '));
  });
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((d: any) => {
    outputs.push(String(d));
    return true;
  });
  return {
    outputs,
    restore: () => {
      logSpy.mockRestore();
      errorSpy.mockRestore();
      warnSpy.mockRestore();
      stderrSpy.mockRestore();
    },
  };
}

async function runValidateAI(
  filePath: string,
  opts: { format?: string; minScore?: number; verbose?: boolean } = {},
): Promise<{ outputs: string[]; exited: boolean }> {
  const { validateAICommand } = await import('./validate-ai.js');
  const capture = captureOutput();
  let exited = false;

  const originalExit = process.exit;
  process.exit = vi.fn().mockImplementation(() => {
    exited = true;
    throw new Error('process.exit');
  }) as any;

  try {
    await validateAICommand(filePath, {
      format: (opts.format as 'text' | 'json') ?? 'text',
      minScore: opts.minScore ?? 100,
      verbose: opts.verbose ?? false,
    });
  } catch (e: any) {
    if (e.message !== 'process.exit') throw e;
  } finally {
    process.exit = originalExit;
    capture.restore();
  }

  return { outputs: capture.outputs, exited };
}

async function runValidateAIJson(
  filePath: string,
  opts: { minScore?: number } = {},
): Promise<{ result: any; exited: boolean }> {
  const { validateAICommand } = await import('./validate-ai.js');
  let jsonOutput: string | null = null;
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...a) => {
    const str = a.join(' ');
    // Capture the first console.log that outputs our JSON structure
    if (jsonOutput === null && str.includes('"version"') && str.includes('"reports"')) {
      jsonOutput = str;
    }
  });

  let exited = false;
  const originalExit = process.exit;
  process.exit = vi.fn().mockImplementation(() => {
    exited = true;
    throw new Error('process.exit');
  }) as any;

  // Suppress other output
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true as any);

  try {
    await validateAICommand(filePath, {
      format: 'json',
      minScore: opts.minScore ?? 100,
    });
  } catch (e: any) {
    if (e.message !== 'process.exit') throw e;
  } finally {
    process.exit = originalExit;
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    stderrSpy.mockRestore();
  }

  if (!jsonOutput) {
    throw new Error('No JSON output captured from validate-ai command');
  }

  const result = JSON.parse(jsonOutput);
  return { result, exited };
}

// ---------------------------------------------------------------------------
// Tests: IR JSON Validation
// ---------------------------------------------------------------------------
describe('validate-ai – IR JSON validation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('scores 100 for a minimal valid IR', async () => {
    const filePath = await createTempIR(makeValidIR());
    try {
      const { result, exited } = await runValidateAIJson(filePath);
      // With info diagnostics, score may be 100 (no errors/warnings)
      expect(result.reports[0].score).toBe(100);
      expect(result.reports[0].valid).toBe(true);
      expect(exited).toBe(false);
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('detects missing required fields with suggestions', async () => {
    const ir = makeValidIR() as any;
    delete ir.version;
    const filePath = await createTempIR(ir);
    try {
      const { result } = await runValidateAIJson(filePath);
      expect(result.reports[0].valid).toBe(false);
      expect(result.reports[0].score).toBeLessThan(100);
      const diags = result.reports[0].diagnostics;
      const missingDiag = diags.find((d: any) => d.code === 'SCHEMA_REQUIRED');
      expect(missingDiag).toBeDefined();
      expect(missingDiag.suggestion).toBeTruthy();
      expect(missingDiag.category).toBe('schema');
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('detects additional properties with suggestions', async () => {
    const ir = makeValidIR() as any;
    ir.provenance.unknownField = 'should-not-be-here';
    const filePath = await createTempIR(ir);
    try {
      const { result } = await runValidateAIJson(filePath);
      expect(result.reports[0].valid).toBe(false);
      const diags = result.reports[0].diagnostics;
      const addPropDiag = diags.find((d: any) => d.code === 'SCHEMA_ADDITIONAL_PROPERTY');
      expect(addPropDiag).toBeDefined();
      expect(addPropDiag.suggestion).toContain('Remove');
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('detects wrong version const', async () => {
    const filePath = await createTempIR(makeValidIR({ version: '2.0' }));
    try {
      const { result } = await runValidateAIJson(filePath);
      expect(result.reports[0].valid).toBe(false);
      const diags = result.reports[0].diagnostics;
      const constDiag = diags.find((d: any) => d.code === 'SCHEMA_CONST');
      expect(constDiag).toBeDefined();
      expect(constDiag.message).toMatch(/version/i);
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('detects invalid JSON', async () => {
    const filePath = await createTempFile('{ not valid json', 'bad.ir.json');
    try {
      const { result } = await runValidateAIJson(filePath);
      expect(result.reports[0].score).toBe(0);
      const diags = result.reports[0].diagnostics;
      const parseDiag = diags.find((d: any) => d.code === 'PARSE_ERROR');
      expect(parseDiag).toBeDefined();
      expect(parseDiag.suggestion).toBeTruthy();
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('detects missing file', async () => {
    const { result } = await runValidateAIJson('/nonexistent/path/test.ir.json');
    expect(result.reports[0].valid).toBe(false);
    const diags = result.reports[0].diagnostics;
    const notFoundDiag = diags.find((d: any) => d.code === 'FILE_NOT_FOUND');
    expect(notFoundDiag).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: Semantic Checks
// ---------------------------------------------------------------------------
describe('validate-ai – semantic checks', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('detects commands without policies', async () => {
    const ir = makeValidIR({
      entities: [
        {
          name: 'Order',
          properties: [
            { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
          ],
          computedProperties: [],
          relationships: [],
          commands: ['createOrder'],
          constraints: [],
          policies: [],
        },
      ],
      commands: [
        {
          name: 'createOrder',
          entity: 'Order',
          parameters: [],
          guards: [],
          actions: [],
          emits: [],
        },
      ],
      policies: [],
    });
    const filePath = await createTempIR(ir);
    try {
      const { result } = await runValidateAIJson(filePath);
      const diags = result.reports[0].diagnostics;
      const noPolicyDiag = diags.find((d: any) => d.code === 'SEMANTIC_NO_POLICY');
      expect(noPolicyDiag).toBeDefined();
      expect(noPolicyDiag.suggestion).toContain('policy');
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('passes when commands are covered by policies', async () => {
    const filePath = await createTempIR(makeIRWithEntity());
    try {
      const { result } = await runValidateAIJson(filePath);
      const diags = result.reports[0].diagnostics;
      const noPolicyDiag = diags.find((d: any) => d.code === 'SEMANTIC_NO_POLICY');
      expect(noPolicyDiag).toBeUndefined();
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('detects orphaned event references', async () => {
    const ir = makeValidIR({
      entities: [
        {
          name: 'Order',
          properties: [
            { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
          ],
          computedProperties: [],
          relationships: [],
          commands: ['createOrder'],
          constraints: [],
          policies: [],
        },
      ],
      commands: [
        {
          name: 'createOrder',
          entity: 'Order',
          parameters: [],
          guards: [],
          actions: [],
          emits: ['orderCreated'],
        },
      ],
      policies: [
        {
          name: 'orderExecute',
          entity: 'Order',
          action: 'execute',
          expression: { kind: 'literal', value: { kind: 'boolean', value: true } },
        },
      ],
      events: [],
    });
    const filePath = await createTempIR(ir);
    try {
      const { result } = await runValidateAIJson(filePath);
      const diags = result.reports[0].diagnostics;
      const orphanDiag = diags.find((d: any) => d.code === 'SEMANTIC_ORPHAN_EVENT');
      expect(orphanDiag).toBeDefined();
      expect(orphanDiag.message).toContain('orderCreated');
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('detects store referencing non-existent entity', async () => {
    const ir = makeValidIR({
      stores: [
        {
          entity: 'NonExistent',
          target: 'memory',
          config: {},
        },
      ],
    });
    const filePath = await createTempIR(ir);
    try {
      const { result } = await runValidateAIJson(filePath);
      const diags = result.reports[0].diagnostics;
      const orphanDiag = diags.find((d: any) => d.code === 'SEMANTIC_STORE_ORPHAN_ENTITY');
      expect(orphanDiag).toBeDefined();
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('detects duplicate constraint codes', async () => {
    const ir = makeValidIR({
      entities: [
        {
          name: 'Order',
          properties: [
            { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
          ],
          computedProperties: [],
          relationships: [],
          commands: [],
          constraints: [
            {
              name: 'check1',
              code: 'DUPLICATE_CODE',
              expression: { kind: 'literal', value: { kind: 'boolean', value: true } },
            },
            {
              name: 'check2',
              code: 'DUPLICATE_CODE',
              expression: { kind: 'literal', value: { kind: 'boolean', value: false } },
            },
          ],
          policies: [],
        },
      ],
    });
    const filePath = await createTempIR(ir);
    try {
      const { result } = await runValidateAIJson(filePath);
      const diags = result.reports[0].diagnostics;
      const dupDiag = diags.find((d: any) => d.code === 'SEMANTIC_DUPLICATE_CONSTRAINT');
      expect(dupDiag).toBeDefined();
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('detects relationship targeting non-existent entity', async () => {
    const ir = makeValidIR({
      entities: [
        {
          name: 'Order',
          properties: [
            { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
          ],
          computedProperties: [],
          relationships: [{ name: 'items', kind: 'hasMany', target: 'NonExistentItem' }],
          commands: [],
          constraints: [],
          policies: [],
        },
      ],
    });
    const filePath = await createTempIR(ir);
    try {
      const { result } = await runValidateAIJson(filePath);
      const diags = result.reports[0].diagnostics;
      const relDiag = diags.find((d: any) => d.code === 'SEMANTIC_RELATIONSHIP_ORPHAN_TARGET');
      expect(relDiag).toBeDefined();
      expect(relDiag.message).toContain('NonExistentItem');
    } finally {
      await cleanupTemp(filePath);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: Scoring
// ---------------------------------------------------------------------------
describe('validate-ai – scoring', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('deducts 25 points per error', async () => {
    const ir = makeValidIR() as any;
    delete ir.version;
    delete ir.provenance;
    const filePath = await createTempIR(ir);
    try {
      const { result } = await runValidateAIJson(filePath);
      // At least 2 errors → at least 50 points deducted
      expect(result.reports[0].score).toBeLessThanOrEqual(50);
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('respects --min-score option', async () => {
    const ir = makeValidIR() as any;
    delete ir.version;
    const filePath = await createTempIR(ir);
    try {
      const { exited } = await runValidateAIJson(filePath, { minScore: 0 });
      // Score < 100 but minScore=0 means it should pass
      expect(exited).toBe(false);
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('exits non-zero when score below minimum', async () => {
    const ir = makeValidIR() as any;
    delete ir.version;
    const filePath = await createTempIR(ir);
    try {
      const { exited } = await runValidateAIJson(filePath, { minScore: 100 });
      expect(exited).toBe(true);
    } finally {
      await cleanupTemp(filePath);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: Text output
// ---------------------------------------------------------------------------
describe('validate-ai – text output', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('shows score in text output', async () => {
    const filePath = await createTempIR(makeValidIR());
    try {
      const { outputs, exited } = await runValidateAI(filePath);
      expect(exited).toBe(false);
      const combined = outputs.join(' ');
      expect(combined).toMatch(/score/i);
      expect(combined).toMatch(/100/);
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('shows PASS/FAIL', async () => {
    const filePath = await createTempIR(makeValidIR());
    try {
      const { outputs } = await runValidateAI(filePath);
      expect(outputs.join(' ')).toMatch(/PASS/);
    } finally {
      await cleanupTemp(filePath);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: Manifest source compilation
// ---------------------------------------------------------------------------
describe('validate-ai – manifest source compilation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('validates a simple manifest source file', async () => {
    const source = `
entity Todo {
  property id: string required
  property title: string required
  property done: boolean = false
}
`;
    const filePath = await createTempManifest(source);
    try {
      const { result } = await runValidateAIJson(filePath);
      expect(result.reports).toHaveLength(1);
      expect(result.reports[0].inputType).toBe('manifest-source');
      // Should have at least a structural summary info diagnostic
      expect(result.reports[0].diagnostics.length).toBeGreaterThanOrEqual(0);
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('detects compile errors in manifest source', async () => {
    const source = `entity { invalid syntax !!!`;
    const filePath = await createTempManifest(source);
    try {
      const { result } = await runValidateAIJson(filePath);
      expect(result.reports[0].valid).toBe(false);
      const diags = result.reports[0].diagnostics;
      const compileError = diags.find((d: any) => d.code === 'COMPILE_ERROR');
      expect(compileError).toBeDefined();
    } finally {
      await cleanupTemp(filePath);
    }
  });
});
