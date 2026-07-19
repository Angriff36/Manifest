import { describe, it, expect } from 'vitest';
import { resolveNamingConfig, validateNamingConfig } from './naming-config.js';
import {
  canonicalEntityName,
  canonicalFieldName,
  canonicalCommandName,
  canonicalEventName,
  canonicalTableName,
  relationshipIdField,
  isAmbiguousFlatSpelling,
  isMechanicalIdAlias,
} from './canonical-names.js';
import { detectStorageNameChanges } from './naming-storage-guard.js';
import { compileToIR } from './ir-compiler.js';

describe('naming — severities off/warn/error/fix', () => {
  it('off ignores mismatches', async () => {
    const naming = resolveNamingConfig({
      normalization: true,
      entities: { casing: 'pascal', mismatch: 'off' },
      fields: { casing: 'camel', mismatch: 'off' },
    });
    const result = await compileToIR(`entity event_date { property required TITLE: string }`, {
      useCache: false,
      naming,
    });
    expect(result.ir!.entities[0]!.name).toBe('event_date');
    expect(result.diagnostics.filter((d) => d.message.includes('Naming mismatch'))).toHaveLength(0);
  });
});

describe('naming — category casing helpers', () => {
  const on = resolveNamingConfig({ normalization: true });
  it('applies entity/field/command/event/table/relationship forms', () => {
    expect(canonicalEntityName('event_date', undefined, on)).toBe('EventDate');
    expect(canonicalFieldName('EVENT_DATE', undefined, on)).toBe('eventDate');
    expect(canonicalCommandName('Create_Order', undefined, on)).toBe('createOrder');
    expect(canonicalEventName('order_created', undefined, on)).toBe('OrderCreated');
    expect(canonicalTableName('EventDate', on)).toBe('eventDates');
    expect(relationshipIdField('author', on)).toBe('authorId');
  });

  it('irregular plurals override automatic table pluralization', () => {
    const naming = resolveNamingConfig({
      normalization: true,
      irregularPlurals: { Person: 'people', Category: 'categories' },
    });
    expect(canonicalTableName('Person', naming)).toBe('people');
    expect(canonicalTableName('Category', naming)).toBe('categories');
  });

  it('preserve pluralization keeps singular casing only', () => {
    const naming = resolveNamingConfig({
      normalization: true,
      tables: { casing: 'camel', pluralization: 'preserve', mismatch: 'fix' },
    });
    expect(canonicalTableName('EventDate', naming)).toBe('eventDate');
  });
});

describe('naming — ambiguous word boundaries', () => {
  it('flags flat spellings when configured', async () => {
    expect(isAmbiguousFlatSpelling('eventdate')).toBe(true);
    expect(isAmbiguousFlatSpelling('EventDate')).toBe(false);
    const naming = resolveNamingConfig({
      normalization: true,
      ambiguousWordBoundaries: 'warn',
    });
    const result = await compileToIR(
      `entity eventdate { property required title: string }
       store eventdate in durable`,
      { useCache: false, naming },
    );
    expect(result.diagnostics.some((d) => d.message.includes('Ambiguous word boundaries'))).toBe(
      true,
    );
  });
});

describe('naming — storage drift + mapping collisions', () => {
  it('blocks deployed table renames without a legacy mapping', () => {
    const policy = resolveNamingConfig({
      normalization: true,
      storageNameChange: 'error',
    });
    const diags = detectStorageNameChanges(
      policy,
      'convex',
      { tables: { CateringEvent: 'cateringEvents' } },
      { tables: { CateringEvent: 'events' } },
    );
    expect(diags.some((d) => d.severity === 'error' && d.message.includes('table rename'))).toBe(
      true,
    );
  });

  it('allows rename when legacy mapping acknowledges prior name', () => {
    const policy = resolveNamingConfig({
      normalization: true,
      projections: { convex: { tables: { CateringEvent: 'events' } } },
    });
    const diags = detectStorageNameChanges(
      policy,
      'convex',
      { tables: { CateringEvent: 'cateringEvents' } },
      { tables: { CateringEvent: 'events' } },
    );
    expect(diags.some((d) => d.message.includes('table rename'))).toBe(false);
    expect(diags.some((d) => d.message.includes('Legacy convex table mapping'))).toBe(true);
  });

  it('errors on colliding legacy table mappings in validateNamingConfig', () => {
    const diags = validateNamingConfig({
      normalization: true,
      projections: {
        convex: { tables: { Order: 'items', Line: 'items' } },
      },
    });
    expect(diags.some((d) => d.severity === 'error' && d.message.includes('both map'))).toBe(true);
  });

  it('detects proposed table collisions', () => {
    const policy = resolveNamingConfig({ normalization: true });
    const diags = detectStorageNameChanges(policy, 'convex', {
      tables: { Foo: 'things', Bar: 'things' },
    });
    expect(diags.some((d) => d.message.includes('Storage table collision'))).toBe(true);
  });
});

describe('naming — alias mechanical id', () => {
  it('treats writerId as authorId when aliased', () => {
    const naming = resolveNamingConfig({
      normalization: true,
      aliases: { writer: 'author' },
    });
    expect(isMechanicalIdAlias('author', 'writerId', naming)).toBe(true);
  });
});
