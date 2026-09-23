/** Client-side transport failure before or after the canonical dispatcher responds. */
export type WiringTransportErrorCode =
  'missing_instance_identity' | 'not_dispatchable' | 'invalid_date' | 'invalid_response';

export class WiringTransportError extends Error {
  readonly code: WiringTransportErrorCode;

  constructor(code: WiringTransportErrorCode, message: string) {
    super(message);
    this.name = 'WiringTransportError';
    this.code = code;
  }
}
