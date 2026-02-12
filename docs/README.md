# Manifest Docs: Start Here

Authority: Advisory
Enforced by: None
Last updated: 2026-02-12

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
