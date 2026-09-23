/** Facts the shared executor needs. Generated capability constants satisfy this. */
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
