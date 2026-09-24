import type { WiringFailureKind, WiringFailureRule, WiringTransportProtocol } from '../types.js';
import { DispatcherErrorText } from './dispatcher-error-text.js';
import { WiringTransportError } from './transport-error.js';

export type WiringCommandOutcome<TData = never> =
  | { ok: true; data: TData }
  | {
      ok: false;
      kind: 'unauthorized' | WiringFailureKind;
      status: number;
      message: string;
    };

/** Reads the dispatcher `{ error }` envelope. Kinds come from known thrown messages. */
export class WiringCommandResponseReader {
  constructor(private readonly protocol: WiringTransportProtocol) {}

  read(
    status: number,
    body: unknown,
    rules: readonly WiringFailureRule[] = [],
  ): WiringCommandOutcome<unknown> {
    if (status === this.protocol.unauthorizedStatus) return this.denied(body, 'unauthorized');
    if (status === this.protocol.notFoundStatus) return this.denied(body, 'not_found');
    if (status === this.protocol.successStatus) return this.success(body);
    if (status === this.protocol.failureStatus) return this.failure(body, rules);
    throw new WiringTransportError(
      'invalid_response',
      `Unexpected command response status ${status}`,
    );
  }

  private denied(body: unknown, kind: 'unauthorized' | 'not_found'): WiringCommandOutcome<unknown> {
    const status =
      kind === 'unauthorized' ? this.protocol.unauthorizedStatus : this.protocol.notFoundStatus;
    return { ok: false, kind, status, message: this.message(body, kind) };
  }

  private success(body: unknown): WiringCommandOutcome<unknown> {
    if (!this.hasKey(body, this.protocol.successEnvelope)) {
      throw new WiringTransportError('invalid_response', 'Success response is missing data');
    }
    return { ok: true, data: (body as Record<string, unknown>)[this.protocol.successEnvelope] };
  }

  private failure(
    body: unknown,
    rules: readonly WiringFailureRule[],
  ): WiringCommandOutcome<unknown> {
    const raw = this.message(body, 'Command failed');
    const thrown = DispatcherErrorText.thrownLine(raw);
    const message = thrown.length > 0 ? thrown : raw;
    const match = rules.find((rule) =>
      rule.prefix ? message.startsWith(rule.message) : message === rule.message,
    );
    return {
      ok: false,
      kind: match?.kind ?? 'business_failure',
      status: this.protocol.failureStatus,
      message,
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
