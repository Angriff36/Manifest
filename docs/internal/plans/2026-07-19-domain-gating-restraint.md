---
title: Domain gating restraint for Manifest authors (agents)
status: Binding
scope: Authoring policies, guards, and constraints in consumer .manifest domain models (not IR/language semantics)
created: 2026-07-19
---

# Domain gating restraint

**Status: Binding** for how agents author **domain** policies/guards/constraints in Manifest programs.  
Does **not** override Tier A (`docs/spec/**`). Language law stays strict; **domain models must not invent busywork.**

## Problem

AI authors systematically overgate consumer domains:

- Specialty read caps (“event staff”) on records every employee needs
- Freezing commands at the first “serious” lifecycle stage
- Treating seed/FK match checks as business rules
- Blocking mid-operation corrections that real businesses do daily

That is not “strict semantics.” That is a bad domain model. Manifest’s house style forbids making invalid programs succeed; it does **not** require making valid operations impossible.

## Binding rules for agents

1. **Prefer capability breadth that matches the job.**  
   Operational visibility → broad staff-style caps. Money, destructive lifecycle, org admin → manage/admin. Do not invent a specialty lane for “looking at the menu.”

2. **Ask what real failure you are preventing.**  
   If the only answer is “someone might change something,” that is not enough. Name the broken invariant (double-spend, audit gap, tenant leak). No invariant → no gate.

3. **Keep live operations editable by the roles that run them.**  
   Mid-flight stages (e.g. event executing, prep in progress) usually need manager correction paths: 86 an item, swap a line, zero a quantity, update a note. Lock terminal/cancelled states harder than “in progress.”

4. **Separate money from ops counts.**  
   Refunds and billing adjustments belong on payment/invoice-style entities. Do not freeze ops fields “because finance.”

5. **Explain every guard in ops language in the source comment.**  
   If a cook or GM would laugh at the reason, delete the guard.

6. **Seed/param match constraints are plumbing.**  
   Document them as create/seed safety, not product policy.

## Anti-patterns

| Anti-pattern                                              | Do instead                                        |
| --------------------------------------------------------- | ------------------------------------------------- |
| Read locked to one specialty role                         | Staff-readable when the whole crew needs it       |
| No edits once “executing/in progress”                     | Allow manager correction; block cancelled/voided  |
| Soft-delete forever blocks re-add on same concept         | New row / new command path; keep audit on old row |
| Copy-paste stage locks across entities                    | Re-derive from that workflow’s real risk          |
| Stack role guards on top of already-tight default execute | One clear policy layer                            |

## Capsule twin

Consumer-facing twin (same rule, app-scoped):  
`C:/Projects/capsule/docs/architecture/domain-gating-restraint.md`

## History

2026-07-19 — Written after Capsule EventDish overgating review (owner): specialty read caps, frozen executing menu, confused re-add, refund-vs-servings mixup.
