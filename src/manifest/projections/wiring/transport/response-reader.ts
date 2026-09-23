import type { WiringTransportProtocol } from '../types.js';
import { WiringTransportError } from './transport-error.js';

export type WiringCommandOutcome<TData = never> =
  | { ok: true; data: TData }
  | { ok: false; kind: 'unauthorized' | 'business_failure'; status: number; message: string };

/** Reads the dispatcher envelope without inventing a second error protocol. */
export class WiringCommandResponseReader {
  constructor(private readonly protocol: WiringTransportProtocol) {}

  read(status: number, body: unknown): WiringCommandOutcome<unknown> {
    if (status === this.protocol.unauthorizedStatus) return this.unauthorized(body);
    if (status === this.protocol.successStatus) return this.success(body);
    if (status === this.protocol.failureStatus) return this.failure(body);
    throw new WiringTransportError(
      'invalid_response',
      `Unexpected command response status ${status}`,
    );
  }

  private unauthorized(body: unknown): WiringCommandOutcome<unknown> {
    return {
      ok: false,
      kind: 'unauthorized',
      status: this.protocol.unauthorizedStatus,
      message: this.message(body, 'Unauthorized'),
    };
  }

  private success(body: unknown): WiringCommandOutcome<unknown> {
    if (!this.hasKey(body, this.protocol.successEnvelope)) {
      throw new WiringTransportError('invalid_response', 'Success response is missing data');
    }
    return { ok: true, data: (body as Record<string, unknown>)[this.protocol.successEnvelope] };
  }

  private failure(body: unknown): WiringCommandOutcome<unknown> {
    return {
      ok: false,
      kind: 'business_failure',
      status: this.protocol.failureStatus,
      message: this.message(body, 'Command failed'),
    };
  }

  private message(body: unknown, fallback: string): string {
    if (!this.hasKey(body, this.protocol.errorEnvelope)) return fallback;
    const value = (body as Record<string, unknown>)[this.protocol.errorEnvelope];
    return typeof value === 'string' && value.length > 0 ? value : fallback;
  }

  private hasKey(body: unknown, key: string): body is Record<string, unknown> {
    return body !== null && typeof body === 'object' && !Array.isArray(body) && key in body;
  }
}
