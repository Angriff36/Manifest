/**
 * Federation client — invokes commands on remote Manifest services.
 *
 * The client translates FederationRequest into HTTP calls, attaches
 * policy bridge headers, handles timeouts and retries, and normalizes
 * responses into FederationResponse objects.
 *
 * The client is transport-agnostic: pass a custom FederationTransport
 * to swap fetch for gRPC, message queues, or test fakes.
 *
 * @module federation/client
 */

import type {
  FederationRequest,
  FederationResponse,
  FederationClientOptions,
  FederationTransport,
  PolicyBridgeHeaders,
  ServiceDescriptor,
} from './types';
import { FederationRegistry } from './registry';

/**
 * Default HTTP transport using fetch.
 */
export class HttpFederationTransport implements FederationTransport {
  private fetchImpl: typeof fetch;

  constructor(fetchImpl: typeof fetch = globalThis.fetch) {
    this.fetchImpl = fetchImpl;
  }

  async invoke(
    descriptor: ServiceDescriptor,
    request: FederationRequest,
    options: { timeoutMs: number; authToken?: string },
  ): Promise<FederationResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Attach policy bridge headers
    for (const [key, value] of Object.entries(buildBridgeHeaders(request.bridge))) {
      if (value !== undefined) headers[key] = value;
    }

    // Attach auth token if the service requires it
    if (options.authToken && descriptor.auth && descriptor.auth.scheme === 'bearer') {
      headers['Authorization'] = `Bearer ${options.authToken}`;
    }

    try {
      const url = `${descriptor.endpoint}/__manifest/federation/${encodeURIComponent(request.entity)}/${encodeURIComponent(request.command)}`;
      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ input: request.input, idempotencyKey: request.idempotencyKey }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return (await res.json()) as FederationResponse;
    } catch (err) {
      clearTimeout(timeout);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        emittedEvents: [],
        handledBy: descriptor.serviceId,
        respondedAt: Date.now(),
      };
    }
  }
}

/**
 * Build the set of policy bridge headers for a cross-service call.
 * Exported for testability and for custom transports.
 */
export function buildBridgeHeaders(bridge: PolicyBridgeHeaders): Record<string, string> {
  const headers: Record<string, string> = {};
  if (bridge.actorId) headers['X-Manifest-Actor'] = bridge.actorId;
  if (bridge.tenantId) headers['X-Manifest-Tenant'] = bridge.tenantId;
  if (bridge.orgId) headers['X-Manifest-Org'] = bridge.orgId;
  if (bridge.actorRoles && bridge.actorRoles.length > 0) {
    headers['X-Manifest-Roles'] = bridge.actorRoles.join(',');
  }
  if (bridge.requestId) headers['X-Request-Id'] = bridge.requestId;
  if (bridge.correlationId) headers['X-Correlation-Id'] = bridge.correlationId;
  return headers;
}

/**
 * FederationClient: invokes commands on services in the federation.
 */
export class FederationClient {
  private registry: FederationRegistry;
  private options: Required<Omit<FederationClientOptions, 'resolveAuthToken'>> & {
    resolveAuthToken?: (serviceId: string) => string | undefined;
  };
  private transport: FederationTransport;

  constructor(
    registry: FederationRegistry,
    options: FederationClientOptions = {},
    transport?: FederationTransport,
  ) {
    this.registry = registry;
    this.options = {
      defaultTimeoutMs: options.defaultTimeoutMs ?? 30000,
      maxRetries: options.maxRetries ?? 0,
      retryDelayMs: options.retryDelayMs ?? 1000,
      resolveAuthToken: options.resolveAuthToken,
      fetchImpl: options.fetchImpl ?? globalThis.fetch,
    };
    this.transport = transport ?? new HttpFederationTransport(this.options.fetchImpl);
  }

  /**
   * Invoke a command on a remote service.
   * Throws if the service/entity/command is not found in the registry.
   * Retries transient failures up to maxRetries times if the command is idempotent.
   */
  async invoke(request: FederationRequest): Promise<FederationResponse> {
    const found = this.registry.findCommand(request.entity, request.command);
    if (!found) {
      return {
        success: false,
        error: `Command "${request.command}" on entity "${request.entity}" not found in federation registry`,
        emittedEvents: [],
        handledBy: request.serviceId,
        respondedAt: Date.now(),
      };
    }
    const { service: descriptor } = found;
    const timeoutMs = request.timeoutMs ?? this.options.defaultTimeoutMs;
    const authToken = this.options.resolveAuthToken?.(descriptor.serviceId);

    const maxAttempts = found.command.idempotent ? this.options.maxRetries + 1 : 1;

    let lastResponse: FederationResponse | undefined;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await this.delay(this.options.retryDelayMs);
      }
      const response = await this.transport.invoke(descriptor, request, { timeoutMs, authToken });
      lastResponse = response;
      if (response.success) return response;
      // Only retry on transport-level errors (no success field implies transport failure)
      if (!isTransientFailure(response)) break;
    }
    return lastResponse!;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Determine if a federation response represents a transient failure
 * that is safe to retry (e.g. network error, 5xx).
 */
export function isTransientFailure(response: FederationResponse): boolean {
  if (response.success) return false;
  // Transport-level: error message indicates connection issue
  if (
    response.error &&
    /abort|fetch|network|timeout|ECONNREFUSED|ENOTFOUND/i.test(response.error)
  ) {
    return true;
  }
  return false;
}
