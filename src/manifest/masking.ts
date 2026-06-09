/**
 * Pure masking strategy helpers for the `masked` property modifier.
 *
 * Semantics: docs/spec/semantics.md, "Property Masking".
 * - `null`/`undefined` pass through unmasked (nothing to leak).
 * - All other values are converted with String(value); masked output is a string.
 * - Transforms are deterministic: identical strategy + identical value ⇒ identical output.
 */
import type { IRMaskStrategy } from './ir';

export function applyMaskStrategy(strategy: IRMaskStrategy, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  const s = String(value);
  switch (strategy.type) {
    case 'redact':
      return '***';
    case 'partial': {
      const [keepStart = 0, keepEnd = 0] = strategy.params ?? [];
      if (keepStart + keepEnd >= s.length) return '*'.repeat(s.length);
      const tail = keepEnd > 0 ? s.slice(-keepEnd) : '';
      return s.slice(0, keepStart) + '*'.repeat(s.length - keepStart - keepEnd) + tail;
    }
    case 'email': {
      const at = s.indexOf('@');
      if (at <= 0) return '***';
      return s[0] + '***@' + s.slice(at + 1);
    }
    case 'phone': {
      const digits = s.replace(/[^0-9]/g, '');
      if (digits.length < 4) return '***';
      return '***-***-' + digits.slice(-4);
    }
    case 'last4': {
      if (s.length <= 4) return '****';
      return '****' + s.slice(-4);
    }
  }
}
