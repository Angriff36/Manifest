/**
 * Identifier identity + house-form helpers used when naming.normalization is on.
 *
 * Identity key ignores case and separators. Configured casing / aliases /
 * plurals come from {@link ResolvedNamingConfig}.
 */

import {
  toCamelCase,
  toPascalCase,
  toSnakeCase,
  toKebabCase,
  pluralize,
  splitWords,
} from './naming-case.js';
import type { NamingCasing, ResolvedNamingConfig } from './naming-config.js';
import { resolveAlias } from './naming-config.js';

export { toCamelCase, toPascalCase, pluralize };

/** Alphanumeric fold used to treat casing/separator variants as one name. */
export function nameKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Prefer spellings that expose word boundaries over flat ALLCAPS/alllower. */
export function scoreSpelling(raw: string): number {
  const words = splitWords(raw).length;
  const hasSep = /[_-]/.test(raw) ? 2 : 0;
  const hasCamel = /[a-z][A-Z]/.test(raw) ? 2 : 0;
  const mixed = raw !== raw.toLowerCase() && raw !== raw.toUpperCase() ? 1 : 0;
  return words * 10 + hasSep + hasCamel + mixed;
}

/** Deterministic best raw spelling among aliases of one nameKey. */
export function pickBestSpelling(variants: string[]): string {
  if (variants.length === 0) return '';
  return [...variants].sort((a, b) => {
    const d = scoreSpelling(b) - scoreSpelling(a);
    if (d !== 0) return d;
    return a.localeCompare(b);
  })[0]!;
}

export function applyCasing(raw: string, casing: NamingCasing): string {
  switch (casing) {
    case 'preserve':
      return raw;
    case 'camel':
      return toCamelCase(raw);
    case 'pascal':
      return toPascalCase(raw);
    case 'snake':
      return toSnakeCase(raw);
    case 'kebab':
      return toKebabCase(raw);
    case 'upper':
      return toSnakeCase(raw).toUpperCase();
    case 'lower':
      return toSnakeCase(raw).toLowerCase().replace(/_/g, '');
    default:
      return raw;
  }
}

export function isAmbiguousFlatSpelling(raw: string): boolean {
  if (/[_-\s]/.test(raw)) return false;
  if (splitWords(raw).length > 1) return false;
  return raw === raw.toLowerCase() || (raw === raw.toUpperCase() && raw.length > 1);
}

export function canonicalEntityName(
  raw: string,
  variants?: string[],
  policy?: ResolvedNamingConfig,
): string {
  const aliased = policy ? resolveAlias(raw, policy.aliases) : raw;
  const best = pickBestSpelling(variants && variants.length > 0 ? variants : [aliased]);
  return applyCasing(best, policy?.entities.casing ?? 'pascal');
}

export function canonicalFieldName(
  raw: string,
  variants?: string[],
  policy?: ResolvedNamingConfig,
): string {
  const aliased = policy ? resolveAlias(raw, policy.aliases) : raw;
  const best = pickBestSpelling(variants && variants.length > 0 ? variants : [aliased]);
  return applyCasing(best, policy?.fields.casing ?? 'camel');
}

export function canonicalCommandName(
  raw: string,
  variants?: string[],
  policy?: ResolvedNamingConfig,
): string {
  const aliased = policy ? resolveAlias(raw, policy.aliases) : raw;
  const best = pickBestSpelling(variants && variants.length > 0 ? variants : [aliased]);
  return applyCasing(best, policy?.commands.casing ?? 'camel');
}

export function canonicalRelationshipName(
  raw: string,
  variants?: string[],
  policy?: ResolvedNamingConfig,
): string {
  const aliased = policy ? resolveAlias(raw, policy.aliases) : raw;
  const best = pickBestSpelling(variants && variants.length > 0 ? variants : [aliased]);
  return applyCasing(best, policy?.relationships.casing ?? 'camel');
}

export function canonicalEventName(
  raw: string,
  variants?: string[],
  policy?: ResolvedNamingConfig,
): string {
  const aliased = policy ? resolveAlias(raw, policy.aliases) : raw;
  const best = pickBestSpelling(variants && variants.length > 0 ? variants : [aliased]);
  return applyCasing(best, policy?.events.casing ?? 'pascal');
}

/** author → authorId (suffix from policy). */
export function relationshipIdField(
  relationshipName: string,
  policy?: ResolvedNamingConfig,
): string {
  const rel = canonicalRelationshipName(relationshipName, undefined, policy);
  const suffix = policy?.relationships.idSuffix ?? 'Id';
  const withoutId = rel.replace(new RegExp(`[_-]?${suffix}$`, 'i'), '').replace(/[_-]?id$/i, '');
  const base = withoutId.length > 0 ? withoutId : rel;
  const fieldBase = applyCasing(base, policy?.fields.casing ?? 'camel');
  if (fieldBase.toLowerCase().endsWith(suffix.toLowerCase())) return fieldBase;
  return `${fieldBase.replace(/Id$/i, '')}${suffix}`;
}

