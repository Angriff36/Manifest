import { describe, it, expect } from 'vitest';
import {
  analyzeConstraintExpression,
  analyzeConstraints,
  numericRangeToCheckConstraint,
  lengthConstraintToCheckConstraint,
  numericRangeToZodChain,
  lengthConstraintToZodChain,
  patternConstraintToCheckConstraint,
  patternConstraintToZodChain,
} from './constraint-analysis';
import type { IRExpression, IRConstraint } from './ir';

// Helper to build IR expressions
function lit(value: number | string | boolean | null): IRExpression {
  if (value === null) return { kind: 'literal', value: { kind: 'null' } };
  if (typeof value === 'number') return { kind: 'literal', value: { kind: 'number', value } };
  if (typeof value === 'string') return { kind: 'literal', value: { kind: 'string', value } };
  return { kind: 'literal', value: { kind: 'boolean', value } };
}

function id(name: string): IRExpression {
  return { kind: 'identifier', name };
}

function member(obj: IRExpression, prop: string): IRExpression {
  return { kind: 'member', object: obj, property: prop };
}

function self(prop: string): IRExpression {
  return member(id('self'), prop);
}

function call(name: string, ...args: IRExpression[]): IRExpression {
  return { kind: 'call', callee: id(name), args };
}

function binary(op: string, left: IRExpression, right: IRExpression): IRExpression {
  return { kind: 'binary', operator: op, left, right };
}

function constraint(name: string, expression: IRExpression): IRConstraint {
  return {
    name,
    code: name,
    expression,
    severity: 'block',
    overrideable: false,
  };
}

