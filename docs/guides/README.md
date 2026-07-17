# Guides

How to integrate Manifest into an application. These are advisory — they describe usage patterns and do not define language semantics (see [`../spec/`](../spec/README.md) for binding rules).

> **Audited (2026-07-15) @RYANSIGNED:** Index links verified. Package pin SoT:
> ~~`package.json` = **3.6.4**.~~
>
> **Correction (2026-07-16):** `package.json` = **3.6.13**. Prefer repo-relative
> `docs/spec/*` paths over any machine-absolute paths still lingering inside
> individual guides.

## Integration

- [Usage patterns](./usage-patterns.md) — decision guide: projections vs. embedded runtime
- [Embedded runtime](./embedded-runtime.md) — using `RuntimeEngine` directly in your handlers
- [Hybrid integration](./hybrid-integration.md) — projections and embedded runtime together
- [DX Proof Kit](./dx-proof-kit.md) — capability catalog, proof registry, integration guard, optional Convex test harness (`@angriff36/manifest/proof-kit`)
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
