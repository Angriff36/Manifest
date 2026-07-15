# Projections

A **projection** consumes compiled Manifest IR and emits a platform- or tooling-specific artifact — an API route module, an ORM schema, an OpenAPI document, a set of typed hooks, a diagram, and so on. Projections are tooling, not runtime semantics: they read the IR and produce derivative views of it, but they never redefine execution order, policy evaluation, or guard semantics, and they never mutate the IR. The runtime remains the single source of truth for what a program _means_; projections only change how that meaning is _rendered_ for a given target. Each projection implements the shared `ProjectionTarget` contract in `src/manifest/projections/interface.ts`, is auto-registered through `src/manifest/projections/builtins.ts`, and is retrieved by name via `getProjection(name)` from `src/manifest/projections/registry.ts`.

## Available projections

~~The table below listed only a subset of shipped generators.~~

> **Correction (2026-07-15) @RYANSIGNED:** Registry names from
> `src/manifest/projections/builtins.ts` / `getProjection()` (package **3.6.4**). Pages linked
> below exist under `docs/projections/`; names without a page are still registered — see mintlify
> `projections/additional-projections.mdx` / `listProjections()`.

| Projection                      | Name                 | Description                                                                                          |
| ------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| [Next.js](./nextjs.md)          | `nextjs`             | Next.js App Router API routes with configurable auth and database support.                           |
| —                               | `routes`             | Canonical route-surface artifact (typed path builders).                                              |
| [Prisma](./prisma.md)           | `prisma`             | Prisma schema generation. Compile-time only, app-agnostic.                                           |
| —                               | `prisma-store`       | Prisma store-provider companion projection.                                                          |
| —                               | `convex`             | Convex schema + validators (diagnostics for unsupported IR features).                                |
| [Drizzle](./drizzle.md)         | `drizzle`            | Drizzle ORM schema generation.                                                                       |
| [OpenAPI](./openapi.md)         | `openapi`            | OpenAPI 3.1.0 spec generation.                                                                       |
| [GraphQL](./graphql.md)         | `graphql`            | GraphQL SDL and resolver stubs.                                                                      |
| [Zod](./zod.md)                 | `zod`                | Zod validation schemas.                                                                              |
| [React Query](./react-query.md) | `react-query`        | TanStack Query hooks.                                                                                |
| [JSON Schema](./json-schema.md) | `jsonschema`         | JSON Schema documents.                                                                               |
| [Express](./express.md)         | `express`            | Express/Fastify route handlers.                                                                      |
| [Hono](./hono.md)               | `hono`               | Hono edge-runtime route handlers.                                                                    |
| [Mermaid](./mermaid.md)         | `mermaid`            | Mermaid ER / state / sequence diagrams.                                                              |
| [LLM Context](./llm-context.md) | `llm-context`        | Structured `manifest-context.json` for agents.                                                       |
| [Product wiring](./wiring.md)   | `wiring`             | Command wiring contract + safe bindings.                                                             |
| —                               | `storybook`          | Storybook CSF3 stories.                                                                              |
| [Health](./health.md)           | `health`             | Health-check handlers (IR/store/outbox scaffolding + Next.js/Express wrappers).                      |
| —                               | `materialized-views` | PostgreSQL `CREATE MATERIALIZED VIEW` DDL.                                                           |
| —                               | `elasticsearch`      | Elasticsearch index mappings / client stubs.                                                         |
| —                               | `terraform`          | Terraform HCL infra stubs.                                                                           |
| —                               | `analytics`          | Analytics tracking-plan projection.                                                                  |
| —                               | `remix`              | Remix loaders/actions.                                                                               |
| —                               | `sveltekit`          | SvelteKit server routes / load functions.                                                            |
| —                               | `kysely`             | Kysely Database interface + row types.                                                               |
| —                               | `dynamodb`           | DynamoDB single-table infra stubs.                                                                   |
| —                               | `pydantic`           | Pydantic v2 models (Python).                                                                         |
| —                               | `dart`               | Dart/Flutter models + API client.                                                                    |
| —                               | `contract-tests`     | Generated contract-test suites (e.g. Convex export parity).                                          |

> Projections are tooling, not runtime semantics. They generate views of the IR and must not alter execution order, policy/guard behavior, or the IR itself.
