# Computed Property Caching

A computed property can declare a cache strategy so its value is memoized rather than recomputed on every read. Three strategies are available: per-command (`request`), per-engine-lifetime (`session`), and time-bounded (`ttl`).

## Syntax

The cache modifier follows the computed property's expression. From the conformance fixture `src/manifest/conformance/fixtures/65-computed-property-caching.manifest`:

```
entity Product {
  property required price: number
  property quantity: number = 1
  property taxRate: number = 0

  computed subtotal: number = price * quantity cache request
  computed total: number = subtotal * (1 + taxRate / 100) cache session
  computed margin: number = subtotal * 0.3 cache ttl 300
  computed label: string = "Product"
}

store Product in memory
```

`cache request` and `cache session` are bare strategies. `cache ttl 300` requires a numeric argument interpreted as a TTL in seconds. A computed property with no `cache` clause (like `label`) is recomputed on every read.

## Behavior

`cache`, `request`, `session`, and `ttl` are reserved keywords in `src/manifest/lexer.ts`. The parser's `parseComputedCache()` (`src/manifest/parser.ts`) runs after the expression: it consumes `cache`, then expects one of `request`, `session`, or `ttl`. For `ttl` it reads a following `NUMBER` token (throwing if absent) and stores `{ strategy: 'ttl', ttlSeconds: <n> }`; the other two store `{ strategy: 'request' }` or `{ strategy: 'session' }`. The cache config is attached to the `ComputedPropertyNode` (type `ComputedPropertyCache` in `src/manifest/types.ts`) and carried through to the IR.

The runtime engine implements the strategies with two caches keyed by `entityName:instanceId:propertyName`:

- `request`: stored in a request-scoped cache (`computedPropertyRequestCache`) that is cleared per command execution. The value survives repeated reads within a single command but not across commands.
- `session`: stored in the long-lived `computedPropertyCache` for the lifetime of the engine instance.
- `ttl`: stored in the same long-lived cache, but on read the entry is only returned when `getNow() - computedAt < ttlSeconds * 1000`; once expired the entry is deleted and the value is recomputed.

On a cache hit the engine returns `{ value, stale, cached: true }`; on a miss it evaluates the expression, stores the result (when a strategy is configured), and returns `cached: false`. Cache entries are not silently wrong when inputs change: when a mutation touches a property that a cached computed depends on, the engine marks the matching cache entries `stale` in both the session/TTL and request caches, and propagates staleness transitively to computed properties that depend on other computed properties. The stale flag is surfaced on the read result rather than forcing an immediate recompute. Because `ttl` uses `getNow()`, expiry honors the deterministic clock supplied via `RuntimeOptions.now`.

### Dependency extraction

Staleness keys on the names of the instance properties a computed reads. Those names are collected at parse time by `extractDependencies()` (`src/manifest/parser.ts`) from the computed's expression and carried on the IR. It captures bare identifiers **and** member access on `self`/`this`: `computed tax = self.subtotal * self.taxRate` correctly lists `subtotal` and `taxRate` as dependencies. (Earlier versions only captured bare identifiers, so member references like `self.subtotal` listed _no_ dependencies and the cache never went stale when those fields changed.) References through `user.*` and `context.*` are excluded — they are not instance properties — while a nested `self.a.b` recurses to capture `a`. This mirrors the `self`/`this` member check in the IR compiler's guard/constraint analysis.

## How it maps to projections

Caching is a runtime evaluation concern; the cache strategy is metadata carried on the computed property in the IR. There is no dedicated database or schema projection for it — a projection that evaluates computed properties would consult the strategy if it chose to.

## Notes & limitations

The `request` cache is cleared on each command boundary, so it is genuinely scoped to a single command's evaluation rather than to an HTTP request abstraction. `session` persists for the lifetime of the `RuntimeEngine` instance — there is no eviction beyond staleness marking. Dependency-driven staleness sets a flag rather than evicting; consumers decide whether to act on `stale: true`. A `ttl` clause without a numeric argument is a parse error.
