# Loop Budget — Manifest

> Primary loop: **Daily Triage** (L1 report-only)

## Daily limits

| Loop | Max runs/day | Max tokens/day | Max sub-agent spawns/run |
|------|--------------|----------------|--------------------------|
| Daily Triage | 2 | 100k | 0 (L1) / 2 (L2) |

## On budget exceed

1. Pause schedulers / disable automations
2. Append event to `loop-run-log.md`
3. Notify human (issue / `STATE.md` High Priority)

## Kill switch

- Issue label or `STATE.md` flag: `loop-pause-all`
- Resume only after human clears the flag in `STATE.md`

## Estimate spend

```bash
npx @cobusgreyling/loop-cost --pattern daily-triage --level L1 --cadence 1d
```

Realistic blend (L1): ~23k tokens/day. Cap remains 100k.
