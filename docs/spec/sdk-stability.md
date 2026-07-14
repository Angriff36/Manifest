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

Breaking changes to a stable subpath require both:

1. A new major package version.
2. A `CHANGELOG` entry under a **Breaking** heading describing the migration.

Exports not listed above are internal. They may change in any release without
a compatibility guarantee.

This declaration covers the public TypeScript/JavaScript API of each subpath.
It does not make generated projection output a stable hand-editing interface;
generated artifacts remain governed by their projection contracts.
