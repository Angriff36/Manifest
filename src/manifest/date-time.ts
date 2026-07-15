/**
 * Date/time primitive type helpers. Pure, UTC-only, deterministic.
 * Representations (docs/spec/semantics.md, Date/Time Types):
 *   datetime = finite epoch ms within the representable Date range (±8.64e15);
 *   duration = finite ms;
 *   date = "YYYY-MM-DD" (valid calendar); time = "HH:MM:SS" (00:00:00–23:59:59).
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2}):(\d{2})$/;

/** Authoritative date/time primitive type names (docs/spec/semantics.md § Date/Time Types). */
export const DATE_TIME_TYPE_NAMES = ['date', 'time', 'datetime', 'timestamp', 'duration'] as const;

/** True when the IR type name is datetime or its `timestamp` alias. */
export function isDatetimeTypeName(typeName: string): boolean {
  return typeName === 'datetime' || typeName === 'timestamp';
}

export function isValidDateString(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [, ys, ms, ds] = m;
  const year = Number(ys),
    month = Number(ms),
    day = Number(ds);
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

export function isValidTimeString(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const m = TIME_RE.exec(value);
  if (!m) return false;
  const [, hs, mins, ss] = m;
  const h = Number(hs),
    min = Number(mins),
    s = Number(ss);
  return h <= 23 && min <= 59 && s <= 59;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function dateOf(ts: unknown): string | null {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null; // finite but outside the representable Date range
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function timeOf(ts: unknown): string | null {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null; // finite but outside the representable Date range
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export function datetimeOf(dateStr: unknown, timeStr?: unknown): number | null {
  if (!isValidDateString(dateStr)) return null;
  const t = timeStr === undefined ? '00:00:00' : timeStr;
  if (!isValidTimeString(t)) return null;
  return Date.parse(`${dateStr}T${t}.000Z`);
}
