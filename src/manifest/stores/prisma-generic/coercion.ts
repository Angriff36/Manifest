/**
 * Value coercion helpers for Prisma scalar columns.
 * Prisma.Decimal is used when available at runtime; otherwise string/number pass through.
 */

export type DecimalInput = string | number | null;

export type JsonInput =
  | string
  | number
  | boolean
  | null
  | { [k: string]: JsonInput }
  | JsonInput[];

export function toDecimalInput(value: unknown): DecimalInput {
  if (value === null || value === undefined || value === '') return null;
  const PrismaDecimal = (globalThis as { Prisma?: { Decimal?: new (v: string | number) => unknown } }).Prisma?.Decimal;
  if (typeof PrismaDecimal === 'function') {
    try {
      return new PrismaDecimal(typeof value === 'number' ? value : String(value)) as unknown as DecimalInput;
    } catch {
      return null;
    }
  }
  if (typeof value === 'number') return value;
  return String(value);
}

export function asJsonInput(value: unknown): Exclude<JsonInput, null> {
  if (value === null || value === undefined) return {} as Exclude<JsonInput, null>;
  // A string reaching a Json-typed field is frequently already-serialized JSON
  // (e.g. a value that was JSON.stringify'd upstream, or a consumer migrating a
  // String column to Json). Passing it verbatim makes Prisma store a
  // double-encoded jsonb string (`"{\"a\":1}"` instead of `{"a":1}`). Re-parse
  // so the structured value lands in the column.
  //
  // Boundary: adopt the parsed value ONLY when it is an object or array. A plain
  // string is itself a legal JSON scalar, and eagerly parsing strings that decode
  // to a scalar would surprisingly coerce stored values — '123' → 123, 'true' →
  // true, 'null' → null. Those (and any non-JSON string) are kept as the raw
  // string; only objects/arrays are unwrapped.
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed !== null && typeof parsed === 'object') {
        return parsed as Exclude<JsonInput, null>;
      }
    } catch {
      // Not valid JSON — fall through and keep the raw string.
    }
    return value as Exclude<JsonInput, null>;
  }
  return value as Exclude<JsonInput, null>;
}

export function asString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

export function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

export function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function asNullableDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(v => v !== null && v !== undefined).map(String);
  }
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter(v => v !== null && v !== undefined).map(String);
      }
    } catch {
      return [];
    }
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return [value.trim()];
  }
  return [];
}

export function asBool(value: unknown, fallback = false): boolean {
  if (value === true || value === false) return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}
