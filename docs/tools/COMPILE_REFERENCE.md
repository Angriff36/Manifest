# Compile .manifest to IR: Reference

Authority: Advisory
Enforced by: None
Last updated: 2026-02-12

Complete reference for compiling Manifest source to Intermediate Representation (IR).

---

## Supported Methods

There are **two supported ways** to compile Manifest source:

### 1. CLI Command

```bash
manifest compile <source> [options]
```

**Options:**
- `-o, --output <path>` - Output directory or file path
- `-g, --glob <pattern>` - Glob pattern for multiple files
- `-d, --diagnostics` - Include diagnostics in output
- `--pretty` - Pretty-print JSON output (default: true)

**Examples:**
```bash
# Compile single file
manifest compile Recipe.manifest -o ir/Recipe.ir.json

# Compile multiple files
manifest compile -g "manifest/**/*.manifest" -o ir/

# Compile using manifest.config.yaml
manifest compile
```

---

### 2. JavaScript/TypeScript API

#### Option A: Using `compileToIR` (Recommended)

```typescript
import { compileToIR } from '@manifest/runtime/ir-compiler';

const source = `
  entity Recipe {
    property id: string
    property name: string
  }
`;

const { ir, diagnostics } = await compileToIR(source);

if (diagnostics.some(d => d.severity === 'error')) {
  console.error('Compilation failed:', diagnostics);
  process.exit(1);
}

console.log('IR:', ir);
```

#### Option B: Using `ManifestCompiler` class

```typescript
import { ManifestCompiler } from '@manifest/runtime/compiler';

const compiler = new ManifestCompiler();
const source = `entity Recipe { property id: string }`;

const { ir, diagnostics } = await compiler.compile(source);

if (diagnostics.some(d => d.severity === 'error')) {
  console.error('Compilation failed:', diagnostics);
  process.exit(1);
}

console.log('IR:', ir);
```

---

## Import Paths

| Import | What You Get |
|--------|--------------|
| `@manifest/runtime/ir-compiler` | `compileToIR()` function |
| `@manifest/runtime/compiler` | `ManifestCompiler` class |
| `@manifest/runtime` | `RuntimeEngine` class |

**Note**: Context7 documentation may reference different paths. The paths above are **authoritative** as defined in `package.json` exports.

---

## Output Format

Successful compilation produces IR matching [IR v1 Schema](../../spec/ir/ir-v1.schema.json):

```typescript
{
  version: "1.0",
  provenance: {
    contentHash: string,
    irHash: string,
    compilerVersion: string,
    schemaVersion: string,
    compiledAt: string
  },
  modules: IRModule[],
  entities: IREntity[],
  stores: IRStore[],
  events: IREvent[],
  commands: IRCommand[],
  policies: IRPolicy[]
}
```

---

## Diagnostics Format

Diagnostics array contains error/warning/info objects:

```typescript
interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  source?: {
    file?: string;
    line?: number;
    column?: number;
  };
}
```

---

## Troubleshooting

### "Cannot find module '@manifest/runtime/ir-compiler'"

**Cause**: Manifest not linked or not built.

**Fix**:
1. Run `npm run build:lib` in Manifest directory
2. Run `npm link` in Manifest directory
3. Run `npm link @manifest/runtime` in your project

### "Cannot find package '@manifest/runtime' from CLI"

**Cause**: The CLI (in `packages/cli/dist/index.js`) requires `@manifest/runtime` but the symlink is missing.

**Fix**: Same as above. The CLI expects the runtime to be linked.

### "Unexpected token export" or "import statements are not permitted"

**Cause**: Using `require()` or CommonJS with ESM-only package.

**Fix**: Use `"type": "module"` in `package.json` and `import` statements. See [Module System Notes](./MODULE_SYSTEM.md).

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MANIFEST_SRC` | Override source pattern (for CLI) |
| `MANIFEST_OUTPUT` | Override IR output directory (for CLI) |

---

## Related Documentation

- [Using Manifest in a New Project](./USING_MANIFEST_IN_NEW_PROJECT.md)
- [IR Schema](../../spec/ir/ir-v1.schema.json)
- [CLI Reference](./CLI_REFERENCE.md)
- [Module System Notes](./MODULE_SYSTEM.md)
