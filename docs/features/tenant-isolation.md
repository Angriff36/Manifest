# Tenant Isolation

A top-level `tenant` declaration scopes entity reads and writes to a tenant value extracted from the runtime context. Tenant-scoped programs fail closed: a command invoked without a resolvable tenant value is rejected with `MISSING_TENANT_CONTEXT`.

## Usage / Syntax

The declaration is a single top-level construct (at most one per program). From the conformance fixture `src/manifest/conformance/fixtures/61-tenant-isolation.manifest`:

```
tenant tenantId : string from context.tenantId

entity Invoice {
  property required id: string
  property required amount: number
  property required description: string

  command createInvoice(amount: number, description: string) {
    mutate amount = amount
    mutate description = description
  }

  store in memory
}
```

The syntax is `tenant <property> : <type> from <context_path>`. `tenant` is a reserved keyword in `src/manifest/lexer.ts`. The parser rejects more than one tenant declaration per program.

## Behavior / What it does

The compiler emits an `IRTenant` record with `property`, `type`, and `contextPath` fields onto `IR.tenant`. The field is only present when a `tenant` declaration exists, so programs without tenancy compile identically to before.

The runtime engine (`src/manifest/runtime-engine.ts`) reads `IR.tenant` and applies tenant scoping:

- `resolveTenantValue()` walks the configured `contextPath` (for example `context.tenantId`) against the active runtime context and returns the tenant value, or `undefined` when the IR has no tenant declaration or the context lacks the value.
- The tenant gate in `runCommand()` activates when **either** the `requireTenantContext` runtime option is set **or** the IR declares a `tenant`. When active and no tenant value resolves (any falsy value — `undefined`, empty string, `null` — counts as missing), the command fails with the error string `MISSING_TENANT_CONTEXT: tenant-scoped command invoked without context.tenantId`. The result is classified as `missing_tenant_context`.
- On create, the resolved tenant value is auto-written into the entity's tenant property.
- `getAllInstances()` filters results to instances whose tenant property equals the active tenant value.
- `getInstance()` returns `undefined` when an instance's tenant property does not match the active tenant value, preventing cross-tenant reads.

The Prisma projection adds a tenant discriminator column and an index per model, and emits PostgreSQL row-level-security policy statements as comments for consumers to apply manually.

## Reference

- Source keyword: `tenant`; syntax `tenant <property> : <type> from <context_path>`.
- IR field: `IR.tenant?: IRTenant` with `{ property, type, contextPath }`.
- Runtime option: `RuntimeOptions.requireTenantContext?: boolean` (independent of the IR-level declaration; can enforce tenant context without a `tenant` block).
- Failure diagnostic: `MISSING_TENANT_CONTEXT`, classified as outcome `missing_tenant_context`.

## Notes & limitations

Tenant filtering is enforced by the reference runtime engine's read paths (`getAllInstances`, `getInstance`); it is not enforced by the database unless the emitted RLS policies are applied. The Prisma RLS statements ship as comments, not executed migrations. The runtime gate is fail-closed by design — a missing or empty tenant value is treated as an error rather than a permissive default. The `requireTenantContext` option and the IR `tenant` declaration are orthogonal; either activates the gate.

Note on provenance: the consolidated feature summary references this fixture as `58-tenant-isolation`, but the committed fixture is `61-tenant-isolation.manifest`. The fixture's tenant value is read from `context.tenantId`.
