# Contributing to Manifest

## Prerequisites

- Node.js >= 20 (see `engines` in `package.json`)
- pnpm — the exact version is pinned in the `packageManager` field; enable
  [corepack](https://nodejs.org/api/corepack.html) (`corepack enable`) and it
  is used automatically.

## Setup

```bash
git clone https://github.com/Angriff36/Manifest.git
cd Manifest
pnpm install        # workspace install — covers packages/* too
```

## Everyday commands

```bash
pnpm test                   # full test suite — must stay green, no exceptions
pnpm run typecheck          # all tsconfig projects + workspace packages
pnpm run lint               # ESLint (0 errors expected)
pnpm run docs:check         # doc metadata/links/spec/snippet integrity
pnpm run dev                # diagnostic UI on localhost:5173
pnpm run conformance:regen  # regenerate expected outputs after fixture changes
```

## Things to know before changing code

- **The IR is the contract.** `docs/spec/ir/ir-v1.schema.json` and
  `docs/spec/semantics.md` are the source of truth; generated code is a view.
  If behavior changes: spec first, then tests, then implementation.
- **Conformance tests are executable semantics**, not ordinary tests. If they
  feel too strict, the change is wrong, not the fixture.
- Any change that makes an invalid program succeed is a language violation,
  not a UX improvement.
- Fixture JSON must stay deterministic and UTF-8 without BOM.

## Pull requests

- Keep diffs surgical; don't reformat or refactor unrelated code.
- `pnpm test`, `pnpm run typecheck`, and `pnpm run lint` must pass — CI runs
  them on Linux and Windows, plus packaging integrity checks (publint +
  tarball install smoke).
- Releases are maintainer-only via the `cut-release` workflow; never bump the
  version in a PR.

## Security issues

See [SECURITY.md](SECURITY.md) — do not open public issues for
vulnerabilities.
