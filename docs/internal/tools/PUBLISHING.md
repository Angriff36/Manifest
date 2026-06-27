# Publishing @angriff36/manifest

Last updated: 2026-06-24

## Overview

The Manifest runtime is published as a **public** scoped package on the npm registry:

- Package: `@angriff36/manifest`
- Registry: `https://registry.npmjs.org`

No GitHub Packages auth, scope redirects, or consumer PATs required.

See also: `docs/internal/tools/PACKAGES_AND_DISTRIBUTION.md`.

## Package Identity

| Field        | Value                                   |
| ------------ | --------------------------------------- |
| Package name | `@angriff36/manifest`                   |
| Registry     | `https://registry.npmjs.org`            |
| Visibility   | Public (`publishConfig.access: public`) |
| Repo         | `https://github.com/Angriff36/Manifest` |

## What Ships in the Package

The published package includes:

- `dist/**` — compiled library (runtime engine, compiler, IR types, projections)
- `packages/cli/dist/**` — compiled CLI binary
- `docs/spec/ir/ir-v1.schema.json` — IR schema, bundled so the CLI can validate IR in any consumer project without needing a local copy
- `README.md`, `LICENSE`, `package.json`

The CLI binary is registered in `bin.manifest` and resolves automatically via `pnpm exec manifest` or `npx manifest` in any project that has the package installed.

## Versioning

The package version (`package.json` → `version`) is the single source of truth. The CLI reports this same version at runtime — it reads `package.json` dynamically rather than hardcoding a string. There is no separate CLI version to maintain.

Consumer-visible versioning is anchored to the **root** package:

- `package.json` (root, `@angriff36/manifest`)

`packages/cli/package.json` is an internal workspace package and is not the consumer-facing install target. It may differ during development. What matters for publish is that `packages/cli/dist/**` contains the intended CLI changes.

## Publishing

### Recommended: cut-release workflow

```bash
gh workflow run cut-release.yml -f version=patch   # or minor / major / explicit e.g. 2.19.0
gh run watch --repo Angriff36/Manifest
```

The workflow is publish-first: it bumps version, runs build + typecheck + tests, commits the bump, **publishes to npm**, and only then tags/pushes and creates the GitHub Release. A failed publish pushes nothing (no dangling tags).

### CI auth (trusted publishing — no NPM_TOKEN)

One-time setup (passkey in browser when prompted):

```powershell
.\scripts\setup-npm-trusted-publish.ps1
```

Links `cut-release.yml` on `Angriff36/Manifest` to npm via OIDC. Workflows already set `id-token: write` and Node 22.

Legacy: GitHub secret `NPM_TOKEN` may be deleted once trusted publishing is configured. Do **not** use a GitHub PAT there.

### Manual publish (fallback)

```bash
npm login   # once per machine; npm opens browser passkey flow for publish
pnpm test
pnpm publish --no-git-checks
```

When npm prompts, press Enter to open the browser and approve with your **passkey** (not OTP — new npm accounts use WebAuthn, not authenticator QR codes).

`prepublishOnly` runs: `pnpm run build:lib && pnpm --filter @manifest/cli --filter @manifest/mcp-server --filter @manifest/lsp-server run build`

Use `pnpm publish` (not `npm publish`) — this workspace layout can hit Arborist errors with `npm publish`.

## Installing in a Consumer Project

No special `.npmrc` required:

```bash
pnpm add @angriff36/manifest@<version> --save-exact
```

## Using the CLI in a Consumer Project

**Always use `pnpm exec manifest` (or `npx manifest`), never a globally installed binary.**

```bash
pnpm exec manifest validate path/to/output.ir.json
pnpm exec manifest compile
pnpm exec manifest check
```

## Vercel / CI

Public npm — no `NPM_TOKEN` needed for install. Standard `pnpm install` works.

## Package Exports

| Import path                              | Entry point                                     |
| ---------------------------------------- | ----------------------------------------------- |
| `@angriff36/manifest`                    | `RuntimeEngine`, `Store`, `CommandResult`, etc. |
| `@angriff36/manifest/ir`                 | IR type definitions                             |
| `@angriff36/manifest/ir-compiler`        | `compileToIR()`                                 |
| `@angriff36/manifest/compiler`           | `ManifestCompiler`                              |
| `@angriff36/manifest/projections/nextjs` | `NextJsProjection`                              |
| `@angriff36/manifest/projections/routes` | `RoutesProjection`                              |
