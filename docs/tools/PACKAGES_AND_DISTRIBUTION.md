# Manifest Packages and Distribution

Last updated: 2026-02-28
Status: Active
Authority: Advisory
Enforced by: None

## Purpose

This document explains the package boundaries and distribution model for Manifest, including how the CLI is shipped and how consumer apps (for example Vercel deployments) should depend on Manifest safely.

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

This package exists to build and test the CLI implementation, but consumers do **not** install it directly.

Production installs should use:

- `@angriff36/manifest`

Why this matters:

- Avoids split-brain versioning and dependency drift
- Ensures the CLI binary and runtime/compiler exports come from the same published artifact
- Matches how Vercel/CI installs dependencies from a registry

## Local Workspace Development vs Production Deployment

### Local workspace (acceptable for development)

In a monorepo, you may temporarily wire apps to a local workspace copy of Manifest while iterating on compiler/runtime internals.

This is convenient, but fragile if you forget that production will install from the registry.

### Production / Vercel (required)

For Vercel and other CI/CD environments, the app should resolve `@angriff36/manifest` from GitHub Packages.

Do **not** depend on a local workspace-only Manifest package path as your deployment strategy.

Why:

- Vercel installs from lockfile + registry, not your local disk
- Local workspace behavior can hide packaging mistakes
- You can think a CLI/runtime feature exists locally that is not actually published yet

## GitHub Packages (Registry)

Manifest publishes to GitHub Packages, not the public npm registry.

- Registry: `https://npm.pkg.github.com`
- Scope: `@angriff36`

Repo `.npmrc` pattern:

```ini
@angriff36:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Consumer project `.npmrc` pattern:

```ini
@angriff36:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

## Token Roles (Common Source of Confusion)

Two tokens are often used with different scopes:

- `NPM_TOKEN` (consumer install token): usually `read:packages`
- `GITHUB_TOKEN` / publish PAT (publisher token): needs `write:packages`

Important:

- A token can pass install auth but still fail publish (`403`, scope mismatch)
- Publishing requires a write-capable token in `NODE_AUTH_TOKEN`

Practical check:

```bash
npm whoami --registry=https://npm.pkg.github.com
```

This confirms auth, but not always publish scope. A publish can still fail if the token lacks `write:packages`.

## Publishing the Real Package

Publish from the Manifest repo root (`@angriff36/manifest`), not from `packages/cli`.

### Token Setup (REQUIRED — read this first)

The publish token is stored in `C:\Users\Ryan\Documents\env.txt` under the key `GITHUB_PACKAGES_TOKEN` (also aliased as `NPM_TOKEN` in that file). This is a GitHub PAT with `write:packages` scope.

**Agents: read the token from that file and pass it inline. Do not ask the user for it.**

The `.npmrc` in this repo references `${NODE_AUTH_TOKEN}`. You must provide it as an environment variable at publish time.

### Recommended publish sequence

```bash
# 1. Check latest published version to avoid conflicts
NODE_AUTH_TOKEN=<token> npm view @angriff36/manifest versions --json

# 2. Bump version in root package.json to next available
#    (edit package.json directly — do NOT use npm version, it may fail in workspace)

# 3. Build shipped artifacts
pnpm run build:lib
pnpm --filter @manifest/cli run build

# 4. Publish to GitHub Packages
NODE_AUTH_TOKEN=<token> pnpm publish --no-git-checks
```

**On Windows (Git Bash / MSYS2)**, use inline env var syntax:
```bash
NODE_AUTH_TOKEN=ghp_xxx pnpm publish --no-git-checks
```

**On Windows (cmd.exe / PowerShell)**:
```powershell
$env:NODE_AUTH_TOKEN="ghp_xxx"; pnpm publish --no-git-checks
```

### Why `pnpm publish` is recommended here

In this repo layout, `npm publish` / `npm pack` may fail with an Arborist workspace-link error (`Cannot read properties of null (reading 'package')`) on some environments.

`pnpm publish` avoids that failure mode and publishes the same package successfully.

## Versioning Rules (What Actually Matters)

Consumer-visible version:

- Root `package.json` (`@angriff36/manifest`)

Internal `packages/cli/package.json` version may differ during development because consumers do not install `@manifest/cli` directly.

What must be true before publish:

- Root package version is bumped
- `packages/cli/dist/**` contains the CLI changes you intend to ship

## Consumer Upgrade Workflow (Capsule Pro / Vercel Example)

1. Publish new `@angriff36/manifest` version to GitHub Packages
2. Update consumer dependency to the exact version (recommended)
3. Update lockfile
4. Commit both `package.json` and lockfile
5. Redeploy (Vercel will install from GitHub Packages)

Example:

```bash
pnpm add -w @angriff36/manifest@0.3.24 --save-exact
```

If local install fails due Windows file locks, use lockfile-only in the meantime:

```bash
pnpm add -w @angriff36/manifest@0.3.24 --save-exact --lockfile-only
```

CI/Vercel will perform a clean install from the updated lockfile.

## CLI Commands (Shipped in `@angriff36/manifest`)

The following commands are included in the published package CLI. See `docs/tools/CLI_REFERENCE.md` for full usage.

### Build & Generate
- `manifest init` — Initialize project config
- `manifest compile` — Compile .manifest to IR
- `manifest generate` — Generate code from IR
- `manifest build` — Compile + generate in one step
- `manifest validate` — Validate IR against schema
- `manifest check` — Compile + validate in one step

### Route Tooling
- `manifest routes` — Generate canonical route manifest from IR
- `manifest lint-routes` — Scan for hardcoded route strings (CI enforcement)
- `manifest audit-routes` — Audit route boundary compliance + ownership rules
- `manifest scan` — Scan .manifest files for policy/store/context/property issues

### Diagnostics
- `manifest doctor` — Ranked offline diagnostics
- `manifest inspect entity <EntityName>` — Inspect source + IR for an entity
- `manifest diff source-vs-ir <EntityName>` — Detect source/IR drift
- `manifest duplicates` — Summarize duplicate merge reports
- `manifest runtime-check <EntityName> <command>` — Route/IR/source correlation
- `manifest cache-status` — Stale runtime cache guidance

## Anti-Pattern to Avoid

Do not treat a local workspace Manifest package as proof that a feature is available to deployed apps.

Correct proof for deployment readiness:

1. Feature exists in source
2. Feature is included in `packages/cli/dist/**` / `dist/**`
3. `@angriff36/manifest` is published
4. Consumer dependency + lockfile updated
5. Deployment completed

