# Manifest CLI

Command-line interface for the Manifest language. Compile, generate, and validate Manifest code.

## Installation

```bash
# Add to your project
npm install -D @manifest/cli

# Or use directly from the Manifest repo
npm run manifest --help
```

## Quick Start

### Option 1: Interactive Setup (Recommended)

```bash
# Initialize with config file (asks questions)
manifest init

# Then use config defaults
manifest build
```

### Option 2: Direct Commands

```bash
# Compile manifest to IR
manifest compile modules/recipe.manifest --output ir/

# Generate Next.js routes from IR
manifest generate ir/recipe.ir.json --projection nextjs --output app/api/

# One-step: compile + generate
manifest build modules/recipe.manifest --projection nextjs --output app/api/

# Validate IR against schema
manifest validate ir/
```

## Commands

### `manifest init`

Initialize Manifest configuration for your project (interactive).

```bash
# Interactive setup
manifest init

# Overwrite existing config
manifest init --force
```

**Questions asked:**
- Framework: Next.js, Remix, Vite, Other
- Auth provider: Clerk, NextAuth, Custom, None
- Workspace: Are you using pnpm/yarn workspaces?
- Workspace prefix: `@repo/` (if using workspaces)
- Import paths: database, runtime, response helpers
- Output directory: Where should generated routes go?
- Tenant filtering: Include multi-tenant filtering?
- Soft-delete filtering: Include soft-delete filtering?

**Creates:** `manifest.config.yaml`

**Example config:**

```yaml
# manifest.config.yaml
$schema: https://manifest.dev/config.schema.json

src: modules/**/*.manifest
output: ir/

projections:
  nextjs:
    output: app/api/
    options:
      authProvider: clerk
      authImportPath: @/lib/auth
      databaseImportPath: @/lib/database
      runtimeImportPath: @/lib/manifest-runtime
      responseImportPath: @/lib/manifest-response
      includeTenantFilter: true
      includeSoftDeleteFilter: true
      tenantIdProperty: tenantId
      deletedAtProperty: deletedAt
```

**Workspace example (capsule-pro):**

```yaml
# manifest.config.yaml
projections:
  nextjs:
    output: apps/api/app/api/
    options:
      authProvider: clerk
      authImportPath: @repo/auth/server
      databaseImportPath: @repo/database
      runtimeImportPath: @repo/manifest/runtime
      responseImportPath: @repo/manifest/response
```

### `manifest compile [source]`

Compile `.manifest` source files to IR (Intermediate Representation).

```bash
# Compile single file (uses config output dir if set)
manifest compile modules/recipe.manifest

# Compile all .manifest files
manifest compile --glob "modules/**/*.manifest"

# Compile all .manifest files
manifest compile --glob "modules/**/*.manifest" --output ir/

# Include diagnostics in output
manifest compile modules/recipe.manifest --output ir/ --diagnostics

# Use default settings (finds all .manifest files)
manifest compile
```

**Options:**
- `-o, --output <path>` - Output directory or file path (default: `ir/`)
- `-g, --glob <pattern>` - Glob pattern for multiple files
- `-d, --diagnostics` - Include diagnostics in output
- `--pretty` - Pretty-print JSON output (default: true)

### `manifest generate <ir>`

Generate code from IR using a projection.

```bash
# Uses config defaults if manifest.config.yaml exists
manifest generate ir/recipe.ir.json

# Override specific options
manifest generate ir/recipe.ir.json --output apps/api/app/api/

# Generate specific surface
manifest generate ir/recipe.ir.json --surface types --output generated/types.ts
manifest generate ir/recipe.ir.json --surface client --output generated/client.ts

# Generate for directory of IR files
manifest generate ir/
```

**Options:**
- `-p, --projection <name>` - Projection name: `nextjs`, `ts.types`, `ts.client` (default: `nextjs`)
- `-s, --surface <name>` - Surface: `route`, `command`, `types`, `client`, `all` (default: `all`)
- `-o, --output <path>` - Output directory (uses config if set)
- `--auth <provider>` - Auth provider or import path (uses config if set)
- `--database <path>` - Database import path (uses config if set)
- `--runtime <path>` - Runtime import path (uses config if set)
- `--response <path>` - Response helpers import path (uses config if set)

### `manifest build [source]`

Compile `.manifest` to IR and generate code in one step.

```bash
# Uses all config defaults (recommended after manifest init)
manifest build modules/recipe.manifest

# Override output directory
manifest build modules/recipe.manifest --code-output apps/api/app/api/

# Multiple files
manifest build "modules/**/*.manifest"
```

