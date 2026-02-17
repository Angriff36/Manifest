# Publishing @angriff36/manifest

Last updated: 2026-02-16

## Overview

The Manifest runtime is published as a private scoped package to GitHub Packages under `@angriff36/manifest`. It is not published to the public npm registry.

## Package Identity

| Field | Value |
|-------|-------|
| Package name | `@angriff36/manifest` |
| Registry | `https://npm.pkg.github.com` |
| Visibility | Private (GitHub package permissions) |
| Repo | `https://github.com/Angriff36/Manifest` |

## Publishing

### Prerequisites

A GitHub PAT (classic) with `write:packages` scope is required to publish.

```bash
export NODE_AUTH_TOKEN=ghp_your_token_here
```

### Steps

```bash
# 1. Build lib and CLI
npm run prepublishOnly   # runs: tsc -p tsconfig.lib.json && cd packages/cli && tsc

# 2. Publish
npm publish
```

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
    "@angriff36/manifest": "workspace:*"
  }
}
```

Or for external consumers (not workspace):

```json
{
  "dependencies": {
    "@angriff36/manifest": "0.3.21"
  }
}
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
