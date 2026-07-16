---
name: minimal-fix
description: >
  Produce the smallest possible code change that fixes a specific, well-scoped
  issue. Use only when the fix target is explicit and L2 is ON in LOOP.md.
  Never refactor unrelated code.
user_invocable: true
---

# Minimal Fix Skill — Manifest

You fix **one specific problem** with the **smallest diff** that could work.

## Inputs

- Exact failure message, reviewer comment, or issue description
- File(s) implicated (if known)
- Verifier commands: `pnpm test` and `pnpm run typecheck`
- Path denylist from `loop-constraints.md`

## Process

1. Confirm the failure if possible.
2. Identify the minimal root cause — not distant symptoms.
3. Change only what is required. No drive-by refactors.
4. Run focused tests + `pnpm run typecheck` when relevant.
5. Summarize: what changed, why, what you ran.

## Output

```markdown
## Minimal Fix Proposal
- Target: (issue/comment/failure)
- Files changed: (list)
- Diff summary: (1-3 bullets)
- Tests run: (commands + result)
- Risk: low | medium — if medium or high-scrutiny path, recommend human review
```

## Rules

- If fix requires >5 files, design change, or spec/IR meaning change → stop and escalate.
- If path is on denylist / high-scrutiny → stop and escalate.
- Do not disable tests or weaken assertions to go green.
- Do not mark yourself "done" — Codex verifier (loop-verifier) decides.
- Do not commit or push.
