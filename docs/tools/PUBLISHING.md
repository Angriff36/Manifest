# Publishing @angriff36/manifest

Last updated: 2026-02-21

## Overview

The Manifest runtime is published as a private scoped package to GitHub Packages under `@angriff36/manifest`. It is not published to the public npm registry.

## Package Identity

| Field | Value |
|-------|-------|
| Package name | `@angriff36/manifest` |
| Registry | `https://npm.pkg.github.com` |
| Visibility | Private (GitHub package permissions) |
| Repo | `https://github.com/Angriff36/Manifest` |

## What Ships in the Package

The published package includes:

- `dist/**` — compiled library (runtime engine, compiler, IR types, projections)
- `packages/cli/dist/**` — compiled CLI binary
- `docs/spec/ir/ir-v1.schema.json` — IR schema, bundled so the CLI can validate IR in any consumer project without needing a local copy
- `README.md`, `LICENSE`, `package.json`

The CLI binary is registered in `bin.manifest` and resolves automatically via `pnpm exec manifest` or `npx manifest` in any project that has the package installed.

## Versioning

The package version (`package.json` → `version`) is the single source of truth. The CLI reports this same version at runtime — it reads `package.json` dynamically rather than hardcoding a string. There is no separate CLI version to maintain.

When bumping the version, update **both**:
- `package.json` (root)
- `packages/cli/package.json`

## Publishing

### Prerequisites

A GitHub PAT (classic) with `write:packages` scope is required to publish. Keep this separate from the `NPM_TOKEN` used by consumer projects (which only needs `read:packages`).

```bash
export NODE_AUTH_TOKEN=ghp_your_write_packages_token_here
```

### Steps

```bash
# 1. Bump version in both package.json files
#    (root and packages/cli/package.json must match)

# 2. Run tests
npm test

# 3. Publish (prepublishOnly builds lib + CLI automatically)
pnpm publish --no-git-checks
```

`prepublishOnly` runs: `pnpm run build:lib && pnpm --filter @manifest/cli run build`

The `.npmrc` at the repo root routes `@angriff36` to GitHub Packages and reads `NODE_AUTH_TOKEN` from the environment:

```
@angriff36:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

## Installing in a Consumer Project

### .npmrc

Add to the consuming project's `.npmrc`:

```
@angriff36:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

### package.json

```json
{
  "dependencies": {
    "@angriff36/manifest": "0.3.23"
  }
}
```

## Using the CLI in a Consumer Project

**Always use `pnpm exec manifest` (or `npx manifest`), never a globally installed binary.**

The global install and the package version are independent and will drift. `pnpm exec` resolves the binary from the installed package, guaranteeing the CLI version matches the library version.

```bash
# Correct — uses the version installed in the project
pnpm exec manifest validate
pnpm exec manifest compile
pnpm exec manifest check

# Wrong — uses whatever is globally installed, version unknown
manifest validate
```

### IR Validation

The `validate` command uses the IR schema bundled inside the package. No `--schema` flag needed:

```bash
pnpm exec manifest validate path/to/output.ir.json
```

## Vercel Deployment

When deploying a consumer project on Vercel, Vercel runs `pnpm install` during build. It needs to authenticate against GitHub Packages.

### Required env var

| Name | Value | Environments |
|------|-------|--------------|
| `NPM_TOKEN` | GitHub PAT with `read:packages` scope | Production, Preview, Development |

Add via: Vercel project → Settings → Environment Variables.

### How it works

The `.npmrc` in the consumer project references `${NPM_TOKEN}`. Vercel injects the env var at build time, pnpm resolves it, and the install authenticates successfully.

## Package Exports

| Import path | Entry point |
|-------------|-------------|
| `@angriff36/manifest` | `RuntimeEngine`, `Store`, `CommandResult`, etc. |
| `@angriff36/manifest/ir` | IR type definitions |
| `@angriff36/manifest/ir-compiler` | `compileToIR()` |
| `@angriff36/manifest/compiler` | `ManifestCompiler` |
| `@angriff36/manifest/projections/nextjs` | `NextJsProjection` |
| `@angriff36/manifest/projections/routes` | `RoutesProjection` |

## Privacy Model

Package visibility is controlled by GitHub's package permissions model — not by `publishConfig.access`. The package is private because the GitHub repository is private. Anyone with a PAT that has `read:packages` and access to the repo can install it.

`"private": false` in `package.json` is intentional — it allows `npm publish` to run. Setting `"private": true` would prevent publishing entirely (npm refuses to publish private-flagged packages).
