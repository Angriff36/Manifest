# Manifest CLI Reference

Authority: Advisory
Enforced by: None
Last updated: 2026-02-21

Complete reference for all Manifest CLI commands.

Package/distribution notes (published package vs internal CLI workspace package, GitHub Packages, Vercel): `docs/tools/PACKAGES_AND_DISTRIBUTION.md`

---

## Installation

The CLI ships inside the `@angriff36/manifest` package. Install the package and use `pnpm exec manifest` — do not install a separate global CLI binary.

```bash
pnpm add @angriff36/manifest
```

**Always invoke via `pnpm exec` (or `npx`), never a global install:**

```bash
# Correct — version is pinned to the installed package
pnpm exec manifest compile
pnpm exec manifest validate

# Wrong — global install version is independent and will drift
manifest compile
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

Validate a compiled IR file against the IR schema (`ir-v1.schema.json`).

```bash
manifest validate [ir] [options]
```

**Arguments:**
- `ir` - IR file or glob pattern (default: finds all `*.ir.json` in current directory)

**Options:**
- `--schema <path>` - Override schema path (default: bundled schema inside the package)
- `--strict` - Treat warnings as errors

**Examples:**
```bash
# Validate a specific IR file (schema resolved automatically)
pnpm exec manifest validate ir/Recipe.ir.json

# Validate all IR files
pnpm exec manifest validate

# Strict mode
pnpm exec manifest validate ir/Recipe.ir.json --strict
```

**Exit codes:**
- `0` - Valid
- `1` - Errors found

**Note:** The schema is bundled inside the package. You do not need a local copy of `ir-v1.schema.json` or a `--schema` flag. If you see `Schema not found`, you are running a stale global CLI binary — use `pnpm exec manifest` instead.

---

### `manifest check`

Compile manifest source to IR and validate the IR against the schema in one step.

```bash
manifest check [source] [options]
```

**Arguments:**
- `source` - Manifest file or glob pattern (default: uses config)

**Options:**
- `-o, --output <dir>` - IR output directory or file path
- `-g, --glob <pattern>` - Glob pattern for multiple files
- `-d, --diagnostics` - Include diagnostics in output
- `--pretty` - Pretty-print JSON output
- `--schema <path>` - Override schema path (default: bundled schema inside the package)
- `--strict` - Fail on warnings

**What it does:**
- Compiles manifest source to IR
- Validates IR against the bundled `ir-v1.schema.json`
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

### `manifest inspect entity`

Inspect one entity across source manifests and precompiled IR.

```bash
manifest inspect entity <EntityName> [options]
```

**Options:**
- `--json` - JSON output for tooling/CI
- `--src <pattern>` - Source manifest glob pattern
- `--ir-root <path...>` - One or more compiled IR roots (defaults include `packages/manifest-ir/ir` and `ir`)

**Examples:**
```bash
pnpm exec manifest inspect entity KitchenTask
pnpm exec manifest inspect entity KitchenTask --json
```

---

### `manifest diff source-vs-ir`

Compare source manifest parse output vs precompiled IR for a single entity. Exits non-zero on drift.

```bash
manifest diff source-vs-ir <EntityName> [options]
```

**Examples:**
```bash
pnpm exec manifest diff source-vs-ir KitchenTask
pnpm exec manifest diff source-vs-ir KitchenTask --json
```

---

### `manifest duplicates`

Summarize `*.merge-report.json` files (if present) and classify duplicate drops as known vs suspicious.

```bash
manifest duplicates [options]
```

**Options:**
- `--entity <name>` - Filter entries by entity/key
- `--merge-report <pattern>` - Override merge report glob pattern
- `--json` - JSON output

**Examples:**
```bash
pnpm exec manifest duplicates
pnpm exec manifest duplicates --entity KitchenTask --json
```

---

### `manifest runtime-check`

Correlate route surface, source manifests, and precompiled IR for a command route failure (for example `Command 'claim' not found`).

```bash
manifest runtime-check <EntityName> <command> [options]
```

**Options:**
- `--route <path>` - Exact route path to match in `routes.manifest.json`
- `--json` - JSON output
- `--src <pattern>` - Source manifest glob pattern
- `--ir-root <path...>` - Compiled IR root(s)

**Examples:**
```bash
pnpm exec manifest runtime-check KitchenTask claim
pnpm exec manifest runtime-check KitchenTask claim --route /api/kitchen/kitchen-tasks/commands/claim --json
```

---

### `manifest cache-status`

Offline cache guidance for diagnosing stale runtime processes after IR rebuilds.

```bash
manifest cache-status [options]
```

**What it does:**
- Inspects precompiled IR provenance timestamps (when available)
- Reports that direct in-process runtime cache introspection is not available from the CLI
- Prints restart guidance for long-running API processes

---

### `manifest doctor`

Run a ranked offline diagnosis for parser/scanner mismatch, source-vs-IR drift, duplicate merge impacts, route/IR mismatch, and likely stale runtime cache.

```bash
manifest doctor [options]
```

**Options:**
- `--entity <name>` - Focus checks on one entity
- `--command <name>` - Focus checks on one command
- `--route <path>` - Route correlation hint
- `--json` - JSON output
- `--src <pattern>` - Source manifest glob pattern
- `--ir-root <path...>` - Compiled IR root(s)

**Examples:**
```bash
pnpm exec manifest doctor --entity KitchenTask --command claim
pnpm exec manifest doctor --entity KitchenTask --command claim --json
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
npm install @angriff36/manifest

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
  run: pnpm exec manifest compile

- name: Validate IR
  run: pnpm exec manifest validate

- name: Generate Code
  run: pnpm exec manifest generate ir -s all -o app/api/generated

- name: Build
  run: pnpm run build
```

Use `pnpm exec manifest` (not `npx manifest` or a global binary) so the CLI version is always pinned to the installed package.

### Pre-commit Hook

```bash
# .git/hooks/pre-commit
#!/bin/bash
pnpm exec manifest compile || exit 1
pnpm exec manifest validate || exit 1
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
