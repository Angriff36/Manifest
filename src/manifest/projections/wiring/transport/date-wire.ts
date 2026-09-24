import { WiringTransportError } from './transport-error.js';

/** Converts client date values to the epoch-millisecond wire form. */
export class EpochMillisecondDate {
  toWire(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value instanceof Date) return this.fromDate(value);
    if (typeof value === 'string' && value.length > 0) return this.parseIso(value);
    throw new WiringTransportError(
      'invalid_date',
      'Date values must be a Date, an epoch millisecond number, or an ISO time string',
    );
  }

  private fromDate(value: Date): number {
    const parsed = value.getTime();
    if (Number.isNaN(parsed)) {
      throw new WiringTransportError('invalid_date', 'Date value is not a valid time');
    }
    return parsed;
  }

  private parseIso(value: string): number {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      throw new WiringTransportError('invalid_date', `Date value is not a valid time: ${value}`);
    }
    return parsed;
  }
}
