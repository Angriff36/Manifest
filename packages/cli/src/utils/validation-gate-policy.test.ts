import { describe, it, expect } from 'vitest';
import {
  ValidationGatePolicy,
  resolveValidationFailOn,
  isValidationFailOn,
} from './validation-gate-policy.js';

describe('ValidationGatePolicy (Config G2)', () => {
  it('block (default): fails only on errors', () => {
    const gate = new ValidationGatePolicy('block');
    expect(gate.shouldExitNonZero(0, 0)).toBe(false);
    expect(gate.shouldExitNonZero(0, 3)).toBe(false);
    expect(gate.shouldExitNonZero(1, 0)).toBe(true);
    expect(gate.shouldExitNonZero(1, 5)).toBe(true);
  });

  it('warn: fails on errors or warnings', () => {
    const gate = new ValidationGatePolicy('warn');
    expect(gate.shouldExitNonZero(0, 0)).toBe(false);
    expect(gate.shouldExitNonZero(0, 1)).toBe(true);
    expect(gate.shouldExitNonZero(2, 0)).toBe(true);
  });

  it('never: never fails the process (report-only)', () => {
    const gate = new ValidationGatePolicy('never');
    expect(gate.shouldExitNonZero(0, 0)).toBe(false);
    expect(gate.shouldExitNonZero(0, 9)).toBe(false);
    expect(gate.shouldExitNonZero(4, 4)).toBe(false);
  });
});

describe('resolveValidationFailOn', () => {
  it('defaults to block', () => {
    expect(resolveValidationFailOn(undefined, undefined)).toBe('block');
  });

  it('prefers CLI over config', () => {
    expect(resolveValidationFailOn('never', 'warn')).toBe('never');
  });

  it('uses config when CLI omitted', () => {
    expect(resolveValidationFailOn(undefined, 'warn')).toBe('warn');
  });

  it('ignores invalid values', () => {
    expect(resolveValidationFailOn('bogus', 'warn')).toBe('warn');
    expect(resolveValidationFailOn('bogus', 'nope')).toBe('block');
    expect(isValidationFailOn('block')).toBe(true);
    expect(isValidationFailOn('error')).toBe(false);
  });
});
