/**
 * Private / encrypted property handling for the Convex projection.
 *
 * Private fields are stripped from public returns. Encrypted fields use the
 * author-owned `encryptionImport` seam and the reference-runtime envelope.
 */

import type { IR, IREntity } from '../../ir';
import type { ProjectionDiagnostic } from '../interface';
import { isPersistentEntity } from './persist.js';

/** Property names marked `private` on an entity (excluding `id`). */
export function privateFieldNames(entity: IREntity): string[] {
  return entity.properties
    .filter((p) => p.name !== 'id' && p.modifiers.includes('private'))
    .map((p) => p.name);
}

/** Property names marked `encrypted` on an entity. */
export function encryptedFieldNames(entity: IREntity): string[] {
  return entity.properties.filter((p) => p.modifiers.includes('encrypted')).map((p) => p.name);
}

/**
 * Diagnostics for every encrypted field on persistent entities.
 * Loud gap — never silent. No encryption seam until semantics are specified.
 */
export function collectEncryptedDiagnostics(
  ir: IR,
  encryptionImport?: string,
): ProjectionDiagnostic[] {
  if (encryptionImport) return [];
  const out: ProjectionDiagnostic[] = [];
  for (const entity of ir.entities) {
    if (!isPersistentEntity(entity, ir)) continue;
    for (const name of encryptedFieldNames(entity)) {
      out.push({
        severity: 'error',
        code: 'CONVEX_ENCRYPTION_IMPORT_REQUIRED',
        entity: entity.name,
        message:
          `Property '${entity.name}.${name}' is encrypted; set ` +
          `options.encryptionImport to an author-owned module exporting encrypt/decrypt. ` +
          `Generation fails closed rather than persisting new plaintext values.`,
      });
    }
  }
  return out;
}

/**
 * Wrap a document-return expression so private fields are stripped.
 * When `privates` is empty, returns `returnExpr` unchanged (byte-stable).
 *
 * @param returnExpr Expression yielding a single doc or null (e.g. `doc`, `await ctx.db.get(id)`).
 * @param privates Private property names to omit.
 */
export function stripPrivateFromDoc(returnExpr: string, privates: string[]): string {
  if (privates.length === 0) return `return ${returnExpr};`;
  const dels = privates.map((p) => `delete (__out as any).${p};`).join(' ');
  return (
    `const __doc = ${returnExpr};\n` +
    `    if (!__doc) return __doc;\n` +
    `    const __out = { ...(__doc as any) };\n` +
    `    ${dels}\n` +
    `    return __out;`
  );
}

/**
 * Return-line for a mutation result object literal with private fields
 * stripped. `literal` is an object literal (always truthy), so no null check.
 */
export function stripPrivateFromReturn(literal: string, privates: string[]): string {
  if (privates.length === 0) return `    return ${literal};\n`;
  const dels = privates.map((p) => `delete (__ret as any).${p};`).join(' ');
  return `    const __ret: Record<string, any> = ${literal};\n    ${dels}\n    return __ret;\n`;
}

/**
 * Wrap a rows-return so each row has private fields stripped.
 * When `privates` is empty, returns `returnExpr` unchanged.
 *
 * @param rowsExpr Expression yielding an array of docs (already bound or inline).
 */
export function stripPrivateFromRows(rowsExpr: string, privates: string[]): string {
  if (privates.length === 0) return `return ${rowsExpr};`;
  const dels = privates.map((p) => `delete (o as any).${p};`).join(' ');
  return (
    `return (${rowsExpr}).map((d) => {\n` +
    `      const o = { ...(d as any) };\n` +
    `      ${dels}\n` +
    `      return o;\n` +
    `    });`
  );
}
