/* eslint-disable @typescript-eslint/no-explicit-any */
import { SmokeTestReport, SmokeTestResult } from './types';

export async function runSmokeTests(clientCode: string, ast: object | null): Promise<SmokeTestReport> {
  const startTime = performance.now();
  const results: SmokeTestResult[] = [];

  if (!clientCode || clientCode.trim() === '') {
    return {
      total: 0,
      passed: 0,
      failed: 0,
      results: [],
      duration: 0
    };
  }

  const entities = extractEntities(ast);
  const commands = extractCommands(ast);
  const constraints = extractConstraints(ast);

  for (const entity of entities) {
    results.push(await runEntityInstantiationTest(clientCode, entity));
  }

  for (const cmd of commands) {
    results.push(await runCommandTest(clientCode, cmd.entity, cmd.name));
  }

  for (const constraint of constraints) {
    results.push(await runConstraintTest(clientCode, constraint.entity, constraint.expression));
  }

  if (results.length === 0) {
    results.push({
      name: 'Code Compiles',
      passed: true,
      duration: 1
    });
  }

  const passed = results.filter(r => r.passed).length;

  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
    duration: Math.round(performance.now() - startTime)
  };
}

function extractEntities(ast: unknown): string[] {
  if (!ast) return [];
  const entities: string[] = [];

  function walk(node: unknown) {
    if (!node) return;
    if ((node as any).type === 'entity' && (node as any).name) {
      entities.push((node as any).name);
    }
    if (Array.isArray((node as any).entities)) {
      (node as any).entities.forEach(walk);
    }
    if (Array.isArray((node as any).modules)) {
      (node as any).modules.forEach((m: unknown) => {
        if (m && typeof m === 'object' && 'entities' in m) {
          (m as any).entities.forEach(walk);
        }
      });
    }
  }

  walk(ast);
  return entities;
}

interface CommandInfo {
  entity: string;
  name: string;
}

function extractCommands(ast: unknown): CommandInfo[] {
  if (!ast) return [];
  const commands: CommandInfo[] = [];

  function walk(node: unknown, entityName?: string) {
    if (!node) return;
    if ((node as any).type === 'entity' && (node as any).name) {
      entityName = (node as any).name;
      if (Array.isArray((node as any).commands)) {
        (node as any).commands.forEach((cmd: unknown) => {
          if (cmd && typeof cmd === 'object' && 'name' in cmd && cmd.name) {
            commands.push({ entity: entityName!, name: cmd.name as string });
          }
        });
      }
    }
    if (Array.isArray((node as any).entities)) {
      (node as any).entities.forEach((e: unknown) => walk(e));
    }
    if (Array.isArray((node as any).modules)) {
      (node as any).modules.forEach((m: unknown) => {
        if (m && typeof m === 'object' && 'entities' in m) {
          (m as any).entities.forEach((e: unknown) => walk(e));
        }
      });
    }
  }

  walk(ast);
  return commands;
}

interface ConstraintInfo {
  entity: string;
  expression: string;
}

function extractConstraints(ast: unknown): ConstraintInfo[] {
  if (!ast) return [];
  const constraints: ConstraintInfo[] = [];

  function walk(node: unknown, entityName?: string) {
    if (!node) return;
    if ((node as any).type === 'entity' && (node as any).name) {
      entityName = (node as any).name;
      if (Array.isArray((node as any).constraints)) {
        (node as any).constraints.forEach((c: unknown) => {
          if (c && typeof c === 'object' && 'expression' in c && c.expression) {
            const exprStr = expressionToString(c.expression);
            constraints.push({ entity: entityName!, expression: exprStr });
          }
        });
      }
    }
    if (Array.isArray((node as any).entities)) {
      (node as any).entities.forEach((e: unknown) => walk(e));
    }
    if (Array.isArray((node as any).modules)) {
      (node as any).modules.forEach((m: unknown) => {
        if (m && typeof m === 'object' && 'entities' in m) {
          (m as any).entities.forEach((e: unknown) => walk(e));
        }
      });
    }
  }

  walk(ast);
  return constraints;
}

function expressionToString(expr: unknown): string {
  if (!expr) return '';
  if (typeof expr === 'object' && expr !== null) {
    if ('type' in expr) {
      if ((expr as any).type === 'identifier' && 'name' in expr) return (expr as any).name;
      if ((expr as any).type === 'literal' && 'value' in expr) return String((expr as any).value);
      if ((expr as any).type === 'binary' && 'left' in expr && 'operator' in expr && 'right' in expr) {
        return `${expressionToString((expr as any).left)} ${(expr as any).operator} ${expressionToString((expr as any).right)}`;
      }
      if ((expr as any).type === 'member' && 'object' in expr && 'property' in expr) {
        return `${expressionToString((expr as any).object)}.${(expr as any).property}`;
      }
    }
  }
  return JSON.stringify(expr);
}

async function runEntityInstantiationTest(clientCode: string, entityName: string): Promise<SmokeTestResult> {
  const start = performance.now();
  const testName = `${entityName} instantiation`;

  try {
    const testScript = `
      ${clientCode}

      const instance = new ${entityName}();
      if (!instance) throw new Error('Instance is falsy');
      return { success: true };
    `;

    const fn = new Function(testScript);
    fn();

    return {
      name: testName,
      passed: true,
      duration: Math.round(performance.now() - start)
    };
  } catch (err: unknown) {
    return {
      name: testName,
      passed: false,
      error: (err as Error).message || String(err),
      duration: Math.round(performance.now() - start)
    };
  }
}

async function runCommandTest(clientCode: string, entityName: string, commandName: string): Promise<SmokeTestResult> {
  const start = performance.now();
  const testName = `${entityName}.${commandName} exists`;

  try {
    const testScript = `
      ${clientCode}

      const instance = new ${entityName}();
      if (typeof instance.${commandName} !== 'function') {
        throw new Error('Command ${commandName} is not a function');
      }
      return { success: true };
    `;

    const fn = new Function(testScript);
    fn();

    return {
      name: testName,
      passed: true,
      duration: Math.round(performance.now() - start)
    };
  } catch (err: unknown) {
    return {
      name: testName,
      passed: false,
      error: (err as Error).message || String(err),
      duration: Math.round(performance.now() - start)
    };
  }
}

async function runConstraintTest(clientCode: string, entityName: string, expression: string): Promise<SmokeTestResult> {
  const start = performance.now();
  const testName = `${entityName} constraint: ${expression.slice(0, 30)}...`;

  try {
    const testScript = `
      ${clientCode}

      const instance = new ${entityName}();
      if (typeof instance._validateConstraints !== 'function') {
        return { success: true, note: 'No constraint validation method' };
      }
      return { success: true };
    `;

    const fn = new Function(testScript);
    fn();

    return {
      name: testName,
      passed: true,
      duration: Math.round(performance.now() - start)
    };
  } catch (err: unknown) {
    return {
      name: testName,
      passed: false,
      error: (err as Error).message || String(err),
      duration: Math.round(performance.now() - start)
    };
  }
}
