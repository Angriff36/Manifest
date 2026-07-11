# Manifest IR Registries

This directory contains the JSON schemas for the machine-readable registries
Manifest emits from compiled IR:

- `commands.schema.json` — the **command registry**. One entry per
  entity+command pair, listing the policies, guards, emits, and effect kinds
  visible at compile time. Downstream consumers (CI gates, audit tooling,
  IDE integrations) treat this as the authoritative inventory of governed
  commands.

- `entities.schema.json` — the **governed-entity registry**. One entry per
  entity, classifying it (governed / read_only_projection / infrastructure /
  bypass_allowed / unknown_nonconforming), recording whether it is tenant-
  scoped, and listing the commands it owns.

- `bypasses.schema.json` — the **approved-bypass registry**. Hand-curated by
  repo owners; validated by `manifest audit-bypasses`. Fields cover the
  evidence any responsible governance review needs: entity, path, reason,
  why-runtime-not-required, tenant boundary, owner, approval and review
  dates.

## Stability

The schemas are versioned via the `compilerVersion` and `irHash` fields on
the emitted JSON. Breaking changes to the schemas MUST bump the manifest
compiler's major version (per `docs/spec/semantics.md` change protocol).

## Authority

Authority for what these registries mean lives in:

- `docs/spec/semantics.md` § "Governance Primitive Surface"
- `docs/spec/adapters.md` (canonical dispatcher, audit sink, outbox store)

The schemas in this directory are the machine-readable contract; the spec
text is the human-readable contract. Downstream governance integrations
(see `docs/integrations/`) consume these schemas but do not author them.
