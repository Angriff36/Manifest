import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { coverageCommand } from './coverage';

async function tempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeFile(p: string, content: string) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, 'utf-8');
}

/** Minimal IR with one entity, one command, one guard, one policy, one constraint. */
function makeIR(overrides: Record<string, unknown> = {}) {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'test',
      irHash: 'test',
      compilerVersion: '1.0.0',
      schemaVersion: '1.0',
      compiledAt: '2024-01-01T00:00:00.000Z',
    },
    modules: [],
    values: [],
    entities: [
      {
        name: 'Task',
        properties: [
          { name: 'id', type: { name: 'string', nullable: false }, modifiers: [] },
          { name: 'completed', type: { name: 'boolean', nullable: false }, modifiers: [] },
          { name: 'priority', type: { name: 'number', nullable: false }, modifiers: [] },
        ],
        computedProperties: [],
        relationships: [],
        commands: ['complete', 'setPriority'],
        constraints: [
          {
            name: 'validPriority',
            code: 'validPriority',
            expression: { kind: 'literal', value: { kind: 'boolean', value: true } },
            severity: 'block',
            message: 'Priority must be valid',
          },
        ],
        policies: ['adminOnly'],
      },
    ],
    enums: [],
    stores: [],
    events: [],
    commands: [
      {
        name: 'complete',
        entity: 'Task',
        parameters: [],
        guards: [
          {
            kind: 'unary',
            operator: 'not',
            operand: { kind: 'member', object: { kind: 'identifier', name: 'self' }, property: 'completed' },
          },
        ],
        constraints: [],
        actions: [
          { kind: 'mutate', target: 'completed', expression: { kind: 'literal', value: { kind: 'boolean', value: true } } },
        ],
        emits: ['TaskCompleted'],
      },
      {
        name: 'setPriority',
        entity: 'Task',
        parameters: [{ name: 'level', type: { name: 'number', nullable: false }, required: true }],
        guards: [],
        constraints: [
          {
            name: 'levelRange',
            code: 'levelRange',
            expression: { kind: 'literal', value: { kind: 'boolean', value: true } },
            severity: 'warn',
            message: 'Level should be 1-5',
          },
        ],
        actions: [
          { kind: 'mutate', target: 'priority', expression: { kind: 'identifier', name: 'level' } },
        ],
        emits: [],
      },
    ],
    policies: [
      {
        name: 'adminOnly',
        action: 'execute',
        expression: {
          kind: 'binary',
          operator: '==',
          left: { kind: 'member', object: { kind: 'identifier', name: 'user' }, property: 'role' },
          right: { kind: 'literal', value: { kind: 'string', value: 'admin' } },
        },
        message: 'Admin only',
      },
    ],
    ...overrides,
  };
}

