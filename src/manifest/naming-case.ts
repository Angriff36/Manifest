/**
 * Pure deterministic case + plural transforms shared by the compiler
 * (canonical names) and projections (physical DB/route naming).
 */

/** Split an identifier into words on camel/Pascal/snake/kebab boundaries. */
export function splitWords(s: string): string[] {
  return s
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[\s_-]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

export function toSnakeCase(s: string): string {
  return splitWords(s)
    .map((w) => w.toLowerCase())
    .join('_');
}

export function toKebabCase(s: string): string {
  return splitWords(s)
    .map((w) => w.toLowerCase())
    .join('-');
}

export function toPascalCase(s: string): string {
  return splitWords(s)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

export function toCamelCase(s: string): string {
  const pascal = toPascalCase(s);
  if (!pascal) return pascal;
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

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

export function pluralize(word: string): string {
  if (!word) return word;
  const cut = word.lastIndexOf('_');
  const prefix = cut >= 0 ? word.slice(0, cut + 1) : '';
  const base = cut >= 0 ? word.slice(cut + 1) : word;
  if (!base) return word;

  const lower = base.toLowerCase();
  if (IRREGULAR_PLURALS[lower]) return prefix + IRREGULAR_PLURALS[lower];
  if (/[^aeiou]y$/i.test(base)) return prefix + base.slice(0, -1) + 'ies';
  if (/(ss|x|z|ch|sh)$/i.test(base)) return prefix + base + 'es';
  if (/s$/i.test(base)) return prefix + base;
  return prefix + base + 's';
}
