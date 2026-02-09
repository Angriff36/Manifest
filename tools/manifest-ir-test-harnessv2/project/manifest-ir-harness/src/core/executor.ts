import type { IR, RuntimeEngine } from '../adapters/manifest-core.js';
import type {
  TestScript,
  ExecutionResult,
  ExecutionStep,
  StepResult,
  AssertionDetail,
  ExecuteScriptOptions,
} from '../types/index.js';

const HARNESS_VERSION = '1.0.0';

function runAssertions(
  command: TestScript['commands'][number],
  result: StepResult
): { passed: number; failed: number; details: AssertionDetail[] } {
  const details: AssertionDetail[] = [];

  details.push({
    check: 'success',
    expected: command.expect.success,
    actual: result.success,
    passed: command.expect.success === result.success,
  });

  if (command.expect.error && !result.success) {
    if (command.expect.error.type) {
      const actualType = result.guardFailures?.length
        ? 'guard'
        : result.error?.includes('policy')
          ? 'policy'
          : result.error?.includes('constraint')
            ? 'constraint'
            : 'unknown';

      details.push({
        check: 'error.type',
        expected: command.expect.error.type,
        actual: actualType,
        passed: command.expect.error.type === actualType,
      });
    }

    if (command.expect.error.guardIndex !== undefined && result.guardFailures) {
      const actualIndex = result.guardFailures[0]?.guardIndex;
      details.push({
        check: 'error.guardIndex',
        expected: command.expect.error.guardIndex,
        actual: actualIndex,
        passed: command.expect.error.guardIndex === actualIndex,
      });
    }

    if (command.expect.error.message) {
      const actualError = result.error ?? '';
      const matches = actualError.includes(command.expect.error.message);
      details.push({
        check: 'error.message',
        expected: command.expect.error.message,
        actual: actualError,
        passed: matches,
      });
    }
  }

  if (command.expect.stateAfter && result.entityStateAfter) {
    for (const [key, expectedValue] of Object.entries(command.expect.stateAfter)) {
      const actualValue = result.entityStateAfter[key];
      const passed = JSON.stringify(actualValue) === JSON.stringify(expectedValue);
      details.push({
        check: `stateAfter.${key}`,
        expected: expectedValue,
        actual: actualValue,
        passed,
      });
    }
  }

  if (command.expect.emittedEvents && result.emittedEvents) {
    const actualNames = result.emittedEvents.map(e => e.name);
    const passed = JSON.stringify(actualNames) === JSON.stringify(command.expect.emittedEvents);
    details.push({
      check: 'emittedEvents',
      expected: command.expect.emittedEvents,
      actual: actualNames,
      passed,
    });
  }

  if (command.expect.constraintWarnings && result.constraintWarnings) {
    const passed =
      JSON.stringify(result.constraintWarnings) ===
      JSON.stringify(command.expect.constraintWarnings);
    details.push({
      check: 'constraintWarnings',
      expected: command.expect.constraintWarnings,
      actual: result.constraintWarnings,
      passed,
    });
  }

  const passedCount = details.filter(d => d.passed).length;
  const failedCount = details.filter(d => !d.passed).length;

  return { passed: passedCount, failed: failedCount, details };
}

export async function executeScript(options: ExecuteScriptOptions): Promise<ExecutionResult> {
  const {
    ir,
    script,
    sourcePath = 'unknown',
    sourceType = 'ir',
    scriptPath = 'unknown',
    irHash,
    executedAt = new Date().toISOString(),
  } = options;

  const runtime = createInMemoryRuntime(ir);
  const context = script.context ?? {};

  if (script.seedEntities) {
    for (const seed of script.seedEntities) {
      runtime.createInstance(seed.entity, seed.id, seed.properties);
    }
  }

  const steps: ExecutionStep[] = [];
  let totalPassed = 0;
  let totalFailed = 0;
  let totalAssertionsPassed = 0;
  let totalAssertionsFailed = 0;

  for (const cmd of script.commands) {
    const params = cmd.params ?? {};

    const commandResult = await runtime.executeCommand(
      cmd.entity,
      cmd.id,
      cmd.command,
      params,
      context
    );

    const stepResult: StepResult = {
      success: commandResult.success,
    };

    if (commandResult.success && commandResult.instance) {
      stepResult.entityStateAfter = commandResult.instance;
    }

    if (commandResult.emittedEvents && commandResult.emittedEvents.length > 0) {
      stepResult.emittedEvents = commandResult.emittedEvents;
    }

    if (!commandResult.success && commandResult.error) {
      stepResult.error = commandResult.error.message;

      if (commandResult.error.type === 'guard') {
        stepResult.guardFailures = [
          {
            guardIndex: commandResult.error.guardIndex ?? 0,
            expression: commandResult.error.expression ?? commandResult.error.message,
            resolvedValues: commandResult.error.resolvedValues ?? {},
            evaluatedTo: false,
          },
        ];
      }
    }

    const assertions = runAssertions(cmd, stepResult);

    if (commandResult.success) {
      totalPassed++;
    } else {
      totalFailed++;
    }

    totalAssertionsPassed += assertions.passed;
    totalAssertionsFailed += assertions.failed;

    steps.push({
      step: cmd.step,
      command: {
        entity: cmd.entity,
        id: cmd.id,
        name: cmd.command,
        params,
      },
      result: stepResult,
      assertions,
    });
  }

  return {
    harness: {
      version: HARNESS_VERSION,
      executedAt,
    },
    source: {
      type: sourceType,
      path: sourcePath,
      ...(irHash ? { irHash } : {}),
    },
    script: {
      path: scriptPath,
      description: script.description,
    },
    execution: {
      context,
      steps,
    },
    summary: {
      totalSteps: steps.length,
      passed: totalPassed,
      failed: totalFailed,
      assertionsPassed: totalAssertionsPassed,
      assertionsFailed: totalAssertionsFailed,
    },
  };
}

