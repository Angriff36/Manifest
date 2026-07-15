/**
 * Convex optimistic concurrency helpers for `versionProperty` /
 * `versionAtProperty` (semantics.md § Entity Concurrency).
 *
 * Projection behavior: create seeds version=1; updates compare an optional
 * client-provided expected version, throw on mismatch, then increment.
 */

import type { IREntity } from '../../ir';

/** True when the field is managed by versionProperty / versionAtProperty. */
export function isConvexVersionManagedField(entity: IREntity, fieldName: string): boolean {
  return entity.versionProperty === fieldName || entity.versionAtProperty === fieldName;
}

/** Schema field lines for version metadata not already declared as properties. */
export function synthesizeConvexVersionSchemaFields(entity: IREntity): string[] {
  const existing = new Set(entity.properties.map((p) => p.name));
  const lines: string[] = [];
  if (entity.versionProperty && !existing.has(entity.versionProperty)) {
    lines.push(`${entity.versionProperty}: v.number()`);
  }
  if (entity.versionAtProperty && !existing.has(entity.versionAtProperty)) {
    lines.push(`${entity.versionAtProperty}: v.number()`);
  }
  return lines;
}

/** Doc assignments for create inserts (server-seeded; never client args). */
export function convexCreateVersionDocLines(entity: IREntity): string[] {
  const lines: string[] = [];
  if (entity.versionProperty) {
    lines.push(`      ${entity.versionProperty}: 1`);
  }
  if (entity.versionAtProperty) {
    lines.push(`      ${entity.versionAtProperty}: Date.now()`);
  }
  return lines;
}

export interface ConvexUpdateVersionOcc {
  /** Optional expected-version arg line (indent for args block). */
  argLine: string | null;
  /** Local name for the expected version (same as versionProperty). */
  expectedArgName: string | null;
  /** Lines after doc load, before patch. */
  checkLines: string[];
  /** Fields to merge into the `updates` object. */
  updateFields: string[];
}

/** OCC check + increment for non-create mutations. */
export function renderConvexUpdateVersionOcc(entity: IREntity): ConvexUpdateVersionOcc {
  const vp = entity.versionProperty;
  if (!vp) {
    return { argLine: null, expectedArgName: null, checkLines: [], updateFields: [] };
  }

  const checkLines = [
    `    if (${vp} !== undefined && (doc as any).${vp} !== ${vp}) {`,
    `      throw new Error(${JSON.stringify('ConcurrencyConflict: VERSION_MISMATCH')} + \` expected \${${vp}} actual \${(doc as any).${vp}}\`);`,
    `    }`,
  ];

  const updateFields = [`      ${vp}: ((doc as any).${vp} ?? 0) + 1`];
  if (entity.versionAtProperty) {
    updateFields.push(`      ${entity.versionAtProperty}: Date.now()`);
  }

  return {
    argLine: `    ${vp}: v.optional(v.number())`,
    expectedArgName: vp,
    checkLines,
    updateFields,
  };
}
