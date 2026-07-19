/**
 * Resolved naming configuration — master toggle + per-category rules.
 *
 * Extends the existing top-level `naming` key. Legacy values
 * (`'snake_case'` / `{ table, column, pluralizeTables }`) remain valid and
 * mean: normalization OFF + physical projection convention only.
 */

import type { NamingConventionInput } from './projections/shared/naming.js';
import { normalizeNaming } from './projections/shared/naming.js';

/** How to handle a name that does not match the configured house form. */
export type NamingRuleSeverity = 'off' | 'warn' | 'error' | 'fix';

/** Configurable casing styles for identifiers / storage names. */
export type NamingCasing = 'preserve' | 'camel' | 'pascal' | 'snake' | 'kebab' | 'upper' | 'lower';

export type PluralizationMode = 'preserve' | 'automatic' | 'explicit';

export type SeparatorKind = 'underscore' | 'hyphen' | 'whitespace';

export interface NamingCategoryRule {
  casing?: NamingCasing;
  mismatch?: NamingRuleSeverity;
}

export interface NamingRelationshipRule extends NamingCategoryRule {
  /** Suffix for relationship foreign keys. Default `'Id'`. */
  idSuffix?: string;
}

export interface NamingCollectionRule extends NamingCategoryRule {
  pluralization?: PluralizationMode;
}

export interface NamingProjectionStorageMappings {
  /** Canonical entity name → deployed table/collection name. */
  tables?: Record<string, string>;
  /**
   * Canonical field key → deployed column name.
   * Key forms: `Entity.field` or `Entity.relationship` (relationship FK).
   */
  fields?: Record<string, string>;
}

/**
 * Expanded naming block (normalization + rules). Legacy convention-only values
 * are accepted separately — see {@link ManifestNamingInput}.
 */
export interface NamingNormalizationConfig {
  /** Master switch. Default false (backward compatible). */
  normalization?: boolean;
  /**
   * Physical DB/route convention inherited by projections (former top-level
   * `naming` value). Optional when using the expanded block.
   */
  convention?: NamingConventionInput;
  entities?: NamingCategoryRule;
  fields?: NamingCategoryRule;
  relationships?: NamingRelationshipRule;
  commands?: NamingCategoryRule;
  events?: NamingCategoryRule;
  collections?: NamingCollectionRule;
  tables?: NamingCollectionRule;
  separators?: { normalize?: SeparatorKind[] };
  collisions?: 'off' | 'warn' | 'error';
  conflictingDefinitions?: 'off' | 'warn' | 'error';
  ambiguousWordBoundaries?: NamingRuleSeverity;
  irregularPlurals?: Record<string, string>;
  /** Semantic aliases: different words intentionally the same (`writer` → `author`). */
  aliases?: Record<string, string>;
  /** Projection-only storage remaps; Manifest canonical names stay unchanged. */
  projections?: {
    convex?: NamingProjectionStorageMappings;
    prisma?: NamingProjectionStorageMappings;
  };
  /**
   * When normalization would change a storage name from the verbatim IR spelling,
   * require a legacy mapping or acknowledge drift. Default `'error'` when
   * normalization is on.
   */
  storageNameChange?: 'off' | 'warn' | 'error';
}

/**
 * Public config input for `naming:` — legacy convention OR expanded block.
 */
export type ManifestNamingInput = NamingConventionInput | NamingNormalizationConfig;

export interface ResolvedCategoryRule {
  casing: NamingCasing;
  mismatch: NamingRuleSeverity;
}

export interface ResolvedRelationshipRule extends ResolvedCategoryRule {
  idSuffix: string;
}

export interface ResolvedCollectionRule extends ResolvedCategoryRule {
  pluralization: PluralizationMode;
}

export interface ResolvedNamingConfig {
  normalization: boolean;
  /** Physical convention for projections (may be undefined = preserve IR names). */
  convention?: NamingConventionInput;
  entities: ResolvedCategoryRule;
  fields: ResolvedCategoryRule;
  relationships: ResolvedRelationshipRule;
  commands: ResolvedCategoryRule;
  events: ResolvedCategoryRule;
  collections: ResolvedCollectionRule;
  tables: ResolvedCollectionRule;
  separators: { normalize: SeparatorKind[] };
  collisions: 'off' | 'warn' | 'error';
  conflictingDefinitions: 'off' | 'warn' | 'error';
  ambiguousWordBoundaries: NamingRuleSeverity;
  irregularPlurals: Record<string, string>;
  aliases: Record<string, string>;
  projections: {
    convex?: NamingProjectionStorageMappings;
    prisma?: NamingProjectionStorageMappings;
  };
  storageNameChange: 'off' | 'warn' | 'error';
}

