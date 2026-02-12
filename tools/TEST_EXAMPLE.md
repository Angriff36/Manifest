# Try It Now: 5-Minute Tool Test

This guide walks you through using the IR Schema Validator on real Manifest IR files.

## Step 1: Build the Validator (30 seconds)

**Windows:**
```bash
cd C:\projects\manifest\tools\manifest-ir-schema-validator\project
npm install
npm run build
```

**Expected output:**
```
added 50 packages...
> ir-validate@1.0.0 build
> tsc

[no errors]
```

✅ **Success check:** You should see a `dist/` folder appear.

---

## Step 2: Validate a Single IR File (10 seconds)

```bash
npm start -- --schema ../../../docs/spec/ir/ir-v1.schema.json --ir ../../../src/manifest/conformance/expected/01-entity-properties.ir.json
```

**Expected output:**
```
✅ Valid: 01-entity-properties.ir.json
   - Entities: 1
   - Properties: 4
   - IR v1 schema compliant

Summary: 1 valid, 0 invalid
```

✅ **What just happened:** The validator checked that `01-entity-properties.ir.json` follows the official IR schema rules.

---

## Step 3: Validate All Conformance Fixtures (20 seconds)

```bash
npm start -- --schema ../../../docs/spec/ir/ir-v1.schema.json --fixtures ../../../src/manifest/conformance/expected
```

**Expected output:**
```
✅ Valid: 01-entity-properties.ir.json
✅ Valid: 02-relationships.ir.json
✅ Valid: 03-computed-properties.ir.json
✅ Valid: 04-command-mutate-emit.ir.json
✅ Valid: 05-guard-denial.ir.json
...
✅ Valid: 27-vnext-integration.ir.json

Summary: 27 valid, 0 invalid
```

✅ **What just happened:** You validated every conformance fixture IR file in one command.

---

## Step 4: Test Invalid IR (see it fail)

Create a broken IR file:

**File:** `C:\projects\manifest\test-broken.ir.json`
```json
{
  "entities": [
    {
      "name": "Order",
      "properties": [
        {
          "name": "id",
          "type": "INVALID_TYPE"
        }
      ]
    }
  ]
}
```

Validate it:
```bash
npm start -- --schema ../../../docs/spec/ir/ir-v1.schema.json --ir ../../../test-broken.ir.json
```

**Expected output:**
```
❌ Invalid: test-broken.ir.json
   - entities[0].properties[0].type: must be equal to one of the allowed values (string, number, boolean, array, object)
   - Missing required field: metadata
   - Missing required field: metadata.compilerVersion

Summary: 0 valid, 1 invalid
```

✅ **What just happened:** The validator caught 3 schema violations and told you exactly what's wrong.

---

## Step 5: Use in CI (Integration Example)

Create a simple script: `validate-ir.sh`

```bash
#!/bin/bash
cd tools/manifest-ir-schema-validator/project

echo "Validating all Manifest IR files..."
npm start -- \
  --schema ../../../docs/spec/ir/ir-v1.schema.json \
  --fixtures ../../../src/manifest/conformance/expected

if [ $? -eq 0 ]; then
  echo "✅ All IR files valid"
  exit 0
else
  echo "❌ IR validation failed"
  exit 1
fi
```

Run it:
```bash
chmod +x validate-ir.sh
./validate-ir.sh
```

✅ **What just happened:** You created a CI-ready validation script. Add this to GitHub Actions and every commit will validate IR.

---

## Next Steps

You've successfully:
- ✅ Built the IR Schema Validator
- ✅ Validated real Manifest IR files
- ✅ Caught invalid IR
- ✅ Created a CI script

**Try the other tools:**
1. **IR Consumer Test Harness** - Test runtime behavior
2. **IR Diff Explainer** - Compare IR versions
3. **Generator Field Access Guard** - Validate generators

See `QUICK_REFERENCE.md` for commands.

---

## Real-World Use Case

**Scenario:** You just refactored the Manifest compiler.

**Question:** Did the refactor change the IR output?

**Answer:**
```bash
# Before refactor
cp src/manifest/conformance/expected/04-command-mutate-emit.ir.json /tmp/before.ir.json

# After refactor
npm test  # Recompiles IR

# Compare
cd tools/IR-diff-explainer/project/packages/ir-diff
node dist/cli.js explain \
  --before /tmp/before.ir.json \
  --after ../../../../../src/manifest/conformance/expected/04-command-mutate-emit.ir.json \
  --out refactor-impact.md

# Read report
cat refactor-impact.md
```

If the diff shows **no changes**, your refactor is safe! ✅

If the diff shows **changes**, you either:
- Found a bug (good!)
- Broke something (fix it!)
- Made an intentional change (document it!)

---

## Congratulations! 🎉

You now know how to use Manifest's development tools.

**Bookmark these:**
- `QUICK_REFERENCE.md` - Fast lookup
- `USAGE_GUIDE.md` - Detailed examples
- `README.md` - Tool catalog

**Questions?** File an issue or check the tool's test fixtures for more examples.
