# Transactional Outbox Pattern

This document describes an application-level pattern for reliable delivery of events emitted by Manifest command execution.

~~This is not core language semantics. Semantics remain defined by `C:/Projects/Manifest/docs/spec/semantics.md`.~~

> **Correction (2026-07-15) @RYANSIGNED:** Manifest ships a first-party outbox
> (`@angriff36/manifest/outbox`, `RuntimeOptions.outboxStore` /
> `transactionProvider`). Prefer wiring `OutboxStore` so the runtime enqueues
> on successful `runCommand` (see `mintlify/adapters/outbox.mdx`). The DIY sketch
> below remains valid for hosts that persist outbox rows outside the engine; it
> is not the only path. Language semantics remain in `docs/spec/semantics.md`.

## Goal

Ensure entity mutation and event persistence happen atomically in your storage transaction so events are not lost.

## Pattern

1. Run command through `RuntimeEngine.runCommand`.
2. Collect emitted events from command result (or event listener).
3. In your store transaction, persist domain mutation and outbox rows together.
4. Process outbox rows asynchronously with retry and idempotency.

## Sketch

```ts
const result = await runtime.runCommand('createOrder', input, {
  entityName: 'Order',
  instanceId: orderId,
});

if (!result.success) return result;

await db.transaction(async (tx) => {
  await tx.order.update({ id: orderId, ...mutationData });

  for (const event of result.emittedEvents) {
    await tx.outbox.insert({
      eventName: event.name,
      channel: event.channel,
      payload: event.payload,
      aggregateId: orderId,
    });
  }
});
```

## Requirements

- Outbox writes must be in the same transaction as business mutation.
- Outbox processors must be idempotent.
- Retry behavior must be explicit and bounded.

## Do Not

- Do not publish to external brokers before transactional persistence.
- Do not treat this pattern as replacing runtime command semantics.

## Related

- ~~`C:/Projects/Manifest/docs/spec/adapters.md`~~ → `docs/spec/adapters.md`
- ~~`C:/Projects/Manifest/docs/guides/implementing-custom-stores.md`~~ → `docs/guides/implementing-custom-stores.md`
- ~~`C:/Projects/Manifest/docs/guides/embedded-runtime.md`~~ → `docs/guides/embedded-runtime.md`
