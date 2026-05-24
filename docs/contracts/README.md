Last updated: 2026-05-24
Status: Active
Authority: Advisory
Enforced by: None

# Contracts Signpost

This folder is a **label layer only**. It does not contain binding law and must not
duplicate normative files from `docs/spec/`.

## Where the actual contracts live

| Contract | Location |
|---|---|
| IR schema (executable contract anchor) | `docs/spec/ir/ir-v1.schema.json` |
| Runtime meaning of IR nodes | `docs/spec/semantics.md` |
| Built-in identifiers and functions | `docs/spec/builtins.md` |
| Adapter hooks (audit, outbox, stores, dispatcher) | `docs/spec/adapters.md` |
| Conformance test rules | `docs/spec/conformance.md` |
| vNext features: constraints, overrides, composite keys, referential actions | `docs/spec/manifest-vnext.md` |
| Registry schemas | `docs/spec/registry/README.md` |
| Conformance fixtures (executable semantics evidence) | `src/manifest/conformance/**` |

## What is NOT a contract

**Projections are not contracts.** The Prisma projection (`PrismaProjection`) reads IR and
emits `schema.prisma` as a **derivative artifact**. The Next.js projection emits route
handlers as a derivative artifact. These are tooling outputs — they do not define language
semantics and do not belong in the contracts tier.

If you are looking for how the Prisma projection works, see:
- `docs/codedocs/api-reference/projections.md`
- `docs/proposals/storage-projection/README.md`

## Files in this folder

- `deployment-boundaries.md` — what is and is not language semantics (scope boundary guide)
- `house-style.md` — language design principles (determinism, explicitness, strict guard semantics)

These are advisory. They do not grant or restrict runtime behavior — `docs/spec/**` does that.
