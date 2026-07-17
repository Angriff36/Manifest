# SDK Stability

This policy defines the `@angriff36/manifest` package exports that are stable
for Builder and other platform consumers.

## Stable subpaths

- `./ir-compiler`
- `./ir`
- `./types`
- `./lexer`
- `./parser`
- `./projections`
- each `./projections/<name>` subpath explicitly listed in `package.json`
  `exports` (there is no wildcard export — a projection is importable per-name
  only once it has an explicit exports entry)
- `./runtime-engine`
- `./agent-sdk`
- `./ir-diff`
- `./breaking-change`
- `./config`
- `./language-metadata`
- `./seed-pack`
- `./proof-kit` (capability catalog, proof registry, integration guard engine;
  must not require `convex-test` — guide: `docs/guides/dx-proof-kit.md`)
- `./proof-kit/convex-test` (optional Convex runtime proof adapter; apps install
  `convex-test` as a devDependency — see
  `docs/internal/plans/2026-07-16-dx-proof-kit-boundary.md` and
  `docs/guides/dx-proof-kit.md`)

The `./projections` subpath includes the projection descriptor API
(`ProjectionDescriptor`, `describeProjection`, `listProjectionDescriptors`,
`validateProjectionInvocation`). See `docs/spec/projection-descriptors.md`
for the schema, registered-vs-safely-invokable distinction, authoring rules,
and descriptor-specific semver expectations.

Breaking changes to a stable subpath require both:

1. A breaking-tier version bump. **This project does not use standard
   semver digit conventions** (owner decision 2026-07-14): a breaking
   release increments the MINOR digit (`x.Y.z` → `x.(Y+1).0`); features and
   fixes increment the PATCH digit (`x.y.Z` → `x.y.(Z+1)`).
2. A `CHANGELOG` entry under a **Breaking** heading describing the migration.

Because the scheme is not standard semver, consumers must **pin exact
versions**. A `^` range will auto-upgrade across breaking releases; `~` is
safe from breaks but pulls new features.

Exports not listed above are internal. They may change in any release without
a compatibility guarantee.

This declaration covers the public TypeScript/JavaScript API of each subpath.
It does not make generated projection output a stable hand-editing interface;
generated artifacts remain governed by their projection contracts.
