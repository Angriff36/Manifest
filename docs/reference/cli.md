# CLI Reference

The `manifest` command-line interface compiles, generates, validates, and governs Manifest programs. This catalog documents every command registered in `packages/cli/src/index.ts`; commands and flags here are taken directly from that file. The CLI reports its version from the root package's `package.json` at runtime.

Global form:

```bash
manifest <command> [arguments] [options]
manifest --version
manifest --help
```

## init

Initialize Manifest configuration interactively, or generate a CI workflow when `--ci` is given.

- `-f, --force` — overwrite an existing config or workflow file.
- `--ci <provider>` — generate a CI workflow for a provider (`github`).
- `--node-versions <versions>` — comma-separated Node versions for the CI matrix (default `18,20,22`).

```bash
manifest init
manifest init --ci github --node-versions 18,20,22
```

## compile

Compile `.manifest` source to IR.

- `[source]` — source file or glob.
- `-o, --output <path>` — output directory or file (falls back to config `output`).
- `-g, --glob <pattern>` — glob for multiple files.
- `-d, --diagnostics` — include diagnostics in output (default off).
- `--pretty` — pretty-print JSON (default on).
- `--merge` — merge multiple files into a single IR (resolves `use` declarations; default off).
- `--entry <files...>` — entry file(s) for merge compilation (auto-detected if omitted).

```bash
manifest compile src/app.manifest -o ir/
```

**Idempotent output.** When an output `.ir.json` already exists and was produced from byte-identical source (same `provenance.contentHash`), the compiler reuses the prior `provenance.compiledAt` (and recomputes `irHash` against it), so re-compiling unchanged source is byte-identical and produces no spurious git diff. A fresh `compiledAt` only lands when the source actually changes. This applies to single-file and `--merge` compilation.

**Duplicate event names** are reported as a compile warning (surfaced with `-d, --diagnostics` and in the LSP): two declarations of the same event name collide in the event registry, so one shadows the other. Rename one.

## generate

Generate code from IR using a projection.

- `<ir>` — IR file or directory (required).
- `-p, --projection <name>` — projection (`nextjs`, `ts.types`, `ts.client`; default `nextjs`).
- `-s, --surface <name>` — surface (`route`, `command`, `types`, `client`, `all`; default `all`).
- `-o, --output <path>` — output directory.
- `--auth <provider>`, `--database <path>`, `--runtime <path>`, `--response <path>` — import paths layered over config.
- `--check` — drift mode: regenerate code in memory and compare to the committed files **without writing**. Exits non-zero and lists the drifted files (a missing file or any byte difference counts as drift) so CI can assert that committed code equals freshly generated code (`prettier --check` semantics).

```bash
manifest generate ir/ -p nextjs -s all -o generated/

# CI drift gate: fail if committed code is stale
manifest generate ir/ -o generated/ --check
```

## build

Compile and generate in one step.

- `[source]` — source file or glob.
- `-p, --projection <name>` (default `nextjs`), `-s, --surface <name>` (default `all`).
- `--ir-output <path>` (default `ir/`), `--code-output <path>` (default `generated/`).
- `-g, --glob <pattern>`; `--auth`, `--database`, `--runtime`, `--response` import paths.

```bash
manifest build src/app.manifest --ir-output ir/ --code-output generated/
```

## watch

Watch `.manifest` files and rebuild on change.

- `[source]` — file, directory, or glob.
- `-p, --projection`, `-s, --surface`, `--ir-output`, `--code-output`, `-g, --glob`, plus the import-path flags (as in build).
- `--debounce <ms>` — debounce delay (default `300`).
- `--events` — emit structured JSON change events to stdout.
- `--clear` — clear the terminal on each rebuild.

```bash
manifest watch src/ --debounce 300 --events
```

## validate

Validate IR against the schema.

- `[ir]` — IR file or glob.
- `--schema <path>` — schema path (default `docs/spec/ir/ir-v1.schema.json`).
- `--strict` — fail on warnings.

```bash
manifest validate ir/app.ir.json --strict
```

## validate-ai

Validate manifest/IR with scored diagnostics for AI agents.

- `[source]` — `.manifest`, `.ir.json`, directory, or glob.
- `-f, --format <format>` — `text` or `json` (default `text`).
- `--schema <path>` — schema path.
- `--min-score <n>` — minimum score to pass (default `100`).
- `--verbose` — include info-level diagnostics.

```bash
manifest validate-ai generated.ir.json --format json --min-score 80
```

Diagnostics are tagged with a `category` (`schema`, `compile`, `semantic`, `structural`, `domain`). The **`domain`** category surfaces compile-time domain- and reaction-wiring checks against IR with coded diagnostics, each carrying a fix suggestion:

