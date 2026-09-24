/** Facts the shared executor needs. Generated capability constants satisfy this. */

import type { WiringFailureRule } from '../types.js';

export interface WiringExecutableCommand {
  capabilityId: string;
  route: string;
  dispatchable: boolean;
  targetsExistingInstance: boolean;
  clientParameterNames: readonly string[];
  serverParameterNames: readonly string[];
  dateParameterNames: readonly string[];
  versionField: string | null;
  acceptsIdempotencyKey: boolean;
  failures?: readonly WiringFailureRule[];
}

export interface WiringCommandCall {
  client: Record<string, unknown>;
  docId?: string;
  version?: number;
  idempotencyKey?: string;
}

export interface WiringHttpRequest {
  method: 'POST';
  path: string;
  body: Record<string, unknown>;
}
