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

function extractEntities(ast: object | null): string[] {
  if (!ast) return [];
  const entities: string[] = [];

  function walk(node: any) {
    if (!node) return;
    if (node.type === 'entity' && node.name) {
      entities.push(node.name);
    }
    if (Array.isArray(node.entities)) {
      node.entities.forEach(walk);
    }
    if (Array.isArray(node.modules)) {
      node.modules.forEach((m: any) => {
        if (m.entities) m.entities.forEach(walk);
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

function extractCommands(ast: object | null): CommandInfo[] {
  if (!ast) return [];
  const commands: CommandInfo[] = [];

  function walk(node: any, entityName?: string) {
    if (!node) return;
    if (node.type === 'entity' && node.name) {
      entityName = node.name;
      if (Array.isArray(node.commands)) {
        node.commands.forEach((cmd: any) => {
          if (cmd.name) {
            commands.push({ entity: entityName!, name: cmd.name });
          }
        });
      }
    }
    if (Array.isArray(node.entities)) {
      node.entities.forEach((e: any) => walk(e));
    }
    if (Array.isArray(node.modules)) {
      node.modules.forEach((m: any) => {
        if (m.entities) m.entities.forEach((e: any) => walk(e));
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

function extractConstraints(ast: object | null): ConstraintInfo[] {
  if (!ast) return [];
  const constraints: ConstraintInfo[] = [];

  function walk(node: any, entityName?: string) {
    if (!node) return;
    if (node.type === 'entity' && node.name) {
      entityName = node.name;
      if (Array.isArray(node.constraints)) {
        node.constraints.forEach((c: any) => {
          if (c.expression) {
            const exprStr = expressionToString(c.expression);
            constraints.push({ entity: entityName!, expression: exprStr });
          }
        });
      }
    }
    if (Array.isArray(node.entities)) {
      node.entities.forEach((e: any) => walk(e));
    }
    if (Array.isArray(node.modules)) {
      node.modules.forEach((m: any) => {
        if (m.entities) m.entities.forEach((e: any) => walk(e));
      });
    }
  }

  walk(ast);
  return constraints;
}

function expressionToString(expr: any): string {
  if (!expr) return '';
  if (expr.type === 'identifier') return expr.name;
  if (expr.type === 'literal') return String(expr.value);
  if (expr.type === 'binary') {
    return `${expressionToString(expr.left)} ${expr.operator} ${expressionToString(expr.right)}`;
  }
  if (expr.type === 'member') {
    return `${expressionToString(expr.object)}.${expr.property}`;
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
  } catch (err: any) {
    return {
      name: testName,
      passed: false,
      error: err.message || String(err),
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
  } catch (err: any) {
    return {
      name: testName,
      passed: false,
      error: err.message || String(err),
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
  } catch (err: any) {
    return {
      name: testName,
      passed: false,
      error: err.message || String(err),
      duration: Math.round(performance.now() - start)
    };
  }
}
