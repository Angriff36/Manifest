Last updated: 2026-05-24
Status: Active
Authority: Advisory
Enforced by: None

# Start Here

## What Manifest is

Manifest is a **business-logic DSL**. You write declarative source files (`.manifest`) that
describe entities, commands, guards, policies, and events. The compiler turns them into an
**Intermediate Representation (IR)** — a JSON document that is the single source of truth
for what a Manifest program means.

```
.manifest source  →  Compiler  →  IR  →  RuntimeEngine
```

Nothing downstream of the IR is authoritative. TypeScript types, Next.js routes, and
Prisma schemas are all **derived views** — convenient output, not language law.

## The three pillars

| Thing | What it is | Where |
|---|---|---|
| **IR schema** | The executable contract. Defines the exact shape every compiled program MUST produce. | `docs/spec/ir/ir-v1.schema.json` |
| **Runtime** | Evaluates IR. Enforces guards, policies, constraints, and event emission in a fixed order. | `src/manifest/runtime-engine.ts` |
| **Conformance** | Fixture-based proof that compiler + runtime match the spec. If a fixture fails, the spec is violated. | `src/manifest/conformance/**` |

## Projections are tooling, not law

A **projection** reads IR and emits platform artifacts. The Prisma projection emits
`schema.prisma`. The Next.js projection emits route handlers. These are code-generation
conveniences — they do not redefine what a Manifest program means.

If `schema.prisma` and the IR spec ever disagree, the IR spec wins. If a generated route
and `semantics.md` disagree, `semantics.md` wins.

The PrismaProjection emits `prisma.config.ts` alongside `schema.prisma` when a `provider`
is set (Prisma 7+ requirement). Both files are derivative. Touch them by changing IR or
projection options — never by editing them as if they were source.

## Folder routing

| I want to… | Go to |
|---|---|
| Understand what a language construct means at runtime | `docs/spec/semantics.md` |
| Change language behavior | Update `docs/spec/**` first, then conformance, then implementation |
| Add a new IR field | `docs/spec/ir/ir-v1.schema.json` → conformance fixtures → `src/manifest/ir-compiler.ts` |
| Understand the Prisma projection | `docs/codedocs/api-reference/projections.md`, `mintlify/integration/prisma.mdx` |
| Read the full doc hierarchy | `docs/README.md` |
| Understand doc authority tiers | `docs/DOCUMENTATION_GOVERNANCE.md` |
| Find binding language law | `docs/spec/**` and `src/manifest/conformance/**` |
| Find advisory guidance and patterns | `docs/patterns/**`, `docs/tools/**` |
| Find design history or deferred proposals | `docs/proposals/**`, `docs/archive/**` |

## What "done" means

A change is done when:
- `npm test` — green (includes 1076+ conformance + unit tests)
- `npm run typecheck` — clean
- `npm run lint` — clean
- `npm run docs:check` — clean (metadata + link integrity)

If the change touches language behavior, `docs/spec/**` and conformance fixtures must be
updated before the implementation.
