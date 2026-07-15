/**
 * Deterministic identifier casing + pluralization helpers for projections.
 *
 * These are PURE, deterministic string transforms — identical input always
 * yields identical output (house-style invariant). No locale, no randomness,
 * no external dependency. Projections that map IR identifiers to physical
 * database names (Prisma `@map`/`@@map`, Drizzle column names, …) use these
 * to apply a consumer-chosen naming convention.
 *
 * Core transforms live in `src/manifest/naming-case.ts` (shared with the
 * compiler's canonical-name pass). This module adds convention resolution.
 *
 * IMPORTANT: convention output is best-effort. The built-in pluralizer covers
 * common English rules plus a tiny irregular set; anything it gets wrong is
 * meant to be overridden by an explicit per-entity mapping (e.g. the Prisma
 * projection's `tableMappings`). The convention is the default, the explicit
 * mapping is the escape hatch for *external* systems that cannot be renamed.
 */

import {
  toSnakeCase,
  toKebabCase,
  toPascalCase,
  toCamelCase,
  pluralize,
} from '../../naming-case.js';

export { toSnakeCase, toKebabCase, toPascalCase, toCamelCase, pluralize };

/** Target case style for a generated identifier. */
export type CaseStyle = 'snake_case' | 'camelCase' | 'PascalCase' | 'preserve';

/** Object form of a naming convention. */
export interface NamingConvention {
  /** Case style for table/model physical names. Default `'preserve'`. */
  table?: CaseStyle;
  /** Case style for column/field physical names. Default `'preserve'`. */
  column?: CaseStyle;
  /** Pluralize resolved table names. Default `true`. */
  pluralizeTables?: boolean;
}

/**
 * Public input shape. The string shorthand `'snake_case'` expands to
 * `{ table: 'snake_case', column: 'snake_case', pluralizeTables: true }` —
 * the common Rails/Postgres convention.
 */
export type NamingConventionInput = 'snake_case' | NamingConvention;

/**
 * Canonicalize the public input into a fully-populated convention, or
 * `undefined` when no convention is requested (IR already carries Manifest
 * house spelling; projections apply physical layout only when configured).
 */
export function normalizeNaming(
  input: NamingConventionInput | undefined,
): Required<NamingConvention> | undefined {
  if (input == null) return undefined;
  if (input === 'snake_case') {
    return { table: 'snake_case', column: 'snake_case', pluralizeTables: true };
  }
  return {
    table: input.table ?? 'preserve',
    column: input.column ?? 'preserve',
    pluralizeTables: input.pluralizeTables ?? true,
  };
}

/**
 * Casing for generated URL route segments (and the client fetch paths that
 * must match them). `'lowercase'` is the historical default — the entity name
 * flattened with no word boundaries (`PrepTask` → `preptask`). The others split
 * on camel/Pascal/snake/kebab boundaries first (`PrepTask` → `prep-task` /
 * `prep_task`); `'preserve'` keeps the entity name verbatim.
 */
export type RouteCasing = 'lowercase' | 'kebab-case' | 'snake_case' | 'preserve';

/** Normalize an identifier to a URL route segment per the chosen casing. */
export function applyRouteCasing(name: string, casing: RouteCasing): string {
  switch (casing) {
    case 'kebab-case':
      return toKebabCase(name);
    case 'snake_case':
      return toSnakeCase(name);
    case 'preserve':
      return name;
    case 'lowercase':
    default:
      return name.toLowerCase();
  }
}

/** Apply a case style. `'preserve'` returns the input unchanged. */
export function applyCase(name: string, style: CaseStyle): string {
  switch (style) {
    case 'snake_case':
      return toSnakeCase(name);
    case 'camelCase':
      return toCamelCase(name);
    case 'PascalCase':
      return toPascalCase(name);
    case 'preserve':
      return name;
  }
}

/**
 * Physical table name for an entity under the given convention. Returns the
 * input unchanged when no convention is active.
 */
export function resolveTableName(entityName: string, input?: NamingConventionInput): string {
  const n = normalizeNaming(input);
  if (!n) return entityName;
  const cased = applyCase(entityName, n.table);
  return n.pluralizeTables ? pluralize(cased) : cased;
}

/**
 * Physical column name for a property under the given convention. Returns the
 * input unchanged when no convention is active.
 */
export function resolveColumnName(propName: string, input?: NamingConventionInput): string {
  const n = normalizeNaming(input);
  if (!n) return propName;
  return applyCase(propName, n.column);
}
