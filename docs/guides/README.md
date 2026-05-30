# Guides

How to integrate Manifest into an application. These are advisory — they describe usage patterns and do not define language semantics (see [`../spec/`](../spec/README.md) for binding rules).

## Integration

- [Usage patterns](./usage-patterns.md) — decision guide: projections vs. embedded runtime
- [Embedded runtime](./embedded-runtime.md) — using `RuntimeEngine` directly in your handlers
- [Hybrid integration](./hybrid-integration.md) — projections and embedded runtime together
- [External integration checklist](./external-integration-checklist.md) — adoption checklist for downstream apps
- [Writing your own projection](./writing-projections.md) — the projection boundary and contract

## Runtime concerns

- [Event wiring](./event-wiring.md) — connecting emitted events to infrastructure
- [Complex workflows](./complex-workflows.md) — multi-step business processes
- [Multi-tenancy](./multi-tenancy.md) — tenant isolation and `requireTenantContext`
- [Implementing custom stores](./implementing-custom-stores.md) — the `Store` interface for ORM adapters
- [Transactional outbox](./transactional-outbox.md) — outbox semantics and the transactional limitation

## Reference

- [Primitives reference](./primitives-reference.md) — language primitives at a glance

## Migration

- [Adopting vNext features](./migration/vnext.md)
- [v0.3.8 version-jump notes](./migration/v0.3.8.md)
