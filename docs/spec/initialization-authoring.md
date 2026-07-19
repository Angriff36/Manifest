---

Last updated: 2026-07-19
Status: Active
Authority: Binding
title: Initialization authoring guide
status: source-of-truth
authority: Manifest language (semantics)
created: 2026-07-16
updated: 2026-07-16
---

# Initialization authoring guide

How to add fields and allocating commands without inventing guards or digging
through generated Convex/Zod code.

## Responsibility split

| Concern | Put it here | Not here |
| --- | --- | --- |
| Formats, enums, arrays, nullability, simple ranges | Field / parameter **schemas** | Guards |
| Who may run the command | **Policies** / roles | Guards that repeat role checks |
| Legal status changes after the document exists | **`transition`** declarations | Handwritten `self.status == …` soup for edges already declared |
| Create-time values when the caller omits them | Property **defaults** / `autoNow` / `timestamps` | Fake placeholder defaults so a partial insert succeeds |
| Dynamic business invariants (related rows, clock, user context) | **Guards** (and named constraints) | Schema defaults |

## Ordinary path for a new field

1. Declare the property with the right type and nullability.
2. If callers supply it at allocation time, add it as a command parameter (same
   name as the field when you want input seeding) **or** assign it with
   `mutate field = …` inside the initialization command.
3. If the engine should fill it when omitted, give it a default (`= "draft"`,
   `= now()`, `timestamps`).
4. Regenerate. You should not need a new “field is unset” guard, a projection
   seed heuristic, or hand-edited generated validators.

## Allocating commands

An allocating command is any command the compiler marks with
`IRCommand.initialization` (literal `create`, or a named initializer such as
`draft` / `introduce` that constructs the first document).

Semantics are **atomic construction**: validate input → virtual draft →
policies/dynamic guards → mutate draft → validate final entity document →
persist once. Failed validation, policy, guard, or mutation leaves **no**
document.

## When to write a guard

Write a guard when the check needs runtime context the schema cannot know, for
example:

- `self.balance >= amount`
- related-collection predicates
- `user` / `context` / `now()` comparisons that are not ownership injection

Do **not** write guards for:

- “this required field will be set by this command”
- “this timestamp starts unset”
- “only managers may create” (use a policy)
- “status may move from draft to open” (use `transition`)

## See also

- `docs/spec/semantics.md` § Initialization Commands
- `IRInitializationPlan` in `docs/spec/ir/ir-v1.schema.json`