- `DOMAIN_UNWIRED_FK` (error) — a `{parent}Id`-style foreign key with no `belongsTo`/`ref` and no command that sets it from `self.id`.
- `DOMAIN_ORPHAN_CREATE` (error) — a child entity with no command or reaction that wires its parent FK.
- `REACTION_UNWIRED` (error) — a reaction whose event is never emitted by a command, or whose payload references can't be satisfied by emitter params, `payload._subject`, or create-result properties.

(Non-error domain findings are reported as `DOMAIN_COMPLETENESS` / `REACTION_COMPLETENESS`.) These mirror the compiler's domain-completeness semantics documented in `docs/spec/semantics.md`.

## fmt

Format `.manifest` source files (deterministic whitespace normalization).

- `[source]` — file, directory, or glob.
- `--check` — fail if any file would change (when set, writing is disabled).
- `--write` — write formatted output (the default when `--check` is not set).
- `-g, --glob <pattern>` — glob when source is a directory.

```bash
manifest fmt src/ --check
```

## install-hooks

Install pre-commit hooks (fmt --check and validate).

- `-f, --force` — overwrite existing hook configuration.
- `--provider <provider>` — `husky` (default) or `simple-git-hooks`.

```bash
manifest install-hooks --provider husky
```

## docs

Generate a static documentation site from IR.

- `[source]` — `.manifest`, `.ir.json`, directory, or glob.
- `-o, --output <path>` — output directory (default `docs-site`).
- `-f, --format <format>` — `html` or `markdown` (default `html`).
- `-t, --title <title>` — site title (default `Manifest API Reference`).

```bash
manifest docs src/ -f markdown -o docs-site
```

### IR merge workflow (`mergeIrs` behavior)

When `manifest docs` receives multiple inputs (directory or glob), it compiles and/or loads each input IR and merges them into one aggregate IR used for page generation.

Expected merge behavior:

- Initialize every required IR array field before merge: `modules`, `values`, `entities`, `enums`, `stores`, `events`, `commands`, `policies`.
- For each input IR, append each array into the merged aggregate.
- Always propagate `values` the same way as other top-level arrays. This is required by the IR schema and by downstream tools that read reusable value-object definitions.

Reference merge skeleton:

```ts
const mergedIR: IR = {
	version: '1.0',
	provenance: firstProvenance,
	modules: [],
	values: [],
	entities: [],
	enums: [],
	stores: [],
	events: [],
	commands: [],
	policies: [],
};

for (const ir of inputIRs) {
	mergedIR.modules.push(...ir.modules);
	mergedIR.values.push(...ir.values);
	mergedIR.entities.push(...ir.entities);
	mergedIR.enums.push(...ir.enums);
	mergedIR.stores.push(...ir.stores);
	mergedIR.events.push(...ir.events);
	mergedIR.commands.push(...ir.commands);
	mergedIR.policies.push(...ir.policies);
}
```

Notes:

- `values` is a required IR v1 field and must always be present, even when empty.
- If a merge implementation omits `values` initialization or propagation, the merged output is nonconformant with `docs/spec/ir/ir-v1.schema.json` and may fail validation.
- Deterministic merges should also sort merged arrays by stable keys before computing hashes or writing output.

## diagram

Generate Mermaid diagrams from IR.

- `[source]` — `.manifest`, `.ir.json`, directory, or glob.
- `-o, --output <path>` — output directory (default `diagrams`).
- `-t, --type <type>` — `er`, `state`, `sequence`, or `all` (default `all`).
- `-e, --entity <name>` — filter to one entity.
- `--markdown` — wrap output in fenced code blocks.

```bash
manifest diagram src/app.manifest -t er --markdown
```

## preflight

Validate environment variables against the config `env` mapping, or generate an example file.

- `-f, --format <format>` — `text` or `json` (default `text`).
- `--generate-example` — generate `.env.example` instead of checking.
- `-o, --output <path>` — output path for the example (default `.env.example`).

```bash
manifest preflight
manifest preflight --generate-example -o .env.template
```

## check

Compile and validate in one step.

- `[source]` — file or glob.
- `-o, --output <path>`, `-g, --glob <pattern>`, `-d, --diagnostics`, `--pretty`.
- `--schema <path>`, `--strict`.

```bash
manifest check src/app.manifest --strict
```

## scan

Scan manifest files for configuration issues (for example policy coverage and store consistency) before runtime.

- `[source]` — file or directory.
- `-g, --glob <pattern>` — glob (default `**/*.manifest`).
- `-f, --format <format>` — `text` or `json` (default `text`).
- `--strict` — fail on warnings.

```bash
manifest scan src/ --strict
```

## harness

Run an IR harness script and report failed steps/assertions.

