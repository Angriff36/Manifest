# Manifest Performance Guide

Authority: Advisory
Enforced by: None
Last updated: 2026-05-20
Applies to: `@angriff36/manifest@2.3.0+`

Performance characteristics and optimization strategies for Manifest.

---

## Benchmarks

### Compilation Performance

| Program Size | Compile Time | IR Cache Hit |
|--------------|--------------|--------------|
| Small (~10 entities) | ~5ms | <1ms |
| Medium (~50 entities) | ~15ms | <1ms |
| Large (~200 entities) | ~50ms | <1ms |

**IR Caching**: Enable IR caching to skip compilation on repeated runs. Subsequent loads are ~100x faster.

### Runtime Performance

| Operation | Time (Memory Store) | Time (Postgres) |
|-----------|---------------------|-----------------|
| Command execution | ~0.1ms | ~5-20ms |
| Guard evaluation | ~0.01ms/guard | N/A |
| Constraint check | ~0.02ms/constraint | N/A |
| Event emission | ~0.05ms/event | ~1-5ms |

**Note**: Database stores are I/O bound. Times depend on network, query complexity, and indexes.

---

## Optimization Strategies

### 1. Enable IR Caching

Skip compilation on repeated runs:

```typescript
import { compileToIR } from '@angriff36/manifest/ir-compiler';

const result = await compileToIR(source, { useCache: true });
```

**Benefits**:
- 100x faster on cache hits
- Lower CPU usage
- Ideal for development servers

### 2. Use Guard Ordering

Put most likely-to-fail guards first:

```manifest
command updateTodo(title: string) {
  guard title != ""
  guard title.length < 100

  mutate title = title
}
```

**Why**: Guards short-circuit on first failure. Order by cost and failure probability.

### 3. Leverage Constraint Severity

Use `warn` for non-critical validations:

```manifest
entity Order {
  constraint priorityRange:warn self.priority >= 1 and self.priority <= 5 "Priority outside recommended range"
}
```

**Why**: Non-blocking constraints don't halt execution. Use for "nice to have" validations.

### 4. Use Computed Properties for Derived Data

Avoid redundant calculations:

```manifest
entity Order {
  property subtotal: number = 0

  computed total: number = self.subtotal * 1.1
}
```

**Why**: Computed properties are cached and only recalculated when dependencies change.

### 5. Batch Operations

The runtime executes commands sequentially. There is no built-in
multi-command transaction; commit boundaries are owned by the underlying
`Store` adapter, not by `runCommand`. To reduce per-call overhead, model
batching at the command level — design a command that accepts an array
of items and applies them in a single store call.

```typescript
// Many fine-grained command invocations:
for (const item of items) {
  await runtime.runCommand('create', item, { entityName: 'OrderItem' });
}

// One coarse-grained command that owns its own batch semantics:
await runtime.runCommand('addItems', { items }, { entityName: 'Order' });
```

The Manifest runtime does NOT wrap multiple `runCommand` calls in a
single transaction. If you need atomic multi-entity writes, either:

- Model them as a single command that does all the work, or
- Use a `Store` adapter that exposes its own transaction handle and
  thread it through. See `docs/guides/implementing-custom-stores.md`.

### 6. Optimize Store Queries

For custom stores, add indexes on frequently queried fields:

```sql
CREATE INDEX idx_entity_tenant ON entity (tenant_id, deleted_at);
CREATE INDEX idx_entity_created ON entity (created_at DESC);
```

**Query patterns**:
- Filter by `tenantId` (multi-tenancy)
- Filter by `deletedAt IS NULL` (soft deletes)
- Sort by `createdAt DESC` (recent first)

### 7. Use Event Batching

Emit multiple events in one command:

```manifest
command completeOrder() {
  // Single command emits multiple events
  emit OrderCompleted { orderId: this.id }
  emit PaymentProcessed { orderId: this.id, amount: this.total }
  emit InventoryUpdated { items: this.items }
}
```

**Why**: Fewer command executions = fewer database transactions.

---

## Memory Usage

### Memory Store

| Entity Count | Memory Usage |
|--------------|--------------|
| 100 | ~50KB |
| 1,000 | ~500KB |
| 10,000 | ~5MB |
| 100,000 | ~50MB |

**Guidelines**:
- Use for <10,000 entities per tenant
- Perfect for development and testing
- Not suitable for production-scale data

### IR Size

| Program Size | IR Size (JSON) |
|--------------|----------------|
| Small (10 entities) | ~5KB |
| Medium (50 entities) | ~25KB |
| Large (200 entities) | ~100KB |

**Note**: IR is compact. Most size comes from entity names and property names.

---

## Concurrency

### Single-Threaded Execution

Manifest runtime is single-threaded. Commands execute sequentially.

```typescript
// Commands execute one at a time
await runtime.runCommand('create', { title: 'A' }, { entityName: 'Todo' });
await runtime.runCommand('create', { title: 'B' }, { entityName: 'Todo' });
```

