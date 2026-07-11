/**
 * Parse duration strings like "5000", "1s", "5m", "1h", "1d" into milliseconds.
 * @param value - Duration value or string with unit suffix
 * @param unit - Optional unit if value is numeric (default 'ms')
 * @returns Duration in milliseconds
 * @throws Error if format is invalid
 */
export function parseDurationToMs(value: number | string, unit?: string): number {
  if (typeof value === 'number') {
    // Numeric value with unit parameter
    const unitToMs: Record<string, number> = {
      ms: 1,
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      weeks: 7 * 24 * 60 * 60 * 1000,
    };
    const multiplier = unitToMs[unit || 'ms'];
    if (!multiplier) {
      throw new Error(`Invalid duration unit: "${unit}"`);
    }
    return value * multiplier;
  }

  // String value with unit suffix (e.g., "5000", "1s", "5m", "1h")
  const match = String(value).match(/^(\d+)([a-z]*)$/i);
  if (!match) {
    throw new Error(`Invalid duration format: "${value}"`);
  }

  const numValue = parseInt(match[1], 10);
  const unitSuffix = match[2] || 'ms';

  const unitToMs: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    weeks: 7 * 24 * 60 * 60 * 1000,
  };

  const multiplier = unitToMs[unitSuffix];
  if (!multiplier) {
    throw new Error(`Invalid duration unit: "${unitSuffix}"`);
  }

  return numValue * multiplier;
}

/**
 * Validate a cron expression (5-field format: minute hour day-of-month month day-of-week)
 * @param cronExpression - Cron expression to validate
 * @returns true if valid, false otherwise
 */
export function isValidCronExpression(cronExpression: string): boolean {
  const fields = cronExpression.trim().split(/\s+/);
  if (fields.length !== 5) {
    return false;
  }

  // Simple validation: each field should be a valid cron value
  // * means any, numbers/ranges/lists are valid
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (field === '*') continue;
    if (/^\*\/\d+$/.test(field)) continue;

    // Check for valid cron patterns
    if (!/^[\d,/-]+$/.test(field)) {
      return false;
    }

    // Basic validation - could be more thorough
    // For now, just ensure numbers are reasonable
    const parts = field.split(/[,/-]/);
    for (const part of parts) {
      if (part === '') continue;
      const num = parseInt(part, 10);
      if (isNaN(num) || num < 0) {
        return false;
      }
    }
  }

  return true;
}