- `<manifest>` — path to a `.manifest` file (required).
- `-s, --script <path>` — harness script JSON (required).
- `-f, --format <format>` — `text` or `json` (default `text`).

```bash
manifest harness src/app.manifest -s harness.json
```

## routes

Generate the canonical route manifest from compiled IR.

- `-s, --src <pattern>` — source glob.
- `-f, --format <format>` — `json` or `summary` (default `json`).
- `-b, --base-path <path>` — base path prefix (default `/api`).

```bash
manifest routes -s "src/**/*.manifest" -f summary
```

## lint-routes

Scan client directories for hardcoded route strings (canonical-route enforcement); fails on violations.

- `-f, --format <format>` — `text` or `json` (default `text`).
- `-c, --config <path>` — config file path.

```bash
manifest lint-routes
```

## audit-routes

Audit route boundary compliance: writes should go through `runtime.runCommand`; direct reads should carry expected scoping filters.

- `-r, --root <path>` — root to audit (default `.`).
- `-f, --format <format>` — `text` or `json` (default `text`).
- `--strict` — fail on warnings and enforce ownership as errors.
- `--tenant-field <name>` (default `tenantId`), `--deleted-field <name>` (default `deletedAt`), `--location-field <name>` (default `locationId`).
- `--commands-manifest <path>` — enables ownership rules. `--exemptions <path>` — exemptions registry.

```bash
manifest audit-routes -r . --strict
```

## emit registries

Emit `commands.json` and `entities.json` registries from IR. (Subcommand of `emit`.)

- `--ir <path>` — compiled IR JSON. `--source <path>` — `.manifest` source to compile and emit from.
- `--out <dir>` — output directory (default `manifest-registry`).
- `--no-validate` — skip schema validation. `--no-pretty` — compact JSON.

```bash
manifest emit registries --source src/app.manifest --out manifest-registry
```

## audit-governance

Run the full governance audit suite (umbrella over the detectors). `audit-constitution` is a deprecated alias.

- `-r, --root <path>` — root (default `.`).
- `--only <list>` — comma-separated detector names (default all).
- `--commands-registry <path>` — enables the missing-tests detector. `--bypass-registry <path>` — enables the bypass-violations detector.
- `--strict` — exit non-zero on any error finding.
- `-f, --format <format>` — `text` or `json` (default `text`).

```bash
manifest audit-governance --strict --only direct-writes,route-drift
```

## enforce-surface

Enforce that application code only writes through registered Manifest commands.

- `--root <path>` (required) — repo/app root to scan.
- `--commands-registry <path>` (required) — `commands.json` emitted from IR.
- `--entities-registry <path>`, `--bypass-registry <path>`.
- `-f, --format <format>` (default `text`), `--strict`.
- `--include <glob...>`, `--exclude <glob...>`.

```bash
manifest enforce-surface --root . --commands-registry manifest-registry/commands.json --strict
```

## audit-bypasses

Validate the approved-bypass registry against the schema. Exits non-zero on error findings.

- `--registry <path>` — bypass registry JSON.
- `-r, --root <path>` — root for resolving paths (default `.`).
- `--strict-expiry` — treat expired `reviewBy` dates as errors.
- `-f, --format <format>` — `text` or `json` (default `text`).

```bash
manifest audit-bypasses --registry bypasses.json --strict-expiry
```

## coverage

Report command/guard/policy/constraint coverage from conformance and unit test evidence.

- `--ir <path>` — compiled IR JSON. `-s, --source <path>` — `.manifest` source (compiled on the fly).
- `-r, --root <path>` — root to scan for test evidence (default `.`).
- `-f, --format <format>` — `text` or `json` (default `text`).
- `--min-coverage <n>` — minimum percentage to pass. `--strict` — exit non-zero when below the minimum.

```bash
manifest coverage -s src/app.manifest --min-coverage 80 --strict
```

## diagram-related diff group

`diff` is a parent command with three subcommands plus an entity-vs-IR diff.

### diff source-vs-ir

Compare source-manifest parse output against precompiled IR for an entity.

- `<entityName>` (required). `--json`, `--src <pattern>`, `--ir-root <path...>`.

### diff ir-vs-ir

Compare two IR JSON files and produce a diff report.

- `<oldIR> <newIR>` (required). `--json`, `--sql`, `--prisma`, `-o, --output <path>`.

```bash
manifest diff ir-vs-ir old.ir.json new.ir.json --sql
```

### diff breaking

Classify IR diff changes as compatible/deprecated/breaking with consumer impact.

- `<oldIR> <newIR>` (required). `--json`, `--ack <path>`, `--ci` (exit non-zero on unacknowledged breaking changes), `-o, --output <path>`.

```bash
manifest diff breaking old.ir.json new.ir.json --ci
```

## migrate

