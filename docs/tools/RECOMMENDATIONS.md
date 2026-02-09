# Tool Recommendations for Manifest Ecosystem

## Executive Summary

You've built **3 critical tools** with Bolt + Opus 4.6 that form the foundation of a robust Manifest development ecosystem. This document recommends **1 immediate next tool** and outlines a strategic roadmap.

---

## What You Have (Status: ✅ Complete)

### 1. IR Consumer Test Harness
**Impact:** ⭐⭐⭐⭐⭐
Solves the **"does my generator understand IR correctly?"** problem. Critical for both Manifest development and external consumers (capsule-pro).

### 2. IR Diff Explainer
**Impact:** ⭐⭐⭐⭐
Solves the **"what changed between IR versions?"** problem. Essential for version management and documenting breaking changes.

### 3. Generator Field Access Guard
**Impact:** ⭐⭐⭐⭐
Solves the **"is my generator over-coupled to IR internals?"** problem. Enforces architectural boundaries and catches violations in CI.

---

## What You Need Next

### **IMMEDIATE: IR Schema Validator** (Build Next with Opus 4.6)

**Problem it solves:**
Right now, nothing validates that generated IR actually conforms to `docs/spec/ir/ir-v1.schema.json`. A compiler bug could silently produce malformed IR that breaks at runtime.

**Why it's urgent:**
- **Manifest is IR-first** - the IR schema is the language contract
- **No safety net** - compiler could emit invalid IR and you wouldn't know until runtime
- **Blocks external adoption** - consumers need confidence that IR is always valid
- **Easy to build** - just JSON Schema validation + CLI wrapper

**Use cases:**
1. **CI/CD Gate:** Run on every commit to validate all conformance fixtures
2. **Compiler Testing:** Validate compiler output in unit tests
3. **External Generators:** Let capsule-pro validate IR before consuming it
4. **Debug Aid:** When something breaks, first check "is the IR even valid?"

**CLI Design:**
```bash
# Validate single file
ir-validate --schema docs/spec/ir/ir-v1.schema.json --ir test.ir.json

# Validate all fixtures (CI usage)
ir-validate --schema docs/spec/ir/ir-v1.schema.json --fixtures src/manifest/conformance/fixtures

# Strict mode: fail on warnings
ir-validate --schema docs/spec/ir/ir-v1.schema.json --ir test.ir.json --strict
```

**Output Example:**
```
✅ Valid: test.ir.json
   - 3 entities
   - 12 commands
   - IR v1 schema compliant

❌ Invalid: broken.ir.json
   - entities[0].commands[2].guards: must be array (got object)
   - entities[1].properties[0].type: unknown type "decimal" (valid: string, number, boolean, array, object)
   - Missing required field: metadata.compilerVersion
```

**Implementation Prompt for Opus 4.6:**
```
Build an IR Schema Validator CLI tool for Manifest IR.

Purpose: Validate that IR JSON conforms to the official ir-v1.schema.json and catch malformed IR before runtime.

Requirements:
- TypeScript, strict types, no `any`
- Use Ajv (JSON Schema validator) for validation
- CLI with commander
- Clear error messages showing path to violation
- Batch validation mode for directories
- Exit code 1 on any failure (CI-friendly)

CLI Interface:
  ir-validate --schema <path> --ir <file>                 # Single file
  ir-validate --schema <path> --fixtures <dir>            # Batch mode
  ir-validate --schema <path> --ir <file> --strict        # Fail on warnings

Output Format:
- ✅/❌ status per file
- Human-readable error messages
- JSON path to each violation
- Summary counts at end

Include:
- package.json with Ajv dependency
- TypeScript config (strict mode)
- Vitest tests
- Fixtures: valid.ir.json, invalid.ir.json
- README with examples

Deliverable: Complete, production-ready package ready to drop into Manifest repo.
```

**Estimated Build Time:** 1-2 hours with Opus 4.6

**ROI:** ⭐⭐⭐⭐⭐ (Highest impact, lowest effort)

---

## Strategic Roadmap (Post-Validator)

### Phase 2: Developer Experience Tools (Medium Priority)

#### **Guard Expression Debugger**
**Problem:** Guards are where Manifest programs fail most often. Developers need a way to test guards interactively.

