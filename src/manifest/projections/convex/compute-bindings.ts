/**
 * Command-scoped `compute` bindings for Convex mutation lowering.
 *
 * Spec (semantics.md § Actions): `compute <name> = <expr>` binds `<name>` into
 * command evaluation scope for later actions and event payloads. It MUST NOT
 * mutate entity state and is never persisted.
 *
 * Expressions are evaluated against the pre-update document (`beforeScope`),
 * matching runtime order (compute runs before mutate in the action loop).
 */

import type { IRCommand } from '../../ir.js';
import type { ProjectionDiagnostic } from '../interface.js';
import { renderExpression, type RenderScope } from './expression.js';

export interface ComputeBinding {
  /** Local binding name (`previousStatus`, `nextQuantity`, …). */
  name: string;
  /** TypeScript expression evaluated against the pre-update scope. */
  code: string;
}

/**
 * Lower IR `compute` actions to ordered local bindings.
 * Later computes may reference earlier binding names via `locals`.
 */
export function renderCommandComputeBindings(
  cmd: IRCommand,
  beforeScope: RenderScope,
): { bindings: ComputeBinding[]; diagnostics: ProjectionDiagnostic[]; localNames: string[] } {
  const bindings: ComputeBinding[] = [];
  const diagnostics: ProjectionDiagnostic[] = [];
  const localNames: string[] = [...(beforeScope.locals ?? [])];

  for (const a of cmd.actions ?? []) {
    if (a.kind !== 'compute' || !a.target) continue;
    const scope: RenderScope = { ...beforeScope, locals: localNames };
    const { code, unresolved } = renderExpression(a.expression, scope);
    if (unresolved.length) {
      diagnostics.push({
        severity: 'warning',
        code: 'CONVEX_UNRESOLVED_COMPUTE',
        message: `compute '${cmd.entity ?? '?'}.${cmd.name}.${a.target}' unresolved (${unresolved.join('; ')}); omitted.`,
      });
      continue;
    }
    bindings.push({ name: a.target, code });
    if (!localNames.includes(a.target)) localNames.push(a.target);
  }

  return {
    bindings,
    diagnostics,
    localNames: bindings.map((b) => b.name),
  };
}

/** `const name = expr;` lines for the mutation handler body. */
export function computeBindingLines(bindings: ComputeBinding[]): string[] {
  return bindings.map((b) => `    const ${b.name} = ${b.code};`);
}

/** Merge compute binding names into a render scope's locals. */
export function withComputeLocals(
  scope: RenderScope,
  computeLocals: readonly string[],
): RenderScope {
  if (computeLocals.length === 0) return scope;
  const locals = [...(scope.locals ?? [])];
  for (const name of computeLocals) {
    if (!locals.includes(name)) locals.push(name);
  }
  return { ...scope, locals };
}
