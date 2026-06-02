/**
 * Federation type contracts for cross-service Manifest runtime communication.
 *
 * Federation enables multiple Manifest runtime instances (microservices) to:
 * - Discover each other's entity schemas and available commands
 * - Invoke commands across service boundaries with policy-enforced authorization
 * - Propagate actor identity and tenant context through a policy bridge
 * - Generate typed HTTP client adapters from remote IRs
 *
 * @module federation/types
 */


/**
 * Describes a single remote Manifest service in the federation.
 * A service descriptor is the public, minimal contract that other services
 * use to discover what entities and commands are available.
 */
export interface ServiceDescriptor {
  /** Unique service identifier (e.g. "orders", "inventory", "billing") */
  serviceId: string;
  /** Human-readable display name */
  displayName?: string;
  /** Base URL for federation calls (e.g. "https://orders.svc.cluster:8080") */
  endpoint: string;
  /** IR schema version this service speaks */
  schemaVersion: string;
  /** Entities exposed for cross-service access (with their commands) */
  entities: ExposedEntity[];
  /** Health check status (populated by registry health checks) */
  health?: ServiceHealth;
  /** Optional service-to-service shared secret or token type for the policy bridge */
  auth?: ServiceAuthConfig;
}

/**
 * An entity exposed by a remote service for cross-service access.
 * Only entities and commands explicitly listed here can be invoked remotely.
 */
export interface ExposedEntity {
  /** Entity name as it exists in the remote service's IR */
  name: string;
  /** Module the entity belongs to (optional) */
  module?: string;
  /** Commands exposed for cross-service invocation */
  commands: ExposedCommand[];
}

/**
 * A command exposed for cross-service invocation.
 * Only commands listed here can be called by other services in the federation.
 */
export interface ExposedCommand {
  /** Command name */
  name: string;
  /** Whether the command is idempotent (safe to retry) */
  idempotent: boolean;
  /** Policy names that must be satisfied for cross-service invocation */
  requiredPolicies: string[];
  /** Optional description for documentation/tooling */
  description?: string;
}

/**
 * Health status of a remote service, populated by periodic health checks.
 */
export interface ServiceHealth {
  /** Whether the service responded to the last health check */
  reachable: boolean;
  /** Timestamp (epoch ms) of the last health check */
  lastCheckedAt: number;
  /** Optional error message if the service is unreachable */
  error?: string;
  /** Reported service version from the health endpoint */
  version?: string;
}

/**
 * Authentication configuration for service-to-service communication.
 * The actual credential material is never included in the descriptor —
 * callers provide a resolver function at invocation time.
 */
export interface ServiceAuthConfig {
  /** Auth scheme used by the remote service */
  scheme: 'bearer' | 'mtls' | 'api-key' | 'none';
  /** Optional human-readable hint (e.g. "vault:orders-federation-token") */
  hint?: string;
}

/**
 * A request to invoke a command on a remote service.
 * Mirrors RuntimeContext to enable seamless cross-service execution.
 */
export interface FederationRequest {
  /** Name of the remote service to call */
  serviceId: string;
  /** Entity name on the remote service */
  entity: string;
  /** Command name on the remote service */
  command: string;
  /** Input parameters for the command */
  input: Record<string, unknown>;
  /** Policy bridge headers — actor identity, tenant, request ID */
  bridge: PolicyBridgeHeaders;
  /** Optional timeout in ms (default: 30000) */
  timeoutMs?: number;
  /** Optional idempotency key for safe retries */
  idempotencyKey?: string;
}

/**
 * Response from a remote service after a federation call.
 * Mirrors CommandResult for consistent error handling.
 */
export interface FederationResponse {
  /** Whether the remote command succeeded */
  success: boolean;
  /** Result payload (if success) */
  result?: unknown;
  /** Error message (if failure) */
  error?: string;
  /** Policy that denied the request (if policy denial) */
  deniedBy?: string;
  /** Guard that failed (if guard failure) */
  guardFailure?: {
    index: number;
    expression: string;
  };
  /** Events emitted by the remote command */
  emittedEvents: Array<{
    name: string;
    channel: string;
    payload: unknown;
  }>;
  /** Correlation ID echoed from the request bridge */
  correlationId?: string;
  /** Service that handled the request */
  handledBy: string;
  /** Timestamp (epoch ms) when the response was generated */
  respondedAt: number;
}

/**
 * Policy bridge headers propagated across service boundaries.
 * These carry the caller's identity, tenant, and request context
 * to the remote service so it can enforce its own authorization policies.
 */
export interface PolicyBridgeHeaders {
  /** Acting user identifier (from caller context) */
  actorId?: string;
  /** Tenant identifier (from caller context) */
  tenantId?: string;
  /** Organization identifier (from caller context) */
  orgId?: string;
  /** Actor's role(s) — forwarded so remote policies can check permissions */
  actorRoles?: string[];
  /** Request ID for distributed tracing */
  requestId?: string;
  /** Correlation ID for grouping related cross-service operations */
  correlationId?: string;
  /** Optional bearer token for service-to-service auth */
  bearerToken?: string;
}

/**
 * Options for the FederationClient.
 */
export interface FederationClientOptions {
  /** Default timeout for federation calls in ms (default: 30000) */
  defaultTimeoutMs?: number;
  /** Maximum number of retry attempts for transient failures (default: 0) */
  maxRetries?: number;
 /** Delay between retries in ms (default: 1000) */
  retryDelayMs?: number;
  /** Function to resolve the auth token for a given service (used when descriptor.auth.scheme !== 'none') */
  resolveAuthToken?: (serviceId: string) => string | undefined;
  /** Fetch implementation (defaults to global fetch) */
  fetchImpl?: typeof fetch;
}

/**
 * Federation registry configuration.
 */
export interface FederationRegistryOptions {
  /** Health check interval in ms (default: 30000). Set to 0 to disable. */
  healthCheckIntervalMs?: number;
  /** Health check timeout in ms (default: 5000) */
  healthCheckTimeoutMs?: number;
  /** Fetch implementation for health checks (defaults to global fetch) */
  fetchImpl?: typeof fetch;
}

/**
 * HTTP transport contract used by the federation client.
 * Implementations translate FederationRequest into actual HTTP calls
 * and parse the response. The default implementation uses fetch;
 * custom implementations enable testing and alternative transports.
 */
export interface FederationTransport {
  invoke(
    descriptor: ServiceDescriptor,
    request: FederationRequest,
    options: { timeoutMs: number; authToken?: string }
  ): Promise<FederationResponse>;
}

/**
 * Generated typed HTTP client adapter for a remote service.
 * Created by the HTTP adapter generator from a ServiceDescriptor.
 * Provides strongly-typed methods for each exposed command.
 */
export interface TypedClientAdapter {
  /** Service ID this adapter is bound to */
  readonly serviceId: string;
  /** Generated source code for the adapter */
  readonly source: string;
  /** Factory that creates a live client instance from a base URL */
  create(baseUrl: string, options?: { authToken?: string; timeoutMs?: number }): Record<string, (...args: unknown[]) => Promise<unknown>>;
}
