# Contribute to Manifest documentation

Authority: Advisory
Enforced by: None
Last updated: 2026-07-15

Thank you for contributing to the public Manifest docs (this `mintlify/` tree).

## Before you edit

1. Read `AGENTS.md` in this folder (accuracy rules + SoT order).
2. Confirm claims against repo root `package.json` (version / `engines.node`),
   `docs/spec/semantics.md`, and `docs/CONFIRMED-FEATURES.md`.
3. Do **not** invent features. Prefer a labeled Documentation gap over a polished lie.

## How to contribute

### Option 1: Edit on GitHub

1. Open the MDX page you want to change
2. Use the edit (pencil) control
3. Submit a PR with evidence for any behavioral claim

### Option 2: Local development

1. Fork/clone the Manifest repo
2. Install the Mintlify CLI: `npm i -g mint` (or `pnpm dlx mint`)
3. From **`mintlify/`** (where `docs.json` lives): `mint dev`
4. Preview at `http://localhost:3000`
5. Open a PR against the default branch

## Correction method (binding for false claims)

When a shipped fact proves a page wrong:

```md
~~outdated or false text~~
> **Correction (YYYY-MM-DD) @RYANSIGNED:** corrected text + pointer to spec/code
```

Do not delete the strike-through until a human cleans the ledger. Date every edit.

## Writing guidelines

- Active voice; address the reader as "you"
- Keep examples aligned with real APIs (`runCommand(commandName, input, options?)`)
- Cite Node **`>=20`** and the current package version from root `package.json` when versioning matters
- Include a short Test plan in the PR for any page that documents runtime behavior

## Need help?

- Spec chain: `docs/spec/README.md`
- Open gaps: `docs/TODO.md`
- Accuracy ledger: `docs/internal/plans/2026-07-15-docs-accuracy-loop.md`
