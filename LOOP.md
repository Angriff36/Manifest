# LOOP.md — Manifest Language

How this repository is operated with loop engineering patterns.

Loop engineering here is **agent ops** (triage → `STATE.md` → human gate). It is
not Manifest DSL `schedule` / domain cron — those are runtime constructs.

## Active Loops

### Daily Triage (L1 — report-only)

| Field | Value |
|-------|-------|
| Cadence | 1d weekdays (`/.github/workflows/daily-triage.yml`) + optional agent `/loop` |
| Skill | `loop-triage` (`.claude/skills/loop-triage`) |
| State | `STATE.md` |
| Phase | Report-only. Human reviews and decides actions. |
| Verifier (L2+) | `pnpm test` + `pnpm typecheck` in an isolated worktree |
| Handoff | Spec/IR changes, Compliance Matrix status, language semantics |

Claude Code (week one):

```text
/loop 1d Run $loop-triage. Read STATE.md first. Append high-priority and watch
items. Update Last run timestamp. Do not auto-fix anything in week one.
```

Cursor: `.cursor/` is gitignored — copy `.claude/skills/loop-triage` →
`.cursor/skills/loop-triage` locally, or point Automations at the committed
skill. Same report-only prompt.

## Human Gates

- No auto-fix until L2 checklist is explicitly enabled.
- No auto-merge to `main`. Draft PRs only; human marks ready.
- High-scrutiny paths require human review (see `loop-constraints.md`).
- Kill switch: issue/label or `STATE.md` flag `loop-pause-all`.

## Worktrees

- Any unattended code-change experiment (L2+) runs in an isolated git worktree
  under `.worktrees/`.
- One worktree per fix attempt; discard after verifier REJECT or human
  escalation.

## Connectors (MCP)

- L1: optional. Loop pattern lookup via `.mcp.json` → `loop-engineering`
  (`@cobusgreyling/loop-mcp-server`).
- Manifest language MCP (`manifest-mcp`) is separate — compile/validate/explain,
  not triage.
- L2+: GitHub connector read-only for CI/issues first; write scope limited to
  comments until trusted.

## Budget & Observability

- Caps: `loop-budget.md` (Daily Triage L1: 100k tokens/day suggested)
- Run history: `loop-run-log.md`
- Estimate: `npx @cobusgreyling/loop-cost --pattern daily-triage --level L1`
- Audit: `npx @cobusgreyling/loop-audit . --suggest`

## Deferred

- **capsule-v2** loop setup — separate phase
- L2 `minimal-fix` / PR babysitter — after L1 signal quality is trusted
- Manifest DSL `schedule` for triage — wrong layer

## Links

- Constraints: [`loop-constraints.md`](./loop-constraints.md)
- Agents guide: [`AGENTS.md`](./AGENTS.md)
- Compliance matrix: [`docs/internal/COMPLIANCE_MATRIX.md`](./docs/internal/COMPLIANCE_MATRIX.md)
- Boundary: [`docs/internal/contracts/manifest-builder-boundary.md`](./docs/internal/contracts/manifest-builder-boundary.md)
