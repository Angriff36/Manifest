/**
 * IR sample seed pack — shared types.
 *
 * Pack-local identity is `seedKey` (never the store id).
 * Clear authority is SampleDataRow only (never tags/source).
 */

export const SAMPLE_DATA_ROW_ENTITY = 'SampleDataRow';

/** Cells that `--fill` may overwrite by default. */
export const FILL_PLACEHOLDER = '{{fill}}';

export interface SeedPackMeta {
  packId: string;
  version: string;
  profile?: 'dev' | 'staging' | 'demo';
  /** Entity names included in this pack (stable order for docs; apply is two-phase). */
  entities: string[];
}

/** One CSV row: seedKey + property/relationship columns as strings. */
export type SeedRow = Record<string, string>;

export interface SeedEntityTable {
  entity: string;
  /** Column order for CSV round-trip. Always includes seedKey first. */
  columns: string[];
  rows: SeedRow[];
}

export interface SeedPack {
  meta: SeedPackMeta;
  tables: SeedEntityTable[];
}

/** Persisted tracking row — sole authority for clear. */
export interface SampleDataRowRecord {
  id: string;
  tenantId: string;
  packId: string;
  version: string;
  entity: string;
  seedKey: string;
  instanceId: string;
}

export function isBlankCell(value: string | undefined | null): boolean {
  if (value == null) return true;
  const trimmed = value.trim();
  return trimmed === '' || trimmed === FILL_PLACEHOLDER;
}

export function slugEntity(entityName: string): string {
  return entityName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}

export interface SeedFillEntityInput {
  entityName: string;
  columns: string[];
  rows: SeedRow[];
  /** Relationship column → allowed target seedKeys already in the pack. */
  allowedSeedKeys: Record<string, string[]>;
  overwrite: boolean;
}

export interface SeedFillProvider {
  fillEntity(input: SeedFillEntityInput): Promise<SeedRow[]>;
}
