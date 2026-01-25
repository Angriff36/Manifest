import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { compileToIR } from '../ir-compiler';
import { RuntimeEngine, RuntimeOptions, CommandResult, EntityInstance } from '../runtime-engine';
import type { IR } from '../ir';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURES_DIR = join(__dirname, 'fixtures');
const EXPECTED_DIR = join(__dirname, 'expected');

const DETERMINISTIC_TIMESTAMP = 1000000000000;
let idCounter = 0;

function createDeterministicOptions(): RuntimeOptions {
  idCounter = 0;
  return {
    generateId: () => `test-id-${++idCounter}`,
    now: () => DETERMINISTIC_TIMESTAMP,
  };
}

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf-8');
}

function loadExpectedIR(name: string): IR {
  const irPath = join(EXPECTED_DIR, name.replace('.manifest', '.ir.json'));
  return JSON.parse(readFileSync(irPath, 'utf-8'));
}

interface CommandTestCase {
  name: string;
  context?: { user?: { id: string; role?: string } };
  setup?: {
    createInstance?: {
      entity: string;
      data: Record<string, unknown>;
    };
  };
  command: {
    name: string;
    entityName?: string;
    instanceId?: string;
    input: Record<string, unknown>;
  };
  expectedResult: {
    success: boolean;
    result?: unknown;
    error?: string;
    deniedBy?: string;
    emittedEvents: Array<{
      name: string;
      channel: string;
      payload: unknown;
      timestamp: number;
    }>;
  };
  expectedInstanceState?: Record<string, unknown>;
}

interface ComputedTestCase {
  name: string;
  setup: {
    createInstance: {
      entity: string;
      data: Record<string, unknown>;
    };
  };
  computedProperty: {
    entity: string;
    instanceId: string;
    property: string;
  };
  expectedValue: unknown;
}

interface CreateTestCase {
  name: string;
  setup?: Record<string, unknown>;
  createInstance: {
    entity: string;
    data: Record<string, unknown>;
  };
  expectedInstance: Record<string, unknown>;
}

interface PersistenceTestCase {
  name: string;
  persistenceTest: {
    entity: string;
    createData: Record<string, unknown>;
    expectedAfterRestore: Record<string, unknown>;
  };
}

interface ResultsFile {
  testCases: Array<CommandTestCase | ComputedTestCase | CreateTestCase | PersistenceTestCase>;
}

function loadExpectedResults(name: string): ResultsFile | null {
  const resultsPath = join(EXPECTED_DIR, name.replace('.manifest', '.results.json'));
  try {
    return JSON.parse(readFileSync(resultsPath, 'utf-8'));
  } catch {
    return null;
  }
}

function normalizeIR(ir: IR): IR {
  return JSON.parse(JSON.stringify(ir));
}

function normalizeResult(result: CommandResult): Partial<CommandResult> {
  const normalized: Partial<CommandResult> = {
    success: result.success,
    emittedEvents: result.emittedEvents,
  };
  if (result.result !== undefined) normalized.result = result.result;
  if (result.error !== undefined) normalized.error = result.error;
  if (result.deniedBy !== undefined) normalized.deniedBy = result.deniedBy;
  return normalized;
}

