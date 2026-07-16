# Loop Run Log — Manifest

Append one entry per run. Prune entries older than 30 days.

## Format

```json
{
  "run_id": "2026-06-09T08:15:00Z",
  "pattern": "daily-triage",
  "duration_s": 45,
  "items_found": 4,
  "actions_taken": 1,
  "escalations": 0,
  "tokens_estimate": 52000,
  "outcome": "report-only | fix-proposed | escalated | no-op"
}
```

## Recent Runs

<!-- Loop appends below this line -->

```json
{"run_id":"2026-07-16T11:35:30Z","pattern":"daily-triage","duration_s":11,"items_found":2,"actions_taken":1,"escalations":1,"tokens_estimate":23000,"readiness_score":100,"outcome":"escalated","workflow_run":"29494959830"}
```
