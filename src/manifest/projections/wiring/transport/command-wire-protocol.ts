/**
 * Wire protocol for the Convex authenticated command dispatcher.
 * One protocol for every command — not a hand-written transport per capability.
 */

import type { WiringTransportProtocol } from '../types.js';

/** Body keys the dispatcher drops so a caller cannot override identity. */
export const CONVEX_HTTP_FORBIDDEN_BODY_KEYS = [
  '__auth',
  'user',
  'tenantId',
  'orgId',
  'userId',
  'actorId',
  'identity',
] as const;

/** Canonical Convex HTTP command protocol. */
export class ConvexHttpWireProtocol {
  readonly profile = 'convex-http' as const;
  readonly method = 'POST' as const;
  readonly contentType = 'application/json' as const;
  readonly auth = 'bearer' as const;
  readonly forbiddenBodyKeys = CONVEX_HTTP_FORBIDDEN_BODY_KEYS;
  readonly successStatus = 200 as const;
  readonly successEnvelope = 'data' as const;
  readonly unauthorizedStatus = 401 as const;
  readonly notFoundStatus = 404 as const;
  readonly failureStatus = 400 as const;
  readonly errorEnvelope = 'error' as const;
  readonly dateWire = 'epoch-ms' as const;
  readonly instanceIdentityField = 'docId' as const;

  static canonical(): ConvexHttpWireProtocol {
    return new ConvexHttpWireProtocol();
  }

  toContract(): WiringTransportProtocol {
    return {
      profile: this.profile,
      method: this.method,
      contentType: this.contentType,
      auth: this.auth,
      forbiddenBodyKeys: [...this.forbiddenBodyKeys],
      successStatus: this.successStatus,
      successEnvelope: this.successEnvelope,
      unauthorizedStatus: this.unauthorizedStatus,
      notFoundStatus: this.notFoundStatus,
      failureStatus: this.failureStatus,
      errorEnvelope: this.errorEnvelope,
      dateWire: this.dateWire,
      instanceIdentityField: this.instanceIdentityField,
    };
  }
}
