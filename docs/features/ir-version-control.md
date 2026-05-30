# IR Version Control

IR version control persists IR snapshots with semantic version tags, generates changelogs between versions, and verifies integrity via SHA-256 hashing. The pure versioning logic lives in `src/manifest/ir-version-store.ts`; filesystem I/O and the user-facing commands live in the `manifest versions` CLI command group.

## Usage / Syntax

Versions are managed through the `manifest versions` subcommands against a store directory (default `.manifest-versions`):

```bash
manifest versions save src/app.manifest --auto-tag --label "initial"
manifest versions list
manifest versions show latest
manifest versions diff 1 2 --breaking --sql
manifest versions tag 2 1.1.0
manifest versions rollback 1 -o restored.ir.json
manifest versions verify --all
manifest versions changelog 1 2
```

## Behavior / What it does

The store module is pure and deterministic — no I/O — operating on IR and an index structure.

The index (`IRVersionIndex`) holds `storeVersion: 1`, the current highest version number, and an ordered list of `IRVersionMeta` (oldest first). `createVersionIndex`, `addVersionToIndex`, `removeTagFromIndex`, and `tagVersionInIndex` are immutable transforms; tagging a version removes the tag from any other version that previously held it.

`createVersionMeta` extracts metadata from an IR and its provenance: version number, optional semver tag, `irHash`, `contentHash`, `savedAt` (ISO timestamp), `compilerVersion`, `schemaVersion`, and an optional label.

Integrity verification (`verifyIRIntegrity`) recomputes the IR hash with `computeIRHash` and compares it against the stored hash, returning `{ valid, storedIrHash, computedIrHash }`.

Semantic versioning helpers parse and format `major.minor.patch` strings. `autoIncrementSemver` derives the next tag from diff and breaking-change analysis: a breaking change bumps major (resetting minor and patch), any other change bumps minor, no change bumps patch, and the absence of a previous tag yields `0.1.0`.

`resolveVersionRef` resolves a reference to a version number, accepting `latest` (or undefined → current version), a numeric string, or a semver tag.

`generateChangelog` builds a `ChangelogEntry` between two IRs by running the existing `diffIR`, `classifyBreakingChanges`, and `generateMigration` engines, capturing the from/to version numbers and tags alongside the diff, breaking, and migration reports.

## Reference

Public types: `SemanticVersion`, `IRVersionMeta`, `IRVersionIndex`, `SaveVersionOptions` (`tag?`, `autoTag?`, `label?`), `VerifyResult`, `ChangelogEntry`.

Functions: `createVersionIndex`, `addVersionToIndex`, `removeTagFromIndex`, `tagVersionInIndex`, `createVersionMeta`, `verifyIRIntegrity`, `parseSemverTag`, `formatSemver`, `autoIncrementSemver`, `resolveVersionRef`, `generateChangelog`.

CLI subcommands (under `manifest versions`, all accepting `--store <path>`): `list`, `show <version>`, `save [source] [--tag|--auto-tag|--label]`, `diff <from> <to> [--breaking|--sql]`, `changelog [from] [to]`, `tag <version> <tag>`, `rollback <version> [-o]`, `verify [version] [--all]`. See `docs/reference/cli.md`.

## Notes & limitations

The store module performs no filesystem access; persistence is handled by the CLI command layer. Semver tags must match `major.minor.patch` exactly — prerelease and build-metadata suffixes are not parsed. `autoIncrementSemver` resolves a major bump only from breaking changes and otherwise treats any change as a minor bump, so it does not distinguish deprecations from compatible additions in the resulting version number. Version references resolve against the in-index entries; an unknown reference returns `undefined`.

Note on provenance: no feature summary was recorded for `ir-version-control` in the consolidated summaries; this page is written directly from the source.
