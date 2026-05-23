/**
 * Tests for the runtime-smoke check.
 *
 * Verifies that the smoke proves the v0.5-era audit + outbox emission
 * contract end-to-end against THIS build of @angriff36/manifest. If the
 * package's MemoryAuditSink/MemoryOutboxStore stop being exported, or
 * RuntimeEngine stops invoking the sink, these assertions fail.
 */

import { describe, it, expect } from 'vitest';
import { runRuntimeSmoke } from './runtime-smoke';

describe('runRuntimeSmoke', () => {
  it('passes against the current @angriff36/manifest build', async () => {
    const result = await runRuntimeSmoke();
    if (!result.ok) {
      // Print structured failure for debugging when this regresses.
      console.log(JSON.stringify(result, null, 2));
    }
    expect(result.fatal).toBeUndefined();
    expect(result.ok).toBe(true);
  });

  it('asserts exactly-one audit emission per runCommand attempt', async () => {
    const result = await runRuntimeSmoke();
    const audit = result.assertions.find(a => a.name === 'audit.emittedExactlyOnce');
    expect(audit?.passed).toBe(true);
    expect(audit?.actual).toBe(1);
  });

  it('asserts outbox enqueue produced exactly one pending entry', async () => {
    const result = await runRuntimeSmoke();
    const outbox = result.assertions.find(a => a.name === 'outbox.enqueuedExactlyOnce');
    expect(outbox?.passed).toBe(true);
    expect(outbox?.actual).toBe(1);
  });

  it('threads RuntimeContext fields through into the AuditRecord', async () => {
    const result = await runRuntimeSmoke();
    const tenant = result.assertions.find(a => a.name === 'audit.tenantId');
    const actor = result.assertions.find(a => a.name === 'audit.actorId');
    const source = result.assertions.find(a => a.name === 'audit.source');
    expect(tenant?.passed).toBe(true);
    expect(actor?.passed).toBe(true);
    expect(source?.passed).toBe(true);
  });
});
