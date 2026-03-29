/**
 * manifest harness command
 *
 * Runs a JSON harness script against a compiled .manifest IR using RuntimeEngine.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { compileToIR } from '@angriff36/manifest/ir-compiler';
import { RuntimeEngine, type CommandResult } from '@angriff36/manifest';

type OutputFormat = 'text' | 'json';

interface HarnessCommandOptions {
  script: string;
  format?: OutputFormat;
}

interface SeedEntity {
  entity: string;
  id: string;
  properties: Record<string, unknown>;
}

interface ExpectedError {
  type?: 'guard' | 'policy' | 'error';
  guardIndex?: number;
}

interface StepExpectation {
  success?: boolean;
  error?: ExpectedError;
  stateAfter?: Record<string, unknown>;
  emittedEvents?: string[];
}

interface ScriptStep {
  step?: number;
  entity: string;
  id: string;
  command: string;
  params?: Record<string, unknown>;
  expect?: StepExpectation;
}

interface HarnessScript {
  description: string;
  context?: Record<string, unknown>;
  seedEntities?: SeedEntity[];
  commands: ScriptStep[];
}

interface AssertionDetail {
  check: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
}

interface StepOutput {
  step: number;
  command: {
    entity: string;
    id: string;
    name: string;
    params: Record<string, unknown>;
  };
  result: {
    success: boolean;
    errorType: 'guard' | 'policy' | 'error' | null;
    errorMessage: string | null;
    guardIndex: number | null;
    emittedEvents: string[];
    entityStateAfter: Record<string, unknown> | null;
  };
  assertions: {
    passed: number;
    failed: number;
    details: AssertionDetail[];
  };
}

interface HarnessRunOutput {
  description: string;
  manifestPath: string;
  scriptPath: string;
  execution: {
    steps: StepOutput[];
  };
  summary: {
    totalSteps: number;
    passedSteps: number;
    failedSteps: number;
    assertionsPassed: number;
    assertionsFailed: number;
  };
}

function assertScriptShape(script: unknown): asserts script is HarnessScript {
  if (!script || typeof script !== 'object') {
    throw new Error('Harness script must be a JSON object');
  }

  const candidate = script as Partial<HarnessScript>;
  if (!candidate.description) {
    throw new Error('Harness script requires "description"');
  }
  if (!Array.isArray(candidate.commands) || candidate.commands.length === 0) {
    throw new Error('Harness script requires a non-empty "commands" array');
  }

  for (let i = 0; i < candidate.commands.length; i++) {
    const cmd = candidate.commands[i] as Partial<ScriptStep>;
    if (!cmd.entity || !cmd.id || !cmd.command) {
      throw new Error(`commands[${i}] requires entity, id, and command`);
    }
  }
}

function decodeIRValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }

  const node = value as { kind?: string; value?: unknown; elements?: unknown[]; properties?: Record<string, unknown> };
  if (node.kind === 'string' || node.kind === 'number' || node.kind === 'boolean') {
    return node.value;
  }
  if (node.kind === 'null') {
    return null;
  }
  if (node.kind === 'array') {
    return (node.elements || []).map((entry) => decodeIRValue(entry));
  }
  if (node.kind === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(node.properties || {})) {
      out[key] = decodeIRValue(raw);
    }
    return out;
  }
  return value;
}

function defaultForType(typeName: string): unknown {
  switch (typeName) {
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'list':
      return [];
    case 'map':
      return {};
    default:
      return '';
  }
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return value as Record<string, unknown>;
}

function pushAssertion(
  details: AssertionDetail[],
  check: string,
  expected: unknown,
  actual: unknown
): void {
  const passed = JSON.stringify(expected) === JSON.stringify(actual);
  details.push({ check, expected, actual, passed });
}

async function buildFallbackEntity(
  ir: { entities?: Array<{ name: string; properties?: Array<{ name: string; type?: { name?: string } | string; defaultValue?: unknown }> }> },
  entityName: string,
  id: string
): Promise<Record<string, unknown>> {
  const entity = (ir.entities || []).find((candidate) => candidate.name === entityName);
  const defaults: Record<string, unknown> = { id };
  if (!entity) {
    return defaults;
  }

  for (const prop of entity.properties || []) {
    if (prop.name === 'id') {
      continue;
    }

    if (prop.defaultValue !== undefined) {
      defaults[prop.name] = decodeIRValue(prop.defaultValue);
      continue;
    }

    const typeName = typeof prop.type === 'object' ? prop.type?.name || 'string' : String(prop.type || 'string');
    defaults[prop.name] = defaultForType(typeName);
  }

  return defaults;
}

function summarize(steps: StepOutput[]): HarnessRunOutput['summary'] {
  const passedSteps = steps.filter((step) => step.assertions.failed === 0).length;
  return {
    totalSteps: steps.length,
    passedSteps,
    failedSteps: steps.length - passedSteps,
    assertionsPassed: steps.reduce((acc, step) => acc + step.assertions.passed, 0),
    assertionsFailed: steps.reduce((acc, step) => acc + step.assertions.failed, 0),
  };
}

function printTextSummary(output: HarnessRunOutput): void {
  console.log(chalk.bold(`Harness: ${output.description}`));
  console.log(`Manifest: ${output.manifestPath}`);
  console.log(`Script:   ${output.scriptPath}`);
  console.log('');

  for (const step of output.execution.steps) {
    const stepPassed = step.assertions.failed === 0;
    const marker = stepPassed ? chalk.green('✓') : chalk.red('✗');
    console.log(`${marker} Step ${step.step} ${step.command.entity}.${step.command.name} (${step.assertions.passed}/${step.assertions.passed + step.assertions.failed} assertions)`);

    if (!stepPassed) {
      for (const detail of step.assertions.details.filter((item) => !item.passed)) {
        console.log(chalk.red(`    - ${detail.check}: expected ${JSON.stringify(detail.expected)}, got ${JSON.stringify(detail.actual)}`));
      }
    }
  }

  console.log('');
  const s = output.summary;
  console.log(chalk.bold('Summary'));
  console.log(`  Steps: ${s.totalSteps} total | ${s.passedSteps} passed | ${s.failedSteps} failed`);
  console.log(`  Assertions: ${s.assertionsPassed} passed | ${s.assertionsFailed} failed`);
}

export async function harnessCommand(manifest: string, options: HarnessCommandOptions): Promise<void> {
  const spinner = ora('Running harness script').start();

  try {
    const manifestPath = path.resolve(process.cwd(), manifest);
    const scriptPath = path.resolve(process.cwd(), options.script);
    const format: OutputFormat = options.format === 'json' ? 'json' : 'text';

    const [manifestSource, scriptSource] = await Promise.all([
      fs.readFile(manifestPath, 'utf-8'),
      fs.readFile(scriptPath, 'utf-8'),
    ]);

    const parsedScript = JSON.parse(scriptSource);
    assertScriptShape(parsedScript);

    const { ir, diagnostics } = await compileToIR(manifestSource);
    const compileErrors = (diagnostics || []).filter((d: { severity?: string }) => d.severity === 'error');
    if (!ir || compileErrors.length > 0) {
      const messages = compileErrors
        .map((d: { message?: string }) => d.message || 'Unknown compile error')
        .join('; ');
      throw new Error(messages || 'Compilation failed');
    }

    const engine = new RuntimeEngine(ir, parsedScript.context || {}, {
      deterministicMode: true,
      requireValidProvenance: false,
    });

    for (const seed of parsedScript.seedEntities || []) {
      const store = engine.getStore(seed.entity);
      if (!store) {
        continue;
      }
      await store.create({ id: seed.id, ...seed.properties });
    }

    const createdInstances = new Set<string>();
    const steps: StepOutput[] = [];

    for (let i = 0; i < parsedScript.commands.length; i++) {
      const cmd = parsedScript.commands[i];
      const stepNumber = cmd.step ?? i + 1;
      const instanceKey = `${cmd.entity}::${cmd.id}`;

      if (!createdInstances.has(instanceKey)) {
        const existing = await engine.getInstance(cmd.entity, cmd.id);
        if (!existing) {
          const fallback = await buildFallbackEntity(ir, cmd.entity, cmd.id);
          const store = engine.getStore(cmd.entity);
          if (store) {
            await store.create(fallback);
          }
        }
        createdInstances.add(instanceKey);
      }

      let commandResult: CommandResult;
      try {
        commandResult = await engine.runCommand(cmd.command, cmd.params || {}, {
          entityName: cmd.entity,
          instanceId: cmd.id,
        });
      } catch (error) {
        commandResult = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          emittedEvents: [],
        };
      }

      const assertionDetails: AssertionDetail[] = [];
      const expect = cmd.expect || {};

      if (expect.success !== undefined) {
        pushAssertion(assertionDetails, 'success', expect.success, commandResult.success);
      }

      if (expect.error) {
        const actualType: 'guard' | 'policy' | 'error' | null = commandResult.guardFailure
          ? 'guard'
          : commandResult.policyDenial
            ? 'policy'
            : commandResult.error
              ? 'error'
              : null;
        if (expect.error.type !== undefined) {
          pushAssertion(assertionDetails, 'error.type', expect.error.type, actualType);
        }
        if (expect.error.guardIndex !== undefined) {
          pushAssertion(assertionDetails, 'error.guardIndex', expect.error.guardIndex, commandResult.guardFailure?.index ?? null);
        }
      }

      if (expect.emittedEvents) {
        const actualEvents = (commandResult.emittedEvents || []).map((event) => event.name);
        pushAssertion(assertionDetails, 'emittedEvents', expect.emittedEvents, actualEvents);
      }

      const entityStateAfter = normalizeRecord(await engine.getInstance(cmd.entity, cmd.id));
      if (expect.stateAfter) {
        for (const [key, expectedValue] of Object.entries(expect.stateAfter)) {
          pushAssertion(assertionDetails, `stateAfter.${key}`, expectedValue, entityStateAfter[key]);
        }
      }

      const passed = assertionDetails.filter((detail) => detail.passed).length;
      const failed = assertionDetails.length - passed;

      steps.push({
        step: stepNumber,
        command: {
          entity: cmd.entity,
          id: cmd.id,
          name: cmd.command,
          params: cmd.params || {},
        },
        result: {
          success: commandResult.success,
          errorType: commandResult.guardFailure
            ? 'guard'
            : commandResult.policyDenial
              ? 'policy'
              : commandResult.error
                ? 'error'
                : null,
          errorMessage: commandResult.guardFailure?.formatted
            || commandResult.policyDenial?.formatted
            || commandResult.error
            || null,
          guardIndex: commandResult.guardFailure?.index ?? null,
          emittedEvents: (commandResult.emittedEvents || []).map((event) => event.name),
          entityStateAfter: Object.keys(entityStateAfter).length === 0 ? null : entityStateAfter,
        },
        assertions: {
          passed,
          failed,
          details: assertionDetails,
        },
      });
    }

    const output: HarnessRunOutput = {
      description: parsedScript.description,
      manifestPath,
      scriptPath,
      execution: { steps },
      summary: summarize(steps),
    };

    spinner.stop();

    if (format === 'json') {
      console.log(JSON.stringify(output, null, 2));
    } else {
      printTextSummary(output);
    }

    if (output.summary.failedSteps > 0 || output.summary.assertionsFailed > 0) {
      process.exit(1);
    }
  } catch (error) {
    spinner.fail(`Harness failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
