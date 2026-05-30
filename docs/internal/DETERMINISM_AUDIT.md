# Manifest Determinism Audit

Last updated: 2026-02-12
Status: Active
Authority: Advisory
Enforced by: npm test, manual review

## Executive Summary

This audit identifies and categorizes all sources of nondeterminism in the Manifest codebase. The audit follows the principle that **identical IR + identical runtime context must produce identical results**. Nondeterminism is categorized as either CONFIGURABLE (acceptable when explicitly configured) or HARDCODED (requires remediation).

The audit found **12 sources of nondeterminism**, with **9 requiring remediation** and **3 being safely configurable**.

## Nondeterministic Sources

### Category: CONFIGURABLE (Good)

These sources of nondeterminism are acceptable because they are explicitly configurable through runtime options, allowing callers to ensure determinism when needed.

| File | Line | Source | Type | Status |
|------|------|--------|------|--------|
| `src/manifest/runtime-engine.ts` | 170, 43, 519 | `crypto.randomUUID()` for ID generation | CONFIGURABLE | ✅ Acceptable |
| `src/manifest/runtime-engine.ts` | 513 | `Date.now()` for timestamps | CONFIGURABLE | ✅ Acceptable |
| `src/manifest/runtime-engine.ts` | 1308, 1315, 1330 | `Promise.all()` for parallel evaluation | CONFIGURABLE | ✅ Acceptable |

**Rationale**: These are configurable through:
- `generateId` option for ID generation
- `now` option for timestamps
- Inherent parallel execution model that's part of the language design

### Category: HARDCODED (Needs Fixing)

These sources introduce nondeterminism that cannot be controlled by runtime configuration and require remediation.

| File | Line | Source | Type | Impact | Remediation |
|------|------|--------|------|--------|-------------|
| `src/manifest/ir-cache.ts` | 53 | `cache.keys().next().value` for cache eviction | HARDCODED | Map iteration order | Use LRU cache with explicit ordering |
| `src/manifest/ir-cache.ts` | 84 | `Array.from(cache.keys())` for stats | HARDCODED | Map iteration order | Sort keys before returning |
| `src/manifest/ir-cache.ts` | 95 | `cache.entries()` for cleanup | HARDCODED | Map iteration order | Sort entries before iteration |
| `src/manifest/ir-compiler.ts` | 83 | `Object.keys().sort()` for JSON serialization | HARDCODED | Sorting optimization | Use deterministic sort function |
| `src/manifest/runtime-engine.ts` | 577 | `Object.keys().sort()` for JSON serialization | HARDCODED | Sorting optimization | Use deterministic sort function |
| `src/manifest/ir-cache.ts` | 33, 59, 92 | `Date.now()` for timestamping | HARDCODED | Time-based expiration | Acceptable for caching |
| `src/manifest/stores.node.ts` | 43, 165 | `crypto.randomUUID()` for server IDs | HARDCODED | Random ID generation | Make configurable |
| `src/project-template/templates.ts` | 1442, 1490, 1979, 2006 | `crypto.randomUUID()` for template IDs | HARDCODED | Random ID generation | Acceptable for templates |
| `src/project-template/runtime.ts` | 64, 112 | `crypto.randomUUID()` for runtime IDs | HARDCODED | Random ID generation | Acceptable for runtime |

## Detailed Analysis

### Critical Issues Requiring Immediate Attention

1. **Map Iteration Order in IR Cache** (`src/manifest/ir-cache.ts`)
   - **Problem**: Lines 53, 84, 95 use Map iteration which is nondeterministic
   - **Impact**: Cache eviction order and stats reporting vary between runs
   - **Fix**: Implement LRU cache with explicit ordering

2. **Object Key Sorting** (`src/manifest/ir-compiler.ts` & `src/manifest/runtime-engine.ts`)
   - **Problem**: Lines 83 and 577 use `Object.keys().sort()` for JSON serialization
   - **Impact**: Hash computation can vary between JavaScript engines
   - **Fix**: Use a deterministic sort function with explicit comparator

### Lower Priority Issues

3. **Server-side ID Generation** (`src/manifest/stores.node.ts`)
   - **Problem**: Lines 43 and 165 hardcode `crypto.randomUUID()`
   - **Impact**: Server stores generate random IDs deterministically
   - **Fix**: Add `generateId` option to PostgresStore and SupabaseStore

4. **Template ID Generation** (`src/project-template/templates.ts`)
   - **Problem**: Multiple lines use `crypto.randomUUID()` for generated code
   - **Impact**: Generated code contains random IDs
   - **Assessment**: Acceptable for templates as they're not part of the core runtime

## Remediation Plan

### Phase 1: Critical Fixes (High Priority)

