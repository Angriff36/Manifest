# Manifest Features

This directory documents the language, runtime, and tooling features of Manifest. Each page follows the same shape: a short intro, usage/syntax drawn from the conformance fixtures or real source, verified behavior, a reference section, and honest caveats. Language-feature syntax is taken from the conformance fixtures in `src/manifest/conformance/fixtures/`; tooling and SDK behavior is verified against the implementation in `src/manifest/` and `packages/`.

For the command-line interface, see `../reference/cli.md`. For code-generation targets (Next.js, Prisma, Drizzle, OpenAPI, Zod, TanStack Query, and others), see `../projections/`.

## Feature pages by category

| Category | Feature | Page |
|----------|---------|------|
| Types | Enum types | [enum-types.md](enum-types.md) |
| Types | Decimal / money types | [decimal-money-types.md](decimal-money-types.md) |
| Types | Value-object types | [value-object-types.md](value-object-types.md) |
| Types | Date / time types | [date-time-types.md](date-time-types.md) |
| Types | Array types | [array-types.md](array-types.md) |
| Constraints & Expressions | Regex constraints | [regex-constraints.md](regex-constraints.md) |
| Constraints & Expressions | Range constraints | [range-constraints.md](range-constraints.md) |
| Constraints & Expressions | Expression built-ins | [expression-builtins.md](expression-builtins.md) |
| Constraints & Expressions | Feature flags | [feature-flags.md](feature-flags.md) |
| Computed | Computed-property caching | [computed-property-caching.md](computed-property-caching.md) |
| Entities | Automatic timestamp fields | [timestamp-fields.md](timestamp-fields.md) |
| Entities | Tenant isolation | [tenant-isolation.md](tenant-isolation.md) |
| Entities | Entity inheritance & generics | [entity-inheritance.md](entity-inheritance.md) |
| Workflows | Approval workflows | [approval-workflows.md](approval-workflows.md) |
| Workflows | Async commands | [async-commands.md](async-commands.md) |
| Workflows | Event reactions & subscriptions | [event-reactions.md](event-reactions.md) |
| Workflows | Modules & imports | [modules-and-imports.md](modules-and-imports.md) |
| Workflows | Role hierarchy | [role-hierarchy.md](role-hierarchy.md) |
| Workflows | Saga orchestration | [saga-workflow.md](saga-workflow.md) |
| Workflows | Scheduled commands | [scheduled-commands.md](scheduled-commands.md) |
| Runtime | Runtime middleware | [runtime-middleware.md](runtime-middleware.md) |
| Runtime | Federation (multi-service) | [federation.md](federation.md) |
| Runtime | Real-time subscriptions | [realtime-subscriptions.md](realtime-subscriptions.md) |
| Security | Encryption, masking, rate limiting, retry | [security-features.md](security-features.md) |
| Extensibility | Plugin API (stores, builtins, projections) | [plugin-api.md](plugin-api.md) |
| AI surfaces | AI agent SDK | [agent-sdk.md](agent-sdk.md) |
| AI surfaces | MCP server | [mcp-server.md](mcp-server.md) |
| Tooling | IR version control | [ir-version-control.md](ir-version-control.md) |
| Tooling | Snapshot testing | [snapshot-testing.md](snapshot-testing.md) |

## Related references

- Command catalog: [../reference/cli.md](../reference/cli.md)
- Projections (code generation): [../projections/](../projections/)
