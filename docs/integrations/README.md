# Manifest Integrations

This directory holds downstream integration examples for Manifest. **Nothing under `docs/integrations/` is authoritative for Manifest semantics.** Manifest itself does not import from these examples, depend on them at build or test time, or treat their documents as binding.

What lives here:

- `capsule-pro/` — Capsule-Pro's governance constitution, expressed as a downstream policy that consumes only Manifest's public surfaces (registries, dispatcher, audit-governance CLI, RuntimeContext, AuditSink, OutboxStore). See `capsule-pro/integration-proof.md` for the exact surface map.

Adding a new integration here MUST follow the same rule: it describes how a downstream application uses Manifest. It MUST NOT define new semantics for Manifest, MUST NOT be referenced as authority from `docs/spec/`, and MUST NOT be imported by `src/manifest/**` or `packages/cli/**`.

For Manifest's authoritative semantics see `docs/spec/`.