interface EntityInstance {
  entityName: string;
  id: string;
  properties: Record<string, unknown>;
}

function resolveExpression(expr: string, instance: EntityInstance): unknown {
  const selfPrefix = 'self.';
  if (expr.startsWith(selfPrefix)) {
    const prop = expr.slice(selfPrefix.length);
    return instance.properties[prop];
  }
  return undefined;
}

function evaluateGuard(guard: { expression: string }, instance: EntityInstance): {
  passed: boolean;
  resolvedValues: Record<string, unknown>;
} {
  const expr = guard.expression;
  const resolvedValues: Record<string, unknown> = {};

  const eqMatch = expr.match(/^self\.(\w+)\s*==\s*"(.+)"$/);
  if (eqMatch) {
    const prop = eqMatch[1]!;
    const expected = eqMatch[2]!;
    const actual = instance.properties[prop];
    resolvedValues[`self.${prop}`] = actual;
    return { passed: actual === expected, resolvedValues };
  }

  const lengthMatch = expr.match(/^self\.(\w+)\.length\s*>\s*(\d+)$/);
  if (lengthMatch) {
    const prop = lengthMatch[1]!;
    const threshold = parseInt(lengthMatch[2]!, 10);
    const arr = instance.properties[prop];
    const length = Array.isArray(arr) ? arr.length : 0;
    resolvedValues[`self.${prop}.length`] = length;
    return { passed: length > threshold, resolvedValues };
  }

  const propRef = expr.match(/^self\.(\w+)$/);
  if (propRef) {
    const val = resolveExpression(expr, instance);
    resolvedValues[expr] = val;
    return { passed: Boolean(val), resolvedValues };
  }

  return { passed: true, resolvedValues };
}

function applyMutation(
  mutation: { property: string; value: unknown; expression?: string },
  instance: EntityInstance
): void {
  if (mutation.expression) {
    const resolved = resolveExpression(mutation.expression, instance);
    instance.properties[mutation.property] = resolved;
  } else {
    instance.properties[mutation.property] = mutation.value;
  }
}

function createInMemoryRuntime(ir: IR): RuntimeEngine {
  const instances = new Map<string, EntityInstance>();

  return {
    async executeCommand(
      entityName: string,
      instanceId: string,
      commandName: string,
      params: Record<string, unknown>,
      _context?: Record<string, unknown>
    ) {
      const entityDef = ir.entities.find(e => e.name === entityName);
      if (!entityDef) {
        return {
          success: false,
          error: {
            type: 'unknown',
            message: `Entity "${entityName}" not found in IR`,
          },
        };
      }

      const key = `${entityName}:${instanceId}`;
      const instance = instances.get(key);
      if (!instance) {
        return {
          success: false,
          error: {
            type: 'unknown',
            message: `Instance "${instanceId}" of "${entityName}" not found`,
          },
        };
      }

      const commandDef = entityDef.commands?.find(c => c.name === commandName);
      if (!commandDef) {
        return {
          success: false,
          error: {
            type: 'unknown',
            message: `Command "${commandName}" not found on "${entityName}"`,
          },
        };
      }

      if (commandDef.guards) {
        for (let i = 0; i < commandDef.guards.length; i++) {
          const guard = commandDef.guards[i]!;
          const { passed, resolvedValues } = evaluateGuard(guard, instance);
          if (!passed) {
            return {
              success: false,
              error: {
                type: 'guard',
                message: guard.expression,
                guardIndex: i,
                expression: guard.expression,
                resolvedValues,
              },
            };
          }
        }
      }

      if (commandDef.mutations) {
        for (const mutation of commandDef.mutations) {
          applyMutation(mutation, instance);
        }
      }

      const emittedEvents: Array<{ name: string; data: unknown }> = [];
      if (commandDef.events) {
        for (const event of commandDef.events) {
          emittedEvents.push({
            name: event.name,
            data: { ...instance.properties, ...params },
          });
        }
      }

      return {
        success: true,
        instance: { ...instance.properties },
        emittedEvents,
      };
    },

    createInstance(
      entityName: string,
      id: string,
      properties: Record<string, unknown>
    ): Record<string, unknown> {
      const entityDef = ir.entities.find(e => e.name === entityName);
      const mergedProps: Record<string, unknown> = {};

      if (entityDef) {
        for (const prop of entityDef.properties) {
          if (prop.default !== undefined) {
            mergedProps[prop.name] = prop.default;
          }
        }
      }

      Object.assign(mergedProps, properties);

      const instance: EntityInstance = {
        entityName,
        id,
        properties: mergedProps,
      };

      instances.set(`${entityName}:${id}`, instance);
      return mergedProps;
    },
  };
}

export { createInMemoryRuntime };
