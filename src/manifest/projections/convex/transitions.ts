/**
 * State-transition enforcement for Convex mutations.
 *
 * Mirrors runtime-engine.ts updateInstance: for each mutate targeting a
 * property with transition rules, reject illegal from→to jumps before patch.
 * Always on — never a config knob.
 */

import type { IRCommand, IREntity, IRExpression, IRTransition } from '../../ir';
import type { ProjectionDiagnostic } from '../interface';

export interface TransitionCheckResult {
  /** Lines inserted before `ctx.db.patch` (indented for the handler body). */
  lines: string[];
  diagnostics: ProjectionDiagnostic[];
}

/** Collect transition rules keyed by property name. */
export function transitionsByProperty(entity: IREntity): Map<string, IRTransition[]> {
  const map = new Map<string, IRTransition[]>();
  for (const t of entity.transitions ?? []) {
    const list = map.get(t.property) ?? [];
    list.push(t);
    map.set(t.property, list);
  }
  return map;
}

/**
 * Emit pre-patch legality checks for mutate actions whose targets have
 * transition rules. Non-mutated transition properties get an info diagnostic.
 */
export function renderTransitionChecks(
  entity: IREntity,
  cmd: IRCommand,
  /** Variable holding the pre-patch document (usually `doc`). */
  docVar: string,
  /** Rendered RHS expression per mutate target (already resolved). */
  updates: { target: string; expression: IRExpression; renderedCode: string }[],
  /** True only while a generated creation entry initializes its seed document. */
  creationFlagVar?: string,
): TransitionCheckResult {
  const diagnostics: ProjectionDiagnostic[] = [];
  const byProp = transitionsByProperty(entity);
  if (byProp.size === 0) return { lines: [], diagnostics };

  const mutated = new Set(updates.map((u) => u.target));
  for (const prop of byProp.keys()) {
    if (mutated.has(prop)) continue;
    diagnostics.push({
      severity: 'info',
      code: 'CONVEX_TRANSITION_UNUSED',
      entity: entity.name,
      message: `Entity '${entity.name}' declares transitions on '${prop}' but command '${cmd.name}' does not mutate it.`,
    });
  }

  const lines: string[] = [];
  for (const u of updates) {
    const rules = byProp.get(u.target);
    if (!rules || rules.length === 0) continue;

    const allowedMap = buildAllowedLookup(rules);
    const propLabel = JSON.stringify(`'${u.target}'`);
    const toExpr = isStringLiteral(u.expression)
      ? JSON.stringify((u.expression as { value: { value: string } }).value.value)
      : `String(${u.renderedCode})`;

    const invalidCondition = creationFlagVar
      ? `!(${creationFlagVar} && __from === __to) && Object.hasOwn(__allowed, __from) && !__allowed[__from].includes(__to)`
      : `Object.hasOwn(__allowed, __from) && !__allowed[__from].includes(__to)`;
    lines.push(
      `    {`,
      `      const __cur = ${docVar}.${u.target};`,
      `      if (__cur !== undefined) {`,
      `        const __from = String(__cur);`,
      `        const __to = ${toExpr};`,
      `        const __allowed: Record<string, string[]> = ${allowedMap};`,
      `        if (${invalidCondition}) {`,
      `          const __opts = __allowed[__from].map((v) => "'" + v + "'").join(", ");`,
      `          throw new Error("Invalid state transition for " + ${propLabel} + ": '" + __from + "' -> '" + __to + "' is not allowed. Allowed from '" + __from + "': [" + __opts + "]");`,
      `        }`,
      `      }`,
      `    }`,
    );
  }

  return { lines, diagnostics };
}

function buildAllowedLookup(rules: IRTransition[]): string {
  const entries = rules.map(
    (r) => `${JSON.stringify(r.from)}: [${r.to.map((v) => JSON.stringify(v)).join(', ')}]`,
  );
  return `{ ${entries.join(', ')} }`;
}

function isStringLiteral(expr: IRExpression): boolean {
  return expr.kind === 'literal' && expr.value.kind === 'string';
}
