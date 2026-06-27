# Validating a downstream app with `manifest integration-check`

Last updated: 2026-05-20
Status: Active
Authority: Non-authoritative

`manifest integration-check` is the umbrella command for proving a
downstream repository is wired up to the full Manifest v0.5-era
governance contract: source compiles, registries emit, audit-governance
detectors pass, the canonical Next.js dispatcher exists, the audit/outbox
adapter contracts function at runtime, and the published package shape
is correct. It does **not** define new semantics — every check delegates
to a specific detector or runtime contract that is normative on its own.

## What gets checked

| Section         | What it proves                                                                                                                                                             | Underlying contract                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `governance`    | direct-writes, event-fabrication, route-drift, missing-tests, bypass-violations                                                                                            | `docs/spec/adapters.md`, `manifest audit-governance`   |
| `bypasses`      | The approved-bypass registry is schema-valid, all referenced files exist, review dates are not stale                                                                       | `docs/spec/registry/bypasses.schema.json`              |
| `dispatcher`    | The canonical `/api/manifest/[entity]/commands/[command]/route.ts` is present                                                                                              | `docs/spec/adapters.md § Canonical Dispatcher`         |
| `runtime-smoke` | This installed build of `@angriff36/manifest` emits exactly one AuditRecord per `runCommand`, enqueues outbox entries on emit, threads `RuntimeContext` through to records | `docs/spec/adapters.md § Audit Sink`, `§ Outbox Store` |
| `package-shape` | Every documented subpath export resolves; the published tarball contains the SQL schemas, dist, and CLI bin                                                                | `package.json` `exports` + `files`                     |

The `governance` and `bypasses` sections are static-analysis only — they
inspect files on disk. The `runtime-smoke` section actually instantiates
a `RuntimeEngine` with a `MemoryAuditSink` and `MemoryOutboxStore` and
runs a single emit-event command, so it is the only section that catches
"the package's runtime adapters are not wired in this build" regressions.

## Quick start

```bash
# Against the current working directory:
manifest integration-check

# Against an explicit downstream repo root:
manifest integration-check --root path/to/downstream

# Just the static checks (no runtime smoke, no npm pack):
manifest integration-check --skip-runtime-smoke --skip-package-shape

# JSON output for CI ingestion:
manifest integration-check --format json
```

Exit code is `0` only when every section's `ok` is true. `--strict`
escalates warnings to failures.

## Testing against a downstream app before publishing

The `runtime-smoke` and `package-shape` sections only prove anything if
the downstream is actually consuming the build of `@angriff36/manifest`
you intend to ship. Three options, from least committal to most:

### 1. `file:` dependency (fastest, fully reversible)

In the downstream repo's `package.json`:

```json
"dependencies": {
  "@angriff36/manifest": "file:../manifest"
}
```

Then `pnpm install` / `npm install` in the downstream. Re-run after every
change in the Manifest tree:

```bash
cd manifest && pnpm run build:lib
cd ../downstream && pnpm install   # re-link
cd ../downstream && manifest integration-check
```

This catches "downstream code does not work against the new audit-sink
surface" but bypasses the npm pack step, so packaging mistakes will not
be visible — see the next option.

### 2. `npm pack` tarball install

```bash
cd manifest && npm run build:lib && npm pack
# → produces angriff36-manifest-<version>.tgz

cd ../downstream
pnpm install ../manifest/angriff36-manifest-<version>.tgz
manifest integration-check
```

This installs the exact bytes that would go to the registry, so it
verifies the `files` array and `exports` map are correct.
`integration-check --skip-tarball=false` (the default) reruns the pack
internally and asserts the expected entries are present.

### 3. Tagged release to GH Packages

Only do this after the file:/pack flows have been clean against the
downstream repo:

```bash
# In manifest/:
gh workflow run cut-release.yml -f version=patch   # publish-first: tag is pushed only after npm publish succeeds
```

Then in the downstream: `pnpm update @angriff36/manifest@^0.5.0`.

A published version cannot be unpublished from npm, so confirming
clean output from `integration-check` against both the file:/ and pack/
installs before this step is strongly recommended.

## Limits

- Application-agnostic by design. The downstream repo's domain-specific
  behavior is not validated by this command; use `manifest harness` (with
  a JSON script) for command-by-command runtime assertions.
- The `dispatcher` section only checks for the canonical route file's
  existence — it does NOT verify the file's contents delegate to the
  dispatcher. The `route-drift` detector (inside the `governance` section)
  catches concrete non-dispatcher routes; the two are complementary.
- The `package-shape` section's tarball check prefers `pnpm pack` over
  `npm pack --dry-run` because `npm pack` is intermittent on Windows
  when the workspace uses pnpm-managed `node_modules` (an upstream
  `@npmcli/arborist` bug that surfaces at ~40% rate locally with
  npm 10.9.3 + Node 22 on Windows 11). `pnpm pack` is deterministic on
  the same layout. CI publishes still go through `npm publish` because
  CI uses fresh installs where the bug does not trigger.
- The tarball check requires `pnpm` (or `npm` as fallback) AND `tar` on
  the PATH. In CI sandboxes that lack either, use `--skip-tarball` to
  explicitly skip; the check WILL surface a clear failure if it can't
  run the packer, rather than silently green-painting.
- The `runtime-smoke` section runs against a synthetic IR built in-memory;
  it does **not** read the downstream's `.manifest` files. The downstream's
  own conformance tests cover that surface.
