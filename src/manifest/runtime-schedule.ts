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

/**
 * Determine if a cron schedule should run at the given timestamp.
 * Simplified: parses cron expressions in the form "0 0 * * *" (minute hour day month day-of-week).
 * For production use, integrate with a proper cron library like cron-parser.
 *
 * @param _cronExpression - Cron expression (e.g., "0 0 * * *")
 * @param _timestamp - Timestamp to check (ms)
 * @returns true if the schedule should run at this timestamp
 *
 * @note This is a placeholder implementation for deterministic testing.
 * Production integrations should use cron-parser or similar.
 */
export function shouldRunCron(_cronExpression: string, _timestamp: number): boolean {
  // Placeholder: just return false for now.
  // Real implementation would parse the cron and check time.
  // For testing, we'll rely on explicit schedule trigger calls.
  return false;
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
export function shouldRunInterval(intervalExpression: string, now: number, lastRunAt: number): boolean {
  const intervalMs = parseIntervalExpression(intervalExpression);
  if (intervalMs <= 0) return false;
  return now - lastRunAt >= intervalMs;
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
