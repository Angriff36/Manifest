# Federation (Multi-Service Runtime)

## Summary

The federated runtime enables multiple Manifest services to communicate with each other while preserving policy enforcement and workflow metadata across service boundaries.

**Package note:** Federation lives in `src/manifest/federation/` and is exported as the `@angriff36/manifest/federation` subpath. The API below matches `src/manifest/federation/types.ts` and `client.ts`.

## ServiceDescriptor

Each service publishes a `ServiceDescriptor` declaring its exposed entities and commands:

```typescript
interface ServiceDescriptor {
  serviceId: string;
  displayName?: string;
  endpoint: string;
  schemaVersion: string;
  entities: ExposedEntity[];
  health?: ServiceHealth;
  auth?: ServiceAuthConfig;
}

interface ExposedEntity {
  name: string;
  module?: string;
  commands: ExposedCommand[];
}

interface ExposedCommand {
  name: string;
  idempotent: boolean;
  requiredPolicies: string[];
  description?: string;
}
```

Build a descriptor from compiled IR with `buildDescriptor()` (`src/manifest/federation/descriptor.ts`).

## FederationClient

```typescript
import { FederationRegistry, FederationClient, buildDescriptor } from '@angriff36/manifest/federation';

const ordersDescriptor = buildDescriptor('orders', ordersIR, {
  endpoint: 'https://orders.svc.cluster:8080',
});

const registry = new FederationRegistry();
registry.register(ordersDescriptor);

const client = new FederationClient(registry);

const response = await client.invoke({
  serviceId: 'orders',
  entity: 'Order',
  command: 'createOrder',
  input: { customerId: 'c-1' },
  bridge: { actorId: 'user-1', tenantId: 'tenant-1', correlationId: 'corr-1' },
});
```

## Policy Bridge

Cross-service calls carry policy context via HTTP headers (`buildBridgeHeaders` in `client.ts`):

| Header | Value |
|--------|-------|
| `X-Manifest-Actor` | Acting user ID |
| `X-Manifest-Tenant` | Tenant ID |
| `X-Manifest-Org` | Organization ID |
| `X-Manifest-Roles` | Comma-separated roles |
| `X-Request-Id` | Request ID for tracing |
| `X-Correlation-Id` | Workflow correlation ID |

Remote endpoint shape: `POST {endpoint}/__manifest/federation/{entity}/{command}`

## Conformance Fixtures

- `87-federation.manifest` — cross-service entity schema exposure and command invocation

## Notes

- Federation is transport-independent — default uses `HttpFederationTransport` (fetch); pass a custom `FederationTransport` for tests or gRPC
- Workflow metadata (`correlationId`, etc.) propagates through `PolicyBridgeHeaders`
- Service descriptors are registered in `FederationRegistry`; health checks are optional via `FederationRegistryOptions`
