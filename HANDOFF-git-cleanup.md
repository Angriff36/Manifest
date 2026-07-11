# Handoff: clean up a messy local git state on `main`

You (Claude Code) are picking this up fresh. A previous assistant (running in a
sandboxed environment with a **locked git index** and a **no-unlink filesystem**)
did real, good work but committed it badly. Your job is to land the _content_
cleanly and discard the _mechanics_ of how it was committed. Git works normally
on this machine — none of the sandbox limitations apply to you.

## TL;DR of what to fix

`main` is **5 commits ahead of origin**. The last 4 commits (made by the previous
assistant) are correct in _content_ but polluted: they swept two nested git
worktrees and build artifacts into the tree, and the on-disk `.git/index` was
never synced to HEAD (commits were made through a side index file). Result:
`git status` shows a deranged staged diff. Rewind those 4 commits, keep the
working-tree content, ignore the junk, and re-commit cleanly.

## Commit graph

```
e4970f5  docs(mintlify): add new projections/language/extensibility pages   <- main (HEAD)
c46d3b6  docs: reorganize docs/ into production structure + move cruft to internal/
d99d575  docs: document v1.0.33 features; bump version + CHANGELOG
86222ce  feat: land projections/CLI/builtins + conformance 63-66
48324f3  fix(cli): resolve -o directory path ...                            <- LAST GOOD COMMIT (origin-ish)
```

`48324f3` is the clean base to rewind to. The 4 commits above it hold the work.

## What the work actually IS (do NOT lose this — it's verified and tests pass)

- **Feature code (86222ce):** new projection generators (graphql, hono, express,
  jsonschema, llm-context, mermaid), new CLI commands (watch, diagram, coverage,
  changelog), new builtins (regex `matches()`, aggregate `sum/avg/min_of/max_of/
count_of/filter/map`, `flag()` feature flags, computed-property `cache`), and
  conformance fixtures 63-66. Core compiler files and ~50 conformance
  `expected/*.ir.json` were updated/regenerated.
- **v1.0.33 (d99d575):** `package.json` bumped 1.0.32 -> 1.0.33, CHANGELOG entry,
  README updated.
- **docs/ reorg (c46d3b6):** new `docs/{getting-started,features,projections,
guides,reference}/` with per-feature + per-projection pages; design history /
  governance moved to `docs/internal/`; `docs/spec/` intentionally left in place
  (it's load-bearing — code/tests/tarball reference `docs/spec/ir/ir-v1.schema.json`
  and `docs/spec/semantics.md`; do not move or rename those).
- **mintlify/ (e4970f5):** ported the above to the published docs site
  (`mintlify/projections/*.mdx`, `mintlify/language/*.mdx`,
  `mintlify/extensibility/*.mdx`), updated `cli/commands.mdx`, and rewired
  `mintlify/docs.json` nav.

Test status: the user ran `pnpm test` and got **1844 passing / 0 failing**
(incl. live Postgres). The shifted conformance baselines are sound.

## The two bugs in those 4 commits

1. **Nested worktrees + build junk were committed.** Staging used `git add -A`
   from the repo root, which swallowed the _registered but nested_ worktrees under
   `.worktrees/feature-main-*` (two full repo copies), plus compiled `.js` files
   sitting next to their `.ts` sources, a stray `nul` file, and debug scratch
   files (`debug-*.mjs`, `verify-aggregates.mts`, `constraint-test-verify.spec.ts`).
2. **`.git/index` is out of sync with HEAD.** Commits were created via a side
   index (`GIT_INDEX_FILE`) + direct ref write, so the real index never advanced.
   That's why `git status` looks insane right now — ignore the specifics, it's an
   index-vs-HEAD desync, not real content loss.

## Worktrees — context for the ignore decision

`git worktree list` shows these registered and all flagged **prunable**:

- `.worktrees/feature-main-1779766129836-hh60` (branch feature/main-...-hh60)
- `.worktrees/feature-main-1779770347259-tfli` (branch feature/main-...-tfli)
- `.claude/worktrees/{jolly-curran,nostalgic-villani,vigorous-noether}-*`
- (Codex worktrees live OUTSIDE the repo under `C:\Users\Ryan\.codex\` — not a concern.)

Nested worktrees inside the repo are NOT auto-excluded from the superproject's
`git add -A`, so they must be gitignored in the main checkout. This does **not**
affect the agents working inside them — each worktree commits to its own branch
via `.git/worktrees/<id>` metadata, independent of the main branch's `.gitignore`.

**Before pruning anything**, check each worktree branch for unmerged/in-flight
commits the Automaker agents may still need:

```
git worktree list
git log --oneline main..feature/main-1779766129836-hh60
git log --oneline main..feature/main-1779770347259-tfli
```

If a branch has commits not on main and the agent isn't done, KEEP it (just ignore
the path). If it's dead, `git worktree remove <path>` / `git worktree prune`.

## Recommended cleanup

```bash
# 1. ignore nested worktrees + build junk so add -A can't resweep them
cat >> .gitignore <<'GI'

# git worktrees (nested inside repo)
.worktrees/
.claude/worktrees/
# stray windows artifact + local debug scratch
nul
debug-*.mjs
verify-aggregates.mts
constraint-test-verify.spec.ts
GI

# 2. rewind the 4 polluted commits but KEEP all working-tree content
git reset --mixed 48324f3

# 3. index is rebuilt and sane now — confirm
git status

# 4. DECISION: the build dumped compiled .js next to .ts under src/ (and packages).
#    The repo already tracks SOME .js, so this needs a human/Claude call:
#      - if those .js are build output -> add an ignore rule (e.g. /src/**/*.js with
#        exceptions for any that are genuinely source) and DON'T stage them
#      - if they're intended -> leave them
#    Inspect first:  git status --porcelain | grep '\.js$' | head -50

# 5. stage the intended trees and commit
git add .gitignore docs mintlify README.md CHANGELOG.md package.json src packages
git diff --cached --stat        # sanity check: NO .worktrees/, no nul, no debug-*
git commit -m "feat+docs: v1.0.33 (projections, builtins, CLI) + verified docs reorg + mintlify site"

# 6. ship
git push origin main
# optional release: git tag v1.0.33 && git push --tags   (CI may auto-publish)
```

## Do-not-break checklist

- Keep `docs/spec/**` exactly where it is (load-bearing paths).
- Don't recommit `.worktrees/` or `.claude/worktrees/`.
- Re-run `pnpm test` after the reset/commit to confirm still green before push.
- `mintlify/docs.json` was hand-tweaked by the user/linter after the original
  write — preserve its current content; don't revert it.