**Options:**
- `-p, --projection <name>` - Projection name (default: `nextjs`)
- `-s, --surface <name>` - Projection surface (default: `all`)
- `--ir-output <path>` - IR output directory (uses config if set)
- `--code-output <path>` - Generated code output directory (uses config if set)
- `-g, --glob <pattern>` - Glob pattern for multiple files
- `--auth <provider>` - Auth provider or import path (uses config if set)
- `--database <path>` - Database import path (uses config if set)
- `--runtime <path>` - Runtime import path (uses config if set)
- `--response <path>` - Response helpers import path (uses config if set)

---

## How Config Works

When you run `manifest init`, it creates `manifest.config.yaml` with your project settings.

**After that, all commands use the config:**

```bash
# After manifest init, just run:
manifest build

# Same as:
manifest build modules/ \
  --ir-output ir/ \
  --code-output apps/api/app/api/ \
  --auth @repo/auth/server \
  --database @repo/database \
  --runtime @repo/manifest/runtime \
  --response @repo/manifest/response
```

**CLI option priority:**
1. Command-line flags (highest priority)
2. Config file values
3. Built-in defaults (lowest priority)

### `manifest validate [ir]`

Validate IR against the schema.

```bash
# Validate all IR files
manifest validate ir/

# Validate specific file
manifest validate ir/recipe.ir.json

# Strict mode (warnings fail validation)
manifest validate ir/ --strict

# Custom schema
manifest validate ir/ --schema custom-schema.json
```

**Options:**
- `--schema <path>` - Schema path (default: `docs/spec/ir/ir-v1.schema.json`)
- `--strict` - Fail on warnings

## Package Scripts

Add to your `package.json`:

```json
{
  "scripts": {
    "manifest": "manifest",
    "manifest:build": "manifest build modules/**/*.manifest --projection nextjs --output app/api/",
    "manifest:validate": "manifest validate ir/",
    "dev": "vite",
    "build": "npm run manifest:build && vite build"
  }
}
```

## Integration with Capsule-Pro

### Directory Structure

Capsule-pro uses a monorepo with multiple Next.js apps:

```
capsule-pro/
├── apps/
│   ├── app/                    ← Main Next.js app
│   │   └── app/
│   │       └── api/            ← Routes go here
│   └── api/                    ← API Next.js app
│       └── app/
│           └── api/            ← Routes go here
└── modules/
    └── *.manifest              ← Your Manifest source files
```

### 1. Install dependencies

```bash
npm install -D @manifest/cli
npm install @supabase/supabase-js
```

### 2. Workspace packages (already exist)

Capsule-pro already has the required packages:

```typescript
// packages/database - Prisma client
// packages/auth - Auth utilities
// packages/manifest - Manifest runtime wrapper
```

**You don't need to create these** - they already exist as workspace packages.

### 3. Define your Manifest source

```manifest
// modules/recipe.manifest
entity Recipe {
  property required id: string
  property required name: string
  property category: string?

  command create(name: string, category?: string) {
    guard user.role == "chef"
    mutate id = generateId()
    mutate name = name
    mutate category = category
  }
}

store Recipe in postgres
```

### 4. Generate routes (with correct workspace imports)

```bash
# From capsule-pro root - using workspace imports
manifest build modules/recipe.manifest \
  --output apps/api/app/api/ \
  --database @repo/database \
  --runtime @repo/manifest/runtime \
  --auth @repo/auth/server
```

This creates:
- `ir/recipe.ir.json` - Compiled IR
- `apps/api/app/api/recipe/route.ts` - Generated API routes

### 5. Generated route example

```typescript
// apps/api/app/api/recipe/route.ts (GENERATED - DO NOT EDIT)
import { NextRequest } from "next/server";
import { database } from "@repo/database";           // ← Workspace import
import { manifestSuccessResponse, manifestErrorResponse } from "@repo/manifest/response";
import { createRuntime } from "@repo/manifest/runtime";
import { auth } from "@repo/auth/server";            // ← Workspace import

export async function GET(request: NextRequest) {
  // ... generated code
}

export async function POST(request: NextRequest) {
  // ... generated code
}
```

### Scripts for package.json

```json
{
  "scripts": {
    "manifest:build": "manifest build modules/**/*.manifest --output apps/api/app/api/ --database @repo/database --runtime @repo/manifest/runtime --auth @repo/auth/server",
    "manifest:build:app": "manifest build modules/**/*.manifest --output apps/app/app/api/ --database @repo/database --runtime @repo/manifest/runtime --auth @repo/auth/server",
    "manifest:validate": "manifest validate ir/"
  }
}
```

