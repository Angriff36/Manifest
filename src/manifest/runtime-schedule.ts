/**
 * Schedule helpers: extract schedules from IR and run scheduled commands.
 *
 * Spec: docs/spec/semantics.md § "Scheduled Commands"
 */

import type { IR, IRSchedule } from './ir';

/**
 * Extract all schedules from an IR.
 * Returns a map keyed by schedule name for convenient lookup.
 *
 * @param ir - The compiled IR
 * @returns Map of schedule name → IRSchedule
 */
export function getSchedulesFromIR(ir: IR): Map<string, IRSchedule> {
  const schedules = new Map<string, IRSchedule>();

  if (ir.schedules && Array.isArray(ir.schedules)) {
    for (const schedule of ir.schedules) {
      schedules.set(schedule.name, schedule);
    }
  }

  return schedules;
}

/** Three-letter month aliases (1-12), matched case-insensitively. */
const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/** Three-letter day-of-week aliases (0=Sunday), matched case-insensitively. */
const DOW_NAMES: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

interface CronField {
  /** Every value this field permits, within [min, max]. */
  values: Set<number>;
  /** True only for a literal `*` — drives the day-of-month / day-of-week OR rule. */
  star: boolean;
}

/** Resolve a single token (number or 3-letter name) to its numeric value. */
function resolveCronToken(
  token: string,
  names: Record<string, number>,
  min: number,
  max: number,
): number {
  const t = token.trim().toLowerCase();
  if (t === '') throw new Error(`empty cron value in "${token}"`);
  const named = names[t];
  const n = named !== undefined ? named : Number(t);
  if (!Number.isInteger(n)) {
    throw new Error(`invalid cron value "${token}"`);
  }
  if (n < min || n > max) {
    throw new Error(`cron value "${token}" out of range [${min}-${max}]`);
  }
  return n;
}

/**
 * Parse one cron field into the set of values it matches. Supports `*`, single
 * values, lists (`a,b`), ranges (`a-b`), and steps (`* / n`, `a-b/n`, `a/n`).
 */
function parseCronField(
  raw: string,
  min: number,
  max: number,
  names: Record<string, number>,
): CronField {
  const field = raw.trim();
  if (field === '') throw new Error('empty cron field');
  const star = field === '*';
  const values = new Set<number>();

  for (const part of field.split(',')) {
    const seg = part.trim();
    if (seg === '') throw new Error(`empty term in cron field "${raw}"`);

    const slash = seg.indexOf('/');
    const rangePart = slash === -1 ? seg : seg.slice(0, slash);
    let step = 1;
    if (slash !== -1) {
      step = Number(seg.slice(slash + 1));
      if (!Number.isInteger(step) || step <= 0) {
        throw new Error(`invalid step in cron term "${part}"`);
      }
    }

    let lo: number;
    let hi: number;
    if (rangePart === '*') {
      lo = min;
      hi = max;
    } else if (rangePart.includes('-')) {
      const dash = rangePart.indexOf('-');
      lo = resolveCronToken(rangePart.slice(0, dash), names, min, max);
      hi = resolveCronToken(rangePart.slice(dash + 1), names, min, max);
    } else {
      lo = resolveCronToken(rangePart, names, min, max);
      // `a/n` means "from a to the field maximum, every n"; a bare `a` is a point.
      hi = slash !== -1 ? max : lo;
    }
    if (lo > hi) throw new Error(`invalid range "${part}" (start > end)`);
    for (let v = lo; v <= hi; v += step) values.add(v);
  }

  return { values, star };
}

/** Parse the day-of-week field, normalizing 7 (some crons' Sunday) to 0. */
function parseDowField(raw: string): CronField {
  const field = parseCronField(raw, 0, 7, DOW_NAMES);
  if (field.values.has(7)) {
    field.values.delete(7);
    field.values.add(0);
  }
  return field;
}

