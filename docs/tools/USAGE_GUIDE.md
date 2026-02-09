# Manifest Tools - Practical Usage Guide

This guide shows you how to actually USE the tools in `C:\projects\manifest\tools\`.

## Quick Setup (Do This First)

All tools need to be built before use:

```bash
# From manifest root directory
cd C:\projects\manifest

# Build all tools at once
for tool in tools/*/project; do
  if [ -f "$tool/package.json" ]; then
    echo "Building $(dirname $tool)..."
    cd "$tool"
    npm install
    npm run build
    cd -
  fi
done
```

Or build them one at a time:

```bash
cd tools/manifest-ir-schema-validator/project
npm install && npm run build

cd ../manifest-IR-consumer-test-harness/project/packages/manifest-ir-harness
npm install && npm run build

cd ../IR-diff-explainer/project/packages/ir-diff
npm install && npm run build

cd ../generator-field-access-guard/packages/field-access-guard
npm install && npm run build
```

---

## Tool 1: IR Schema Validator

**What it does:** Validates that IR JSON conforms to the official `ir-v1.schema.json` schema.

### When to use it:
- ✅ After compiling `.manifest` files
- ✅ In CI to catch malformed IR
- ✅ Before consuming IR in generators
- ✅ When debugging "weird runtime behavior"

### Basic Usage:

```bash
cd C:\projects\manifest\tools\manifest-ir-schema-validator\project

# Validate a single IR file
npm start -- --schema ../../../docs/spec/ir/ir-v1.schema.json \
  --ir ../../../src/manifest/conformance/expected/01-entity-properties.ir.json

# Validate all conformance fixtures (CI use case)
npm start -- --schema ../../../docs/spec/ir/ir-v1.schema.json \
  --fixtures ../../../src/manifest/conformance/expected

# Strict mode (fail on warnings)
npm start -- --schema ../../../docs/spec/ir/ir-v1.schema.json \
  --ir ../../../src/manifest/conformance/expected/04-command-mutate-emit.ir.json \
  --strict
```

### Expected Output:

**Valid IR:**
```
✅ Valid: 01-entity-properties.ir.json
   - 1 entity
   - 4 properties
   - IR v1 schema compliant
```

**Invalid IR:**
```
❌ Invalid: broken.ir.json
   - entities[0].commands[2].guards: must be array (got object)
   - entities[1].properties[0].type: unknown type "decimal"
   - Missing required field: metadata.compilerVersion

Summary: 0 valid, 1 invalid
```

### Integrate into CI:

Add to your `.github/workflows/test.yml` or equivalent:

```yaml
- name: Validate IR Schema
  run: |
    cd tools/manifest-ir-schema-validator/project
    npm run build
    npm start -- --schema ../../../docs/spec/ir/ir-v1.schema.json \
      --fixtures ../../../src/manifest/conformance/expected
```

---

## Tool 2: IR Consumer Test Harness

**What it does:** Runs declarative test scripts against Manifest IR to verify runtime behavior.

### When to use it:
- ✅ Testing Manifest runtime changes
- ✅ Validating external IR consumers (capsule-pro)
- ✅ Documenting runtime semantics
- ✅ Regression testing with snapshots

### Create a Test Script:

Create `test-order-submit.json`:
```json
{
  "description": "Order submission with valid guards",
  "context": {
    "user": { "id": "user-1", "role": "customer" }
  },
  "seedEntities": [
    {
      "entity": "Order",
      "id": "order-1",
      "properties": {
        "id": "order-1",
        "status": "draft",
        "items": [{ "id": "item-1", "price": 10 }]
      }
    }
  ],
  "commands": [
    {
      "step": 1,
      "entity": "Order",
      "id": "order-1",
      "command": "submit",
      "params": {},
      "expect": {
        "success": true,
        "stateAfter": {
          "status": "submitted"
        },
        "emittedEvents": ["orderSubmitted"]
      }
    }
  ]
}
```

### Run the Test:

```bash
cd C:\projects\manifest\tools\manifest-IR-consumer-test-harness\project\packages\manifest-ir-harness

# First, wire the adapter to real Manifest runtime
# Edit src/adapters/manifest-core.ts to import from actual Manifest

# Run test against IR
npm run harness -- run \
  --ir ../../../../../src/manifest/conformance/expected/04-command-mutate-emit.ir.json \
  --script test-order-submit.json

# Output results to file
npm run harness -- run \
  --ir ../../../../../src/manifest/conformance/expected/04-command-mutate-emit.ir.json \
  --script test-order-submit.json \
  --output results.json

# Snapshot mode (for Vitest)
npm run harness -- run \
  --ir ../../../../../src/manifest/conformance/expected/04-command-mutate-emit.ir.json \
  --script test-order-submit.json \
  --snapshot
```

### Use in Tests:

```typescript
import { describe, it, expect } from 'vitest';
import { runScript } from '@repo/manifest-ir-harness';
import testScript from './test-order-submit.json';
import irFile from './order.ir.json';

describe('Order Runtime Behavior', () => {
  it('submits order successfully', async () => {
    const result = await runScript({
      irSource: irFile,
      script: testScript,
    });

    expect(result.summary.passed).toBe(1);
    expect(result.summary.failed).toBe(0);
  });

  it('matches snapshot', async () => {
    const result = await runScript({
      irSource: irFile,
      script: testScript,
      timestamp: '2026-01-01T00:00:00.000Z', // Freeze for snapshot
    });

    expect(result).toMatchSnapshot();
  });
});
```

---

## Tool 3: IR Diff Explainer

**What it does:** Compares two IR files and generates human-readable diff reports.

### When to use it:
- ✅ After refactoring the compiler
- ✅ Documenting breaking changes between versions
- ✅ Validating "no IR changes" in refactors
- ✅ Generating changelogs

### Basic Usage:

```bash
cd C:\projects\manifest\tools\IR-diff-explainer\project\packages\ir-diff

# Compare two IR files - Markdown report
npm run cli -- explain \
  --before ../../../../../src/manifest/conformance/expected/01-entity-properties.ir.json \
  --after ../../../../../src/manifest/conformance/expected/03-computed-properties.ir.json \
  --out diff-report.md

# JSON summary (machine-readable)
npm run cli -- summarize \
  --before ../../../../../src/manifest/conformance/expected/01-entity-properties.ir.json \
  --after ../../../../../src/manifest/conformance/expected/03-computed-properties.ir.json \
  --out diff-summary.json
```

### Use Case: Validate Compiler Refactor

```bash
# Before refactor: compile and save IR
npm test  # Generates IR in expected/

# Copy IR to backup
cp src/manifest/conformance/expected/04-command-mutate-emit.ir.json /tmp/before.ir.json

# After refactor: recompile
npm test

# Compare
cd tools/IR-diff-explainer/project/packages/ir-diff
npm run cli -- explain \
  --before /tmp/before.ir.json \
  --after ../../../../../src/manifest/conformance/expected/04-command-mutate-emit.ir.json \
  --out refactor-impact.md

# If diff shows changes, you broke something!
```

### Custom Config for Semantic Labeling:

Create `ir-diff.config.json`:
```json
{
  "labels": {
    "entities.*.name": "Entity name (BREAKING)",
    "entities.*.commands.*.name": "Command name (BREAKING)",
    "entities.*.properties.*": "Property definition",
    "metadata.compilerVersion": "Compiler version"
  },
  "risks": {
    "entities.*.name": "breaking",
    "entities.*.commands": "breaking",
    "entities.*.properties": "risky",
    "metadata": "safe"
  }
}
```

Run with config:
```bash
npm run cli -- explain \
  --before v0.3.7.ir.json \
  --after v0.3.8.ir.json \
  --config ir-diff.config.json \
  --out v0.3.8-changes.md
```

---

## Tool 4: Generator Field Access Guard

**What it does:** Tracks which IR fields your generator reads and validates against an allowlist.

### When to use it:
- ✅ Building new generators (capsule-pro)
- ✅ Enforcing "generators can't read internal fields"
- ✅ CI validation before merging generator changes
- ✅ Documenting generator dependencies

### Step 1: Create Baseline (First Time)

```bash
cd C:\projects\manifest\tools\generator-field-access-guard\packages\field-access-guard

# Generate baseline allowlist
npm run cli -- init \
  --input ../../../../../src/manifest/conformance/expected/04-command-mutate-emit.ir.json \
  --generator /path/to/your/generator.js \
  --out baseline-allowlist.json
```

This creates `baseline-allowlist.json`:
```json
[
  "entities.*.name",
  "entities.*.properties.*.name",
  "entities.*.properties.*.type",
  "entities.*.commands.*.name",
  "entities.*.commands.*.params.*"
]
```

### Step 2: Validate Generator (CI)

```bash
npm run cli -- run \
  --input ../../../../../src/manifest/conformance/expected/04-command-mutate-emit.ir.json \
  --generator /path/to/your/generator.js \
  --allowlist baseline-allowlist.json \
  --out report.json
```

**Success (exit code 0):**
```
Report written to report.json
Observed: 12, Forbidden: 0, Allowed: 12
```

**Failure (exit code 1):**
```
Report written to report.json
Observed: 15, Forbidden: 3, Allowed: 12

Forbidden paths detected:
  - entities.0.commands.0.guards.0.expression
  - entities.0.commands.0.actions.0.mutations
  - metadata.irHash
```

### Example: Validate Capsule-Pro Generator

```bash
# In capsule-pro repo
cd packages/manifest

# Generate baseline from your generator
field-guard init \
  --input fixtures/recipe.ir.json \
  --generator src/generators/capsule-pro.ts \
  --out .field-access-allowlist.json

# Add to CI (.github/workflows/test.yml)
field-guard run \
  --input fixtures/recipe.ir.json \
  --generator src/generators/capsule-pro.ts \
  --allowlist .field-access-allowlist.json \
  --out field-access-report.json
```

---

## Workflow: Using All Tools Together

### Scenario: Adding a New Manifest Feature

1. **Write `.manifest` source**
   ```manifest
   entity Task {
     property id: string
     property status: string = "pending"

     command complete() {
       guard self.status == "pending"
       mutate status = "completed"
       emit taskCompleted
     }
   }
   ```

2. **Compile to IR**
   ```bash
   # Compile using Manifest compiler
   # Output: task.ir.json
   ```

3. **Validate IR Schema** ✅
   ```bash
   cd tools/manifest-ir-schema-validator/project
   npm start -- --schema ../../../docs/spec/ir/ir-v1.schema.json \
     --ir task.ir.json
   ```

4. **Test Runtime Behavior** ✅
   ```bash
   # Create test-task-complete.json script
   cd tools/manifest-IR-consumer-test-harness/project/packages/manifest-ir-harness
   npm run harness -- run --ir task.ir.json --script test-task-complete.json
   ```

5. **Compare with Previous Version** ✅
   ```bash
   cd tools/IR-diff-explainer/project/packages/ir-diff
   npm run cli -- explain \
     --before old-task.ir.json \
     --after task.ir.json \
     --out changes.md
   ```

6. **Validate Generator (if applicable)** ✅
   ```bash
   cd tools/generator-field-access-guard/packages/field-access-guard
   npm run cli -- run \
     --input task.ir.json \
     --generator my-generator.js \
     --allowlist baseline.json \
     --out report.json
   ```

---

## Integration with npm Scripts

Add to your `package.json`:

```json
{
  "scripts": {
    "validate:ir": "cd tools/manifest-ir-schema-validator/project && npm start -- --schema ../../../docs/spec/ir/ir-v1.schema.json --fixtures ../../../src/manifest/conformance/expected",

    "test:harness": "cd tools/manifest-IR-consumer-test-harness/project/packages/manifest-ir-harness && npm run harness",

    "diff:ir": "cd tools/IR-diff-explainer/project/packages/ir-diff && npm run cli -- explain",

    "guard:generator": "cd tools/generator-field-access-guard/packages/field-access-guard && npm run cli"
  }
}
```

Usage:
```bash
npm run validate:ir
npm run test:harness -- run --ir test.ir.json --script script.json
npm run diff:ir -- --before old.json --after new.json --out diff.md
npm run guard:generator -- run --input ir.json --generator gen.js --allowlist allow.json --out report.json
```

---

## Troubleshooting

### "Command not found"
**Problem:** Tool isn't built
**Solution:**
```bash
cd tools/<tool-name>/project
npm install
npm run build
```

### "Cannot find module"
**Problem:** Dependencies not installed
**Solution:**
```bash
cd tools/<tool-name>/project
npm install
```

### "Adapter not implemented"
**Problem:** IR Consumer Test Harness needs wiring to real Manifest runtime
**Solution:** Edit `tools/manifest-IR-consumer-test-harness/project/packages/manifest-ir-harness/src/adapters/manifest-core.ts`:

```typescript
import { compileToIR } from '../../../../../src/manifest/compiler.js';
import { RuntimeEngine } from '../../../../../src/manifest/runtime-engine.js';

export const adapter = {
  async compile(source: string) {
    return compileToIR(source);
  },
  createRuntime(ir: IR) {
    return new RuntimeEngine(ir);
  }
};
```

---

## Quick Reference Card

| Tool | Command | Purpose |
|------|---------|---------|
| **IR Validator** | `ir-validate --schema schema.json --ir file.json` | Validate IR structure |
| **Test Harness** | `harness run --ir file.json --script test.json` | Test runtime behavior |
| **IR Diff** | `ir-diff explain --before old.json --after new.json --out diff.md` | Compare IR versions |
| **Field Guard** | `field-guard run --input ir.json --generator gen.js --allowlist allow.json --out report.json` | Validate generator access |

---

## Need Help?

- Tool not working? Check if it's built: `ls tools/<tool>/project/dist`
- Want to see examples? Check `tools/<tool>/project/fixtures/`
- Confused about output? Check `tools/<tool>/project/tests/` for expected behavior