/** Default collection/table form from entity name + table rule. */
export function canonicalTableName(entityName: string, policy?: ResolvedNamingConfig): string {
  const entity = canonicalEntityName(entityName, undefined, policy);
  const irregular =
    policy?.irregularPlurals?.[entity] ??
    Object.entries(policy?.irregularPlurals ?? {}).find(
      ([k]) => nameKey(k) === nameKey(entity),
    )?.[1];
  const rule = policy?.tables ?? {
    casing: 'camel' as const,
    pluralization: 'automatic' as const,
    mismatch: 'fix' as const,
  };
  if (rule.pluralization !== 'automatic') {
    return applyCasing(entity, rule.casing);
  }
  if (irregular) return applyCasing(irregular, rule.casing);
  const snake = toSnakeCase(entity);
  return applyCasing(pluralize(snake), rule.casing);
}

/**
 * Strip a trailing Id / _id suffix to recover the relationship/word stem.
 */
export function stripIdSuffix(raw: string, idSuffix = 'Id'): string {
  const escaped = idSuffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return raw.replace(new RegExp(`[_-]?${escaped}$`, 'i'), '').replace(/[_-]?id$/i, '');
}

/**
 * True when `field` is a spelling (or alias spelling) of the relationship's
 * configured FK form — e.g. writerId ≈ authorId when aliases map writer→author.
 */
export function isMechanicalIdAlias(
  relationshipName: string,
  field: string,
  policy?: ResolvedNamingConfig,
): boolean {
  const expected = relationshipIdField(relationshipName, policy);
  if (nameKey(field) === nameKey(expected)) return true;
  if (!policy?.aliases || Object.keys(policy.aliases).length === 0) return false;
  const suffix = policy.relationships.idSuffix ?? 'Id';
  const fieldStem = resolveAlias(stripIdSuffix(field, suffix), policy.aliases);
  return nameKey(relationshipIdField(fieldStem, policy)) === nameKey(expected);
}

const RESERVED_IDENTIFIERS = new Set([
  'self',
  'this',
  'user',
  'context',
  'true',
  'false',
  'null',
  'params',
]);

export function isReservedIdentifier(name: string): boolean {
  return RESERVED_IDENTIFIERS.has(name) || RESERVED_IDENTIFIERS.has(name.toLowerCase());
}

export class CanonicalNameRegistry {
  private readonly entityVariants = new Map<string, string[]>();
  private readonly enumVariants = new Map<string, string[]>();
  private readonly eventVariants = new Map<string, string[]>();
  private readonly valueVariants = new Map<string, string[]>();
  private policy: ResolvedNamingConfig | undefined;

  constructor(policy?: ResolvedNamingConfig) {
    this.policy = policy;
  }

  setPolicy(policy: ResolvedNamingConfig): void {
    this.policy = policy;
  }

  addEntity(raw: string): void {
    this.add(this.entityVariants, raw);
  }

  addEnum(raw: string): void {
    this.add(this.enumVariants, raw);
  }

  addEvent(raw: string): void {
    this.add(this.eventVariants, raw);
  }

  addValue(raw: string): void {
    this.add(this.valueVariants, raw);
  }

  entity(raw: string): string {
    return canonicalEntityName(raw, this.entityVariants.get(nameKey(raw)), this.policy);
  }

  enum(raw: string): string {
    return canonicalEntityName(raw, this.enumVariants.get(nameKey(raw)), this.policy);
  }

  event(raw: string): string {
    return canonicalEventName(raw, this.eventVariants.get(nameKey(raw)), this.policy);
  }

  value(raw: string): string {
    return canonicalEntityName(raw, this.valueVariants.get(nameKey(raw)), this.policy);
  }

  field(raw: string): string {
    return canonicalFieldName(raw, undefined, this.policy);
  }

  command(raw: string): string {
    return canonicalCommandName(raw, undefined, this.policy);
  }

  relationship(raw: string): string {
    return canonicalRelationshipName(raw, undefined, this.policy);
  }

  identifier(raw: string): string {
    if (isReservedIdentifier(raw)) return raw;
    const key = nameKey(raw);
    if (this.entityVariants.has(key)) return this.entity(raw);
    if (this.enumVariants.has(key)) return this.enum(raw);
    if (this.eventVariants.has(key)) return this.event(raw);
    if (this.valueVariants.has(key)) return this.value(raw);
    return this.field(raw);
  }

  private add(map: Map<string, string[]>, raw: string): void {
    const aliased = this.policy ? resolveAlias(raw, this.policy.aliases) : raw;
    const key = nameKey(aliased);
    if (!key) return;
    const list = map.get(key) ?? [];
    list.push(raw);
    map.set(key, list);
  }
}