### Multi-Tenant Isolation

Each `RuntimeEngine` instance has isolated state:

```typescript
// Separate instances for separate tenants
const runtime1 = new RuntimeEngine(ir, { tenantId: 'tenant-1' });
const runtime2 = new RuntimeEngine(ir, { tenantId: 'tenant-2' });

// These can run in parallel (different instances)
await Promise.all([
  runtime1.runCommand('create', { title: 'A' }, { entityName: 'Todo' }),
  runtime2.runCommand('create', { title: 'B' }, { entityName: 'Todo' })
]);
```

### Entity Locking

Manifest uses optimistic concurrency. Commands check entity state before execution:

```manifest
entity Todo {
  property version: number = 0

  command update(title: string, expectedVersion: number) {
    guard self.version == expectedVersion
    mutate title = title
    mutate version = self.version + 1
  }
}
```

**For pessimistic locking**: Use database-level locks in custom store.

---

## Monitoring

### Enable profiling

```typescript
const runtime = new RuntimeEngine(
  ir,
  { actorId: 'user-123' },
  { profiling: { enabled: true } }
);
```

**Logs**:
- Command execution start/end
- Guard evaluation results
- Constraint validation results
- Event emissions

### Performance Metrics

Track execution time:

```typescript
const start = performance.now();
const result = await runtime.runCommand('create', input, { entityName: 'Todo' });
const duration = performance.now() - start;

console.log(`Command executed in ${duration}ms`);
```

### Memory Profiling

For Node.js:

```javascript
const used = process.memoryUsage();
console.log({
  rss: Math.round(used.rss / 1024 / 1024) + 'MB',
  heapTotal: Math.round(used.heapTotal / 1024 / 1024) + 'MB',
  heapUsed: Math.round(used.heapUsed / 1024 / 1024) + 'MB',
  external: Math.round(used.external / 1024 / 1024) + 'MB'
});
```

---

## Scaling Strategies

### Vertical Scaling

Single-server deployment:

- Use database stores (Postgres, Supabase)
- Enable connection pooling
- Use IR caching
- Optimize database queries

### Horizontal Scaling

Multi-server deployment:

- Use shared database store
- Each server runs independent `RuntimeEngine` instances
- Database handles concurrency
- Use tenant-specific routing

### Caching Strategies

1. **IR Cache**: Cache compiled IR (`.manifest-cache/`)
2. **Query Cache**: Cache frequently accessed entities
3. **Compute Cache**: Use computed properties for derived data

---

## Performance Testing

Run benchmarks:

```bash
npm run bench
```

Output:

```
RuntimeEngine.runCommand
  ✓ Simple command (no guards)         ~0.1ms
  ✓ Command with 3 guards              ~0.15ms
  ✓ Command with constraints           ~0.2ms
  ✓ Command with events                ~0.25ms

MemoryStore
  ✓ Create 100 entities                ~2ms
  ✓ Query 100 entities                 ~1ms
  ✓ Update 100 entities                ~5ms

IRCompiler.compile
  ✓ Small program (10 entities)        ~5ms
  ✓ Medium program (50 entities)       ~15ms
  ✓ Large program (200 entities)       ~50ms
  ✓ Cached compile (hit)               ~0.1ms
```

---

## Common Performance Pitfalls

### ❌ Don't: Query in guards

```manifest
guard userCanEdit(this, user)  // Database query in guard
```

**Problem**: Guards execute frequently. Database queries add latency.

**Fix**: Cache user permissions in runtime context.

### ❌ Don't: Emit events for every state change

```manifest
command updateTitle(title: string) {
  mutate title = title
  emit TitleUpdated
}
```

**Problem**: Too many events overwhelm consumers.

**Fix**: Emit events for business-significant changes only.

### ❌ Don't: Use memory store for large datasets

**Fix:** Use Postgres or Supabase via `@angriff36/manifest/stores`, or implement a custom `Store` and pass it through `storeProvider`.

### ❌ Don't: Disable IR caching in production

```typescript
```typescript
import { compileToIR } from '@angriff36/manifest/ir-compiler';
const result = await compileToIR(source, { useCache: false });  // Slow
```
```

**Problem**: Recompiling on every request wastes CPU.

**Fix**: Enable IR caching and warm cache on startup.

---

## Performance Checklist

Before deploying to production:

- [ ] IR caching enabled
- [ ] Database stores configured
- [ ] Database indexes created
- [ ] Guards ordered by cost
- [ ] Constraint severity set appropriately
- [ ] Event emissions minimized
- [ ] Memory profiling done
- [ ] Load testing completed
- [ ] Monitoring configured
- [ ] Connection pooling configured

---

## Further Reading

- **Store Implementation**: `docs/guides/implementing-custom-stores.md`
- **Transactional Outbox**: `docs/guides/transactional-outbox.md`
- **API Reference**: `docs/tools/API_REFERENCE.md`
