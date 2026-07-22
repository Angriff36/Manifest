/**
 * Convex emission for command parameters with `trustedSource` (`from context.*`).
 *
 * Spec (semantics.md § Commands): strip client values, inject from authoritative
 * runtime context at the declared path, fail closed with MISSING_TRUSTED_CONTEXT
 * when required and unresolved. Convex resolves paths against
 * `getAuthContext(ctx)` (`__auth.context ?? __auth`).
 */

import type { IRCommand, IRParameter, IRValue } from '../../ir';
import type { ProjectionDiagnostic } from '../interface';
import type { NormalizedOptions } from './generator.js';

export function trustedParameters(cmd: IRCommand): IRParameter[] {
  return (cmd.parameters ?? []).filter((parameter) => !!parameter.trustedSource);
}

export function clientOwnedParameters(cmd: IRCommand): IRParameter[] {
  return (cmd.parameters ?? []).filter((parameter) => !parameter.trustedSource);
}

function defaultLiteral(value: IRValue): string {
  switch (value.kind) {
    case 'string':
      return JSON.stringify(value.value);
    case 'number':
      return String(value.value);
    case 'boolean':
      return String(value.value);
    case 'null':
      return 'null';
    case 'array':
      return `[${value.elements.map(defaultLiteral).join(', ')}]`;
    case 'object':
      return `{${Object.entries(value.properties)
        .map(([key, nested]) => `${JSON.stringify(key)}: ${defaultLiteral(nested)}`)
        .join(', ')}}`;
  }
}

/** Resolve `context.a.b` against `__auth` (requires authBindings forceAuth). */
export function trustedSourceResolveExpr(trustedSource: string): string | null {
  if (!trustedSource.startsWith('context.')) return null;
  const path = trustedSource.slice('context.'.length);
  if (!path) return null;
  let expr = '(__auth.context ?? __auth)';
  for (const segment of path.split('.')) {
    if (!segment) return null;
    expr = `${expr}[${JSON.stringify(segment)}]`;
  }
  return expr;
}

export type TrustedInjectMode = 'args' | 'locals';

/**
 * Diagnostics + injection lines for trusted params on a command.
 * Callers must force auth when any trusted param is present.
 */
export function renderTrustedSourceInjection(
  cmd: IRCommand,
  options: NormalizedOptions,
  mode: TrustedInjectMode,
): { lines: string[]; diagnostics: ProjectionDiagnostic[] } {
  const diagnostics: ProjectionDiagnostic[] = [];
  const trusted = trustedParameters(cmd);
  if (trusted.length === 0) return { lines: [], diagnostics };

  if (!options.authContextImport) {
    for (const parameter of trusted) {
      diagnostics.push({
        severity: 'error',
        code: 'CONVEX_AUTH_CONTEXT_REQUIRED',
        entity: cmd.entity,
        message:
          `Parameter '${cmd.entity ?? '?'}.${cmd.name}.${parameter.name}' has trustedSource ` +
          `'${parameter.trustedSource}' — set options.authContextImport so Convex can inject it.`,
      });
    }
    return {
      lines: [
        `    throw new Error("CONVEX_AUTH_CONTEXT_REQUIRED: set options.authContextImport for trustedSource params");`,
      ],
      diagnostics,
    };
  }

  const lines: string[] = [];
  for (const parameter of trusted) {
    const source = parameter.trustedSource!;
    const resolveExpr = trustedSourceResolveExpr(source);
    if (!resolveExpr) {
      diagnostics.push({
        severity: 'error',
        code: 'CONVEX_UNSUPPORTED_TRUSTED_SOURCE',
        entity: cmd.entity,
        message:
          `Parameter '${cmd.entity ?? '?'}.${cmd.name}.${parameter.name}' trustedSource ` +
          `'${source}' must be a context.* path.`,
      });
      lines.push(
        `    throw new Error(${JSON.stringify(
          `CONVEX_UNSUPPORTED_TRUSTED_SOURCE: ${parameter.name} (${source})`,
        )});`,
      );
      continue;
    }

    const tmp = `__trusted_${parameter.name}`;
    lines.push(`    const ${tmp} = ${resolveExpr};`);
    if (mode === 'args') {
      if (parameter.defaultValue !== undefined) {
        lines.push(
          `    args.${parameter.name} = (${tmp} === undefined || ${tmp} === null)`,
          `      ? ${defaultLiteral(parameter.defaultValue)}`,
          `      : ${tmp};`,
        );
      } else if (parameter.required) {
        lines.push(
          `    if (${tmp} === undefined || ${tmp} === null) {`,
          `      throw new Error(${JSON.stringify(
            `MISSING_TRUSTED_CONTEXT: ${parameter.name} from ${source}`,
          )});`,
          `    }`,
          `    args.${parameter.name} = ${tmp};`,
        );
      } else {
        lines.push(
          `    if (${tmp} !== undefined && ${tmp} !== null) args.${parameter.name} = ${tmp};`,
        );
      }
    } else if (parameter.defaultValue !== undefined) {
      lines.push(
        `    const ${parameter.name} = (${tmp} === undefined || ${tmp} === null)`,
        `      ? ${defaultLiteral(parameter.defaultValue)}`,
        `      : ${tmp};`,
      );
    } else if (parameter.required) {
      lines.push(
        `    if (${tmp} === undefined || ${tmp} === null) {`,
        `      throw new Error(${JSON.stringify(
          `MISSING_TRUSTED_CONTEXT: ${parameter.name} from ${source}`,
        )});`,
        `    }`,
        `    const ${parameter.name} = ${tmp};`,
      );
    } else {
      lines.push(`    const ${parameter.name} = ${tmp};`);
    }
  }

  return { lines, diagnostics };
}