describe('Manifest Conformance Tests', () => {
  const fixtures = readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.manifest')).sort();

  describe('IR Compilation', () => {
    fixtures.forEach(fixtureName => {
      it(`compiles ${fixtureName} to expected IR`, () => {
        const source = loadFixture(fixtureName);
        const { ir, diagnostics } = compileToIR(source);

        expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
        expect(ir).not.toBeNull();

        const expectedIR = loadExpectedIR(fixtureName);
        const normalizedActual = normalizeIR(ir!);
        const normalizedExpected = normalizeIR(expectedIR);

        expect(normalizedActual).toEqual(normalizedExpected);
      });
    });
  });

  describe('Runtime Behavior', () => {
    fixtures.forEach(fixtureName => {
      const results = loadExpectedResults(fixtureName);
      if (!results) return;

      describe(fixtureName, () => {
        results.testCases.forEach((testCase) => {
          if ('command' in testCase) {
            const tc = testCase as CommandTestCase;
            it(tc.name, async () => {
              const source = loadFixture(fixtureName);
              const { ir } = compileToIR(source);
              expect(ir).not.toBeNull();

              const context = tc.context || {};
              const engine = new RuntimeEngine(ir!, context, createDeterministicOptions());

              if (tc.setup?.createInstance) {
                engine.createInstance(
                  tc.setup.createInstance.entity,
                  tc.setup.createInstance.data as EntityInstance
                );
              }

              const result = await engine.runCommand(
                tc.command.name,
                tc.command.input,
                {
                  entityName: tc.command.entityName,
                  instanceId: tc.command.instanceId,
                }
              );

              const normalizedResult = normalizeResult(result);
              expect(normalizedResult.success).toBe(tc.expectedResult.success);

              if (tc.expectedResult.error) {
                expect(normalizedResult.error).toBe(tc.expectedResult.error);
              }

              if (tc.expectedResult.deniedBy) {
                expect(normalizedResult.deniedBy).toBe(tc.expectedResult.deniedBy);
              }

              if (tc.expectedResult.result !== undefined) {
                expect(normalizedResult.result).toBe(tc.expectedResult.result);
              }

              expect(normalizedResult.emittedEvents?.length).toBe(tc.expectedResult.emittedEvents.length);

              tc.expectedResult.emittedEvents.forEach((expectedEvent, i) => {
                const actualEvent = normalizedResult.emittedEvents![i];
                expect(actualEvent.name).toBe(expectedEvent.name);
                expect(actualEvent.channel).toBe(expectedEvent.channel);
                expect(actualEvent.timestamp).toBe(expectedEvent.timestamp);
              });

              if (tc.expectedInstanceState && tc.command.entityName && tc.command.instanceId) {
                const instance = engine.getInstance(tc.command.entityName, tc.command.instanceId);
                expect(instance).toEqual(tc.expectedInstanceState);
              }
            });
          }

          if ('computedProperty' in testCase) {
            const tc = testCase as ComputedTestCase;
            it(tc.name, () => {
              const source = loadFixture(fixtureName);
              const { ir } = compileToIR(source);
              expect(ir).not.toBeNull();

              const engine = new RuntimeEngine(ir!, {}, createDeterministicOptions());

              engine.createInstance(
                tc.setup.createInstance.entity,
                tc.setup.createInstance.data as EntityInstance
              );

              const value = engine.evaluateComputed(
                tc.computedProperty.entity,
                tc.computedProperty.instanceId,
                tc.computedProperty.property
              );

              expect(value).toBe(tc.expectedValue);
            });
          }

          if ('createInstance' in testCase && !('command' in testCase) && !('computedProperty' in testCase) && !('persistenceTest' in testCase)) {
            const tc = testCase as CreateTestCase;
            it(tc.name, () => {
              const source = loadFixture(fixtureName);
              const { ir } = compileToIR(source);
              expect(ir).not.toBeNull();

              const engine = new RuntimeEngine(ir!, {}, createDeterministicOptions());

              const instance = engine.createInstance(
                tc.createInstance.entity,
                tc.createInstance.data as EntityInstance
              );

              expect(instance).toEqual(tc.expectedInstance);
            });
          }

          if ('persistenceTest' in testCase) {
            const tc = testCase as PersistenceTestCase;
            it(tc.name, () => {
              const source = loadFixture(fixtureName);
              const { ir } = compileToIR(source);
              expect(ir).not.toBeNull();

              const engine1 = new RuntimeEngine(ir!, {}, createDeterministicOptions());
              engine1.createInstance(
                tc.persistenceTest.entity,
                tc.persistenceTest.createData as EntityInstance
              );

              const serialized = engine1.serialize();

              const engine2 = new RuntimeEngine(ir!, {}, createDeterministicOptions());
              engine2.restore({ stores: serialized.stores });

              const restored = engine2.getInstance(
                tc.persistenceTest.entity,
                tc.persistenceTest.createData.id as string
              );

              expect(restored).toEqual(tc.persistenceTest.expectedAfterRestore);
            });
          }
        });
      });
    });
  });

  describe('Denial Reason Stability', () => {
    it('guard denial message is stable', async () => {
      const source = loadFixture('05-guard-denial.manifest');
      const { ir } = compileToIR(source);
      const engine = new RuntimeEngine(ir!, {}, createDeterministicOptions());

      engine.createInstance('Task', { id: 'task-1', title: 'Test', completed: true } as EntityInstance);

      const result = await engine.runCommand('complete', {}, {
        entityName: 'Task',
        instanceId: 'task-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Guard condition failed for command 'complete'");
    });

    it('policy denial message is stable', async () => {
      const source = loadFixture('06-policy-denial.manifest');
      const { ir } = compileToIR(source);
      const engine = new RuntimeEngine(ir!, { user: { id: 'user-1', role: 'user' } }, createDeterministicOptions());

      engine.createInstance('Document', { id: 'doc-1', title: 'Test' } as EntityInstance);

      const result = await engine.runCommand('makePublic', {}, {
        entityName: 'Document',
        instanceId: 'doc-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Only administrators can execute commands');
      expect(result.deniedBy).toBe('adminOnly');
    });
  });

  describe('Determinism', () => {
    it('produces identical IR across multiple compilations', () => {
      const source = loadFixture('04-command-mutate-emit.manifest');

      const result1 = compileToIR(source);
      const result2 = compileToIR(source);
      const result3 = compileToIR(source);

      expect(normalizeIR(result1.ir!)).toEqual(normalizeIR(result2.ir!));
      expect(normalizeIR(result2.ir!)).toEqual(normalizeIR(result3.ir!));
    });

    it('uses deterministic timestamps when options provided', async () => {
      const source = loadFixture('04-command-mutate-emit.manifest');
      const { ir } = compileToIR(source);
      const engine = new RuntimeEngine(ir!, {}, createDeterministicOptions());

      engine.createInstance('Counter', { id: 'counter-1', value: 0 } as EntityInstance);

      const result = await engine.runCommand('increment', {}, {
        entityName: 'Counter',
        instanceId: 'counter-1',
      });

      expect(result.emittedEvents[0].timestamp).toBe(DETERMINISTIC_TIMESTAMP);
    });

    it('uses deterministic IDs when options provided', () => {
      const source = loadFixture('01-entity-properties.manifest');
      const { ir } = compileToIR(source);
      const engine = new RuntimeEngine(ir!, {}, createDeterministicOptions());

      const instance1 = engine.createInstance('Product', { name: 'Product 1' } as EntityInstance);
      const instance2 = engine.createInstance('Product', { name: 'Product 2' } as EntityInstance);

      expect(instance1?.id).toBe('test-id-1');
      expect(instance2?.id).toBe('test-id-2');
    });
  });
});
