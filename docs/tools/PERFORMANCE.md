# Manifest Performance Guide

Authority: Advisory
Enforced by: None
Last updated: 2026-02-12

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
| Query (100 records) | ~1ms | ~10ms |

**Note**: Database stores are I/O bound. Times depend on network, query complexity, and indexes.

---

## Optimization Strategies

### 1. Enable IR Caching

Skip compilation on repeated runs:

```typescript
const result = await compile(source, {
  cache: true,
  cacheDir: '.manifest-cache'
});
```

**Benefits**:
- 100x faster on cache hits
- Lower CPU usage
- Ideal for development servers

### 2. Use Guard Ordering

Put most likely-to-fail guards first:

```manifest
command updateTodo(title: string) {
  guard title is not empty              // Fast check, likely to fail
  guard title.length < 100              // Medium check
  guard userCanEdit(this, user)        // Slow check (database query), unlikely to fail

  mutate this.title = title
}
```

**Why**: Guards short-circuit on first failure. Order by cost and failure probability.

### 3. Leverage Constraint Severity

Use `warn` for non-critical validations:

```manifest
constraint PriorityWithinRange {
  severity: warn  // Doesn't block execution
  rule: this.priority >= 1 and this.priority <= 5
  message: "Priority outside recommended range"
}
```

**Why**: Non-blocking constraints don't halt execution. Use for "nice to have" validations.

### 4. Use Computed Properties for Derived Data

Avoid redundant calculations:

```manifest
entity Order {
  property items: OrderItem[]
  property subtotal: number

  computed total {
    // Automatically recalculated when items or subtotal changes
    rule: this.subtotal + (this.items.sum(item => item.total) * 0.1)
  }
}
```

**Why**: Computed properties are cached and only recalculated when dependencies change.

### 5. Batch Operations

Execute multiple commands in a transaction:

```typescript
// Instead of:
for (const item of items) {
  await runtime.executeCommand('OrderItem', 'create', item);
}

// Use:
await runtime.executeCommand('Order', 'addItems', { items });
// Manifest handles all items in one transaction
```

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
await runtime.executeCommand('Todo', 'create', { title: 'A' });
await runtime.executeCommand('Todo', 'create', { title: 'B' });
```

### Multi-Tenant Isolation

Each `RuntimeEngine` instance has isolated state:

```typescript
// Separate instances for separate tenants
const runtime1 = new RuntimeEngine(ir, { tenantId: 'tenant-1' });
const runtime2 = new RuntimeEngine(ir, { tenantId: 'tenant-2' });

// These can run in parallel (different instances)
await Promise.all([
  runtime1.executeCommand('Todo', 'create', { title: 'A' }),
  runtime2.executeCommand('Todo', 'create', { title: 'B' })
]);
```

### Entity Locking

Manifest uses optimistic concurrency. Commands check entity state before execution:

```manifest
entity Todo {
  property version: number

  command update(title: string) {
    // Optimistic lock check
    guard this.version == input.version

    mutate this.title = title
    mutate this.version = this.version + 1
  }
}
```

**For pessimistic locking**: Use database-level locks in custom store.

---

## Monitoring

### Enable Debug Logging

```typescript
const runtime = new RuntimeEngine(ir, {
  userId: 'user-123',
  debug: true
});
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
const result = await runtime.executeCommand('Todo', 'create', input);
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
RuntimeEngine.executeCommand
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
  mutate this.title = title
  emit TitleUpdated { title: this.title }  // Noise
}
```

**Problem**: Too many events overwhelm consumers.

**Fix**: Emit events for business-significant changes only.

### ❌ Don't: Use memory store for large datasets

```typescript
const runtime = new RuntimeEngine(ir, {
  storeProvider: () => new MemoryStore()  // Not for production
});
```

**Problem**: Memory store doesn't persist and has poor performance for large datasets.

**Fix**: Use Postgres or Supabase store.

### ❌ Don't: Disable IR caching in production

```typescript
const result = compile(source, { cache: false });  // Slow
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

- **Store Implementation**: `docs/patterns/implementing-custom-stores.md`
- **Transactional Outbox**: `docs/patterns/transactional-outbox-pattern.md`
- **API Reference**: `docs/tools/API_REFERENCE.md`
