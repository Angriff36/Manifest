# Manifest Repository Guardrails

Last updated: 2026-02-12
Status: Active
Authority: Advisory
Enforced by: None

This document defines automated guardrails and development protocols that protect the semantic integrity of the Manifest language implementation. These guardrails prevent accidental violations of the language contract defined in the specification documents.

## Table of Contents

1. [Protected Invariants](#protected-invariants)
2. [ESLint Rules](#eslint-rules)
3. [CI/CD Checks](#cicd-checks)
4. [Pre-commit Hooks](#pre-commit-hooks)
5. [Test Requirements](#test-requirements)
6. [Documentation Requirements](#documentation-requirements)
7. [Danger Zone Protocols](#danger-zone-protocols)

---

## Protected Invariants

### 1. Command Execution Order

**Invariant**: The command execution order is semantically fixed and must not be reordered.

**Required Order** (from `docs/spec/semantics.md`):
1. Build evaluation context (`self/this`, params, runtime context)
2. Evaluate applicable **policies** (action: `execute` or `all`)
3. Evaluate command-level **constraints** (vNext)
4. Evaluate **guards** in order (halt on first falsey)
5. Execute **actions** in order
6. Emit declared **events** in order
7. Return CommandResult

**Protection Mechanisms**:
- Runtime implementation at `src/manifest/runtime-engine.ts:806-924` follows this order strictly
- Tests verify that policy denial prevents guard evaluation
- Tests verify that guard failure prevents action execution
- Tests verify that all actions execute before events are emitted
- Generated code in templates must preserve this order

**Violation Examples** (PROHIBITED):
- Adding "fallback" behavior when guards fail
- Skipping policy checks for "convenience"
- Executing actions before all guards pass
- Emitting events before actions complete
- Auto-repairing failed constraints without explicit override

### 2. IR Schema Compliance

**Invariant**: The IR schema (`docs/spec/ir/ir-v1.schema.json`) is the single source of truth for valid IR structure.

**Protection Mechanisms**:
- CI validates all conformance IR files against schema (`.github/workflows/ci.yml:35-57`)
- Schema validator tool at `tools/manifest-ir-schema-validator/`
- Breaking schema changes require:
  1. Schema version bump
  2. Fixture regeneration
  3. Runtime updates
  4. Template updates

**Violation Examples** (PROHIBITED):
- Hand-editing IR output in tests
- Adding ad-hoc IR properties not in schema
- Using `additionalProperties: false` violations to "make things work"

### 3. Semantic Guarantees

#### 3.1 Evaluation Context

**Invariant**: Expression evaluation must provide spec-guaranteed bindings.

**Required Bindings** (from `docs/spec/builtins.md`):
- `self`: Current entity instance or `null`
- `this`: Alias of `self`
- `user`: Current user object or `null`
- `context`: Runtime context object
- `now()`: Current time (milliseconds since epoch)
- `uuid()`: Globally unique identifier

**Protection Mechanisms**:
- Runtime builds context in `buildEvalContext()` at runtime-engine.ts:926-946
- Tests verify missing bindings cause correct failures (not silent defaults)
- No implicit fallbacks for missing user/context

**Violation Examples** (PROHIBITED):
- Auto-injecting default `user` object to "make demos work"
- Providing fallback `context` when none was passed
- Making `user` optional when guard requires it

#### 3.2 Expression Evaluation

**Invariant**: Expressions evaluate according to operator semantics in `docs/spec/semantics.md`.

**Protected Operator Semantics**:
- `==` and `is`: Loose equality (`undefined == null` is `true`)
- `!=`: Loose inequality
- `and`/`or`: Boolean truthiness evaluation
- `in`: Array or string membership
- `contains`: Array or string contains (reversed operands)

**Protection Mechanisms**:
- Binary operator implementation at runtime-engine.ts:1355-1388
- Conformance tests for each operator
- No operator overloading or implicit coercion beyond spec

**Violation Examples** (PROHIBITED):
- Changing `==` to strict equality for "safety"
- Making `in` work on objects (not in spec)
- Adding short-circuit evaluation beyond `and`/`or`

#### 3.3 Relationship Resolution

**Invariant**: Relationship traversal follows the semantic contract defined in `docs/spec/semantics.md:38-60`.

**Required Behavior**:
- `hasMany`: Returns array (may be empty)
- `hasOne`/`belongsTo`/`ref`: Returns instance or `null`
- Resolution synchronous within store context
- Uses foreign keys or inverse relationships

**Protection Mechanisms**:
- Relationship index at runtime-engine.ts:283-384
- Resolution logic at runtime-engine.ts:402-510
- Memoization cache (cleared per command)
- Tests for circular reference handling

**Violation Examples** (PROHIBITED):
- Making relationships async/awaitable
- Returning `undefined` instead of `null` for empty relationships
- Auto-creating related instances on access

### 4. Determinism Boundaries

**Invariant**: Determinism is required for conformance testing and reproducibility.

**Configurable Non-Determinism** (via `RuntimeOptions`):
- `generateId`: ID generation function
- `now`: Time source function

**Protection Mechanisms**:
- Conformance tests inject deterministic sources (conformance.test.ts:18-24)
- Tests verify timestamp matching in emitted events
- No hardcoded `Date.now()` or `crypto.randomUUID()` in runtime
- Runtime uses `this.options.generateId` and `this.options.now`

**Violation Examples** (PROHIBITED):
- Using `Date.now()` directly in runtime (use `this.getNow()`)
- Using `crypto.randomUUID()` directly (use `this.options.generateId()`)
- Hardcoded timestamps in test expectations
- Random IDs in fixture data

### 5. Store-Agnostic Design

**Invariant**: The runtime must not hardcode knowledge of specific store implementations.

**Protection Mechanisms**:
- Store interface at runtime-engine.ts:156-163
- Store initialization via `storeProvider` option
- No direct dependency on postgres/supabase packages in browser runtime
- Server-side stores isolated to `stores.node.ts`

**Violation Examples** (PROHIBITED):
- Importing `pg` or `@supabase/supabase-js` in runtime-engine.ts
- Hardcoding SQL queries for "optimization"
- Assuming localStorage is always available

### 6. Effect Boundary Contracts

**Invariant**: Actions `persist`, `publish`, and `effect` are adapter hooks with default no-op behavior.

**Required Behavior** (from `docs/spec/adapters.md:83-96`):
- No adapter installed: Action is no-op, returns evaluated expression value
- Adapter installed: Delegates to adapter implementation
- Adapters must be deterministic for conformance tests

**Protection Mechanisms**:
- Action execution at runtime-engine.ts:1194-1246
- Default return of `value` for all adapter actions
- No inline HTTP, database, or file system calls in runtime

**Violation Examples** (PROHIBITED):
- Adding `fetch()` calls inline in `effect` action handler
- Hardcoding `fs.writeFile()` in `persist` action
- Emitting to external event buses directly in runtime

---

## ESLint Rules

### Existing Rules

#### `manifest/no-hardcoded-versions`

**Purpose**: Prevents version string fragmentation.

**Implementation**: `eslint-rules/no-hardcoded-versions.js`

**Enforcement**: Warns on semver patterns (X.Y.Z) unless:
- File imports from `./version` or `../version`
- File is in `**/conformance/expected/**`
- File is in `**/fixtures/**`
- File is a test file (`**/*.test.ts`)

**Allowed Exception Pattern**:
```javascript
'**/conformance/expected/**',  // Generated IR with version
'**/fixtures/**',             // Test fixtures
'**/*.test.ts',               // Test files
'**/version.ts',              // Source of truth
'**/zipExporter.ts',          // Default version for projects
'**/templates.ts',            // Template placeholders
```

### Recommended Future Rules

#### `manifest/ir-immutability`

**Purpose**: Prevent runtime modification of IR structure.

**Proposed Implementation**:
```javascript
// eslint-rules/no-ir-mutation.js
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent direct mutation of IR objects',
      category: 'Possible Errors',
      recommended: true,
    },
  },
  create(context) {
    return {
      AssignmentExpression(node) {
        // Detect: ir.entities.push(...)
        // Detect: ir.commands[0] = ...
        context.report({
          node,
          message: 'IR must be immutable. Do not modify IR objects directly.',
        });
      },
    };
  },
};
```

#### `manifest/guard-order-violation`

**Purpose**: Detect attempts to bypass guard evaluation order.

**Proposed Implementation**:
```javascript
// eslint-rules/guard-order.js
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent bypassing command guard order',
    },
  },
  create(context) {
    return {
      // Detect: executeActions() without checkGuards()
      // Detect: skipGuards or similar patterns
      CallExpression(node) {
        if (node.callee.name === 'executeActions') {
          // Verify guards were checked first
        }
      },
    };
  },
};
```

#### `manifest/no-inline-effects`

**Purpose**: Prevent effectful operations in runtime core.

**Proposed Implementation**:
```javascript
// eslint-rules/no-inline-effects.js
const FORBIDDEN_CALLS = [
  'fetch',
  'fs.readFile',
  'fs.writeFile',
  'process.exit',
  'setTimeout',
  'setInterval',
];

export default {
  create(context) {
    return {
      CallExpression(node) {
        const calleeName = node.callee.name;
        if (FORBIDDEN_CALLS.includes(calleeName)) {
          context.report({
            node,
            message: `Inline effect '${calleeName}' not allowed in runtime core. Use adapters.`,
          });
        }
      },
    };
  },
};
```

#### `manifest/no-default-context`

**Purpose**: Prevent implicit user/context injection.

**Proposed Implementation**:
```javascript
// eslint-rules/no-default-context.js
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prevent default user/context injection for convenience',
    },
  },
  create(context) {
    return {
      // Detect: user ?? { id: 'default-user' }
      // Detect: context ?? {}
      LogicalExpression(node) {
        if (node.operator === '??') {
          const left = context.getSourceCode().getText(node.left);
          if (left === 'user' || left === 'context') {
            context.report({
              node,
              message: `Do not provide default ${left}. Missing bindings should fail explicitly.`,
            });
          }
        }
      },
    };
  },
};
```

---

## CI/CD Checks

### Existing CI Workflow

**File**: `.github/workflows/ci.yml`

**Current Checks**:
1. TypeScript type check (`npm run typecheck`)
2. ESLint validation (`npm run lint`)
3. Full test suite (427+ tests)
4. IR schema validation against conformance fixtures

### Recommended Additional Checks

#### IR Schema Breaking Change Detection

**Purpose**: Detect schema changes that break conformance tests.

**Implementation**:
```yaml
# .github/workflows/ci.yml
check-schema-break:
  name: Check Schema Breaking Changes
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
    - name: Install dependencies
      run: npm ci
    - name: Run conformance suite
      run: npm test
    - name: Check test count
      run: |
        ACTUAL=$(npm test -- --reporter=json | jq '.stats.tests')
        EXPECTED=448
        if [ "$ACTUAL" -lt "$EXPECTED" ]; then
          echo "ERROR: Test count dropped from $EXPECTED to $ACTUAL"
          exit 1
        fi
```

#### Command Execution Order Verification

**Purpose**: Verify runtime preserves command execution phases.

**Implementation**: Add dedicated unit test
```typescript
// src/manifest/runtime-engine/execution-order.test.ts
describe('Command Execution Order', () => {
  it('must not skip policy evaluation', async () => {
    // Test that policy denial prevents guard evaluation
  });

  it('must not skip guard evaluation', async () => {
    // Test that guard failure prevents action execution
  });

  it('must execute all actions before emitting events', async () => {
    // Test event emission timing
  });

  it('must evaluate guards in order', async () => {
    // Test early exit on first falsey guard
  });
});
```

#### Spec-Implementation Alignment Check

**Purpose**: Ensure spec and implementation are synchronized.

**Implementation**:
```yaml
# .github/workflows/spec-sync.yml
spec-sync-check:
  name: Check Spec-Implementation Alignment
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Check for nonconformance sections
      run: |
        if grep -r "Nonconformance" docs/spec/; then
          echo "WARNING: Nonconformance found in specs"
          grep -r "Nonconformance" docs/spec/
          exit 1
        fi
```

---

## Pre-commit Hooks

### Husky Setup

**Installation**:
```bash
npm install -D husky
npx husky init
```

**Configuration**: `.husky/pre-commit`

### Recommended Pre-commit Hook

```bash
#!/bin/sh
# .husky/pre-commit

. "$(dirname "$0")/_/husky.sh"

# Run lint on staged files
echo "Running ESLint..."
npx eslint --fix $(git diff --cached --name-only --diff-filter=ACM '*.ts' '*.tsx')

# Run type check
echo "Running TypeScript type check..."
npm run typecheck

# Run affected conformance tests
echo "Running conformance tests..."
npx vitest run src/manifest/conformance/conformance.test.ts

# Check for hand-edited IR files
echo "Checking for hand-edited IR..."
if git diff --cached --name-only | grep -E 'conformance/expected/.*\.ir\.json$'; then
  echo "ERROR: IR files should be generated, not hand-edited."
  echo "Run: npm run conformance:regen"
  exit 1
fi

# Check for hardcoded versions (excluding allowed paths)
echo "Checking for hardcoded versions..."
npx eslint --rule 'manifest/no-hardcoded-versions: error' $(git diff --cached --name-only --diff-filter=AM '*.ts' '*.tsx')

exit 0
```

### Pre-push Hook

```bash
#!/bin/sh
# .husky/pre-push

echo "Running full test suite..."
npm test || exit 1

echo "Running benchmarks..."
npm run bench || exit 1

exit 0
```

---

## Test Requirements

### Spec Change Test Requirements

When modifying `docs/spec/` files, the following tests are REQUIRED:

1. **IR Schema Change** (`docs/spec/ir/ir-v1.schema.json`):
   - Regenerate all conformance expected IR: `npm run conformance:regen`
   - Add new conformance fixture for changed feature
   - Update IR compiler tests
   - Update runtime to handle new IR structure

2. **Semantics Change** (`docs/spec/semantics.md`):
   - Add conformance test demonstrating new behavior
   - Update existing tests affected by change
   - Document behavior change in migration guide

3. **Builtin Change** (`docs/spec/builtins.md`):
   - Update builtin function tests
   - Verify deterministic behavior for `now()` and `uuid()`

4. **Adapter Change** (`docs/spec/adapters.md`):
   - Add adapter integration tests
   - Verify no-op default behavior

### Conformance Fixture Requirements

**Golden Rule**: Conformance fixtures are executable semantics, not "tests."

**Adding a New Fixture**:

1. **Create `.manifest` file** in `src/manifest/conformance/fixtures/`
2. **Generate expected IR**: `npm run conformance:regen`
3. **Create expected output** (if applicable):
   - `.ir.json` for IR structure
   - `.diagnostics.json` for failure cases
   - `.results.json` for runtime behavior

**Determinism Requirements**:
- Use deterministic time source in tests
- Use deterministic ID generation
- No random values in expected outputs
- Timestamps must match injected time source

**File Integrity**:
- UTF-8 without BOM for all JSON
- Stable JSON (no reordering for comparison)
- `// @ts-check` for type safety

### Test Count Validation

**Current Baseline**: 448 tests (as of version 0.3.8)

**Test Count Must Never Decrease**:
- Removing tests requires explicit justification
- Test count decrease in PR is an automatic fail
- Exceptions: Duplicate test removal, test consolidation

---

## Documentation Requirements

### Change Documentation Requirements

#### Spec Changes

Any change to `docs/spec/` requires:

1. **Update SPEC_VERSION.md** (if it exists) or changelog
2. **Add migration guide** for breaking changes
3. **Update ADR** (Architecture Decision Record) if applicable
4. **Document nonconformance** if implementation lags

#### Implementation Changes

Any change to implementation requires:

1. **Update inline comments** for complex logic
2. **Add JSDoc** for public APIs
3. **Update CLAUDE.md** if workflow changes
4. **Update AGENTS.md** if agent protocols change

### Nonconformance Documentation

**Requirement**: All nonconformance must be documented in `docs/spec/semantics.md` under "Nonconformance" section.

**Format**:
```markdown
### Nonconformance
- ~~Description of issue~~
- **RESOLVED (YYYY-MM-DD)**: How it was fixed
- **OPEN**: Issue tracking, workaround
```

**No Undocumented Nonconformance**:
- Every behavioral deviation from spec must be documented
- "Temporary" workarounds must have tracking issue
- Resolved nonconformance must have resolution date

---

## Danger Zone Protocols

### High-Risk Areas

These areas require extra scrutiny and verification:

#### 1. Spec & IR Contract

**Location**: `docs/spec/`, especially `docs/spec/ir/ir-v1.schema.json`

**Risk Level**: CRITICAL

**Protocol**:
1. Create feature branch from main
2. Draft spec change first
3. Discuss with team if possible
4. Update schema with semantic version bump if breaking
5. Regenerate ALL conformance fixtures
6. Update compiler, runtime, templates
7. Run full test suite
8. Create PR with test results

**Verification**:
- `npm test` passes (448/448)
- `npm run conformance:regen` produces valid output
- CI workflow validates schema
- No undocumented nonconformance

#### 2. Conformance Fixtures

**Location**: `src/manifest/conformance/fixtures/`, `src/manifest/conformance/expected/`

**Risk Level**: CRITICAL

**Protocol**:
1. Fixtures describe required behavior, not observed behavior
2. Never edit `.ir.json` files by hand
3. Use `npm run conformance:regen` after source changes
4. Verify test actually tests the intended behavior

**Verification**:
- Fixture compiles without errors
- Expected output matches spec semantics
- Test fails when implementation is wrong

#### 3. Runtime Behavior

**Location**: `src/manifest/runtime-engine.ts`

**Risk Level**: HIGH

**Protocol**:
1. Changes to execution order require spec update first
2. New builtin functions require spec update
3. Adapter hooks must remain no-ops by default
4. Maintain determinism boundaries

**Verification**:
- All existing tests still pass
- New tests for changed behavior
- Manual verification via Runtime UI

#### 4. Compiler & IR Generation

**Location**: `src/manifest/ir-compiler.ts`

**Risk Level**: HIGH

**Protocol**:
1. IR shape changes require schema update
2. Compiler normalization must preserve semantics
3. No special cases for "convenience"
4. Generated IR validates against schema

**Verification**:
- Conformance tests pass
- IR schema validation passes
- No test-only compiler paths

#### 5. Export Templates

**Location**: `src/manifest/projections/nextjs/templates.ts`

**Risk Level**: MEDIUM

**Protocol**:
1. Templates must track real implementation
2. No "optimizations" that change semantics
3. Guard/order preservation in generated code
4. Update templates when implementation changes

**Verification**:
- Generated code has same execution order
- Smoke tests pass
- No template drift warnings

### Change Classification Matrix

| Change Type | Risk Level | Required Actions |
|-------------|-------------|-------------------|
| Spec clarification (no behavior change) | LOW | Docs update only |
| Bug fix (implementation matches spec) | MEDIUM | Add test, fix code |
| Spec addition (new feature) | HIGH | Spec first, then tests, then implementation |
| Spec change (breaking) | CRITICAL | Major version bump, full conformance regen, migration guide |
| Template update only | LOW-MEDIUM | Verify alignment with implementation |
| Test addition (no spec change) | LOW | Add test, verify it fails on broken impl |

### Pre-Change Checklist

Before committing to danger zones:

- [ ] I have read the relevant spec section
- [ ] I understand the current behavior
- [ ] I have a test that reproduces current/expected behavior
- [ ] For spec changes: I've updated docs first
- [ ] For breaking changes: I've bumped version
- [ ] `npm test` passes completely
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] Manual verification done if UI affected
- [ ] Documentation updated
- [ ] Nonconformance documented (if applicable)

---

## Appendices

### A. ESLint Rule Template

```javascript
// eslint-rules/[rule-name].js
/**
 * Rule purpose and motivation
 * @see ../../docs/spec/[relevant-section].md
 */

export default {
  meta: {
    type: 'problem', // or 'suggestion', 'layout'
    docs: {
      description: 'Full description of what this prevents',
      category: 'Possible Errors' | 'Best Practices' | 'Security',
      recommended: true | false,
    },
    schema: [], // Options schema
    messages: {
      messageId: 'Error message with {{placeholder}}',
    },
  },
  create(context) {
    return {
      // AST visitor methods
      Identifier(node) {
        context.report({
          node,
          messageId: 'messageId',
          data: { placeholder: 'value' },
        });
      },
    };
  },
};
```

### B. Conformance Test Template

```typescript
// src/manifest/conformance/fixtures/feature-name.manifest
// Purpose: Test [specific behavior]
// Spec reference: docs/spec/[section].md

entity Test {
  // ... entity definition
}

command testCommand {
  // ... command definition
}
```

```typescript
// src/manifest/conformance/expected/feature-name.results.json
{
  "setup": {
    "createInstance": { ... }
  },
  "tests": [
    {
      "name": "describes expected behavior",
      "command": { ... },
      "expectedResult": { ... }
    }
  ]
}
```

### C. CI Workflow Template

```yaml
# .github/workflows/[check-name].yml
name: [Check Name]

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check:
    name: [Check Display Name]
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run check
        run: npm run [your-check-script]
```

---

## Summary

These guardrails protect the following core principles:

1. **IR is Authority**: Schema defines valid IR; all generated code derives from it
2. **Determinism Over Convenience**: Identical inputs produce identical outputs
3. **Explicitness Over Inference**: No hidden defaults or auto-repair
4. **Diagnostics Explain, Never Compensate**: Failures surface details; execution stops
5. **Spec-Driven Development**: Behavior changes start with spec, then tests, then code

**Any violation of these guardrails is a regression, not a UX improvement.**

For questions or clarifications, refer to:
- `CLAUDE.md` - Project overview and development workflow
- `AGENTS.md` - Agent protocols and non-negotiables
- `docs/spec/` - Language specification documents