const DEFAULT_SEPARATORS: SeparatorKind[] = ['underscore', 'hyphen', 'whitespace'];

const RECOMMENDED_WHEN_ENABLED: Omit<
  ResolvedNamingConfig,
  'normalization' | 'convention' | 'irregularPlurals' | 'aliases' | 'projections'
> = {
  entities: { casing: 'pascal', mismatch: 'fix' },
  fields: { casing: 'camel', mismatch: 'fix' },
  relationships: { casing: 'camel', idSuffix: 'Id', mismatch: 'fix' },
  commands: { casing: 'camel', mismatch: 'fix' },
  events: { casing: 'pascal', mismatch: 'fix' },
  collections: { casing: 'camel', pluralization: 'automatic', mismatch: 'fix' },
  tables: { casing: 'camel', pluralization: 'automatic', mismatch: 'fix' },
  separators: { normalize: [...DEFAULT_SEPARATORS] },
  collisions: 'error',
  conflictingDefinitions: 'error',
  ambiguousWordBoundaries: 'warn',
  storageNameChange: 'error',
};

/** True when the value is the legacy physical-convention-only form. */
export function isLegacyNamingConvention(value: unknown): boolean {
  if (value === 'snake_case') return true;
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length === 0) return true;
  const legacyKeys = new Set(['table', 'column', 'pluralizeTables']);
  return keys.every((k) => legacyKeys.has(k));
}

export type NamingConfigDiagnostic = { severity: 'error' | 'warning'; message: string };

/**
 * Validate raw naming config. Returns diagnostics; does not throw.
 * Invalid casing/severity combos and alias cycles are errors.
 */
export function validateNamingConfig(raw: unknown): NamingConfigDiagnostic[] {
  const diags: NamingConfigDiagnostic[] = [];
  if (raw == null) return diags;
  if (isLegacyNamingConvention(raw)) return diags;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    diags.push({
      severity: 'error',
      message: 'naming must be an object or the string "snake_case".',
    });
    return diags;
  }
  const o = raw as NamingNormalizationConfig;
  const severities = new Set(['off', 'warn', 'error', 'fix']);
  const casings = new Set(['preserve', 'camel', 'pascal', 'snake', 'kebab', 'upper', 'lower']);
  const plurals = new Set(['preserve', 'automatic', 'explicit']);

  const checkCategory = (
    label: string,
    rule: NamingCategoryRule | undefined,
    allow: NamingCasing[],
  ) => {
    if (!rule) return;
    if (rule.casing != null && !allow.includes(rule.casing)) {
      diags.push({
        severity: 'error',
        message: `naming.${label}.casing '${rule.casing}' is not valid for ${label}. Allowed: ${allow.join(', ')}.`,
      });
    }
    if (rule.casing != null && !casings.has(rule.casing)) {
      diags.push({
        severity: 'error',
        message: `naming.${label}.casing '${rule.casing}' is unknown.`,
      });
    }
    if (rule.mismatch != null && !severities.has(rule.mismatch)) {
      diags.push({
        severity: 'error',
        message: `naming.${label}.mismatch '${rule.mismatch}' is unknown (use off|warn|error|fix).`,
      });
    }
  };

  checkCategory('entities', o.entities, [
    'preserve',
    'pascal',
    'camel',
    'snake',
    'kebab',
    'upper',
    'lower',
  ]);
  checkCategory('fields', o.fields, [
    'preserve',
    'camel',
    'pascal',
    'snake',
    'kebab',
    'upper',
    'lower',
  ]);
  checkCategory('relationships', o.relationships, [
    'preserve',
    'camel',
    'pascal',
    'snake',
    'kebab',
  ]);
  checkCategory('commands', o.commands, ['preserve', 'camel', 'pascal', 'snake', 'kebab']);
  checkCategory('events', o.events, [
    'preserve',
    'pascal',
    'camel',
    'snake',
    'kebab',
    'upper',
    'lower',
  ]);
  checkCategory('collections', o.collections, [
    'preserve',
    'camel',
    'pascal',
    'snake',
    'kebab',
    'lower',
  ]);
  checkCategory('tables', o.tables, ['preserve', 'camel', 'pascal', 'snake', 'kebab', 'lower']);

  for (const key of ['collections', 'tables'] as const) {
    const rule = o[key];
    if (rule?.pluralization != null && !plurals.has(rule.pluralization)) {
      diags.push({
        severity: 'error',
        message: `naming.${key}.pluralization '${rule.pluralization}' is unknown.`,
      });
    }
  }

  if (o.aliases) {
    diags.push(...validateAliases(o.aliases));
  }

  // Projection storage mapping collisions (same target, different symbols).
  for (const proj of ['convex', 'prisma'] as const) {
    const maps = o.projections?.[proj];
    if (!maps) continue;
    if (maps.tables) {
      const byTarget = new Map<string, string>();
      for (const [entity, table] of Object.entries(maps.tables)) {
        diags.push({
          severity: 'warning',
          message: `naming.projections.${proj}.tables.${entity}: legacy storage mapping to '${table}' is active.`,
        });
        const k = table.toLowerCase();
        const prev = byTarget.get(k);
        if (prev && prev !== entity) {
          diags.push({
            severity: 'error',
            message: `naming.projections.${proj}.tables: '${prev}' and '${entity}' both map to '${table}'.`,
          });
        } else {
          byTarget.set(k, entity);
        }
      }
    }
    if (maps.fields) {
      const byTarget = new Map<string, string>();
      for (const [key, col] of Object.entries(maps.fields)) {
        diags.push({
          severity: 'warning',
          message: `naming.projections.${proj}.fields['${key}']: legacy storage mapping to '${col}' is active.`,
        });
        const entity = key.split('.')[0] ?? '';
        const k = `${entity}::${col.toLowerCase()}`;
        const prev = byTarget.get(k);
        if (prev && prev !== key) {
          diags.push({
            severity: 'error',
            message: `naming.projections.${proj}.fields: '${prev}' and '${key}' both map to '${col}'.`,
          });
        } else {
          byTarget.set(k, key);
        }
      }
    }
  }

  return diags;
}

