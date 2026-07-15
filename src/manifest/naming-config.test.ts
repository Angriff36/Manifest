import { describe, it, expect } from 'vitest';
import {
  resolveNamingConfig,
  validateNamingConfig,
  isLegacyNamingConvention,
  extractNamingConvention,
  resolveAlias,
} from './naming-config.js';
import { resolveBuildNaming, resolveProjectionOptions } from './config.js';

describe('naming-config — defaults / legacy', () => {
  it('defaults to normalization off', () => {
    const r = resolveNamingConfig(undefined);
    expect(r.normalization).toBe(false);
    expect(r.entities.mismatch).toBe('off');
  });

  it('treats snake_case shorthand as legacy convention with normalization off', () => {
    expect(isLegacyNamingConvention('snake_case')).toBe(true);
    const r = resolveNamingConfig('snake_case');
    expect(r.normalization).toBe(false);
    expect(extractNamingConvention('snake_case')).toBe('snake_case');
  });

  it('treats { table, column } as legacy', () => {
    const legacy = { table: 'snake_case' as const, column: 'snake_case' as const };
    expect(isLegacyNamingConvention(legacy)).toBe(true);
    expect(resolveNamingConfig(legacy).normalization).toBe(false);
  });
});

describe('naming-config — enabled policy', () => {
  it('enables recommended fix rules when normalization: true', () => {
    const r = resolveNamingConfig({ normalization: true });
    expect(r.normalization).toBe(true);
    expect(r.entities).toEqual({ casing: 'pascal', mismatch: 'fix' });
    expect(r.fields.casing).toBe('camel');
    expect(r.relationships.idSuffix).toBe('Id');
  });

  it('rejects invalid casing for a category', () => {
    const diags = validateNamingConfig({
      normalization: true,
      entities: { casing: 'not-a-case' as 'pascal' },
    });
    expect(diags.some((d) => d.severity === 'error')).toBe(true);
  });

  it('detects alias cycles', () => {
    const diags = validateNamingConfig({
      normalization: true,
      aliases: { a: 'b', b: 'a' },
    });
    expect(diags.some((d) => d.message.includes('cycle'))).toBe(true);
  });

  it('resolves alias chains', () => {
    expect(resolveAlias('writer', { writer: 'author' })).toBe('author');
  });
});

describe('naming-config — public config API', () => {
  it('resolveBuildNaming mirrors resolveNamingConfig', () => {
    expect(resolveBuildNaming({ naming: { normalization: true } }).normalization).toBe(true);
    expect(resolveBuildNaming(undefined).normalization).toBe(false);
  });

  it('resolveProjectionOptions layers convention and __manifestNaming', () => {
    const opts = resolveProjectionOptions(
      {
        naming: {
          normalization: true,
          convention: 'snake_case',
          projections: { convex: { tables: { Order: 'orders_v1' } } },
        },
        projections: { convex: { options: {} } },
      },
      'convex',
    );
    expect(opts.naming).toBe('snake_case');
    expect((opts.__manifestNaming as { projections: { convex: unknown } }).projections.convex).toEqual(
      { tables: { Order: 'orders_v1' } },
    );
  });
});
