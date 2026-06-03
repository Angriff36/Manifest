# Federation (Multi-Service Runtime)

## Summary

The federated runtime enables multiple Manifest services to communicate with each other while preserving policy enforcement and workflow metadata across service boundaries.

## ServiceDescriptor

Each service publishes a `ServiceDescriptor` declaring its entities, commands, and policies:

```typescript
interface ServiceDescriptor {
  serviceName: string;
  baseUrl: string;
  entities: string[];
  commands: { entity: string; command: string }[];
  policies: { entity: string; scope: string; expression: string }[];
}
```

## FederationClient

```typescript
import { FederationClient } from "@angriff36/manifest/federation";

const client = new FederationClient({
  services: [
    { serviceName: "inventory", baseUrl: "http://inventory:3001" },
    { serviceName: "payment", baseUrl: "http://payment:3002" },
  ],
});
```

## Policy Bridge

Cross-service calls carry policy context via HTTP headers:

| Header | Value |
|--------|-------|
| `X-Manifest-User-Id` | Current user ID |
| `X-Manifest-Tenant-Id` | Current tenant |
| `X-Manifest-Role` | Current user role |
| `X-Manifest-Correlation-Id` | Workflow correlation ID |
| `X-Manifest-Causation-Id` | Causation identifier |

## Conformance Fixtures

- `87-federation.manifest` — cross-service entity schema exposure and command invocation

## Notes

- Federation is transport-independent — the default uses HTTP but custom transports are supported
- Workflow metadata (correlationId, causationId) propagates automatically through federated calls
- Service descriptors can be discovered via a registry service or hardcoded in configuration