describe('manifest coverage', () => {
  it('reports 0% coverage when no test evidence exists', async () => {
    const dir = await tempDir('manifest-coverage-empty-');
    const irPath = path.join(dir, 'test.ir.json');
    await writeFile(irPath, JSON.stringify(makeIR()));

    const result = await coverageCommand({ ir: irPath, root: dir, format: 'json' });

    expect(result.overall.total).toBeGreaterThan(0);
    expect(result.overall.covered).toBe(0);
    expect(result.overall.percentage).toBe(0);
    expect(result.uncoveredPaths.length).toBe(result.overall.total);
  });

  it('marks commands covered when referenced in test files', async () => {
    const dir = await tempDir('manifest-coverage-test-ref-');
    const irPath = path.join(dir, 'test.ir.json');
    await writeFile(irPath, JSON.stringify(makeIR()));

    // Write a test file that references the command IDs
    await writeFile(
      path.join(dir, 'tests', 'task.test.ts'),
      `describe('Task.complete', () => { it('works', () => {}); });\n` +
      `describe('Task.setPriority', () => { it('works', () => {}); });\n`
    );

    const result = await coverageCommand({ ir: irPath, root: dir, format: 'json' });

    const commandCat = result.categories.find((c) => c.name === 'command')!;
    expect(commandCat.summary.covered).toBe(2);
    expect(commandCat.summary.percentage).toBe(100);
  });

  it('marks guards covered from conformance results with guard failures', async () => {
    const dir = await tempDir('manifest-coverage-guard-');
    const irPath = path.join(dir, 'test.ir.json');
    await writeFile(irPath, JSON.stringify(makeIR()));

    // Write a conformance results file that exercises the guard
    const results = {
      testCases: [
        {
          name: 'complete fails on completed task',
          command: {
            name: 'complete',
            entityName: 'Task',
            instanceId: 'task-1',
            input: {},
          },
          expectedResult: { success: false, error: 'Guard failed', emittedEvents: [] },
          expectedGuardFailure: { index: 0, expression: 'not self.completed' },
        },
      ],
    };
    await writeFile(
      path.join(dir, 'conformance', 'expected', '01-test.results.json'),
      JSON.stringify(results)
    );

    const result = await coverageCommand({ ir: irPath, root: dir, format: 'json' });

    const guardCat = result.categories.find((c) => c.name === 'guard')!;
    expect(guardCat.summary.covered).toBe(1);
    expect(guardCat.summary.total).toBe(1);
  });

  it('marks policies covered from conformance results with policy denials', async () => {
    const dir = await tempDir('manifest-coverage-policy-');
    const irPath = path.join(dir, 'test.ir.json');
    await writeFile(irPath, JSON.stringify(makeIR()));

    const results = {
      testCases: [
        {
          name: 'non-admin denied',
          command: {
            name: 'complete',
            entityName: 'Task',
            instanceId: 'task-1',
            input: {},
          },
          expectedResult: {
            success: false,
            error: 'Admin only',
            deniedBy: 'adminOnly',
            emittedEvents: [],
          },
          expectedPolicyDenial: { policyName: 'adminOnly', expression: 'user.role == "admin"' },
        },
      ],
    };
    await writeFile(
      path.join(dir, 'conformance', 'expected', '01-policy.results.json'),
      JSON.stringify(results)
    );

    const result = await coverageCommand({ ir: irPath, root: dir, format: 'json' });

    const policyCat = result.categories.find((c) => c.name === 'policy')!;
    expect(policyCat.summary.covered).toBe(1);
    expect(policyCat.summary.total).toBe(1);
  });

  it('marks constraints covered when constraint name appears in test corpus', async () => {
    const dir = await tempDir('manifest-coverage-constraint-');
    const irPath = path.join(dir, 'test.ir.json');
    await writeFile(irPath, JSON.stringify(makeIR()));

    // Test file that references constraint codes
    await writeFile(
      path.join(dir, 'tests', 'constraints.test.ts'),
      `it('validates validPriority constraint', () => {});\nit('checks levelRange', () => {});\n`
    );

    const result = await coverageCommand({ ir: irPath, root: dir, format: 'json' });

    const constraintCat = result.categories.find((c) => c.name === 'constraint')!;
    expect(constraintCat.summary.covered).toBe(2);
    expect(constraintCat.summary.total).toBe(2);
  });

  it('computes correct overall percentage across categories', async () => {
    const dir = await tempDir('manifest-coverage-overall-');
    const irPath = path.join(dir, 'test.ir.json');
    await writeFile(irPath, JSON.stringify(makeIR()));

    // Cover only commands — 2 out of 6 total paths
    // (2 commands + 1 guard + 1 policy + 2 constraints = 6)
    await writeFile(
      path.join(dir, 'tests', 'partial.test.ts'),
      `describe('Task.complete', () => {});\ndescribe('Task.setPriority', () => {});\n`
    );

    const result = await coverageCommand({ ir: irPath, root: dir, format: 'json' });

    expect(result.overall.total).toBe(6);
    expect(result.overall.covered).toBe(2);
    expect(result.overall.percentage).toBeCloseTo(33.33, 1);
  });

  it('reports 100% when all paths are covered', async () => {
    const dir = await tempDir('manifest-coverage-full-');

    // Simple IR with just one command, no guards/policies/constraints
    const simpleIR = makeIR({
      commands: [
        {
          name: 'doIt',
          entity: 'Task',
          parameters: [],
          guards: [],
          constraints: [],
          actions: [],
          emits: [],
        },
      ],
      policies: [],
      entities: [
        {
          name: 'Task',
          properties: [],
          computedProperties: [],
          relationships: [],
          commands: ['doIt'],
          constraints: [],
          policies: [],
        },
      ],
    });
    const irPath = path.join(dir, 'test.ir.json');
    await writeFile(irPath, JSON.stringify(simpleIR));

    await writeFile(
      path.join(dir, 'tests', 'all.test.ts'),
      `describe('Task.doIt', () => {});\n`
    );

    const result = await coverageCommand({ ir: irPath, root: dir, format: 'json' });

    expect(result.overall.percentage).toBe(100);
    expect(result.uncoveredPaths.length).toBe(0);
  });

  it('handles IR with no commands gracefully', async () => {
    const dir = await tempDir('manifest-coverage-no-cmd-');
    const emptyIR = makeIR({
      commands: [],
      policies: [],
      entities: [
        {
          name: 'Empty',
          properties: [],
          computedProperties: [],
          relationships: [],
          commands: [],
          constraints: [],
          policies: [],
        },
      ],
    });
    const irPath = path.join(dir, 'test.ir.json');
    await writeFile(irPath, JSON.stringify(emptyIR));

    const result = await coverageCommand({ ir: irPath, root: dir, format: 'json' });

    expect(result.overall.total).toBe(0);
    expect(result.overall.percentage).toBe(100);
  });

  it('throws when no IR file is found and no source is given', async () => {
    const dir = await tempDir('manifest-coverage-no-ir-');

    await expect(
      coverageCommand({ root: dir })
    ).rejects.toThrow(/No IR file found/);
  });

  it('returns structured JSON output', async () => {
    const dir = await tempDir('manifest-coverage-json-');
    const irPath = path.join(dir, 'test.ir.json');
    await writeFile(irPath, JSON.stringify(makeIR()));

    const result = await coverageCommand({ ir: irPath, root: dir, format: 'json' });

    // Verify structure
    expect(result).toHaveProperty('overall');
    expect(result).toHaveProperty('categories');
    expect(result).toHaveProperty('uncoveredPaths');
    expect(result.overall).toHaveProperty('total');
    expect(result.overall).toHaveProperty('covered');
    expect(result.overall).toHaveProperty('uncovered');
    expect(result.overall).toHaveProperty('percentage');
    expect(result.categories).toHaveLength(4);
    expect(result.categories.map((c) => c.name)).toEqual([
      'command',
      'guard',
      'policy',
      'constraint',
    ]);
  });

  it('uncoveredPaths only contains non-covered items', async () => {
    const dir = await tempDir('manifest-coverage-uncovered-');
    const irPath = path.join(dir, 'test.ir.json');
    await writeFile(irPath, JSON.stringify(makeIR()));

    // Cover just the commands
    await writeFile(
      path.join(dir, 'tests', 'partial.test.ts'),
      `describe('Task.complete', () => {});\ndescribe('Task.setPriority', () => {});\n`
    );

    const result = await coverageCommand({ ir: irPath, root: dir, format: 'json' });

    for (const p of result.uncoveredPaths) {
      expect(p.covered).toBe(false);
      expect(p.category).not.toBe('command');
    }
  });
});
