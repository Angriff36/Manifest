# Manifest Packages and Distribution

Last updated: ~~2026-06-24~~ **2026-07-15**
Status: Active
Authority: Advisory
Enforced by: None

## Purpose

This document explains the package boundaries and distribution model for Manifest, including how the CLI is shipped and how consumer apps should depend on Manifest.

## The Real Published Package (Consumer-Facing)

The package consumers install is:

- `@angriff36/manifest`

This is the only package consumer applications should rely on in production.

It includes:

- Runtime (`RuntimeEngine`)
- Compiler exports (`compileToIR`, compiler APIs)
- Projections (including routes projection)
- Bundled CLI binary (`manifest`)
- Bundled IR schema (`docs/spec/ir/ir-v1.schema.json`) for `manifest validate`

The CLI is exposed via root `package.json`:

- `bin.manifest -> ./packages/cli/dist/index.js`

## Internal CLI Package vs Published Consumer Package

Inside this repo there is an internal workspace package:

- `@manifest/cli` (under `packages/cli`)

Consumers do **not** install it directly. Production installs use `@angriff36/manifest` from the public npm registry.

## Registry

Manifest publishes to **public npm** (`https://registry.npmjs.org`).

- Scoped package `@angriff36/manifest` with `"publishConfig": { "access": "public" }`
- No `@angriff36:registry` redirect in repo or consumer projects
- No GitHub PAT for install

## Publishing

Publish from the Manifest repo root (`@angriff36/manifest`), not from `packages/cli`.

### CI (recommended)

`cut-release.yml` publishes via `pnpm publish` using **OIDC trusted publishing** (`id-token: write`; no `NPM_TOKEN` secret). One-time setup: `scripts/setup-npm-trusted-publish.ps1`.

### Manual

```bash
npm login
npm view @angriff36/manifest versions --json
pnpm run build:lib
pnpm --filter @manifest/cli run build
pnpm publish --no-git-checks
```

Use `pnpm publish` — `npm publish` may fail with Arborist workspace-link errors in this repo layout.

## Consumer Upgrade Workflow

1. Publish new `@angriff36/manifest` version to npm
2. Update consumer dependency to the exact version
3. Update lockfile
4. Commit `package.json` + lockfile
5. Redeploy

Example:

```bash
~~pnpm add -w @angriff36/manifest@2.18.0 --save-exact~~
pnpm add -w @angriff36/manifest@3.6.4 --save-exact
```

> **Correction (2026-07-15) @RYANSIGNED:** Pin the current published version from `package.json`
> / npm (**3.6.4** as of this edit). Do not copy stale `2.x` examples.

## Anti-Pattern to Avoid

Do not treat a local workspace Manifest package as proof that a feature is available to deployed apps.

Correct proof for deployment readiness:

1. Feature exists in source
2. Feature is included in `packages/cli/dist/**` / `dist/**`
3. `@angriff36/manifest` is published to npm
4. Consumer dependency + lockfile updated
5. Deployment completed
