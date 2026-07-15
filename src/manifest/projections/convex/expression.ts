/**
 * IR-expression → TypeScript renderer for the Convex functions surface.
 *
 * This turns Manifest guard/policy/constraint/action/reaction expressions into
 * the equivalent TypeScript that runs inside a Convex function. It is a PURE,
 * deterministic transform.
 *
 * DESIGN NOTE — fail CLOSED, never silently fail open. Unlike a permissive
 * codegen that returns `true` for anything it can't parse (which would make an
 * unparseable guard silently pass — a security bypass), this renderer records
 * every node it cannot map in `unresolved`. The caller decides what to do:
 * governance contexts (guards/policies/constraints) MUST treat a non-empty
 * `unresolved` as a hard error and emit a denying `throw`, so the gap is loud
 * at generation time rather than open at runtime. This honours the Manifest
 * house style ("no permissive defaults; never make an invalid program succeed").
 */

import type { IRExpression, IRValue } from '../../ir';

/** Identifier roots that always render as themselves (not members of `selfVar`). */
export const DEFAULT_GLOBALS: readonly string[] = ['user', 'context', 'args', 'payload', 'request'];

/** How bare identifiers and `self`/`this` resolve. */
export interface RenderScope {
  /** Variable name that `self.x` / `this.x` / bare `x` resolve against (e.g. "doc"). */
  selfVar: string;
  /**
   * When true, a bare identifier is treated as a member of `selfVar`
   * (`status` → `doc.status`). When false, bare identifiers render as
   * themselves (used for already-bound locals like command params). Default true.
   */
  bareIdentifierIsSelf?: boolean;
  /**
   * Identifier roots that render verbatim (e.g. `user`, `context`). A member
   * access `user.role` thus becomes `user.role`, not `doc.user.role`. Defaults
   * to {@link DEFAULT_GLOBALS}.
   */
  globals?: readonly string[];
  /** Already-bound local names (e.g. command parameters) that render verbatim. */
  locals?: readonly string[];
}

export interface RenderResult {
  /** The rendered TypeScript expression. */
  code: string;
  /** Human-readable descriptions of nodes that could not be mapped (empty ⇒ fully resolved). */
  unresolved: string[];
}

/** Map of DSL binary operators to JS operators (applied as whole-token swaps). */
const BINARY_OP: Readonly<Record<string, string>> = Object.freeze({
  '==': '===',
  '!=': '!==',
  '===': '===',
  '!==': '!==',
  '<': '<',
  '>': '>',
  '<=': '<=',
  '>=': '>=',
  '+': '+',
  '-': '-',
  '*': '*',
  '/': '/',
  '%': '%',
  and: '&&',
  or: '||',
  '&&': '&&',
  '||': '||',
});

function renderLiteralValue(v: IRValue): string {
  switch (v.kind) {
    case 'string':
      return JSON.stringify(v.value);
    case 'number':
      return String(v.value);
    case 'boolean':
      return String(v.value);
    case 'null':
      return 'null';
    case 'array':
      return `[${v.elements.map(renderLiteralValue).join(', ')}]`;
    case 'object': {
      const entries = Object.entries(v.properties).map(
        ([k, val]) => `${JSON.stringify(k)}: ${renderLiteralValue(val)}`,
      );
      return `{${entries.join(', ')}}`;
    }
  }
}

/** True for an IR `null` literal. */
export function isNullLiteral(e: IRExpression | undefined): boolean {
  return !!e && e.kind === 'literal' && (e as { value?: { kind?: string } }).value?.kind === 'null';
}

/**
 * Render an IR expression to TypeScript. Collects unmappable nodes in
 * `unresolved` instead of guessing.
 */
