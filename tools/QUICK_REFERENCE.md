# Manifest Tools - Quick Reference

## 🚀 One-Time Setup

**Windows:**
```bash
cd C:\projects\manifest\tools
setup-all.bat
```

**Linux/Mac:**
```bash
cd /path/to/manifest/tools
./setup-all.sh
```

---

## 📋 Tool Commands Cheat Sheet

### 1. IR Schema Validator
**Purpose:** Validate IR structure

```bash
# Single file
cd tools/manifest-ir-schema-validator/project
npm start -- --schema ../../../docs/spec/ir/ir-v1.schema.json --ir test.ir.json

# All fixtures (CI)
npm start -- --schema ../../../docs/spec/ir/ir-v1.schema.json --fixtures ../../../src/manifest/conformance/expected

# Strict mode
npm start -- --schema ../../../docs/spec/ir/ir-v1.schema.json --ir test.ir.json --strict
```

**Output:**
- ✅ = Valid IR
- ❌ = Invalid IR (with error details)

---

### 2. IR Consumer Test Harness
**Purpose:** Test runtime behavior

```bash
cd tools/manifest-IR-consumer-test-harness/project/packages/manifest-ir-harness

# Run test script
npm run harness -- run --ir path/to/test.ir.json --script path/to/script.json

# Output to file
npm run harness -- run --ir test.ir.json --script script.json --output results.json

# Snapshot mode (Vitest)
npm run harness -- run --ir test.ir.json --script script.json --snapshot

# Auto-discover fixtures
npm run harness -- fixtures --dir path/to/fixtures
```

**Test Script Format:**
```json
{
  "description": "Test name",
  "context": { "user": { "id": "user-1" } },
  "seedEntities": [
    { "entity": "Order", "id": "order-1", "properties": {...} }
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
        "stateAfter": { "status": "submitted" },
        "emittedEvents": ["orderSubmitted"]
      }
    }
  ]
}
```

---

### 3. IR Diff Explainer
**Purpose:** Compare IR versions

```bash
cd tools/IR-diff-explainer/project/packages/ir-diff

# Markdown report
node dist/cli.js explain --before old.ir.json --after new.ir.json --out changes.md

# JSON summary
node dist/cli.js summarize --before old.ir.json --after new.ir.json --out summary.json

# With custom config
node dist/cli.js explain --before old.json --after new.json --config ir-diff.config.json --out report.md
```

**Config Format (optional):**
```json
{
  "labels": {
    "entities.*.name": "Entity name (BREAKING)",
    "entities.*.commands": "Command definitions"
  },
  "risks": {
    "entities.*.name": "breaking",
    "entities.*.properties": "safe"
  }
}
```

---

### 4. Generator Field Access Guard
**Purpose:** Validate generator IR access

```bash
cd tools/generator-field-access-guard/packages/field-access-guard

# Generate baseline (first time)
node dist/cli.js init --input test.ir.json --generator path/to/gen.js --out baseline.json

# Validate generator (CI)
node dist/cli.js run --input test.ir.json --generator path/to/gen.js --allowlist baseline.json --out report.json
```

**Allowlist Format:**
```json
[
  "entities.*.name",
  "entities.*.properties.*.type",
  "entities.*.commands.*.name"
]
```

**Exit Codes:**
- `0` = All access allowed
- `1` = Forbidden paths detected

---

## 🔗 Common Workflows

### Workflow 1: Validate New Feature

```bash
# 1. Compile .manifest → IR
npm test  # or your compile command

# 2. Validate IR schema
cd tools/manifest-ir-schema-validator/project
npm start -- --schema ../../../docs/spec/ir/ir-v1.schema.json --ir ../../feature.ir.json

# 3. Test runtime behavior
cd ../manifest-IR-consumer-test-harness/project/packages/manifest-ir-harness
npm run harness -- run --ir feature.ir.json --script feature-test.json

# 4. Compare with previous version (if updating)
cd ../../IR-diff-explainer/project/packages/ir-diff
node dist/cli.js explain --before old-feature.ir.json --after feature.ir.json --out changes.md
```

### Workflow 2: Build Generator

```bash
# 1. Create baseline allowlist
cd tools/generator-field-access-guard/packages/field-access-guard
node dist/cli.js init --input test.ir.json --generator my-generator.js --out .allowlist.json

# 2. Test generator
node my-generator.js test.ir.json > output.ts

# 3. Validate access (CI)
node dist/cli.js run --input test.ir.json --generator my-generator.js --allowlist .allowlist.json --out report.json
```

### Workflow 3: CI Integration

```yaml
# .github/workflows/test.yml
- name: Validate IR
  run: |
    cd tools/manifest-ir-schema-validator/project
    npm run build
    npm start -- --schema ../../../docs/spec/ir/ir-v1.schema.json --fixtures ../../../src/manifest/conformance/expected

- name: Guard Generator
  run: |
    cd tools/generator-field-access-guard/packages/field-access-guard
    npm run build
    node dist/cli.js run --input test.ir.json --generator gen.js --allowlist baseline.json --out report.json
```

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| "Command not found" | Run `npm run build` in tool directory |
| "Cannot find module" | Run `npm install` in tool directory |
| "Adapter not implemented" | Wire harness adapter to real Manifest runtime |
| Build fails | Check Node version (need 18+), clean `node_modules` |
| Test harness fails | Make sure IR is valid first with validator |

---

## 📖 Full Documentation

- **Complete usage examples:** `docs/tools/USAGE_GUIDE.md`
- **Tool catalog:** `docs/tools/README.md`
- **Recommendations:** `docs/tools/RECOMMENDATIONS.md`

---

## 💡 Quick Tips

1. **Always validate IR first** - save debugging time
2. **Use snapshots** - catch regression with test harness
3. **Baseline on day 1** - create generator allowlist from the start
4. **CI everything** - all 4 tools can run in CI

---

## 🎯 Which Tool When?

| Situation | Tool |
|-----------|------|
| Just compiled IR | ✅ IR Schema Validator |
| Testing command behavior | ✅ IR Consumer Test Harness |
| Refactored compiler | ✅ IR Diff Explainer |
| Building generator | ✅ Generator Field Access Guard |
| Runtime error | ✅ Validator first, then Harness |
| Version upgrade | ✅ Diff Explainer |
| Generator broken | ✅ Field Access Guard |

---

**Need more detail?** See `docs/tools/USAGE_GUIDE.md`
