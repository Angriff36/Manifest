# Manifest Development Tools

This document catalogs the AI-built tools for Manifest development, testing, and validation.

## 📚 Documentation

- **[Quick Reference](../../tools/QUICK_REFERENCE.md)** - Command cheat sheet
- **[Usage Guide](USAGE_GUIDE.md)** - Detailed examples and workflows
- **[Test Example](../../tools/TEST_EXAMPLE.md)** - 5-minute hands-on tutorial
- **[Recommendations](RECOMMENDATIONS.md)** - Strategic tool roadmap

## 🚀 Quick Start

```bash
# Windows
cd C:\projects\manifest\tools
setup-all.bat

# Linux/Mac
cd /path/to/manifest/tools
./setup-all.sh
```

Then try the [5-minute test example](../../tools/TEST_EXAMPLE.md)!

## Built Tools (via Bolt + Opus 4.6)

### 1. **Manifest IR Consumer Test Harness**
**Location:** `C:\Projects\bolt-projects\manifest-IR-consumer-test-harness`

**Purpose:** Execute declarative test scripts against Manifest IR and produce deterministic, snapshot-able outputs for catching IR consumer mistakes and runtime regressions.

**Use Cases:**
- Validate Manifest runtime behavior
- Test external IR consumers (like capsule-pro generators)
- Document runtime semantics with executable examples
- Regression testing with Vitest snapshots

**Key Features:**
- Declarative JSON test scripts
- Portable adapter pattern (wire to any IR/runtime)
- Captures guard failures with resolved values
- Tracks emitted events in order
- Stable, diff-friendly JSON output
- CLI + programmatic API

**CLI:**
```bash
# Run script against IR
harness run --ir test.ir.json --script script.json

# Compile manifest first
harness run --manifest test.manifest --script script.json

# Auto-discover fixtures
harness fixtures --dir path/to/fixtures
```

**Status:** ✅ Complete with fixtures, tests, and documentation

---

### 2. **IR Diff Explainer**
**Location:** `C:\Projects\bolt-projects\IR-diff-explainer`

**Purpose:** Schema-agnostic JSON diff tool for comparing Manifest IR versions and explaining changes with human-readable reports.

**Use Cases:**
- Compare IR before/after compiler changes
- Document breaking changes between Manifest versions
- Validate that refactoring doesn't change IR output
- Generate changelogs for IR schema updates

**Key Features:**
- Deep JSON diffing with path tracking
- Configurable risk levels (breaking, risky, safe)
- Custom label mapping for semantic context
- Markdown report generation
- JSON summary output

**CLI:**
```bash
# Generate markdown report
ir-diff explain --before v1.ir.json --after v2.ir.json --out changes.md

# Generate JSON summary
ir-diff summarize --before v1.ir.json --after v2.ir.json --out summary.json

# With custom config
ir-diff explain --before old.json --after new.json --config ir-diff.config.json --out report.md
```

**Config Example:**
```json
{
  "labels": {
    "entities.*.name": "Entity name",
    "entities.*.commands": "Command definitions"
  },
  "risks": {
    "entities.*.name": "breaking",
    "entities.*.properties.*": "safe"
  }
}
```

**Status:** ✅ Complete with tests and fixtures

---

### 3. **Generator Field Access Guard**
**Location:** `C:\Projects\bolt-projects\generator-field-access-guard`

**Purpose:** Runtime tracing tool that monitors which IR fields a generator actually reads, preventing generators from accessing fields they shouldn't (like reading constraint internals when generating routes).

**Use Cases:**
- Validate generator boundary compliance
- Catch over-coupling between generators and IR
- Enforce "generators can only read public fields" contracts
- Create baseline allowlists of permitted IR access
- CI/CD validation that generators don't access forbidden fields

**Key Features:**
- Transparent IR proxy that traces field access
- Pattern-based allowlist (supports wildcards like `entities.*.name`)
- Baseline generation (`init` command)
- Validation mode (`run` command with allowlist)
- Detailed report with observed/forbidden/allowed breakdown

**CLI:**
```bash
# Generate baseline allowlist (first time)
field-guard init --input ir.json --generator ./my-generator.js --out baseline.json

# Validate generator against allowlist (CI/CD)
field-guard run --input ir.json --generator ./my-generator.js --allowlist baseline.json --out report.json
```

**Allowlist Example:**
```json
[
  "entities.*.name",
  "entities.*.properties.*",
  "entities.*.commands.*.name",
  "modules.*"
]
```

**Exit Codes:**
- `0` - All access within allowlist
- `1` - Forbidden paths detected (fails CI)

**Status:** ✅ Complete with tests and fixtures

---

## Other Tools in bolt-projects

### 4. **Event Intake**
**Location:** `C:\Projects\bolt-projects\event-intake`
**Purpose:** Unknown - needs investigation

### 5. **Sales Reporting PDF Engine**
**Location:** `C:\Projects\bolt-projects\sales-reporting-pdf-engine`
**Purpose:** Unknown - possibly related to capsule-pro business logic, not Manifest tooling

### 6. **Stress Simulator**
**Location:** `C:\Projects\bolt-projects\stress-simulator`
**Purpose:** Unknown - possibly load testing tool

---

## Suggested Additional Tools

### 7. **IR Schema Validator** (High Priority)
**Purpose:** Validate IR JSON against the official `ir-v1.schema.json` and catch malformed IR before runtime.

**Why Needed:**
- Catch compiler bugs that produce invalid IR
- Validate hand-crafted IR (if anyone does that)
- CI/CD gate: "no invalid IR gets committed"

**CLI Design:**
```bash
ir-validate --schema docs/spec/ir/ir-v1.schema.json --ir test.ir.json

# Validate all fixtures
ir-validate --schema docs/spec/ir/ir-v1.schema.json --dir src/manifest/conformance/fixtures
```