**Impact:** ⭐⭐⭐⭐
Makes Manifest **learnable**. New users can experiment with guards without writing full programs.

**When to build:** After you see users struggling with guard failures repeatedly.

---

#### **Conformance Fixture Generator**
**Problem:** Adding conformance tests is tedious - you have to write `.manifest`, compile to `.ir.json`, manually create `.results.json`.

**Impact:** ⭐⭐⭐
Speeds up **test creation** and ensures **fixture consistency**.

**When to build:** When you're adding lots of new conformance tests and the manual process becomes painful.

---

### Phase 3: Production/Performance Tools (Low Priority)

#### **Runtime Performance Profiler**
**Problem:** Some Manifest programs might run slowly, but developers don't know why.

**Impact:** ⭐⭐
Useful for **optimization**, but only after you have users with real performance complaints.

**When to build:** When someone says "my Manifest program is slow, help me find the bottleneck."

---

#### **IR Provenance Verifier**
**Problem:** Need to ensure IR hasn't been tampered with in production.

**Impact:** ⭐⭐
Security concern for **high-stakes environments**.

**When to build:** When someone wants to deploy Manifest in a security-sensitive context.

---

#### **Migration Assistant**
**Problem:** Breaking changes to Manifest syntax require manual rewrites.

**Impact:** ⭐
Only needed when you **actually make breaking changes**. Don't build until you need it.

**When to build:** When you plan a v1.0 with breaking changes from v0.x.

---

## Rejected Ideas (Don't Build These)

### ❌ Manifest Formatter/Linter
**Why not:** `.manifest` syntax is simple. Users can just use Prettier or format by hand. Low ROI.

### ❌ Manifest Language Server (LSP)
**Why not:** Huge effort for small user base. Wait until you have 100+ users writing Manifest daily.

### ❌ Visual Manifest Editor (GUI)
**Why not:** Manifest is designed for **AI**, not humans. A GUI defeats the purpose.

### ❌ Manifest Package Manager
**Why not:** No ecosystem yet. Solve this after you have 20+ reusable Manifest modules.

---

## Decision Framework

When deciding what tool to build next, ask:

1. **Does it catch bugs before runtime?** → High priority
2. **Does it make Manifest easier to learn?** → Medium priority
3. **Does it speed up development?** → Medium priority
4. **Does it only help after scale?** → Low priority, wait

**The validator fits criterion #1 perfectly.**

---

## Tool Architecture Principles

All Manifest tools should follow these patterns:

### 1. **Adapter Boundary**
Tools should import from a single adapter file, not deep internals. Example:

```typescript
// src/adapters/manifest-core.ts
export const adapter = {
  compile(source: string) { /* ... */ },
  validate(ir: IR) { /* ... */ }
};
```

**Why:** Makes tools portable and decouples them from Manifest internals.

### 2. **CLI + Programmatic API**
Every tool should have both:

```typescript
// CLI usage
ir-validate --schema schema.json --ir test.ir.json

// Programmatic usage
import { validate } from 'ir-validator';
const result = validate(ir, schema);
```

**Why:** CLI for humans/CI, API for automation/integration.

### 3. **Deterministic Output**
All tool output should be:
- Stable (same input = same output)
- Sortable (JSON keys sorted)
- Diffable (no timestamps unless in metadata section)

**Why:** Enables snapshot testing and version control diffing.

### 4. **TypeScript Strict Mode**
No `any`, no `@ts-ignore`, full type safety.

**Why:** Tools should be as robust as Manifest itself.

### 5. **Vitest for Testing**
All tools use Vitest with fixtures.

**Why:** Consistency across tooling ecosystem.

---

## Next Steps

1. **Build IR Schema Validator** (Opus 4.6, 1-2 hours)
2. **Integrate into Manifest CI** (add to GitHub Actions or equivalent)
3. **Document validator in main README** (link from "Tooling" section)
4. **Re-evaluate tool priorities** after 3-6 months of usage

---

## Questions to Consider

- **Are external users building generators yet?** If yes, they need the validator urgently.
- **Are guard failures the #1 support issue?** If yes, prioritize the guard debugger.
- **Is IR changing frequently?** If yes, the diff explainer will see heavy use.

Match tool priorities to actual pain points, not hypothetical ones.
