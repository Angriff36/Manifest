# Manifest Docs: Start Here

Last updated: 2026-02-12
Status: Active
Authority: Advisory
Enforced by: None

## What Manifest Is

Manifest is a deterministic domain-specific language (DSL).

- You write Manifest source (`.manifest`).
- The compiler produces IR (Intermediate Representation).
- The runtime executes IR.
- Conformance tests prove compiler/runtime behavior matches spec.

## Where To Go First

Use this routing table before editing anything:

- **Binding language law (canonical):** `docs/spec/**`
- **Executable proof of language behavior:** `src/manifest/conformance/**`
- **Guidance and implementation patterns:** `docs/patterns/**`
- **Deployment boundary FAQ (what is and is not language semantics):** `docs/contracts/deployment-boundaries.md`
- **Migration docs:** `docs/migration/**`
- **Drafts, proposals, and design notes:** `specs/**`

## Understanding Manifest

New to Manifest? Start with these guides:

- **What is Manifest?** `docs/ARCHITECTURE_AND_POSITIONING.md` - What Manifest IS and is NOT
- **Quick Start:** `docs/QUICKSTART.md` - Get up and running in 5 minutes
- **FAQ:** `docs/FAQ.md` - Common questions and answers

## Integration Patterns

Most applications use BOTH projections AND embedded runtime:

- **Usage Patterns:** `docs/patterns/usage-patterns.md` - Decision guide for projections vs embedded runtime
- **Embedded Runtime:** `docs/patterns/embedded-runtime-pattern.md` - Direct runtime integration
- **Event Wiring:** `docs/patterns/event-wiring.md` - Connect events to infrastructure (WebSockets, queues, webhooks)
- **Complex Workflows:** `docs/patterns/complex-workflows.md` - Multi-step business processes
- **Hybrid Integration:** `docs/patterns/hybrid-integration.md` - Combining projections and embedded runtime
- **Multi-Tenancy:** `docs/patterns/multi-tenancy.md` - Tenant isolation and scoping
- **Custom Stores:** `docs/patterns/implementing-custom-stores.md` - ORM integration

## Folder Meanings In Plain Terms

- `docs/spec/`: What the language means and requires.
- `src/manifest/conformance/`: Tests/fixtures that enforce those rules.
- `docs/patterns/`: How to apply the language in real apps.
- `specs/`: Ideas and proposals that are not binding.

## Key Terms

- **Manifest language:** The DSL itself.
- **Manifest source:** Author-written `.manifest` program.
- **IR:** Compiled contract from source; runtime authority for execution.
- **Runtime:** Executes IR deterministically.
- **Conformance:** Test fixtures/results that prove semantics.
- **Projection:** Generated code surface from IR (for example Next.js artifacts).
- **Embedded runtime:** Hand-written app/server code that calls runtime directly.

## Change Rules

If you are changing language meaning:

1. Update `docs/spec/**` first.
2. Update conformance fixtures/tests.
3. Update implementation.
4. Keep `npm test`, `npm run typecheck`, and `npm run lint` green.

See `docs/DOCUMENTATION_GOVERNANCE.md` for full policy.