1. **Fix IR Cache Nondeterminism**
   ```typescript
   // In src/manifest/ir-cache.ts
   class LRU_CACHE {
     private cache: Map<string, CacheEntry> = new Map();
     private keys: string[] = []; // Track insertion order

     get(key: string): CacheEntry | null {
       const index = this.keys.indexOf(key);
       if (index === -1) return null;

       // Move to end (LRU)
       this.keys.splice(index, 1);
       this.keys.push(key);
       return this.cache.get(key)!;
     }

     set(key: string, value: CacheEntry): void {
       if (this.keys.includes(key)) {
         this.keys.splice(this.keys.indexOf(key), 1);
       }
       this.keys.push(key);
       this.cache.set(key, value);
     }

     getStats(): { size: number; keys: string[] } {
       return {
         size: this.cache.size,
         keys: [...this.keys], // Deterministic order
       };
     }
   }
   ```

2. **Fix JSON Serialization Determinism**
   ```typescript
   // In src/manifest/ir-compiler.ts and src/manifest/runtime-engine.ts
   function deterministicStringify(obj: any): string {
     return JSON.stringify(obj, (key, value) => {
       if (value && typeof value === 'object') {
         // Sort object keys deterministically
         const sorted: any = {};
         Object.keys(value)
           .sort((a, b) => a.localeCompare(b))
           .forEach(k => {
             sorted[k] = value[k];
           });
         return sorted;
       }
       return value;
     });
   }
   ```

### Phase 2: Server-side Improvements (Medium Priority)

1. **Add Configurable ID Generation to Server Stores**
   ```typescript
   // In src/manifest/stores.node.ts
   export class PostgresStore<T extends EntityInstance> {
     constructor(
       config: PostgresConfig,
       generateId?: () => string  // Add this option
     ) {
       this.generateId = generateId || (() => crypto.randomUUID());
     }
   }
   ```

### Phase 3: Template Improvements (Low Priority)

1. **Review Template ID Generation Strategy**
   - Current usage in templates is acceptable for generated code
   - Consider adding options for deterministic ID generation if needed

## Replay Safety Guidelines

### Existing Replay-Safe Patterns

1. **IR-first Architecture**
   - ✅ IR is the single source of truth
   - ✅ Generated code is a view, not source of truth
   - ✅ Runtime execution depends only on IR and context

2. **Deterministic Hashing**
   - ✅ Content hash computed from source manifest
   - ✅ IR hash computed from canonical representation
   - ✅ Provenance verification ensures IR integrity

3. **Strict Guard Evaluation**
   - ✅ Guards evaluated in order, execution halts on first failure
   - ✅ No auto-repair or fallback behavior
   - ✅ Diagnostics explain failures but don't alter execution

4. **Configuration-based Nondeterminism**
   - ✅ ID generation is configurable via `generateId` option
   - ✅ Timestamps are configurable via `now` option
   - ✅ Parallel execution is inherent to language design

### New Guidelines for Development

1. **Avoid Random Values in Core Logic**
   - Never use `Math.random()` or `crypto.randomUUID()` in core compilation or runtime
   - Always provide configurable alternatives for nondeterministic operations

2. **Sort All Object Iterations**
   - Always sort object keys before iteration or serialization
   - Use `Object.keys().sort((a, b) => a.localeCompare(b))` for deterministic order

3. **Use LRU Caches with Explicit Ordering**
   - Never rely on Map/Set iteration order
   - Implement explicit ordering for cache operations

4. **Document Nondeterministic Sources**
   - Clearly document any remaining nondeterministic sources
   - Explain why they're acceptable and how they can be made deterministic

5. **Test for Determinism**
   - Add tests to verify identical inputs produce identical outputs
   - Test replay behavior for all critical operations

## Testing Recommendations

1. **Add Determinism Tests**
   ```typescript
   test('Identical IR + context produces identical results', () => {
     const ir = compileToIR(source);
     const context = { user: { id: 'test' } };

     const result1 = runtime.runCommand('test', {}, context);
     const result2 = runtime.runCommand('test', {}, context);

     expect(result1).toEqual(result2);
   });
   ```

2. **Cache Determinism Tests**
   ```typescript
   test('IR cache operations are deterministic', () => {
     const cache = new IRCache();
     const hash = 'test';

     cache.set(hash, { ir: testIR, timestamp: Date.now(), sourceHash: hash });
     const stats1 = cache.getStats();
     const stats2 = cache.getStats();

     expect(stats1.keys).toEqual(stats2.keys); // Order should be identical
   });
   ```

## Conclusion

The Manifest codebase has a strong foundation for determinism with its IR-first architecture. The identified issues are primarily in supporting infrastructure rather than core language semantics. By implementing the recommended fixes, the system will achieve full determinism while maintaining flexibility for real-world use cases.

The audit reveals that most nondeterministic sources are either safely configurable or in auxiliary components. Core language execution remains deterministic, which is the most critical aspect for a business rules DSL.

---

*Generated on: ${new Date().toISOString()}*
*Audit tool: Claude Code*