export function renderExpression(expr: IRExpression | undefined, scope: RenderScope): RenderResult {
  const unresolved: string[] = [];
  const bareIsSelf = scope.bareIdentifierIsSelf !== false;
  const globals = new Set(scope.globals ?? DEFAULT_GLOBALS);
  const locals = new Set(scope.locals ?? []);

  const go = (e: IRExpression | undefined): string => {
    if (!e) {
      unresolved.push('empty expression');
      return '/* unresolved */ undefined';
    }
    switch (e.kind) {
      case 'literal':
        return renderLiteralValue(e.value);

      case 'identifier': {
        if (e.name === 'now') return 'Date.now()';
        if (e.name === 'uuid') return 'crypto.randomUUID()';
        if (e.name === 'self' || e.name === 'this') return scope.selfVar;
        if (globals.has(e.name) || locals.has(e.name)) return e.name;
        return bareIsSelf ? `${scope.selfVar}.${e.name}` : e.name;
      }

      case 'member': {
        // self.x / this.x → <selfVar>.x
        if (
          e.object.kind === 'identifier' &&
          (e.object.name === 'self' || e.object.name === 'this')
        ) {
          return `${scope.selfVar}.${e.property}`;
        }
        return `${go(e.object)}.${e.property}`;
      }

      case 'unary': {
        const op = e.operator === 'not' ? '!' : e.operator;
        return `(${op}${go(e.operand)})`;
      }

      case 'binary': {
        const left = go(e.left);
        const right = go(e.right);
        if (e.operator === 'contains') return `${left}.includes(${right})`;
        if (e.operator === 'notContains') return `!${left}.includes(${right})`;
        // `a in [..]` semantics: membership → right.includes(left)
        if (e.operator === 'in') return `${right}.includes(${left})`;
        // Null comparisons use LOOSE equality so they match both `null` and an
        // absent field (Convex stores an unset optional as `undefined`, not
        // `null`). Strict `===`/`!==` against null would miss unset fields and
        // also fails to narrow `T | undefined` in generated TypeScript.
        if (
          (e.operator === '==' || e.operator === '!=') &&
          (isNullLiteral(e.left) || isNullLiteral(e.right))
        ) {
          return `(${left} ${e.operator} ${right})`;
        }
        const jsOp = BINARY_OP[e.operator];
        if (!jsOp) {
          unresolved.push(`binary operator '${e.operator}'`);
          return `(${left} /* ?${e.operator}? */ ${right})`;
        }
        return `(${left} ${jsOp} ${right})`;
      }

      case 'conditional':
        return `(${go(e.condition)} ? ${go(e.consequent)} : ${go(e.alternate)})`;

      case 'array':
        return `[${e.elements.map(go).join(', ')}]`;

      case 'object':
        return `{${e.properties.map((p) => `${JSON.stringify(p.key)}: ${go(p.value)}`).join(', ')}}`;

      case 'call': {
        const callee = e.callee.kind === 'identifier' ? e.callee.name : undefined;
        const args = e.args.map(go);
        switch (callee) {
          case 'now':
            return 'Date.now()';
          case 'uuid':
            return 'crypto.randomUUID()';
          case 'addDays':
            return `new Date(Date.now() + (${args[1]}) * 86400000).toISOString()`;
          case 'percent':
            return args.length >= 2
              ? `((${args[0]}) / (${args[1]}) * 100)`
              : `((${args[0]}) / 100)`;
          case 'between':
            return `((${args[0]}) >= (${args[1]}) && (${args[0]}) <= (${args[2]}))`;
          case 'removeTagFromString':
            return `${args[0]}.replace(${args[1]}, "").trim()`;
          // Feature toggle (not an auth guard): render a call to the generated
          // `flag()` helper the functions file provides (configurable, not a
          // silent `true`). Keeps the expression resolved without fail-open auth.
          case 'flag':
            return `flag(${args.join(', ')})`;
          case 'roleAllows':
            // roleAllows(user.role, X) → checkRole(userRole, X). The caller emits checkRole().
            return `checkRole(userRole, ${args[1]})`;
          case 'length':
            return `(${args[0]}).length`;
          case 'lower':
          case 'toLowerCase':
            return `(${args[0]}).toLowerCase()`;
          case 'upper':
          case 'toUpperCase':
            return `(${args[0]}).toUpperCase()`;
          case 'trim':
            return `(${args[0]}).trim()`;
          case 'substring':
            return args.length >= 3
              ? `(${args[0]}).substring(${args[1]}, ${args[2]})`
              : `(${args[0]}).substring(${args[1]})`;
          case 'indexOf':
            return `(${args[0]}).indexOf(${args[1]})`;
          case 'startsWith':
            return `(${args[0]}).startsWith(${args[1]})`;
          case 'endsWith':
            return `(${args[0]}).endsWith(${args[1]})`;
          case 'replace':
            return `(${args[0]}).replace(${args[1]}, ${args[2]})`;
          case 'split':
            return `(${args[0]}).split(${args[1]})`;
          // Aggregate builtins (docs/spec/builtins.md). Collections are plain
          // arrays at evaluation time — mutation codegen preloads hasMany edges
          // referenced by count_of(self.<rel>, …) onto the self var (PB023).
          case 'count_of':
            if (args.length === 0) {
              unresolved.push("builtin 'count_of()' missing collection");
              return '/* unresolved count_of() */ 0';
            }
            if (args.length === 1) return `((${args[0]}) ?? []).length`;
            return `((${args[0]}) ?? []).filter(${args[1]}).length`;
          default:
            if (!callee) {
              unresolved.push('non-identifier callee');
              return '/* unresolved call */ undefined';
            }
            unresolved.push(`builtin '${callee}()'`);
            return `/* unresolved ${callee}() */ undefined`;
        }
      }

      case 'lambda': {
        // Render as a JS arrow so aggregate builtins (count_of/filter/map) can
        // pass the predicate through. Lambda params bind as locals for the body.
        const added: string[] = [];
        for (const p of e.params) {
          if (!locals.has(p)) {
            locals.add(p);
            added.push(p);
          }
        }
        const body = go(e.body);
        for (const p of added) locals.delete(p);
        return `(${e.params.join(', ')}) => (${body})`;
      }

      default: {
        unresolved.push(`expression kind '${(e as { kind: string }).kind}'`);
        return '/* unresolved */ undefined';
      }
    }
  };

  const code = go(expr);
  return { code, unresolved };
}
