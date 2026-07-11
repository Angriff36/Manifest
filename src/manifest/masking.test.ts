import { describe, it, expect } from 'vitest';
import { applyMaskStrategy } from './masking';

describe('applyMaskStrategy', () => {
  describe('null passthrough', () => {
    it('passes null through unmasked', () => {
      expect(applyMaskStrategy({ type: 'redact' }, null)).toBeNull();
    });

    it('passes undefined through unmasked', () => {
      expect(applyMaskStrategy({ type: 'partial', params: [0, 4] }, undefined)).toBeUndefined();
    });
  });

  describe('redact', () => {
    it('replaces any value with ***', () => {
      expect(applyMaskStrategy({ type: 'redact' }, 'sensitive')).toBe('***');
    });

    it('redacts non-string values', () => {
      expect(applyMaskStrategy({ type: 'redact' }, 12345)).toBe('***');
    });

    it('redacts empty strings', () => {
      expect(applyMaskStrategy({ type: 'redact' }, '')).toBe('***');
    });
  });

  describe('partial', () => {
    it('keeps first keepStart and last keepEnd characters', () => {
      expect(applyMaskStrategy({ type: 'partial', params: [0, 4] }, '123-45-6789')).toBe(
        '*******6789',
      );
    });

    it('keeps characters at both ends', () => {
      expect(applyMaskStrategy({ type: 'partial', params: [2, 2] }, 'abcdefgh')).toBe('ab****gh');
    });

    it('fully masks when keepStart + keepEnd >= length', () => {
      expect(applyMaskStrategy({ type: 'partial', params: [3, 3] }, 'abcde')).toBe('*****');
    });

    it('handles keepEnd of 0 without leaking the tail', () => {
      expect(applyMaskStrategy({ type: 'partial', params: [2, 0] }, 'abcdef')).toBe('ab****');
    });

    it('masks numbers via string conversion', () => {
      expect(applyMaskStrategy({ type: 'partial', params: [0, 2] }, 123456)).toBe('****56');
    });

    it('fully masks the empty string to an empty string', () => {
      expect(applyMaskStrategy({ type: 'partial', params: [0, 4] }, '')).toBe('');
    });
  });

  describe('email', () => {
    it('keeps first char of local part and the domain', () => {
      expect(applyMaskStrategy({ type: 'email' }, 'alice@example.com')).toBe('a***@example.com');
    });

    it('fully redacts a string without @', () => {
      expect(applyMaskStrategy({ type: 'email' }, 'not-an-email')).toBe('***');
    });

    it('fully redacts when @ is the first character', () => {
      expect(applyMaskStrategy({ type: 'email' }, '@example.com')).toBe('***');
    });

    it('splits on the first @ only', () => {
      expect(applyMaskStrategy({ type: 'email' }, 'a@b@c.com')).toBe('a***@b@c.com');
    });
  });

  describe('phone', () => {
    it('keeps the last 4 digits of the digit-only form', () => {
      expect(applyMaskStrategy({ type: 'phone' }, '555-867-5309')).toBe('***-***-5309');
    });

    it('ignores formatting characters when extracting digits', () => {
      expect(applyMaskStrategy({ type: 'phone' }, '+1 (555) 867-5309')).toBe('***-***-5309');
    });

    it('fully redacts when fewer than 4 digits', () => {
      expect(applyMaskStrategy({ type: 'phone' }, '12')).toBe('***');
    });
  });

  describe('last4', () => {
    it('keeps the last 4 characters', () => {
      expect(applyMaskStrategy({ type: 'last4' }, '4111111111111111')).toBe('****1111');
    });

    it('fully masks strings of 4 or fewer characters', () => {
      expect(applyMaskStrategy({ type: 'last4' }, 'abcd')).toBe('****');
      expect(applyMaskStrategy({ type: 'last4' }, 'ab')).toBe('****');
    });
  });
});
