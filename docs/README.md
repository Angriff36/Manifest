# Manifest Documentation

Manifest is a deterministic, **IR-first** domain-specific language for business rules and workflows.

- You write Manifest source (`.manifest`).
- The compiler produces **IR** — the Intermediate Representation, the single source of truth.
- The runtime (`RuntimeEngine`) executes IR.
- Conformance tests prove compiler/runtime behavior matches the spec.

The IR schema (`spec/ir/ir-v1.schema.json`) is authoritative. Generated TypeScript and routes are derivative views, not authority.

---

## Getting started

- [Quickstart](./getting-started/quickstart.md) — compile and run a manifest in a few minutes
- [What Manifest is (and is not)](./getting-started/architecture-and-positioning.md)
- [Use Manifest in a new project](./getting-started/new-project.md)
- [FAQ](./getting-started/faq.md)
- [Troubleshooting](./getting-started/troubleshooting.md)

## Features

Full reference for every shipped capability lives in [`features/`](./features/README.md). Highlights:

- **Types** — [enums](./features/enum-types.md), [decimal & money](./features/decimal-money-types.md), [value objects](./features/value-object-types.md), [date/time](./features/date-time-types.md), [arrays](./features/array-types.md)
- **Constraints & expressions** — [regex `matches()`](./features/regex-constraints.md), [range constraints](./features/range-constraints.md), [aggregate & expression builtins](./features/expression-builtins.md), [feature flags `flag()`](./features/feature-flags.md)
- **Computed properties** — [memoization & caching](./features/computed-property-caching.md)
- **Entities** — [timestamps](./features/timestamp-fields.md), [tenant isolation](./features/tenant-isolation.md)
- **Extensibility** — [plugin API: custom stores & expression functions](./features/plugin-api.md)
- **AI surfaces** — [agent SDK](./features/agent-sdk.md), [MCP server](./features/mcp-server.md), [LLM context export](./projections/llm-context.md)

## Projections

Generate platform artifacts from IR. One page each in [`projections/`](./projections/README.md):

[Next.js](./projections/nextjs.md) · [Prisma](./projections/prisma.md) · [Drizzle](./projections/drizzle.md) · [OpenAPI 3.1](./projections/openapi.md) · [GraphQL](./projections/graphql.md) · [Zod](./projections/zod.md) · [TanStack Query](./projections/react-query.md) · [JSON Schema](./projections/json-schema.md) · [Express](./projections/express.md) · [Hono](./projections/hono.md) · [Mermaid diagrams](./projections/mermaid.md) · [LLM context](./projections/llm-context.md)

## Language reference (binding)

The `spec/` tree is **normative** — changes there require conformance updates. Read in order:

1. [Spec entrypoint](./spec/README.md)
2. [IR v1 schema](./spec/ir/ir-v1.schema.json) — the authoritative contract
3. [Semantics](./spec/semantics.md) — runtime meaning of IR nodes
4. [Builtins](./spec/builtins.md) — built-in identifiers and functions
5. [Adapters](./spec/adapters.md) — audit, outbox, store, dispatcher hooks
6. [Conformance](./spec/conformance.md) — conformance test rules
7. [vNext semantics](./spec/manifest-vnext.md) — constraint outcomes, overrides, workflows
8. [Project layout](./spec/project-layout.md) — where files go in consumer apps

## Guides

How to integrate Manifest. These do not define semantics — see [`guides/`](./guides/README.md):

- [Usage patterns](./guides/usage-patterns.md) — projections vs embedded runtime
- [Embedded runtime](./guides/embedded-runtime.md)
- [Event wiring](./guides/event-wiring.md)
- [Complex workflows](./guides/complex-workflows.md)
- [Hybrid integration](./guides/hybrid-integration.md)
- [Multi-tenancy](./guides/multi-tenancy.md)
- [Implementing custom stores](./guides/implementing-custom-stores.md)
- [Transactional outbox](./guides/transactional-outbox.md)

## CLI & API reference

See [`reference/`](./reference/README.md):

- [CLI reference](./reference/cli.md) — every command and option
- [API reference](./reference/api.md) — programmatic surface
- [Compiler & IR](./reference/compiler-ir.md)
- [Runtime engine](./reference/runtime-engine.md)
- [Config schema](./spec/config/manifest.config.md)

---

## What Manifest actually guarantees

Which guarantees are statically enforced, runtime-enforced, contract-only, or deferred:

| Guarantee                                                 | Where it lives                                          | Enforced                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| IR schema validity                                        | `spec/ir/ir-v1.schema.json`                             | **Statically** — `manifest validate`, `manifest check`                                  |
| Policy / guard / constraint semantics                     | `spec/semantics.md`                                     | **At runtime** — `RuntimeEngine.runCommand`                                             |
| Deterministic mode                                        | `spec/adapters.md § Deterministic Mode`                 | **At runtime** — `ManifestEffectBoundaryError`                                          |
| `requireTenantContext` fail-closed                        | `spec/semantics.md § Runtime Context`                   | **At runtime** — `MISSING_TENANT_CONTEXT` outcome                                       |
| `AuditSink.emit` exactly-once per command                 | `spec/adapters.md § Audit Sink`                         | **At runtime** — fail-open on sink errors                                               |
| `OutboxStore.enqueue` per emitted-event command           | `spec/adapters.md § Outbox Store`                       | **At runtime** — non-transactional w.r.t. mutation                                      |
| Canonical dispatcher route presence                       | —                                                       | **Statically** — `manifest integration-check § dispatcher`                              |
| Direct-writes / route-drift / event-fabrication detection | `manifest audit-governance`                             | **Statically** — CI gate                                                                |
| Subpath imports / tarball shape                           | `package.json` `exports` + `files`                      | **Statically** — `manifest integration-check § package-shape`                           |
| **Transactional outbox** (mutation + enqueue atomicity)   | —                                                       | **Deferred** — adapters honor a caller-supplied `tx`; `RuntimeEngine` does not open one |
| **Live Postgres adapter tests**                           | `src/manifest/{audit,outbox}/.../postgres.live.test.ts` | **Env-gated** — set `MANIFEST_POSTGRES_TEST_URL`                                        |

> Internal design history, governance policy, and superseded plans live in [`internal/`](./internal/) and are not part of the product documentation.
