import type { ASTNode } from './guardParser';

export interface EvaluationStep {
  expression: string;
  result: unknown;
  passed: boolean;
  depth: number;
  nodeType: string;
}

export interface EvaluationResult {
  passed: boolean;
  value: unknown;
  steps: EvaluationStep[];
  error: string | null;
}

function resolveProperty(obj: unknown, path: string[]): unknown {
  let current = obj;
  for (const key of path) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function getPropertyPath(node: ASTNode): string[] {
  if (node.type === 'identifier') return [node.name];
  if (node.type === 'property_access') return [...getPropertyPath(node.object), node.property];
  return [];
}

const BUILTINS: Record<string, (args: unknown[]) => unknown> = {
  isEmpty: ([val]) => {
    if (val == null) return true;
    if (typeof val === 'string') return val.length === 0;
    if (Array.isArray(val)) return val.length === 0;
    if (typeof val === 'object') return Object.keys(val as object).length === 0;
    return false;
  },
  contains: ([haystack, needle]) => {
    if (typeof haystack === 'string' && typeof needle === 'string') return haystack.includes(needle);
    if (Array.isArray(haystack)) return haystack.includes(needle);
    return false;
  },
  startsWith: ([str, prefix]) => {
    if (typeof str === 'string' && typeof prefix === 'string') return str.startsWith(prefix);
    return false;
  },
  endsWith: ([str, suffix]) => {
    if (typeof str === 'string' && typeof suffix === 'string') return str.endsWith(suffix);
    return false;
  },
  length: ([val]) => {
    if (typeof val === 'string' || Array.isArray(val)) return val.length;
    if (typeof val === 'object' && val != null) return Object.keys(val).length;
    return 0;
  },
  typeof: ([val]) => {
    if (val === null) return 'null';
    if (Array.isArray(val)) return 'array';
    return typeof val;
  },
  matches: ([str, pattern]) => {
    if (typeof str === 'string' && typeof pattern === 'string') {
      try {
        return new RegExp(pattern).test(str);
      } catch {
        return false;
      }
    }
    return false;
  },
};

export function evaluateGuard(ast: ASTNode, context: Record<string, unknown>): EvaluationResult {
  const steps: EvaluationStep[] = [];

  function evaluate(node: ASTNode, depth: number): unknown {
    switch (node.type) {
      case 'number':
      case 'string':
      case 'boolean': {
        steps.push({ expression: node.source, result: node.value, passed: !!node.value, depth, nodeType: node.type });
        return node.value;
      }

      case 'null': {
        steps.push({ expression: 'null', result: null, passed: false, depth, nodeType: 'null' });
        return null;
      }

      case 'identifier': {
        const val = context[node.name];
        steps.push({ expression: node.source, result: val, passed: val != null && val !== false && val !== 0, depth, nodeType: 'identifier' });
        return val;
      }

      case 'property_access': {
        const path = getPropertyPath(node);
        const val = resolveProperty(context, path);
        steps.push({ expression: node.source, result: val, passed: val != null && val !== false && val !== 0, depth, nodeType: 'property_access' });
        return val;
      }

      case 'comparison': {
        const left = evaluate(node.left, depth + 1);
        const right = evaluate(node.right, depth + 1);
        let result: boolean;
        switch (node.op) {
          case '==': result = left === right; break;
          case '!=': result = left !== right; break;
          case '>': result = Number(left) > Number(right); break;
          case '<': result = Number(left) < Number(right); break;
          case '>=': result = Number(left) >= Number(right); break;
          case '<=': result = Number(left) <= Number(right); break;
          default: result = false;
        }
        steps.push({ expression: node.source, result, passed: result, depth, nodeType: 'comparison' });
        return result;
      }

      case 'logical_and': {
        const left = evaluate(node.left, depth + 1);
        if (!left) {
          steps.push({ expression: node.source, result: false, passed: false, depth, nodeType: 'logical_and' });
          return false;
        }
        const right = evaluate(node.right, depth + 1);
        const result = !!right;
        steps.push({ expression: node.source, result, passed: result, depth, nodeType: 'logical_and' });
        return result;
      }

      case 'logical_or': {
        const left = evaluate(node.left, depth + 1);
        if (left) {
          steps.push({ expression: node.source, result: true, passed: true, depth, nodeType: 'logical_or' });
          return true;
        }
        const right = evaluate(node.right, depth + 1);
        const result = !!right;
        steps.push({ expression: node.source, result, passed: result, depth, nodeType: 'logical_or' });
        return result;
      }

      case 'logical_not': {
        const operand = evaluate(node.operand, depth + 1);
        const result = !operand;
        steps.push({ expression: node.source, result, passed: result, depth, nodeType: 'logical_not' });
        return result;
      }

      case 'function_call': {
        const fn = BUILTINS[node.name];
        if (!fn) {
          steps.push({ expression: node.source, result: undefined, passed: false, depth, nodeType: 'error' });
          return undefined;
        }
        const args = node.args.map((a) => evaluate(a, depth + 1));
        const result = fn(args);
        steps.push({ expression: node.source, result, passed: !!result, depth, nodeType: 'function_call' });
        return result;
      }

      case 'group':
        return evaluate(node.expr, depth);

      default:
        return undefined;
    }
  }

  try {
    const value = evaluate(ast, 0);
    return { passed: !!value, value, steps, error: null };
  } catch (e) {
    return { passed: false, value: undefined, steps, error: e instanceof Error ? e.message : 'Evaluation error' };
  }
}