/**
 * Determine whether a 5-field cron expression is due at the given instant.
 *
 * Fields: minute hour day-of-month month day-of-week. Evaluated in **UTC** so
 * the result is a pure function of the absolute instant (independent of the
 * host timezone) — matching Vercel Cron, which runs in UTC. Day-of-month and
 * day-of-week follow the standard Vixie-cron OR rule: when BOTH are restricted
 * (neither is `*`), the day matches if EITHER matches; otherwise both must.
 *
 * Throws on a malformed expression (wrong field count, out-of-range value, bad
 * step/range) — callers iterating schedules (the worker) isolate the throw.
 */
export function isCronDue(expression: string, date: Date): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(
      `invalid cron expression "${expression}": expected 5 fields, got ${fields.length}`,
    );
  }
  const [minuteF, hourF, domF, monthF, dowF] = fields;
  const minute = parseCronField(minuteF, 0, 59, {});
  const hour = parseCronField(hourF, 0, 23, {});
  const dom = parseCronField(domF, 1, 31, {});
  const month = parseCronField(monthF, 1, 12, MONTH_NAMES);
  const dow = parseDowField(dowF);

  if (!minute.values.has(date.getUTCMinutes())) return false;
  if (!hour.values.has(date.getUTCHours())) return false;
  if (!month.values.has(date.getUTCMonth() + 1)) return false;

  const domMatch = dom.values.has(date.getUTCDate());
  const dowMatch = dow.values.has(date.getUTCDay());
  const dayMatch = !dom.star && !dow.star ? domMatch || dowMatch : domMatch && dowMatch;
  return dayMatch;
}

/**
 * Whether a cron expression is due at the given epoch millisecond timestamp.
 * Thin wrapper over {@link isCronDue}; matches to the minute in UTC.
 */
export function shouldRunCron(cronExpression: string, timestamp: number): boolean {
  return isCronDue(cronExpression, new Date(timestamp));
}

/**
 * Determine if an interval schedule should run.
 * Simplified: checks if the time elapsed since the last run exceeds the interval.
 * For testing, use explicit runSchedule() calls instead.
 *
 * @param intervalExpression - Interval expression (e.g., "5m", "1h", "1 weeks")
 * @param now - Current timestamp (ms)
 * @param lastRunAt - Last run timestamp (ms), or 0 if never run
 * @returns true if the interval has elapsed
 */
export function shouldRunInterval(
  intervalExpression: string,
  now: number,
  lastRunAt: number,
): boolean {
  const intervalMs = parseIntervalExpression(intervalExpression);
  if (intervalMs <= 0) return false;
  return now - lastRunAt >= intervalMs;
}

/**
 * Whether an interval/every schedule is due: true once the elapsed time since
 * its last run reaches `durationMs`. The IR carries the resolved millisecond
 * duration for both `interval` and `every` triggers, so this takes ms directly
 * (unlike {@link shouldRunInterval}, which parses a duration string).
 */
export function isIntervalDue(durationMs: number, now: number, lastRunAt: number): boolean {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return false;
  return now - lastRunAt >= durationMs;
}

/**
 * Parse interval expression to milliseconds.
 * Supports: "5m" (minutes), "1h" (hours), "1 days" (days), "1 weeks" (weeks).
 *
 * @param expression - Interval expression
 * @returns Milliseconds, or -1 if unparseable
 */
export function parseIntervalExpression(expression: string): number {
  const trimmed = expression.trim().toLowerCase();
  const match = trimmed.match(/^(\d+)\s*([a-z]+)$/);
  if (!match) return -1;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'm':
    case 'min':
    case 'mins':
    case 'minute':
    case 'minutes':
      return value * 60 * 1000;
    case 'h':
    case 'hr':
    case 'hrs':
    case 'hour':
    case 'hours':
      return value * 60 * 60 * 1000;
    case 'd':
    case 'day':
    case 'days':
      return value * 24 * 60 * 60 * 1000;
    case 'w':
    case 'week':
    case 'weeks':
      return value * 7 * 24 * 60 * 60 * 1000;
    default:
      return -1;
  }
}
