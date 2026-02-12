# Module System Notes

Authority: Advisory
Enforced by: None
Last updated: 2026-02-12

Manifest uses ES Modules (ESM). This document explains module system requirements and usage.

---

## ESM Only

Manifest is **ESM-only**. All imports must use `import` statements:

```typescript
// ✅ Correct
import { compileToIR } from '@manifest/runtime/ir-compiler';
import { RuntimeEngine } from '@manifest/runtime';

// ❌ Incorrect - will fail
const { compileToIR } = require('@manifest/runtime/ir-compiler');
```

Per [Node.js ESM documentation](https://nodejs.org/api/esm.html):

> Import statements are only permitted in ES modules... The `import` statement cannot be used in embedded scripts unless the `type` attribute is set to `module`.

---

## Project Configuration

Your project MUST be configured as ESM. One of:

### Option 1: package.json (Recommended)

```json
{
  "type": "module"
}
```

### Option 2: Use .mjs Extension

Rename your files to use `.mjs`:

```bash
mv compile.ts compile.mjs
```

Then import accordingly.

---

## Interoperability

### Importing CommonJS from ESM

Per [Node.js ESM documentation](https://nodejs.org/api/esm.html), you **can** import CommonJS modules from ESM:

```typescript
// ✅ Allowed - CommonJS re-exported as ESM
import lodash from 'lodash';
import { express } from 'express';

// ❌ Not allowed - require() in ESM
const lodash = require('lodash');
```

### Importing Manifest (ESM) from CommonJS

**Not supported**. Manifest cannot be imported via `require()`:

```javascript
// ❌ This will fail
const { compileToIR } = require('@manifest/runtime/ir-compiler');

// Error: Unknown keyword 'import' or SyntaxError
```

**Solution**: Convert your project to ESM using `"type": "module"`.

---

## Dynamic Import

For conditional imports, use dynamic `import()`:

```typescript
// ✅ Works in both ESM and CommonJS
const { compileToIR } = await import('@manifest/runtime/ir-compiler');
```

---

## TypeScript Configuration

For TypeScript projects, ensure `tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true
  }
}
```

---

## File Extensions

| Extension | Module Type | Notes |
|-----------|--------------|-------|
| `.js` | ESM | If `"type": "module"` in package.json |
| `.mjs` | ESM | Always ESM, regardless of package.json |
| `.cjs` | CommonJS | Always CommonJS |
| `.ts` | ESM | If `"type": "module"` in package.json |
| `.mts` | ESM | TypeScript ESM, compiles to `.mjs` |

---

## Next.js Projects

Next.js automatically handles ESM. No configuration needed if using App Router (`app/` directory).

---

## Troubleshooting

### "SyntaxError: Cannot use import statement outside a module"

**Cause**: File is not recognized as ESM.

**Fix**: Add `"type": "module"` to `package.json`.

### "Unknown keyword 'import' or unexpected token"

**Cause**: Using `require()` to load an ESM package.

**Fix**: Use `import` instead of `require()`.

### "ReferenceError: exports is not defined"

**Cause**: Mixing CommonJS (`exports`) with ESM.

**Fix**: Use `export` instead of `exports`.

---

## References

- [Node.js ESM Documentation](https://nodejs.org/api/esm.html)
- [Using Manifest in a New Project](./USING_MANIFEST_IN_NEW_PROJECT.md)
- [Compile Reference](./COMPILE_REFERENCE.md)
