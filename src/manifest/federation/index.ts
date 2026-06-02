/**
 * Federation module — public API for cross-service Manifest runtime communication.
 *
 * @module federation
 *
 * Federation enables multiple Manifest runtime instances (microservices) to:
 * - Discover each other's entity schemas and available commands
 * - Invoke commands across service boundaries with policy-enforced authorization
 * - Propagate actor identity and tenant context through a policy bridge
 * - Generate typed HTTP client adapters from remote IRs
 *
 * Main exports:
 * - {@link FederationRegistry} — service discovery and health tracking
 * - {@link FederationClient} — cross-service command invocation
 * - {@link HttpFederationTransport} — default fetch-based transport
 * - {@link buildDescriptor} — build a ServiceDescriptor from a compiled IR
 * - {@link generateHttpAdapter} — generate typed TypeScript client code
 * - {@link buildBridgeFromContext} / {@link contextFromBridgeHeaders} — policy bridge
 *
 * @example
 * ```typescript
 * import { FederationRegistry, FederationClient, buildDescriptor } from '@angriff36/manifest/federation';
 *
 * // Build a descriptor from a compiled IR
 * const ordersDescriptor = buildDescriptor('orders', ordersIR, {
 *   endpoint: 'https://orders.svc.cluster:8080',
 * });
 *
 * // Register and discover
 * const registry = new FederationRegistry();
 * registry.register(ordersDescriptor);
 *
 * // Invoke a command on the remote service
 * const client = new FederationClient(registry);
 * const response = await client.invoke({
 *   serviceId: 'orders',
 *   entity: 'Order',
 *   command: 'createOrder',
 *   input: { customerId: 'c-1', items: [...] },
 *   bridge: { actorId: 'user-1', tenantId: 'tenant-1' },
 * });
 * ```
 */

export type {
  ServiceDescriptor,
  ExposedEntity,
  ExposedCommand,
  ServiceHealth,
  ServiceAuthConfig,
  FederationRequest,
  FederationResponse,
  PolicyBridgeHeaders,
  FederationClientOptions,
  FederationRegistryOptions,
  FederationTransport,
  TypedClientAdapter,
} from './types';

export { FederationRegistry } from './registry';
export type { ExposedCommandRef } from './registry';

export {
  FederationClient,
  HttpFederationTransport,
  buildBridgeHeaders,
  isTransientFailure,
} from './client';

export {
  buildBridgeFromContext,
  contextFromBridgeHeaders,
  parseBridgeHeaders,
  validateBridgeHeaders,
  ensureCorrelationId,
} from './policy-bridge';

export { buildDescriptor } from './descriptor';
export { generateHttpAdapter, renderAdapterSource } from './http-adapter';
