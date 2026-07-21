# Manifest Mintlify docs — agent instructions

Authority: Advisory (product docs workspace under `mintlify/`)
Enforced by: None
Last updated: 2026-07-21

> For Mintlify product knowledge (components, `docs.json`, writing standards),
> install the Mintlify skill: `npx skills add https://mintlify.com/docs`

## About this project

- Public docs site for **`@angriff36/manifest`** (Manifest DSL + reference runtime)
- Pages are MDX with YAML frontmatter; site config is `docs.json`
- Preview: `mint dev` (from this directory). Link check: `mint broken-links`

## Source of truth (do not invent features)

1. Repo root `package.json` — **version SoT** (currently **3.6.41**); `engines.node` is **`>=20`**
2. `docs/spec/ir/ir-v1.schema.json` → `docs/spec/semantics.md` → builtins → adapters → conformance
3. Evidence inventory: `docs/CONFIRMED-FEATURES.md` (what exists) and `docs/TODO.md` (gaps)
4. Historical roadmap `docs/FEATURE-LIST.md` is **not** trustworthy without the caveat header

If docs disagree with Tier A / shipped code: **do not silently rewrite history**. Use:

```md
~~false claim~~
> **Correction (YYYY-MM-DD) @RYANSIGNED:** accurate claim + evidence pointer
```

Strike **prose or inline code only**. Never wrap a fenced block in `~~…~~`
(`~~```lang … ```~~`) — Mintlify’s MDX parser then treats `{…}` inside as JSX and
fails deploy with `Could not parse expression with acorn` (live site stuck;
seen 2026-07-21 on `language/reactions.mdx`).

## Hard accuracy rules

- **`RuntimeEngine.runCommand(commandName, input, options?)`** — never entity-first or 4-arg phantoms
- **Execution order** (`docs/spec/semantics.md` § Commands): context → rateLimit → policies → command constraints → guards → actions → emits → return
- **Policies** are top-level decls (or entity `defaultPolicies`); **no command-body policy clauses**
- **Do not document unpublished packages** as installable: `@manifest/mcp-server`, `@manifest/lsp-server`, `@manifest/stdlib`, VS Code `manifest-lang` (in-repo only)
- Label **Documentation gaps** when IR accepts a construct with no runtime/projection enforcement (e.g. `eventSourced` store)
- Prefer `pnpm` for this monorepo; consumer install examples may use npm/pnpm but must pin the SoT version when citing a number

## Style

- Active voice, second person ("you")
- Sentence case headings; one idea per sentence
- Code formatting for commands, paths, APIs
- Never invent APIs to make examples prettier
