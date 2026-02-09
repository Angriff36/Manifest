# ir-validate

CLI tool to validate Manifest IR JSON files against `ir-v1.schema.json`.

Catches malformed IR before runtime. CI-friendly with exit code 1 on any validation failure.

## Install

```bash
npm install
npm run build
```

## Usage

### Validate a single file

```bash
node dist/cli.js --schema fixtures/ir-v1.schema.json --ir fixtures/valid.ir.json
```

Output:

```
✅ valid.ir.json
```

### Validate a directory (batch mode)

```bash
node dist/cli.js --schema fixtures/ir-v1.schema.json --fixtures fixtures/
```

Output:

```
✅ valid.ir.json
❌ invalid.ir.json
   /version: must be equal to one of the allowed values [enum]
   /entities/0/name: must NOT have fewer than 1 characters [minLength]
   ...

---
Total: 3 | Passed: 1 | Failed: 2
```

### Strict mode

Enables strict JSON Schema validation. Fails on additional properties and schema warnings:

```bash
node dist/cli.js --schema fixtures/ir-v1.schema.json --ir fixtures/valid.ir.json --strict
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All files valid |
| 1 | One or more files failed validation |

## CI Integration

```yaml
# GitHub Actions example
- name: Validate IR
  run: node dist/cli.js --schema ir-v1.schema.json --fixtures ./ir-output/
```

## Development

```bash
npm test          # Run tests
npm run build     # Compile TypeScript
```

## Project Structure

```
src/
  cli.ts          # CLI entry point (commander)
  validator.ts    # Core validation logic (Ajv)
  formatter.ts    # Output formatting
  types.ts        # TypeScript type definitions
tests/
  validator.test.ts
  formatter.test.ts
fixtures/
  ir-v1.schema.json   # Sample IR schema
  valid.ir.json        # Valid fixture
  invalid.ir.json      # Invalid fixture (multiple errors)
```
