# Using Manifest in a Fresh Project

Authority: Advisory
Enforced by: None
Last updated: 2026-02-12

Complete guide to using Manifest in a new project (outside the Manifest monorepo).

---

## Prerequisites

**Manifest is NOT published to npm.** You must link the local package to use it in external projects.

---

## Step 1: Build Manifest (Required)

The `dist/` folder must be built before linking. From the Manifest monorepo root:

```bash
cd /path/to/manifest
npm run build:lib
```

This creates the required distribution files:
- `dist/manifest/*.js` - Runtime and compiler
- `packages/cli/dist/*.js` - CLI entry points

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
   npm link @manifest/runtime
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
   pnpm link @manifest/runtime
   ```

---

## Step 3: Verify Installation

```bash
cd /path/to/your-project
ls -la node_modules/@manifest/runtime
# Should show symlink to manifest directory
```

---

## Troubleshooting

### "Cannot find module '@manifest/runtime'"

**Cause**: The `dist/` folder doesn't exist or wasn't built before linking.

**Fix**: Run `npm run build:lib` in the Manifest directory first.

### "Cannot find package '@manifest/runtime' from CLI"

**Cause**: The CLI tries to import `@manifest/runtime` but the symlink is broken or missing.

**Fix**: Ensure you:
1. Ran `npm run build:lib` in Manifest
2. Ran `npm link` in Manifest directory
3. Ran `npm link @manifest/runtime` in your project

### pnpm: Issues with workspace linking

If using pnpm workspaces, you may need to disable workspace detection for external linking:

```bash
pnpm link @manifest/runtime --ignore-workspace
```

---

## Module System Notes

Manifest uses **ESM (ES Modules)** exclusively. All imports must use `import` statements:

```typescript
// ✅ Correct
import { compileToIR } from '@manifest/runtime/ir-compiler';

// ❌ Incorrect (CommonJS)
const { compileToIR } = require('@manifest/runtime/ir-compiler');
```

Per [Node.js ESM documentation](https://nodejs.org/api/esm.html), import statements are only permitted in ES modules. Your project must either:
- Use `"type": "module"` in `package.json`, OR
- Use `.mjs` file extension

---

## Import Reference

| Feature | Import Path | Export |
|---------|-------------|--------|
| IR Compiler | `@manifest/runtime/ir-compiler` | `compileToIR()` function |
| Compiler | `@manifest/runtime/compiler` | `ManifestCompiler` class |
| Runtime Engine | `@manifest/runtime` | `RuntimeEngine` class |
| Next.js Projection | `@manifest/runtime/projections/nextjs` | `NextJsProjection` class |
| TypeScript Types | `@manifest/runtime/ir` | IR type definitions |

---

## Related Documentation

- [Compile .manifest to IR](../tools/COMPILE_REFERENCE.md)
- [Project Scaffolding](../MANIFEST_PROJECT_SCAFFOLDING.md)
- [Module Systems](../tools/MODULE_SYSTEM.md)