## Projections

### Next.js Projection

Surfaces:
- **route** - Entity GET routes (list, retrieve)
- **command** - Command POST routes (create, update, delete)
- **types** - TypeScript type definitions
- **client** - Client SDK functions

Example:

```bash
# Generate GET routes for entities
manifest generate ir/ --surface route --output app/api/

# Generate POST routes for commands
manifest generate ir/ --surface command --output app/api/

# Generate TypeScript types
manifest generate ir/ --surface types --output generated/types.ts

# Generate client SDK
manifest generate ir/ --surface client --output generated/client.ts

# Generate all surfaces
manifest generate ir/ --surface all --output generated/
```

## Configuration

Create `manifest.config.yaml` in your project root:

```yaml
# Project configuration
src: "modules/**/*.manifest"
output: "ir/"

projections:
  nextjs:
    output: "app/api/"
    options:
      authProvider: "clerk"
      databaseImportPath: "@/lib/database"
      runtimeImportPath: "@/lib/manifest-runtime"
      responseImportPath: "@/lib/manifest-response"
      includeTenantFilter: true
      tenantIdProperty: "tenantId"
      deletedAtProperty: "deletedAt"

dev:
  port: 5173
  watch: true

test:
  coverage: true
```

## Examples

See `docs/examples/` for complete examples:
- Recipe API
- Task management
- Multi-tenant SaaS
- Event sourcing

## Troubleshooting

### Windows: `manifest` exits `0` with no output

If CLI commands return exit `0` with no output on Windows (especially with pnpm shims), verify from your project root:

```bash
pnpm exec manifest --help
node .\node_modules\@manifest\runtime\packages\cli\dist\index.js --help
.\node_modules\.bin\manifest.cmd --help
```

Expected result: each command prints the Manifest help text.

Root cause (fixed in `0.3.10`): direct-run detection compared unresolved normalized paths, which could differ across `node_modules` shim paths and `.pnpm` real targets.

Implementation summary:
- CLI now compares normalized **realpaths** for module and argv entrypoint.
- On Windows, comparison is case-insensitive.
- If argv realpath cannot be resolved, fallback bin-context checks allow execution (`manifest`/`index.js` path hints, ESM main-equivalent check).

Note on `init --force`:
- `manifest init --force` is interactive and requires terminal input.
- In non-interactive/headless shells, it may wait for prompts or exit without rewriting config.

### `TypeError: Cannot read properties of undefined (reading 'output')` in `manifest compile`

If `pnpm exec manifest compile` fails at `packages/cli/dist/index.js` around line `48`, you are likely on a build with duplicate Commander argument declarations.

Fixed behavior:
- Command signatures no longer duplicate args in both `.command(...)` and `.argument(...)`.
- Action handlers use safe option defaults (`options = {}`).
- Config access remains null-safe (`config?.output`, `config?.projections?...`).

Quick check:

```bash
pnpm exec manifest --help
```

Expected command shapes:
- `compile [options] [source]`
- `generate [options] <ir>`
- `build [options] [source]`
- `validate [options] [ir]`

### `Cannot find module .../dist/manifest/parser` during `manifest compile`

If compile starts and then fails with:

```text
Cannot find module .../dist/manifest/parser imported from .../dist/manifest/ir-compiler.js
```

you are on a runtime build where ESM relative imports were emitted without `.js` extensions.

Fixed behavior:
- Runtime ESM imports now use explicit `.js` extensions (for example `./parser.js`, `./lexer.js`, `./ir-cache.js`, `./version.js`).
- Projection registry/builtins exports/imports were also aligned to `.js` specifiers for Node ESM resolution.

Validation command:

```bash
pnpm exec manifest compile
```

Expected result: compile runs across discovered manifests without module-resolution errors.

### "Cannot find module '@manifest/compiler'"

Make sure you're running from the Manifest repo or have installed the dependencies:

```bash
cd packages/cli
npm install
```

### "No .manifest files found"

Create a `.manifest` file or specify the source:

```bash
manifest compile path/to/your/file.manifest
```

### Generated routes don't work

Check your lib files are set up correctly:
- `lib/manifest-runtime.ts`
- `lib/database.ts`
- `lib/manifest-response.ts`

## Related Documentation

- **[Usage Patterns Guide](../../docs/guides/usage-patterns.md)** - Projections vs embedded runtime
- **[Next.js Projection README](../../src/manifest/projections/nextjs/README.md)** - Projection details
- **[Language Semantics](../../docs/spec/semantics.md)** - How Manifest works
