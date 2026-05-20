# Manifest Development Tools

Last updated: 2026-05-20
Status: Active
Authority: Advisory
Applies to: `@angriff36/manifest@0.5.0+`

This section documents the CLI and development tools that ship with the
`@angriff36/manifest` package. Tools are supportive — they validate IR,
runtime behavior, and generator behavior, but **language semantics are
defined only in `docs/spec/`**.

## Start here

- **CLI reference:** [`docs/tools/CLI_REFERENCE.md`](./CLI_REFERENCE.md) — every command, when to use it, when not to.
- **Integration check:** [`docs/tools/integration-check.md`](./integration-check.md) — the umbrella command for validating a downstream repo against the full governance + runtime contract.
- **API reference:** [`docs/tools/API_REFERENCE.md`](./API_REFERENCE.md) — programmatic surface.
- **Compile reference:** [`docs/tools/COMPILE_REFERENCE.md`](./COMPILE_REFERENCE.md) — compiler internals.

## Tooling areas

### CLI

All shipped commands live in `packages/cli/src/commands/`. The bin entry
is `manifest` (see `package.json` `bin.manifest`). Invoke via
`pnpm exec manifest <command>` or, when consumed as a workspace dep,
`pnpm manifest <command>`.

### Runtime smoke / harness

- `manifest harness <ir> -s <script.json>` — fixture-driven runtime
  assertions. See [`HARNESS`](./CLI_REFERENCE.md#harness) in the CLI
  reference.
- `manifest integration-check` — programmatic in-memory smoke that wires
  `MemoryAuditSink` + `MemoryOutboxStore` to a `RuntimeEngine` and
  asserts one-audit-emission + one-outbox-enqueue per command attempt.

### Static analysis / governance

- `manifest scan` — `.manifest`-level policy + store-target check.
- `manifest audit-routes` — boundary compliance for handwritten / generated route handlers.
- `manifest audit-governance` (alias `audit-constitution`) — umbrella over five governance detectors (direct-writes, event-fabrication, route-drift, missing-tests, bypass-violations).
- `manifest audit-bypasses` — schema validation of the approved-bypass registry.
- `manifest lint-routes` — flags hardcoded route strings in client TypeScript.

### Code generation

- `manifest compile` / `build` — `.manifest` → IR JSON → generated code.
- `manifest generate` — IR JSON → projection-specific output.
- `manifest emit registries` — IR → `commands.json` / `entities.json` governance index.
- `manifest routes` — IR → canonical route manifest JSON.

### Diagnosis

- `manifest doctor` — ranked offline diagnostics (source-vs-IR drift, route correlation, duplicate merges).
- `manifest runtime-check <Entity> <command>` — focused per-command wiring check.
- `manifest inspect entity <Entity>` — single-entity deep dive.
- `manifest diff source-vs-ir <Entity>` — targeted drift report.

## Validation principle

Tool output must never be used to justify semantic drift from spec or
conformance. If behavior changes, update spec and conformance first.

## Related

- `docs/tools/USAGE_GUIDE.md`
- `docs/tools/RECOMMENDATIONS.md`
- `docs/tools/PACKAGES_AND_DISTRIBUTION.md`
- `docs/tools/PUBLISHING.md`
- `docs/spec/conformance.md`