**Features:**
- JSON Schema validation
- Clear error messages with paths to violations
- Batch validation mode
- Exit code 1 on any validation failure

---

### 8. **Conformance Fixture Generator** (Medium Priority)
**Purpose:** AI-assisted tool that generates conformance fixtures from natural language descriptions.

**Why Needed:**
- Makes it easier to add new conformance tests
- Ensures fixture format consistency
- Speeds up test-driven language development

**CLI Design:**
```bash
conform-gen --spec "Order entity with status guard that prevents duplicate submission" --out fixtures/28-duplicate-prevention.manifest

# Interactive mode
conform-gen --interactive
```

**Features:**
- Generates `.manifest` source
- Compiles to `.ir.json`
- Creates placeholder `.results.json` with expected structure
- Prompts user to fill in expected results

---

### 9. **Guard Expression Debugger** (Medium Priority)
**Purpose:** Interactive REPL for testing guard expressions with mock entity state.

**Why Needed:**
- Guards are where most Manifest programs fail
- Helps developers understand guard evaluation
- Teaches guard semantics interactively

**CLI Design:**
```bash
guard-debug --ir test.ir.json

> entity Order id order-1 { status: "draft", items: [] }
Created Order(order-1)

> eval self.status == "draft"
true

> eval self.items.length > 0
false

> run command submit
❌ Guard 1 failed: self.items.length > 0
   Resolved: { self.items.length: 0 }
```

**Features:**
- Seed entities with mock state
- Evaluate expressions in isolation
- Run commands and see which guard fails
- Show resolved values for each guard

---

### 10. **IR Provenance Verifier** (Low Priority)
**Purpose:** Verify IR provenance metadata (contentHash, irHash, compilerVersion) for tamper detection.

**Why Needed:**
- Catch hand-edited IR files
- Ensure IR came from trusted compiler
- Enable "only execute verified IR" production mode

**CLI Design:**
```bash
ir-verify --ir production.ir.json --require-provenance

# Verify batch
ir-verify --dir deploy/ --require-provenance
```

**Features:**
- Recalculate contentHash and compare
- Verify irHash integrity
- Check compiler version compatibility
- Fail CI if provenance missing or invalid

---

### 11. **Runtime Performance Profiler** (Low Priority)
**Purpose:** Measure runtime performance of command execution, guard evaluation, and computed property recalculation.

**Why Needed:**
- Identify performance bottlenecks in Manifest programs
- Validate that computed properties aren't over-recomputing
- Help developers optimize their `.manifest` specs

**CLI Design:**
```bash
runtime-prof --ir test.ir.json --script benchmark-script.json --out profile.json

# Generate flame graph
runtime-prof --ir test.ir.json --script benchmark-script.json --flamegraph profile.svg
```

**Features:**
- Time each command execution
- Break down guard evaluation time
- Track computed property recalculations
- Flame graph visualization
- JSON output for CI tracking

---

### 12. **Migration Assistant** (Low Priority, Future)
**Purpose:** Automated tool to migrate `.manifest` files from one Manifest version to another.

**Why Needed:**
- Breaking changes to syntax require manual rewrites
- Large codebases have many `.manifest` files
- Reduces migration friction for users

**CLI Design:**
```bash
manifest-migrate --from v0.3 --to v0.4 --input old.manifest --out new.manifest

# Batch migration
manifest-migrate --from v0.3 --to v0.4 --dir src/manifests --dry-run
```

**Features:**
- AST-based transformations (not regex)
- Dry-run mode shows diff preview
- Handles syntax changes automatically
- Reports unsupported migrations for manual review

---

## Tool Priority Matrix

| Tool | Priority | Effort | Value | Status |
|------|----------|--------|-------|--------|
| IR Consumer Test Harness | HIGH | ✅ Done | Critical for external consumers | Complete |
| IR Diff Explainer | HIGH | ✅ Done | Critical for version management | Complete |
| Generator Field Access Guard | HIGH | ✅ Done | Critical for generator contracts | Complete |
| IR Schema Validator | HIGH | Low | Catches invalid IR early | **Recommended Next** |
| Guard Expression Debugger | MEDIUM | Medium | Developer experience win | **Nice to Have** |
| Conformance Fixture Generator | MEDIUM | Medium | Speeds up test creation | Nice to Have |
| Runtime Performance Profiler | LOW | High | Optimization aid | Future |
| IR Provenance Verifier | LOW | Low | Security/integrity | Future |
| Migration Assistant | LOW | High | Only needed on breaking changes | Future |

---

## Integration with Manifest

All tools follow these principles:

1. **Adapter Pattern:** External tools import from adapters, not deep internals
2. **IR-First:** Tools consume IR JSON, not `.manifest` source (unless needed)
3. **Deterministic Output:** Stable, diff-friendly JSON/text output
4. **CLI + API:** Both command-line and programmatic usage
5. **Vitest Integration:** Can be used in test suites
6. **TypeScript Strict:** No `any`, full type safety

---

## Contributing New Tools

When building new Manifest tools:

1. **Follow the harness pattern:**
   - Single adapter file for Manifest imports
   - CLI with `commander`
   - Vitest for tests
   - README with examples

2. **Make output deterministic:**
   - Sort JSON keys
   - Use stable ordering
   - Allow freezing timestamps for snapshots

3. **Think portability:**
   - Can this tool work on any IR-first language?
   - Should it be Manifest-specific or generic?

4. **Document the "why":**
   - What problem does this solve?
   - Who uses it and when?
   - Example use cases

---

## Questions?

For tool suggestions or improvements, file an issue referencing this doc.
