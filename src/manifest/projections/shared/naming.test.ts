/**
 * Unit tests for the deterministic casing + pluralization helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  toSnakeCase,
  toCamelCase,
  toPascalCase,
  pluralize,
  normalizeNaming,
  resolveTableName,
  resolveColumnName,
} from './naming.js';

describe('case transforms', () => {
  it('toSnakeCase handles camelCase, PascalCase, acronyms and separators', () => {
    expect(toSnakeCase('createdAt')).toBe('created_at');
    expect(toSnakeCase('Widget')).toBe('widget');
    expect(toSnakeCase('authorId')).toBe('author_id');
    expect(toSnakeCase('UserAccount')).toBe('user_account');
    expect(toSnakeCase('HTTPServer')).toBe('http_server');
    expect(toSnakeCase('already_snake')).toBe('already_snake');
    expect(toSnakeCase('kebab-case')).toBe('kebab_case');
  });

  it('toPascalCase normalizes from any style', () => {
    expect(toPascalCase('created_at')).toBe('CreatedAt');
    expect(toPascalCase('createdAt')).toBe('CreatedAt');
    expect(toPascalCase('widget')).toBe('Widget');
  });

  it('toCamelCase normalizes from any style', () => {
    expect(toCamelCase('created_at')).toBe('createdAt');
    expect(toCamelCase('Widget')).toBe('widget');
    expect(toCamelCase('UserAccount')).toBe('userAccount');
  });

  it('transforms are deterministic (idempotent for snake→snake)', () => {
    expect(toSnakeCase(toSnakeCase('createdAt'))).toBe('created_at');
  });
});

describe('pluralize', () => {
  it('applies common English rules', () => {
    expect(pluralize('widget')).toBe('widgets');
    expect(pluralize('box')).toBe('boxes');
    expect(pluralize('class')).toBe('classes');
    expect(pluralize('dish')).toBe('dishes');
    expect(pluralize('category')).toBe('categories');
    expect(pluralize('day')).toBe('days'); // vowel + y → just +s
  });

  it('handles irregulars', () => {
    expect(pluralize('person')).toBe('people');
    expect(pluralize('child')).toBe('children');
  });

  it('preserves snake_case prefix, pluralizing only the final word', () => {
    expect(pluralize('user_account')).toBe('user_accounts');
    expect(pluralize('order_category')).toBe('order_categories');
  });

  it('is idempotent for already-plural words', () => {
    expect(pluralize('widgets')).toBe('widgets');
    expect(pluralize(pluralize('widget'))).toBe('widgets');
  });
});

describe('normalizeNaming', () => {
  it('returns undefined for no convention (back-compat)', () => {
    expect(normalizeNaming(undefined)).toBeUndefined();
  });

  it("expands the 'snake_case' shorthand", () => {
    expect(normalizeNaming('snake_case')).toEqual({
      table: 'snake_case',
      column: 'snake_case',
      pluralizeTables: true,
    });
  });

  it('fills object defaults (preserve case, pluralize on)', () => {
    expect(normalizeNaming({ column: 'snake_case' })).toEqual({
      table: 'preserve',
      column: 'snake_case',
      pluralizeTables: true,
    });
  });
});

describe('resolveTableName / resolveColumnName', () => {
  it('return input unchanged when no convention', () => {
    expect(resolveTableName('Widget')).toBe('Widget');
    expect(resolveColumnName('createdAt')).toBe('createdAt');
  });

  it('apply snake_case + pluralization to tables', () => {
    expect(resolveTableName('UserAccount', 'snake_case')).toBe('user_accounts');
  });

  it('apply snake_case to columns without pluralization', () => {
    expect(resolveColumnName('createdAt', 'snake_case')).toBe('created_at');
  });

  it('respect pluralizeTables: false', () => {
    expect(resolveTableName('Widget', { table: 'snake_case', pluralizeTables: false })).toBe('widget');
  });
});