function validateAliases(aliases: Record<string, string>): NamingConfigDiagnostic[] {
  const diags: NamingConfigDiagnostic[] = [];
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [from, to] of Object.entries(aliases)) {
    if (!from || !to) {
      diags.push({
        severity: 'error',
        message: `naming.aliases entry '${from}' → '${to}' is empty.`,
      });
      continue;
    }
    if (key(from) === key(to)) {
      diags.push({
        severity: 'error',
        message: `naming.aliases '${from}' → '${to}' is a no-op (same identity key).`,
      });
    }
  }
  // Cycle detection
  for (const start of Object.keys(aliases)) {
    const seen = new Set<string>();
    let cur: string | undefined = start;
    while (cur) {
      const k = key(cur);
      if (seen.has(k)) {
        diags.push({
          severity: 'error',
          message: `naming.aliases cycle detected involving '${start}'.`,
        });
        break;
      }
      seen.add(k);
      const next = Object.entries(aliases).find(([f]) => key(f) === k)?.[1];
      cur = next;
      if (cur && !Object.keys(aliases).some((f) => key(f) === key(cur!))) break;
      // stop if target is not also an alias source
      if (next && !Object.keys(aliases).some((f) => key(f) === key(next))) break;
    }
  }
  return diags;
}

/**
 * Resolve raw config `naming` to a fully populated policy.
 * Legacy / omitted → normalization false (current behavior preserved).
 */
function withMismatchOff(
  base: Omit<
    ResolvedNamingConfig,
    'normalization' | 'convention' | 'irregularPlurals' | 'aliases' | 'projections'
  >,
): typeof base {
  return {
    ...base,
    entities: { ...base.entities, mismatch: 'off' },
    fields: { ...base.fields, mismatch: 'off' },
    relationships: { ...base.relationships, mismatch: 'off' },
    commands: { ...base.commands, mismatch: 'off' },
    events: { ...base.events, mismatch: 'off' },
    collections: { ...base.collections, mismatch: 'off' },
    tables: { ...base.tables, mismatch: 'off' },
  };
}

