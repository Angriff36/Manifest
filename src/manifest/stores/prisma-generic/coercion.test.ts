import { describe, it, expect } from 'vitest';
import { asJsonInput } from './coercion.js';

describe('asJsonInput — string-safe Json coercion', () => {
  it('passes an object through unchanged', () => {
    const obj = { a: 1, nested: { b: [2, 3] } };
    expect(asJsonInput(obj)).toEqual(obj);
  });

  it('passes an array through unchanged', () => {
    const arr = [1, 2, { c: 3 }];
    expect(asJsonInput(arr)).toEqual(arr);
  });

  it('re-parses a JSON object string into an object (no double-encoding)', () => {
    expect(asJsonInput('{"a":1}')).toEqual({ a: 1 });
  });

  it('re-parses a JSON array string into an array', () => {
    expect(asJsonInput('[1,2]')).toEqual([1, 2]);
  });

  it('keeps a plain string as a raw string (legal JSON scalar)', () => {
    expect(asJsonInput('hello')).toBe('hello');
  });

  it('keeps a numeric string as a raw string (does NOT coerce to a number)', () => {
    expect(asJsonInput('123')).toBe('123');
  });

  it('keeps a boolean-looking string as a raw string (does NOT coerce to a boolean)', () => {
    expect(asJsonInput('true')).toBe('true');
  });

  it('keeps a "null" string as a raw string (does NOT coerce to null)', () => {
    expect(asJsonInput('null')).toBe('null');
  });

  it('keeps an invalid-JSON string as a raw string', () => {
    expect(asJsonInput('{not valid json')).toBe('{not valid json');
  });

  it('returns {} for null / undefined', () => {
    expect(asJsonInput(null)).toEqual({});
    expect(asJsonInput(undefined)).toEqual({});
  });
});
