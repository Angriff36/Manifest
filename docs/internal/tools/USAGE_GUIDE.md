# Manifest Tools Usage Guide

This guide shows practical commands for the main Manifest tooling projects in this repository.

## 1) IR Schema Validator

Path:

- `C:/Projects/Manifest/tools/manifest-ir-schema-validator/project`

Examples:

```bash
cd C:/Projects/Manifest/tools/manifest-ir-schema-validator/project
npm install
npm run build
npm start -- --schema ../../../docs/spec/ir/ir-v1.schema.json --ir ./fixtures/valid.ir.json
```

## 2) IR Consumer Test Harness

Path:

- `C:/Projects/Manifest/tools/manifest-IR-consumer-test-harness/project/packages/manifest-ir-harness`

Examples:

```bash
cd C:/Projects/Manifest/tools/manifest-IR-consumer-test-harness/project/packages/manifest-ir-harness
npm install
npm run build
npm run harness -- fixtures --dir ./fixtures
```

## 3) IR Diff Explainer

Path:

- `C:/Projects/Manifest/tools/IR-diff-explainer/project/packages/ir-diff`

Examples:

```bash
cd C:/Projects/Manifest/tools/IR-diff-explainer/project/packages/ir-diff
npm install
npm run build
npm run cli -- summarize --before ./tests/fixtures/before.json --after ./tests/fixtures/after.json --out ./tmp-summary.json
```

## 4) Generator Field Access Guard

Path:

- `C:/Projects/Manifest/tools/generator-field-access-guard/packages/field-access-guard`

Examples:

```bash
cd C:/Projects/Manifest/tools/generator-field-access-guard/packages/field-access-guard
npm install
npm run build
npm run cli -- init --input ./test/fixtures/ir.json --generator ./test/fixtures/generator.js --out ./tmp-allowlist.json
npm run cli -- run --input ./test/fixtures/ir.json --generator ./test/fixtures/generator.js --allowlist ./tmp-allowlist.json --out ./tmp-report.json
```

## Integration Rule

Use these tools to validate artifacts and behavior, not to change semantic law. Semantic changes must flow through `docs/spec/*` and conformance fixtures first.