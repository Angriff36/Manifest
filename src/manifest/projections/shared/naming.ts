/**
 * Deterministic identifier casing + pluralization helpers for projections.
 *
 * These are PURE, deterministic string transforms — identical input always
 * yields identical output (house-style invariant). No locale, no randomness,
 * no external dependency. Projections that map IR identifiers to physical
 * database names (Prisma `@map`/`@@map`, Drizzle column names, …) use these
 * to apply a consumer-chosen naming convention.
 *
 * IMPORTANT: convention output is best-effort. The built-in pluralizer covers
 * common English rules plus a tiny irregular set; anything it gets wrong is
 * meant to be overridden by an explicit per-entity mapping (e.g. the Prisma
 * projection's `tableMappings`). The convention is the default, the explicit
 * mapping is the escape hatch.
 */

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
 * `undefined` when no convention is requested (fully back-compatible: callers
 * emit IR names verbatim).
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

// ----------------------------------------------------------------------------
// Case transforms
// ----------------------------------------------------------------------------

/** Split an identifier into lower-cased words on camel/Pascal/snake/kebab boundaries. */
function splitWords(s: string): string[] {
  return s
    // acronym followed by a capitalized word: HTTPServer → HTTP Server
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    // lower/digit followed by upper: createdAt → created At
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    // separators
    .replace(/[\s_-]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/** `createdAt` / `Widget` / `author id` → `created_at` / `widget` / `author_id`. */
export function toSnakeCase(s: string): string {
  return splitWords(s).map(w => w.toLowerCase()).join('_');
}

/** `created_at` / `Widget` → `CreatedAt` / `Widget`. */
export function toPascalCase(s: string): string {
  return splitWords(s)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

/** `created_at` / `Widget` → `createdAt` / `widget`. */
export function toCamelCase(s: string): string {
  const pascal = toPascalCase(s);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/** Apply a case style. `'preserve'` returns the input unchanged. */
export function applyCase(name: string, style: CaseStyle): string {
  switch (style) {
    case 'snake_case': return toSnakeCase(name);
    case 'camelCase': return toCamelCase(name);
    case 'PascalCase': return toPascalCase(name);
    case 'preserve': return name;
  }
}

// ----------------------------------------------------------------------------
// Pluralization
// ----------------------------------------------------------------------------

/** Small irregular set. Anything missing here is overridable via explicit mappings. */
const IRREGULAR_PLURALS: Readonly<Record<string, string>> = {
  person: 'people',
  child: 'children',
  man: 'men',
  woman: 'women',
  tooth: 'teeth',
  foot: 'feet',
  mouse: 'mice',
  goose: 'geese',
};

/**
 * Pluralize the final word of an identifier, preserving any snake_case prefix
 * (`user_account` → `user_accounts`). Already-plural inputs ending in `s` are
 * returned unchanged, so the function is effectively idempotent for the common
 * case (`widgets` → `widgets`).
 */
export function pluralize(word: string): string {
  if (!word) return word;
  const cut = word.lastIndexOf('_');
  const prefix = cut >= 0 ? word.slice(0, cut + 1) : '';
  const base = cut >= 0 ? word.slice(cut + 1) : word;
  if (!base) return word;

  const lower = base.toLowerCase();
  if (IRREGULAR_PLURALS[lower]) return prefix + IRREGULAR_PLURALS[lower];
  if (/[^aeiou]y$/i.test(base)) return prefix + base.slice(0, -1) + 'ies';
  // Use double-s (`ss`), not single `s`, so singular words like `class` →
  // `classes` while already-plural words like `widgets` stay unchanged below.
  if (/(ss|x|z|ch|sh)$/i.test(base)) return prefix + base + 'es';
  if (/s$/i.test(base)) return prefix + base; // already plural-ish (idempotent)
  return prefix + base + 's';
}

// ----------------------------------------------------------------------------
// Resolution entry points
// ----------------------------------------------------------------------------

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
