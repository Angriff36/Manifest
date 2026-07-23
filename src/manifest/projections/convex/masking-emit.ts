/**
 * Emit Convex read-time masking for `masked` properties.
 *
 * Order on public reads: decrypt → policies → computed → mask → strip private.
 * Mutations keep returning unmasked values (matches reference runtime).
 */

import type { IREntity, IRMaskStrategy } from '../../ir';
import { renderExpression, type RenderScope } from './expression.js';

export interface MaskedFieldEmit {
  name: string;
  strategy: { type: IRMaskStrategy['type']; params?: number[] };
  /** JS expression body evaluated as (self, user, context) => boolean */
  unmaskWhenCode?: string;
}

export const MASK_HELPER = `function __applyMaskStrategy(strategy: { type: string; params?: number[] }, value: unknown): unknown {
  if (value == null) return value;
  const s = String(value);
  switch (strategy.type) {
    case "redact":
      return "***";
    case "partial": {
      const keepStart = strategy.params?.[0] ?? 0;
      const keepEnd = strategy.params?.[1] ?? 0;
      if (keepStart + keepEnd >= s.length) return "*".repeat(s.length);
      const tail = keepEnd > 0 ? s.slice(-keepEnd) : "";
      return s.slice(0, keepStart) + "*".repeat(s.length - keepStart - keepEnd) + tail;
    }
    case "email": {
      const at = s.indexOf("@");
      if (at <= 0) return "***";
      return s[0] + "***@" + s.slice(at + 1);
    }
    case "phone": {
      const digits = s.replace(/[^0-9]/g, "");
      if (digits.length < 4) return "***";
      return "***-***-" + digits.slice(-4);
    }
    case "last4": {
      if (s.length <= 4) return "****";
      return "****" + s.slice(-4);
    }
    default:
      return "***";
  }
}

function __maskDoc(
  doc: any,
  fields: ReadonlyArray<{
    name: string;
    strategy: { type: string; params?: number[] };
    unmaskWhen?: (self: any, user: any, context: any) => unknown;
  }>,
  auth: { user?: any; context?: any } = {},
): any {
  if (!doc) return doc;
  const out = { ...(doc as any) };
  const user = auth.user;
  const context = auth.context;
  for (const field of fields) {
    const value = out[field.name];
    if (value == null) continue;
    if (field.unmaskWhen) {
      try {
        if (field.unmaskWhen(out, user, context)) continue;
      } catch (error) {
        console.warn(
          \`[Manifest Convex] unmaskWhen evaluation error for '\${field.name}' (value stays masked)\`,
          error,
        );
      }
    }
    out[field.name] = __applyMaskStrategy(field.strategy, value);
  }
  return out;
}`;

/** Non-private masked fields (private wins by being stripped elsewhere). */
export function maskedFieldEmits(entity: IREntity): MaskedFieldEmit[] {
  const out: MaskedFieldEmit[] = [];
  for (const prop of entity.properties) {
    if (!prop.maskStrategy) continue;
    if (prop.modifiers.includes('private')) continue;
    const strategy: MaskedFieldEmit['strategy'] = { type: prop.maskStrategy.type };
    if (prop.maskStrategy.params && prop.maskStrategy.params.length > 0) {
      strategy.params = [...prop.maskStrategy.params];
    }
    const emit: MaskedFieldEmit = { name: prop.name, strategy };
    if (prop.maskStrategy.unmaskWhen) {
      const scope: RenderScope = { selfVar: 'self' };
      const { code, unresolved } = renderExpression(prop.maskStrategy.unmaskWhen, scope);
      if (unresolved.length === 0 && code.trim().length > 0) {
        emit.unmaskWhenCode = code;
      }
    }
    out.push(emit);
  }
  return out;
}

/** Embeddable array literal of field specs (unmaskWhen as arrow functions). */
export function serializeMaskedFields(fields: MaskedFieldEmit[]): string {
  const entries = fields.map((f) => {
    const strategy = JSON.stringify(f.strategy);
    if (f.unmaskWhenCode) {
      return `{ name: ${JSON.stringify(f.name)}, strategy: ${strategy}, unmaskWhen: (self: any, user: any, context: any) => (${f.unmaskWhenCode}) }`;
    }
    return `{ name: ${JSON.stringify(f.name)}, strategy: ${strategy} }`;
  });
  return `[${entries.join(', ')}]`;
}

export function maskAndStripPrivateDoc(
  docExpr: string,
  fields: MaskedFieldEmit[],
  privates: string[],
  authExpr: string,
): string {
  if (fields.length === 0 && privates.length === 0) return `return ${docExpr};`;
  // Use __final (not __doc) so callers that already bound `const __doc` for
  // inline computed assign-back do not hit a TDZ/redeclare error.
  if (fields.length === 0) {
    const dels = privates.map((p) => `delete (__out as any).${p};`).join(' ');
    return (
      `const __final = ${docExpr};\n` +
      `    if (!__final) return __final;\n` +
      `    const __out = { ...(__final as any) };\n` +
      `    ${dels}\n` +
      `    return __out;`
    );
  }
  const specs = serializeMaskedFields(fields);
  if (privates.length === 0) {
    return (
      `const __final = ${docExpr};\n` +
      `    if (!__final) return __final;\n` +
      `    return __maskDoc(__final, ${specs}, ${authExpr});`
    );
  }
  const dels = privates.map((p) => `delete (__out as any).${p};`).join(' ');
  return (
    `const __final = ${docExpr};\n` +
    `    if (!__final) return __final;\n` +
    `    const __out = __maskDoc(__final, ${specs}, ${authExpr});\n` +
    `    ${dels}\n` +
    `    return __out;`
  );
}

export function maskAndStripPrivateRows(
  rowsExpr: string,
  fields: MaskedFieldEmit[],
  privates: string[],
  authExpr: string,
): string {
  if (fields.length === 0 && privates.length === 0) return `return ${rowsExpr};`;
  if (fields.length === 0) {
    const dels = privates.map((p) => `delete (o as any).${p};`).join(' ');
    return (
      `return (${rowsExpr}).map((d) => {\n` +
      `      const o = { ...(d as any) };\n` +
      `      ${dels}\n` +
      `      return o;\n` +
      `    });`
    );
  }
  const specs = serializeMaskedFields(fields);
  if (privates.length === 0) {
    return `return (${rowsExpr}).map((d) => __maskDoc(d, ${specs}, ${authExpr}));`;
  }
  const dels = privates.map((p) => `delete (o as any).${p};`).join(' ');
  return (
    `return (${rowsExpr}).map((d) => {\n` +
    `      const o = __maskDoc(d, ${specs}, ${authExpr});\n` +
    `      ${dels}\n` +
    `      return o;\n` +
    `    });`
  );
}

/** Auth bag for unmaskWhen: prefer existing `user`/`context` locals. */
export function maskAuthExpr(needsAuth: boolean): string {
  if (!needsAuth) return '{}';
  return '{ user: typeof user !== "undefined" ? user : undefined, context: typeof context !== "undefined" ? context : undefined }';
}

export function maskedFieldsNeedAuth(fields: MaskedFieldEmit[]): boolean {
  return fields.some((f) => !!f.unmaskWhenCode);
}