export function resolveNamingConfig(raw?: ManifestNamingInput | null): ResolvedNamingConfig {
  if (raw == null) {
    return {
      normalization: false,
      convention: undefined,
      ...withMismatchOff(RECOMMENDED_WHEN_ENABLED),
      irregularPlurals: {},
      aliases: {},
      projections: {},
      storageNameChange: 'off',
    };
  }

  if (isLegacyNamingConvention(raw)) {
    return {
      normalization: false,
      convention: raw as NamingConventionInput,
      ...withMismatchOff(RECOMMENDED_WHEN_ENABLED),
      irregularPlurals: {},
      aliases: {},
      projections: {},
      storageNameChange: 'off',
    };
  }

  const o = raw as NamingNormalizationConfig;
  const enabled = o.normalization === true;
  const base = RECOMMENDED_WHEN_ENABLED;

  const cat = (
    rule: NamingCategoryRule | undefined,
    fallback: ResolvedCategoryRule,
  ): ResolvedCategoryRule => ({
    casing: rule?.casing ?? fallback.casing,
    mismatch: enabled ? (rule?.mismatch ?? fallback.mismatch) : 'off',
  });

  const resolved: ResolvedNamingConfig = {
    normalization: enabled,
    convention: o.convention,
    entities: cat(o.entities, base.entities),
    fields: cat(o.fields, base.fields),
    relationships: {
      ...cat(o.relationships, base.relationships),
      idSuffix: o.relationships?.idSuffix ?? base.relationships.idSuffix,
    },
    commands: cat(o.commands, base.commands),
    events: cat(o.events, base.events),
    collections: {
      ...cat(o.collections, base.collections),
      pluralization: o.collections?.pluralization ?? base.collections.pluralization,
    },
    tables: {
      ...cat(o.tables, base.tables),
      pluralization: o.tables?.pluralization ?? base.tables.pluralization,
    },
    separators: {
      normalize: o.separators?.normalize ?? [...DEFAULT_SEPARATORS],
    },
    collisions: o.collisions ?? base.collisions,
    conflictingDefinitions: o.conflictingDefinitions ?? base.conflictingDefinitions,
    ambiguousWordBoundaries: o.ambiguousWordBoundaries ?? base.ambiguousWordBoundaries,
    irregularPlurals: { ...(o.irregularPlurals ?? {}) },
    aliases: { ...(o.aliases ?? {}) },
    projections: {
      ...(o.projections?.convex ? { convex: o.projections.convex } : {}),
      ...(o.projections?.prisma ? { prisma: o.projections.prisma } : {}),
    },
    storageNameChange: enabled ? (o.storageNameChange ?? base.storageNameChange) : 'off',
  };

  // When normalization is off, force mismatch handling off so callers can
  // still read recommended casing without applying it.
  if (!enabled) {
    resolved.entities = { ...resolved.entities, mismatch: 'off' };
    resolved.fields = { ...resolved.fields, mismatch: 'off' };
    resolved.relationships = { ...resolved.relationships, mismatch: 'off' };
    resolved.commands = { ...resolved.commands, mismatch: 'off' };
    resolved.events = { ...resolved.events, mismatch: 'off' };
    resolved.collections = { ...resolved.collections, mismatch: 'off' };
    resolved.tables = { ...resolved.tables, mismatch: 'off' };
  }

  return resolved;
}

/** Extract the physical convention for `resolveProjectionOptions` inheritance. */
export function extractNamingConvention(
  naming: ManifestNamingInput | undefined,
): NamingConventionInput | undefined {
  if (naming == null) return undefined;
  if (isLegacyNamingConvention(naming)) return naming as NamingConventionInput;
  const o = naming as NamingNormalizationConfig;
  return o.convention;
}

/** Follow alias chain to the terminal word (no cycles — validate first). */
export function resolveAlias(word: string, aliases: Record<string, string>): string {
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  let cur = word;
  const seen = new Set<string>();
  for (;;) {
    const k = key(cur);
    if (seen.has(k)) return cur;
    seen.add(k);
    const hit = Object.entries(aliases).find(([f]) => key(f) === k);
    if (!hit) return cur;
    cur = hit[1];
  }
}

/** Whether `normalizeNaming` would treat this as an active convention. */
export function hasActiveConvention(convention: NamingConventionInput | undefined): boolean {
  return normalizeNaming(convention) !== undefined;
}