Analyze an IR diff for database migration planning.

- `--old-ir <path>` and `--new-ir <path>` (both required).
- `--dry-run` — show the plan without applying. `--preview` — show SQL and Prisma steps.
- `--force` — apply despite warnings or unacknowledged breaking changes.
- `--json`. `--tool <tool>` — `prisma` (default) or `drizzle`.
- `--no-check-reversibility` — skip reversibility validation. `-o, --output <path>`.

```bash
manifest migrate --old-ir old.ir.json --new-ir new.ir.json --preview
```

## changelog

Generate a Markdown changelog from IR diffs between Git refs.

- `<from-ref>` (required), `[to-ref]` (default `HEAD`).
- `-s, --source <pattern>` — glob (default `**/*.manifest`).
- `-o, --output <path>`, `-t, --title <title>`, `--json`.

```bash
manifest changelog v0.3.0 HEAD -o CHANGELOG.md
```

## duplicates

Summarize duplicate merge reports (`*.merge-report.json`).

- `--entity <name>` — filter by entity. `--merge-report <pattern>` — override glob. `--json`.

```bash
manifest duplicates --json
```

## runtime-check

Correlate route surface, source manifests, and precompiled IR for a command.

- `<entityName> <commandName>` (required).
- `--route <path>` — optional canonical route to validate (exact match). `--json`, `--src <pattern>`, `--ir-root <path...>`.

```bash
manifest runtime-check Invoice createInvoice
```

## cache-status

Show offline cache guidance (precompiled IR timestamps and restart advice).

- `--entity <name>`, `--command <name>`, `--json`, `--ir-root <path...>`.

```bash
manifest cache-status --json
```

## doctor

Run ranked offline diagnostics for source/IR/route drift and duplicate merges.

- `--entity <name>`, `--command <name>`, `--route <path>`, `--json`, `--src <pattern>`, `--ir-root <path...>`.

```bash
manifest doctor --entity Invoice
```

## integration-check

Validate a downstream repo against the full Manifest governance + runtime contract. Exits non-zero unless every section passes.

- `--root <path>` — downstream repo root (defaults to cwd).
- `--commands-registry <path>`, `--bypass-registry <path>`.
- `--format <fmt>` — `text` or `json` (default `text`). `--strict` — treat warnings as failures.
- `--skip-runtime-smoke`, `--skip-package-shape`, `--skip-tarball`, `--package-root <path>`.

```bash
manifest integration-check --root . --strict
```

## inspect entity

Inspect a single entity across source manifests and precompiled IR. (Subcommand of `inspect`.)

- `<entityName>` (required). `--json`, `--src <pattern>`, `--ir-root <path...>`.

```bash
manifest inspect entity Invoice --json
```

## config

Parent command for inspecting and validating `manifest.config.{yaml,ts,js}`.

- `config validate` — validate config against the JSON schema. `--json` (non-zero exit on failure).
- `config print-defaults` — print the canonical defaults. `--json` (default on).
- `config inspect` (alias `print-effective`) — print the effective config (defaults + overrides), stable and key-sorted for CI snapshots. `--json` (default on).

```bash
manifest config validate --json
manifest config inspect
```

## versions

Parent command for IR snapshot versioning (store directory defaults to `.manifest-versions`). See `docs/features/ir-version-control.md`.

- `versions list` — list saved versions. `--store`, `--json`.
- `versions show <version>` — show metadata by number, tag, or `latest`. `--store`, `--json`.
- `versions save [source]` — compile and save a snapshot. `--store`, `--tag <tag>`, `--auto-tag`, `--label <text>`.
- `versions diff <from> <to>` — compare two versions. `--store`, `--json`, `--breaking`, `--sql`.
- `versions changelog [from] [to]` — changelog between versions. `--store`, `--json`.
- `versions tag <version> <tag>` — apply a semver tag. `--store`.
- `versions rollback <version>` — output a previous snapshot. `--store`, `-o, --output <path>`.
- `versions verify [version]` — verify integrity via SHA-256. `--store`, `--json`, `--all`.

```bash
manifest versions save src/app.manifest --auto-tag
manifest versions verify --all
```

## plugins

Parent command for inspecting plugins declared in `manifest.config`. See `docs/features/plugin-api.md`.

- `plugins list` — list declared plugins (module, enabled, whether options are present). `--json`.

```bash
manifest plugins list
```

## Notes

`audit-constitution` is registered only as a deprecated alias of `audit-governance` and prints a deprecation warning. `emit`, `inspect`, `diff`, `config`, `versions`, and `plugins` are parent commands whose behavior lives in their subcommands. An older `docs/tools/CLI_REFERENCE.md` exists but may be out of date; this page reflects the commands actually registered in `packages/cli/src/index.ts`.
