/**
 * Compile-time proof that the generated `as const` transport object
 * satisfies the executor's protocol type.
 */

import type { WiringTransportProtocol } from '../types.js';

const generatedTransport = {
  profile: 'convex-http',
  method: 'POST',
  contentType: 'application/json',
  auth: 'bearer',
  forbiddenBodyKeys: ['__auth', 'user', 'tenantId', 'orgId', 'userId', 'actorId', 'identity'],
  successStatus: 200,
  successEnvelope: 'data',
  unauthorizedStatus: 401,
  failureStatus: 400,
  errorEnvelope: 'error',
  dateWire: 'epoch-ms',
  instanceIdentityField: 'docId',
} as const;

export const generatedTransportSatisfiesProtocol: WiringTransportProtocol = generatedTransport;
