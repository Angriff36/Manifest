# Using Manifest in a Fresh Project

Authority: Advisory
Enforced by: None
Last updated: 2026-07-15

Complete guide to using Manifest in a new project (outside the Manifest monorepo).

---

## Prerequisites

~~**Manifest is published to the public npm registry** as `@angriff36/manifest` — `npm install` / `pnpm add` works with no special `.npmrc` configuration. For monorepo development, you can also link the local package.~~

> **Correction (2026-07-15) @RYANSIGNED:** Prefer the **published** package
> (`@angriff36/manifest@3.6.4` SoT in root `package.json`). Requires **Node.js
> `>=20`**. Local `pnpm link` / `npm link` is only for contributing to Manifest
> itself. This repo uses **pnpm** (`packageManager: pnpm@10.31.0`).

```bash
pnpm add @angriff36/manifest@3.6.4
```

---

## Step 1: Build Manifest (Required for local link only)

~~The `dist/` folder must be built before linking. From the Manifest monorepo root:

```bash
cd /path/to/manifest
npm run build:lib
```~~

> **Correction (2026-07-15) @RYANSIGNED:** Skip this step when installing from
> npm. For a local link only:

```bash
cd /path/to/manifest
pnpm run build:lib
```

This creates the required distribution files:

- `dist/manifest/*.js` - Runtime and compiler
- `packages/cli/dist/*.js` - CLI entry points (after the CLI package build)

---

## Step 2: Link Manifest Locally

### Using npm

**Two-step process** (per [npm-link documentation](https://docs.npmjs.com/cli/v9/commands/npm-link/)):

1. **Create global symlink** in Manifest directory:

   ```bash
   cd /path/to/manifest
   npm link
   ```

2. **Link into your project**:
   ```bash
   cd /path/to/your-project
   npm link @angriff36/manifest
   ```

### Using pnpm

**Two forms** (per [pnpm link documentation](https://pnpm.io/cli/link)):

1. **Create global symlink** in Manifest directory:

   ```bash
   cd /path/to/manifest
   pnpm link
   ```

2. **Link into your project**:
   ```bash
   cd /path/to/your-project
   pnpm link @angriff36/manifest
   ```

---

## Step 3: Verify Installation

```bash
cd /path/to/your-project
ls -la node_modules/@angriff36/manifest
# Should show symlink to manifest directory
```

---

## Troubleshooting

### "Cannot find module '@angriff36/manifest'"

**Cause**: The `dist/` folder doesn't exist or wasn't built before linking.

**Fix**: Run ~~`npm run build:lib`~~ `pnpm run build:lib` in the Manifest directory first.

### "Cannot find package '@angriff36/manifest' from CLI"

**Cause**: The CLI tries to import `@angriff36/manifest` but the symlink is broken or missing.

**Fix**: Ensure you:

1. Ran ~~`npm run build:lib`~~ `pnpm run build:lib` in Manifest
2. Ran `npm link` / `pnpm link` in Manifest directory
3. Ran `npm link @angriff36/manifest` / `pnpm link @angriff36/manifest` in your project

### pnpm: Issues with workspace linking

If using pnpm workspaces, you may need to disable workspace detection for external linking:

```bash
pnpm link @angriff36/manifest --ignore-workspace
```

---

## Module System Notes

Manifest uses **ESM (ES Modules)** exclusively. All imports must use `import` statements:

```typescript
// ✅ Correct
import { compileToIR } from '@angriff36/manifest/ir-compiler';

// ❌ Incorrect (CommonJS)
const { compileToIR } = require('@angriff36/manifest/ir-compiler');
```

Per [Node.js ESM documentation](https://nodejs.org/api/esm.html), import statements are only permitted in ES modules. Your project must either:

- Use `"type": "module"` in `package.json`, OR
- Use `.mjs` file extension

---

## Import Reference

| Feature            | Import Path                              | Export                   |
| ------------------ | ---------------------------------------- | ------------------------ |
| IR Compiler        | `@angriff36/manifest/ir-compiler`        | `compileToIR()` function |
| Compiler           | `@angriff36/manifest/compiler`           | `ManifestCompiler` class |
| Runtime Engine     | `@angriff36/manifest`                    | `RuntimeEngine` class    |
| Next.js Projection | `@angriff36/manifest/projections/nextjs` | `NextJsProjection` class |
| TypeScript Types   | `@angriff36/manifest/ir`                 | IR type definitions      |

---

## Related Documentation

- [CLI reference (compile, generate, build)](../reference/cli.md)
- [Module system](../reference/module-system.md)
- [Usage patterns](../guides/usage-patterns.md)
