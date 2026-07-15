# Mermaid Projection

> **Audited (2026-07-15) @RYANSIGNED:** Spot-check OK — surfaces
> `mermaid.er` / `state` / `sequence` / `all` + CLI `manifest diagram` on
> package **3.6.4**.

The Mermaid projection generates [Mermaid](https://mermaid.js.org) diagrams from compiled Manifest IR. Use it to visualize a domain model — entity relationships, state machines, and command execution flows — for documentation, design review, or onboarding. Diagrams are deterministic: identical IR always yields identical output.

The projection is registered under the name `mermaid` and lives at `src/manifest/projections/mermaid/generator.ts`. A dedicated CLI wrapper, `manifest diagram`, is provided at `packages/cli/src/commands/diagram.ts`.

## What it generates

The generator emits exactly three diagram families across four surfaces.

`mermaid.er` produces a single `erDiagram` from `ir.entities` and their relationships. Each entity becomes a block; when `includeProperties` is on (the default) each property is rendered as a typed attribute, annotated `"PK"` when the property is `required` or `"nullable"` when the type is nullable. Relationships are rendered as cardinality edges, deduplicated per `(source, target, name)`. With no entities, an `NO_ENTITIES` info diagnostic is returned.

`mermaid.state` produces one `stateDiagram-v2` per entity that has `transitions`. The generator derives the initial state from the default value of the property that backs the transitions, emits `[*] -->` into it, marks states with no outgoing transitions as terminal (`--> [*]`), and renders each transition (sorted for determinism). Entities without transitions yield `NO_TRANSITIONS` / `NO_STATE_ENTITIES` diagnostics; an unknown entity filter yields `ENTITY_NOT_FOUND`.

`mermaid.sequence` produces one `sequenceDiagram` per entity-scoped command, showing the execution flow: the client invoking the command, a `Note` for policies, a `Note` plus per-guard messages for guards, action steps, event emissions to an `EventBus` participant (with channel when known), and the return type. Guard expression labels longer than 60 characters are truncated.

`mermaid.all` runs the ER, state, and sequence generators and concatenates their artifacts. An unknown surface returns an `UNKNOWN_SURFACE` error diagnostic. Artifacts carry `contentType: "mermaid"` and `.mmd` path hints (for example `diagrams/er-diagram.mmd`, `diagrams/state-<entity>.mmd`, `diagrams/sequence-<entity>-<command>.mmd`).

## Usage

Programmatically through the registry:

```ts
import { getProjection } from '@angriff36/manifest/projections';

const projection = getProjection('mermaid');
const result = projection.generate(ir, {
  surface: 'mermaid.all',
  options: { markdown: true, includeProperties: true },
});
```

Or via the CLI, which accepts a `.manifest` source file, a precompiled `.ir.json`, a directory, or a glob, merges all inputs into one IR, and writes `.mmd` files to the output directory:

```bash
manifest diagram ./schema.manifest --type er --output diagrams
manifest diagram ./src --type all --markdown
manifest diagram ./schema.manifest --type state --entity Order
```

The CLI flags are `-o, --output <path>` (default `diagrams`), `-t, --type <er|state|sequence|all>` (default `all`), `-e, --entity <name>`, and `--markdown`. The `--type` value is mapped to the corresponding `mermaid.*` surface.

## Type mapping & behavior

ER attribute types are mapped by `irTypeToMermaidType`: `string`, `number`, `boolean`, `date`, `datetime`, `decimal`, and `any` map to their lowercase names; any other type name passes through unchanged. Relationship kinds map to cardinality notation: `hasMany` to `||--o{`, `hasOne` to `||--||`, `belongsTo` and `ref` to `}o--||`, with `||--||` as the fallback. Entity and state names are sanitized to `[A-Za-z0-9_]`. Quotes inside labels are escaped to `#quot;`. When `markdown` is enabled, each diagram is wrapped in a fenced ` ```mermaid ` block.

## Options

`MermaidProjectionOptions` accepts `markdown` (default `false`), `includeProperties` (default `true`, applies to ER diagrams), and `entity` (a filter for state and sequence diagrams). When a request supplies a top-level `entity` field, it is merged into the options as the `entity` filter.

## Notes & limitations

Only the three diagram families above exist — there are no class, flowchart, or gantt outputs. State diagrams require entity `transitions` to be present in the IR; entities without them are silently skipped (with an info diagnostic). Sequence diagrams are emitted only for entity-scoped commands. The CLI merges multiple input files by concatenating their `entities`, `stores`, `events`, `commands`, and `policies`, taking provenance from the first file — it does not deduplicate across files, so overlapping definitions can appear more than once.
