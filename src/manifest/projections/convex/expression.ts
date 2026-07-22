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
  /**
   * Plan-derived relation locals. A mapped `self.person`, `this.person`, or
   * bare `person` renders as the separate hydrated local instead of a physical
   * document property. Chained access naturally continues from that local.
   */
  relationVars?: Readonly<Record<string, string>>;
  /**
   * Convex document identity for `self.id` / `this.id` / bare `id`
   * (e.g. `_id` after insert, `docId` on updates). Schema has no `id` field —
   * only Convex `_id` — so without this, emit payloads serialize `undefined`.
   */
  idExpr?: string;
  /**
   * Pre-update instance for `previous{Field}` emit fields (e.g. `doc`).
   * `previousStatus` → `${beforeVar}.status`. Post-update `selfVar` keeps
   * current fields (`status`, etc.).
   */
  beforeVar?: string;
  /**
   * Fallback TypeScript type for lambda callback parameters when no collection
   * element type is known. Default {@link DEFAULT_LAMBDA_PARAM_TYPE}.
   */
  lambdaParamType?: string;
  /**
   * Resolve the element type of a collection expression (e.g. `self.prepTasks`
   * → `Doc<"prepTasks">`) so `count_of` predicates get a named document type
   * when IR + table naming make that safe.
   */
  resolveCollectionElementType?: (collection: IRExpression) => string | undefined;
}

/** Smallest explicit doc-shaped type used when no named Doc<> is available. */
export const DEFAULT_LAMBDA_PARAM_TYPE = 'Record<string, any>';

