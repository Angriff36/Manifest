# Manifest CLI Reference

Authority: Advisory
Enforced by: None
Last updated: 2026-02-12

Complete reference for all Manifest CLI commands.

---

## Installation

```bash
# Local project
npm install @manifest/runtime

# Global CLI
npm install -g @manifest/cli
```

---

## Commands

### `manifest init`

Initialize a new Manifest project.

```bash
manifest init [options]
```

**Options:**
- `--force` - Overwrite existing config

**Creates:** `manifest.config.yaml`

**Example:**
```bash
manifest init
```

**Prompts:**
1. Where are your `.manifest` files? (default: `**/*.manifest`)
2. Where should IR output go? (default: `ir/`)
3. Will you be generating code from IR? (default: no)
4. What projection target? (default: `nextjs`)
5. Where should generated code be written? (default: `app/api`)

---

### `manifest compile`

Compile Manifest source to IR.

```bash
manifest compile [source] [options]
```

**Arguments:**
- `source` - Manifest file or pattern (default: uses config)

**Options:**
- `-o, --output <dir>` - Output directory for IR files
- `-g, --glob <pattern>` - Glob pattern for multiple files (use with output directory)
- `-d, --diagnostics` - Include diagnostics in output
- `--pretty` - Pretty-print JSON output (default: true)

**Examples:**
```bash
# Compile single file
manifest compile Recipe.manifest -o ir/Recipe.ir.json

# Compile all files using config
manifest compile

# Compile multiple files using glob
manifest compile -g "manifest/**/*.manifest" -o ir/

# Output to stdout
manifest compile Recipe.manifest -o -
```

---

### `manifest generate`

Generate code from IR using projections.

```bash
manifest generate <ir-input> [options]
```

**Arguments:**
- `ir-input` - IR file or directory containing `*.ir.json`

**Options:**
- `-p, --projection <name>` - Projection target (default: `nextjs`)
- `-s, --surface <name>` - Surface to generate: `route`, `command`, `types`, `client`, `all`
- `-o, --output <dir>` - Output directory
- `--auth <provider>` - Auth provider: `clerk`, `nextauth`, `custom`, `none`
- `--database <path>` - Database import path (default: `@/lib/database`)
- `--runtime <path>` - Runtime import path
- `--response <path>` - Response helpers import path

**Examples:**
```bash
# Generate GET routes for all entities
manifest generate ir -s route -o app/api/generated

# Generate POST routes for commands
manifest generate ir -s command -o app/api/generated

# Generate TypeScript types
manifest generate ir -s types -o lib/types

# Generate client SDK
manifest generate ir -s client -o lib/client

# Generate everything
manifest generate ir -s all -o app/api/generated

# Use specific projection
manifest generate ir -p nextjs -s all -o app/api

# Custom auth
manifest generate ir --auth nextauth -s all -o app/api
```

---

### `manifest validate`

Validate Manifest source without compiling.

```bash
manifest validate <source>
```

**Arguments:**
- `source` - Manifest file or pattern

**Examples:**
```bash
# Validate single file
manifest validate Recipe.manifest

# Validate all files
manifest validate "manifest/**/*.manifest"
```

**Exit codes:**
- `0` - Valid
- `1` - Errors found

---

### `manifest check`

Check project for common issues.

```bash
manifest check [options]
```

**Options:**
- `-o, --output <dir>` - IR output directory or file path
- `-g, --glob <pattern>` - Glob pattern for multiple files
- `-d, --diagnostics` - Include diagnostics in output
- `--pretty` - Pretty-print JSON output
- `--schema <path>` - Schema path (default: docs/spec/ir/ir-v1.schema.json)
- `--strict` - Fail on warnings

**What it does:**
- Compiles manifest source to IR
- Validates IR against schema
- Reports errors and warnings

---

### `manifest build`

Compile and generate in one step.

```bash
manifest build [options]
```

**Options:**
- All `compile` options
- All `generate` options

**Equivalent to:**
```bash
manifest compile && manifest generate ir
```

**Example:**
```bash
manifest build -s all -o app/api/generated
```

---

## Configuration File

`manifest.config.yaml`:

```yaml
$schema: https://manifest.dev/config.schema.json

# Source files
src: "**/*.manifest"

# IR output
output: "ir/"

# Code generation
projections:
  nextjs:
    output: "app/api"
    options:
      authProvider: "clerk"
      includeTenantFilter: true
      includeSoftDeleteFilter: true
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MANIFEST_SRC` | Override source pattern |
| `MANIFEST_OUTPUT` | Override IR output directory |
| `MANIFEST_AUTH` | Default auth provider |
| `MANIFEST_DB` | Database import path |
| `NO_COLOR` | Disable colored output |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Errors found |
| 2 | Invalid usage |
| 3 | Compilation failed |
| 4 | Generation failed |

---

## Examples

### New Project Setup

```bash
# 1. Initialize
npx create-next-app@latest my-app
cd my-app

# 2. Install Manifest
npm install @manifest/runtime

# 3. Configure
npx manifest init

# 4. Write manifest
cat > manifest/Recipe.manifest << 'EOF'
entity Recipe {
  property id: string
  property name: string
}
EOF

# 5. Compile
npx manifest compile

# 6. Generate
npx manifest generate ir -s all -o app/api/generated
```

### CI/CD Pipeline

```yaml
# .github/workflows/manifest.yml
- name: Compile Manifest
  run: npx manifest compile

- name: Validate IR
  run: npx manifest check

- name: Generate Code
  run: npx manifest generate ir -s all -o app/api/generated

- name: Build
  run: npm run build
```

### Pre-commit Hook

```bash
# .git/hooks/pre-commit
#!/bin/bash
npx manifest compile || exit 1
npx manifest validate "manifest/**/*.manifest" || exit 1
```

---

## Tips

### Batch Compilation

```bash
# Compile all and output to structured directory
manifest compile "manifest/**/*.manifest" -o ir/
```

### Specific Entity

```bash
# Generate only for Recipe entity
manifest generate ir/Recipe.ir.json -s route -o app/api/recipes
```

### Batch Compilation

```bash
# Compile multiple files using glob
manifest compile -g "manifest/**/*.manifest" -o ir/
```

### Debug Output

```bash
# Verbose output
MANIFEST_DEBUG=1 manifest compile
```

---

## Related Docs

- **Project Scaffolding**: `docs/MANIFEST_PROJECT_SCAFFOLDING.md`
- **Quick Start**: `docs/QUICKSTART.md`
- **Projections**: `docs/patterns/external-projections.md`
- **API Reference**: `docs/tools/API_REFERENCE.md`