describe('constraint-analysis', () => {
  describe('analyzeConstraintExpression', () => {
    it('extracts range from between(self.price, 0, 1000)', () => {
      const result = analyzeConstraintExpression(call('between', self('price'), lit(0), lit(1000)));
      expect(result.numericRanges).toHaveLength(1);
      expect(result.numericRanges[0]).toEqual({
        min: 0,
        max: 1000,
        propertyPath: 'self.price',
      });
    });

    it('extracts lower bound from min(self.age, 18)', () => {
      const result = analyzeConstraintExpression(call('min', self('age'), lit(18)));
      expect(result.numericRanges).toHaveLength(1);
      expect(result.numericRanges[0]).toEqual({
        min: 18,
        propertyPath: 'self.age',
      });
    });

    it('extracts upper bound from max(self.score, 100)', () => {
      const result = analyzeConstraintExpression(call('max', self('score'), lit(100)));
      expect(result.numericRanges).toHaveLength(1);
      expect(result.numericRanges[0]).toEqual({
        max: 100,
        propertyPath: 'self.score',
      });
    });

    it('extracts min length from length(self.name) >= 1', () => {
      const result = analyzeConstraintExpression(
        binary('>=', call('length', self('name')), lit(1)),
      );
      expect(result.lengthConstraints).toHaveLength(1);
      expect(result.lengthConstraints[0]).toEqual({
        minLength: 1,
        propertyPath: 'self.name',
      });
    });

    it('extracts max length from length(self.bio) <= 500', () => {
      const result = analyzeConstraintExpression(
        binary('<=', call('length', self('bio')), lit(500)),
      );
      expect(result.lengthConstraints).toHaveLength(1);
      expect(result.lengthConstraints[0]).toEqual({
        maxLength: 500,
        propertyPath: 'self.bio',
      });
    });

    it('extracts range from self.price > 0', () => {
      const result = analyzeConstraintExpression(binary('>', self('price'), lit(0)));
      expect(result.numericRanges).toHaveLength(1);
      expect(result.numericRanges[0]).toEqual({
        min: 1,
        propertyPath: 'self.price',
      });
    });

    it('extracts range from self.price >= 0', () => {
      const result = analyzeConstraintExpression(binary('>=', self('price'), lit(0)));
      expect(result.numericRanges).toHaveLength(1);
      expect(result.numericRanges[0]).toEqual({
        min: 0,
        propertyPath: 'self.price',
      });
    });

    it('extracts range from self.quantity <= 100', () => {
      const result = analyzeConstraintExpression(binary('<=', self('quantity'), lit(100)));
      expect(result.numericRanges).toHaveLength(1);
      expect(result.numericRanges[0]).toEqual({
        max: 100,
        propertyPath: 'self.quantity',
      });
    });

    it('extracts range from reversed binary: 0 < self.price', () => {
      const result = analyzeConstraintExpression(binary('<', lit(0), self('price')));
      expect(result.numericRanges).toHaveLength(1);
      expect(result.numericRanges[0]).toEqual({
        min: 1,
        propertyPath: 'self.price',
      });
    });

    it('extracts pattern from matches(self.email, "^[^@]+@[^@]+$")', () => {
      const result = analyzeConstraintExpression(
        call('matches', self('email'), lit('^[^@]+@[^@]+$')),
      );
      expect(result.patternConstraints).toHaveLength(1);
      expect(result.patternConstraints[0]).toEqual({
        pattern: '^[^@]+@[^@]+$',
        propertyPath: 'self.email',
      });
    });

    it('returns empty pattern for matches with non-literal pattern', () => {
      const result = analyzeConstraintExpression(call('matches', self('email'), self('pattern')));
      expect(result.patternConstraints).toHaveLength(0);
    });

    it('returns empty for unrecognized expressions', () => {
      const result = analyzeConstraintExpression(binary('==', self('status'), lit('active')));
      expect(result.numericRanges).toHaveLength(0);
      expect(result.lengthConstraints).toHaveLength(0);
    });

    it('returns empty for between with non-literal args', () => {
      const result = analyzeConstraintExpression(
        call('between', self('price'), self('minVal'), lit(100)),
      );
      expect(result.numericRanges).toHaveLength(0);
    });
  });

  describe('analyzeConstraints', () => {
    it('merges multiple constraints on the same property', () => {
      const constraints = [
        constraint('priceMin', binary('>=', self('price'), lit(0))),
        constraint('priceMax', binary('<=', self('price'), lit(1000))),
      ];
      const result = analyzeConstraints(constraints);
      expect(result.numericRanges).toHaveLength(1);
      expect(result.numericRanges[0]).toEqual({
        min: 0,
        max: 1000,
        propertyPath: 'self.price',
      });
    });

    it('merges min/max length constraints on same property', () => {
      const constraints = [
        constraint('nameMinLen', binary('>=', call('length', self('name')), lit(1))),
        constraint('nameMaxLen', binary('<=', call('length', self('name')), lit(255))),
      ];
      const result = analyzeConstraints(constraints);
      expect(result.lengthConstraints).toHaveLength(1);
      expect(result.lengthConstraints[0]).toEqual({
        minLength: 1,
        maxLength: 255,
        propertyPath: 'self.name',
      });
    });

    it('handles between + length constraints together', () => {
      const constraints = [
        constraint('priceRange', call('between', self('price'), lit(1), lit(10000))),
        constraint('nameMinLen', binary('>=', call('length', self('name')), lit(1))),
      ];
      const result = analyzeConstraints(constraints);
      expect(result.numericRanges).toHaveLength(1);
      expect(result.lengthConstraints).toHaveLength(1);
    });

    it('collects pattern constraints from matches() calls', () => {
      const constraints = [
        constraint('emailFormat', call('matches', self('email'), lit('^[^@]+@[^@]+$'))),
        constraint('phoneFormat', call('matches', self('phone'), lit('^\\d{3}-\\d{4}$'))),
      ];
      const result = analyzeConstraints(constraints);
      expect(result.patternConstraints).toHaveLength(2);
      expect(result.patternConstraints[0].pattern).toBe('^[^@]+@[^@]+$');
      expect(result.patternConstraints[1].pattern).toBe('^\\d{3}-\\d{4}$');
    });

    it('keeps multiple pattern constraints on same property', () => {
      const constraints = [
        constraint('hasAt', call('matches', self('email'), lit('@'))),
        constraint('hasDot', call('matches', self('email'), lit('\\.'))),
      ];
      const result = analyzeConstraints(constraints);
      expect(result.patternConstraints).toHaveLength(2);
    });
  });

  describe('numericRangeToCheckConstraint', () => {
    it('generates SQL for min + max', () => {
      const sql = numericRangeToCheckConstraint({ min: 0, max: 1000, propertyPath: 'self.price' });
      expect(sql).toBe('price >= 0 AND price <= 1000');
    });

    it('generates SQL for min only', () => {
      const sql = numericRangeToCheckConstraint({ min: 18, propertyPath: 'self.age' });
      expect(sql).toBe('age >= 18');
    });

    it('generates SQL for max only', () => {
      const sql = numericRangeToCheckConstraint({ max: 100, propertyPath: 'self.score' });
      expect(sql).toBe('score <= 100');
    });

    it('uses custom column name', () => {
      const sql = numericRangeToCheckConstraint(
        { min: 0, propertyPath: 'self.price' },
        'unit_price',
      );
      expect(sql).toBe('unit_price >= 0');
    });
  });

  describe('lengthConstraintToCheckConstraint', () => {
    it('generates SQL for min + max length', () => {
      const sql = lengthConstraintToCheckConstraint({
        minLength: 1,
        maxLength: 255,
        propertyPath: 'self.name',
      });
      expect(sql).toBe('length(name) >= 1 AND length(name) <= 255');
    });
  });

  describe('numericRangeToZodChain', () => {
    it('generates Zod chain for min + max', () => {
      expect(numericRangeToZodChain({ min: 0, max: 1000, propertyPath: 'self.price' })).toBe(
        '.min(0).max(1000)',
      );
    });

    it('generates Zod chain for min only', () => {
      expect(numericRangeToZodChain({ min: 18, propertyPath: 'self.age' })).toBe('.min(18)');
    });
  });

  describe('lengthConstraintToZodChain', () => {
    it('generates Zod chain for min + max length', () => {
      expect(
        lengthConstraintToZodChain({ minLength: 1, maxLength: 255, propertyPath: 'self.name' }),
      ).toBe('.min(1).max(255)');
    });
  });

  describe('patternConstraintToCheckConstraint', () => {
    it('generates PostgreSQL regex CHECK for simple pattern', () => {
      const sql = patternConstraintToCheckConstraint({
        pattern: '^\\d{5}$',
        propertyPath: 'self.zipCode',
      });
      expect(sql).toBe("zipCode ~ '^\\d{5}$'");
    });

    it('uses custom column name', () => {
      const sql = patternConstraintToCheckConstraint(
        { pattern: '^[a-z]+$', propertyPath: 'self.code' },
        'product_code',
      );
      expect(sql).toBe("product_code ~ '^[a-z]+$'");
    });

    it('escapes single quotes in pattern', () => {
      const sql = patternConstraintToCheckConstraint({
        pattern: "^it's$",
        propertyPath: 'self.name',
      });
      expect(sql).toBe("name ~ '^it''s$'");
    });
  });

  describe('patternConstraintToZodChain', () => {
    it('generates Zod regex chain for simple pattern', () => {
      expect(
        patternConstraintToZodChain({ pattern: '^\\d{5}$', propertyPath: 'self.zipCode' }),
      ).toBe('.regex(/^\\d{5}$/)');
    });

    it('escapes forward slashes in pattern', () => {
      expect(
        patternConstraintToZodChain({ pattern: '^https://.*$', propertyPath: 'self.url' }),
      ).toBe('.regex(/^https:\\/\\/.*$/)');
    });
  });
});