/** Map `previousStatus` → `status` (emit previous-value convention). */
export function previousPropertyName(property: string): string | undefined {
  const m = /^previous([A-Z][a-zA-Z0-9]*)$/.exec(property);
  if (!m) return undefined;
  const rest = m[1]!;
  return rest.charAt(0).toLowerCase() + rest.slice(1);
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
/** Format `(p: T, q: T)` for a generated arrow callback. */
export function formatTypedLambdaParams(
  params: readonly string[],
  paramType: string = DEFAULT_LAMBDA_PARAM_TYPE,
): string {
  return params.map((p) => `${p}: ${paramType}`).join(', ');
}

export function renderExpression(expr: IRExpression | undefined, scope: RenderScope): RenderResult {
  const unresolved: string[] = [];
  const bareIsSelf = scope.bareIdentifierIsSelf !== false;
  const globals = new Set(scope.globals ?? DEFAULT_GLOBALS);
  const locals = new Set(scope.locals ?? []);
  const relationVars = scope.relationVars ?? {};
  /** Stack of element types for nested `count_of`/aggregate lambda bodies. */
  const lambdaParamTypeStack: string[] = [];
  const fallbackLambdaType = scope.lambdaParamType ?? DEFAULT_LAMBDA_PARAM_TYPE;

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
        if (bareIsSelf && relationVars[e.name]) return relationVars[e.name]!;
        if (e.name === 'id' && scope.idExpr) return scope.idExpr;
        if (bareIsSelf && scope.beforeVar) {
          const prev = previousPropertyName(e.name);
          if (prev) return `${scope.beforeVar}.${prev}`;
        }
        return bareIsSelf ? `${scope.selfVar}.${e.name}` : e.name;
      }

      case 'member': {
        // self.x / this.x → <selfVar>.x (with Convex id / previous* rewrites)
        if (
          e.object.kind === 'identifier' &&
          (e.object.name === 'self' || e.object.name === 'this')
        ) {
          if (relationVars[e.property]) return relationVars[e.property]!;
          if (e.property === 'id' && scope.idExpr) return scope.idExpr;
          if (scope.beforeVar) {
            const prev = previousPropertyName(e.property);
            if (prev) return `${scope.beforeVar}.${prev}`;
          }
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
        // count_of: resolve the related-document element type before rendering
        // the predicate lambda so callback params are never implicit any.
        if (
          callee === 'count_of' ||
          callee === 'sum' ||
          callee === 'avg' ||
          callee === 'min_of' ||
          callee === 'max_of' ||
          callee === 'map' ||
          callee === 'filter' ||
          callee === 'flat_map'
        ) {
          if (e.args.length === 0) {
            unresolved.push(`builtin '${callee}()' missing collection`);
            return callee === 'count_of' ||
              callee === 'sum' ||
              callee === 'avg' ||
              callee === 'min_of' ||
              callee === 'max_of'
              ? `/* unresolved ${callee}() */ 0`
              : `/* unresolved ${callee}() */ []`;
          }
          const collection = e.args[0]!;
          const collCode = go(collection);
          if (callee === 'count_of') {
            if (e.args.length === 1) return `((${collCode}) ?? []).length`;
            const predicate = e.args[1]!;
            const elementType =
              scope.resolveCollectionElementType?.(collection) ?? fallbackLambdaType;
            lambdaParamTypeStack.push(elementType);
            const predCode = go(predicate);
            lambdaParamTypeStack.pop();
            return `((${collCode}) ?? []).filter(${predCode}).length`;
          }
          if (callee === 'sum') {
            if (e.args.length === 1) {
              return `((${collCode}) ?? []).reduce((acc: number, v: unknown) => acc + (typeof v === "number" ? v : 0), 0)`;
            }
            const mapper = e.args[1]!;
            const elementType =
              scope.resolveCollectionElementType?.(collection) ?? fallbackLambdaType;
            lambdaParamTypeStack.push(elementType);
            const mapCode = go(mapper);
            lambdaParamTypeStack.pop();
            return `((${collCode}) ?? []).map(${mapCode}).reduce((acc: number, v: unknown) => acc + (typeof v === "number" ? v : 0), 0)`;
          }
          if (callee === 'avg' || callee === 'min_of' || callee === 'max_of') {
            let valuesExpr: string;
            if (e.args.length === 1) {
              valuesExpr = `((${collCode}) ?? []).filter((v: unknown): v is number => typeof v === "number")`;
            } else {
              const mapper = e.args[1]!;
              const elementType =
                scope.resolveCollectionElementType?.(collection) ?? fallbackLambdaType;
              lambdaParamTypeStack.push(elementType);
              const mapCode = go(mapper);
              lambdaParamTypeStack.pop();
              valuesExpr = `((${collCode}) ?? []).map(${mapCode}).filter((v: unknown): v is number => typeof v === "number")`;
            }
            if (callee === 'avg') {
              return (
                `(() => { const __vals = ${valuesExpr}; ` +
                `return __vals.length === 0 ? 0 : __vals.reduce((a: number, v: number) => a + v, 0) / __vals.length; })()`
              );
            }
            const empty = 'undefined';
            const reduce =
              callee === 'min_of' ? 'Math.min(...__vals)' : 'Math.max(...__vals)';
            return (
              `(() => { const __vals = ${valuesExpr}; ` +
              `return __vals.length === 0 ? ${empty} : ${reduce}; })()`
            );
          }
          if (callee === 'filter') {
            if (e.args.length < 2) {
              unresolved.push("builtin 'filter()' missing predicate");
              return `((${collCode}) ?? [])`;
            }
            const predicate = e.args[1]!;
            const elementType =
              scope.resolveCollectionElementType?.(collection) ?? fallbackLambdaType;
            lambdaParamTypeStack.push(elementType);
            const predCode = go(predicate);
            lambdaParamTypeStack.pop();
            return `((${collCode}) ?? []).filter(${predCode})`;
          }
          if (callee === 'map') {
            if (e.args.length < 2) {
              unresolved.push("builtin 'map()' missing mapper");
              return `((${collCode}) ?? [])`;
            }
            const mapper = e.args[1]!;
            const elementType =
              scope.resolveCollectionElementType?.(collection) ?? fallbackLambdaType;
            lambdaParamTypeStack.push(elementType);
            const mapCode = go(mapper);
            lambdaParamTypeStack.pop();
            return `((${collCode}) ?? []).map(${mapCode})`;
          }
          // flat_map — element rows are often relation-hydrated beyond Doc<> fields
          // (nested belongsTo/hasMany). Keep callback params as Record to typecheck.
          if (e.args.length < 2) {
            unresolved.push("builtin 'flat_map()' missing mapper");
            return `((${collCode}) ?? [])`;
          }
          const mapper = e.args[1]!;
          lambdaParamTypeStack.push(fallbackLambdaType);
          const mapCode = go(mapper);
          lambdaParamTypeStack.pop();
          return `((${collCode}) ?? []).flatMap(${mapCode})`;
        }
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
            return `checkRole(${args.join(', ')})`;
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
          case 'unique_of':
            return `Array.from(new Set((${args[0]}) ?? []))`;
          case 'max':
            return `Math.max(${args.join(', ')})`;
          case 'min':
            return `Math.min(${args.join(', ')})`;
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
        // Render as a typed JS arrow so aggregate builtins (count_of/filter/map)
        // pass the predicate through under strict TypeScript (no TS7006).
        const added: string[] = [];
        for (const p of e.params) {
          if (!locals.has(p)) {
            locals.add(p);
            added.push(p);
          }
        }
        const body = go(e.body);
        for (const p of added) locals.delete(p);
        const paramType =
          lambdaParamTypeStack[lambdaParamTypeStack.length - 1] ?? fallbackLambdaType;
        return `(${formatTypedLambdaParams(e.params, paramType)}) => (${body})`;
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
