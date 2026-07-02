/**
 * Webhook runtime handler tests.
 *
 * Deterministic and HTTP-server-free: every case calls handleWebhookRequest with
 * a literal WebhookHttpRequest. HMAC signatures are computed in-test with the
 * same node:crypto primitives the handler uses, so a "valid signature" is proven
 * end to end rather than mocked.
 */

import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';

import { RuntimeEngine } from '../runtime-engine';
import { IRCompiler } from '../ir-compiler';
import { MemoryIdempotencyStore } from '../idempotency/stores/memory';
import type { IR } from '../ir';
import { handleWebhookRequest, type WebhookHttpRequest } from './handler';

const SOURCE = `
entity Order {
  property status: string
  property amount: number
  property externalRef: string

  command Create() {
    guard status == null
    mutate status = "pending"
  }

  command ApplyPayment(amountPaid: number, providerRef: string) {
    mutate amount = amountPaid
    mutate externalRef = providerRef
    mutate status = "paid"
  }
}

command NotifySlack(channel: string, text: string) {
  emit SlackNotification
}

webhook SlackInbound "/webhooks/slack" run NotifySlack
  transform: {
    channel: payload.channel,
    text: payload.text
  }

webhook StripePayment "/webhooks/stripe" run Order.ApplyPayment
  signature {
    algorithm: "hmac-sha256"
    header: "Stripe-Signature"
    secret: "context.stripeSecret"
  }
  idempotencyHeader: "Idempotency-Key"
  transform: {
    instanceId: payload.orderId,
    amountPaid: payload.amount,
    providerRef: payload.ref
  }
`;

async function compileToIR(source: string): Promise<IR> {
  // useCache:false → each call yields a fresh IR. The content-hash cache
  // (globalIRCache) otherwise returns one shared object for identical source,
  // and tests that inject into the IR (e.g. unsupported algorithm) would leak.
  const result = await new IRCompiler().compileToIR(source, { useCache: false });
  if (!result.ir) {
    throw new Error(`Compilation failed: ${result.diagnostics.map((d) => d.message).join(', ')}`);
  }
  return result.ir;
}

const SECRET = 'whsec_topsecret';

function sign(rawBody: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}

/** Build a runtime with the shared secret in context and an optional idempotency store. */
async function makeRuntime(opts: { withStore?: boolean } = {}): Promise<{
  runtime: RuntimeEngine;
  store?: MemoryIdempotencyStore;
}> {
  const ir = await compileToIR(SOURCE);
  const store = opts.withStore ? new MemoryIdempotencyStore() : undefined;
  const runtime = new RuntimeEngine(
    ir,
    { stripeSecret: SECRET },
    store ? { idempotencyStore: store } : {},
  );
  return { runtime, store };
}

function stripeRequest(rawBody: string, headers: Record<string, string> = {}): WebhookHttpRequest {
  return {
    method: 'POST',
    path: '/webhooks/stripe',
    headers,
    rawBody,
  };
}

describe('webhook IR compilation', () => {
  it('compiles webhook declarations into the IR (parser + ir-compiler)', async () => {
    const ir = await compileToIR(SOURCE);
    const webhooks = ir.webhooks ?? [];
    expect(webhooks.map((w) => w.name).sort()).toEqual(['SlackInbound', 'StripePayment']);

    const stripe = webhooks.find((w) => w.name === 'StripePayment');
    expect(stripe).toBeDefined();
    expect(stripe?.path).toBe('/webhooks/stripe');
    expect(stripe?.command).toBe('ApplyPayment');
    expect(stripe?.entity).toBe('Order');
    expect(stripe?.signature).toEqual({
      algorithm: 'hmac-sha256',
      header: 'Stripe-Signature',
      secret: 'context.stripeSecret',
    });
    expect(stripe?.idempotencyHeader).toBe('Idempotency-Key');
    expect(stripe?.transform?.map((t) => t.name)).toEqual(['instanceId', 'amountPaid', 'providerRef']);

    const slack = webhooks.find((w) => w.name === 'SlackInbound');
    expect(slack?.signature).toBeUndefined();
    expect(slack?.idempotencyHeader).toBeUndefined();
    // Method defaults to POST at runtime (not stored on the IR when unspecified).
    expect(slack?.method).toBeUndefined();
  });
});

describe('webhook matching', () => {
  it('returns 404 for an unknown path', async () => {
    const { runtime } = await makeRuntime();
    const res = await handleWebhookRequest(runtime, {
      method: 'POST',
      path: '/webhooks/unknown',
      headers: {},
      rawBody: '{}',
    });
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toContain('/webhooks/unknown');
  });

  it('returns 405 when the path exists under a different method', async () => {
    const { runtime } = await makeRuntime();
    const res = await handleWebhookRequest(runtime, {
      method: 'GET',
      path: '/webhooks/slack',
      headers: {},
      rawBody: '{}',
    });
    expect(res.status).toBe(405);
    expect((res.body as { error: string }).error).toContain('POST');
  });

  it('matches method case-insensitively', async () => {
    const { runtime } = await makeRuntime();
    const res = await handleWebhookRequest(runtime, {
      method: 'post',
      path: '/webhooks/slack',
      headers: {},
      rawBody: JSON.stringify({ channel: 'general', text: 'hi' }),
    });
    expect(res.status).toBe(200);
  });
});

describe('webhook signature verification', () => {
  it('accepts a valid plain-hex HMAC signature', async () => {
    const { runtime } = await makeRuntime({ withStore: true });
    const body = JSON.stringify({ orderId: 'order-1', amount: 10, ref: 'pi_1' });
    await runtime.createInstance('Order', { id: 'order-1', status: 'pending', amount: 0, externalRef: '' });
    const res = await handleWebhookRequest(
      runtime,
      stripeRequest(body, { 'Stripe-Signature': sign(body), 'Idempotency-Key': 'evt_ok' }),
    );
    expect(res.status).toBe(200);
  });

  it('accepts a GitHub-style sha256= prefixed signature', async () => {
    const { runtime } = await makeRuntime({ withStore: true });
    await runtime.createInstance('Order', { id: 'order-1', status: 'pending', amount: 0, externalRef: '' });
    const body = JSON.stringify({ orderId: 'order-1', amount: 10, ref: 'pi_1' });
    const res = await handleWebhookRequest(
      runtime,
      stripeRequest(body, { 'Stripe-Signature': `sha256=${sign(body)}`, 'Idempotency-Key': 'evt_prefix' }),
    );
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature header with 401', async () => {
    const { runtime } = await makeRuntime({ withStore: true });
    const body = JSON.stringify({ orderId: 'order-1', amount: 10, ref: 'pi_1' });
    const res = await handleWebhookRequest(runtime, stripeRequest(body, { 'Idempotency-Key': 'evt_1' }));
    expect(res.status).toBe(401);
    expect((res.body as { error: string }).error).toContain('Stripe-Signature');
  });

  it('rejects an invalid signature with 401', async () => {
    const { runtime } = await makeRuntime({ withStore: true });
    const body = JSON.stringify({ orderId: 'order-1', amount: 10, ref: 'pi_1' });
    const res = await handleWebhookRequest(
      runtime,
      stripeRequest(body, { 'Stripe-Signature': 'deadbeef', 'Idempotency-Key': 'evt_1' }),
    );
    expect(res.status).toBe(401);
  });

  it('rejects a signature computed with the wrong secret with 401', async () => {
    const { runtime } = await makeRuntime({ withStore: true });
    const body = JSON.stringify({ orderId: 'order-1', amount: 10, ref: 'pi_1' });
    const res = await handleWebhookRequest(
      runtime,
      stripeRequest(body, { 'Stripe-Signature': sign(body, 'the-wrong-secret'), 'Idempotency-Key': 'evt_1' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns a 500 config error when the secret context path is unresolvable', async () => {
    const ir = await compileToIR(SOURCE);
    // Context lacks stripeSecret entirely.
    const runtime = new RuntimeEngine(ir, {}, { idempotencyStore: new MemoryIdempotencyStore() });
    const body = JSON.stringify({ orderId: 'order-1', amount: 10, ref: 'pi_1' });
    const res = await handleWebhookRequest(
      runtime,
      stripeRequest(body, { 'Stripe-Signature': sign(body), 'Idempotency-Key': 'evt_1' }),
    );
    expect(res.status).toBe(500);
    expect((res.body as { error: string }).error).toContain('context.stripeSecret');
  });

  it('uses options.resolveSecret when provided', async () => {
    const ir = await compileToIR(SOURCE);
    // Context has NO stripeSecret; the override supplies it instead.
    const runtime = new RuntimeEngine(ir, {}, { idempotencyStore: new MemoryIdempotencyStore() });
    await runtime.createInstance('Order', { id: 'order-1', status: 'pending', amount: 0, externalRef: '' });
    const body = JSON.stringify({ orderId: 'order-1', amount: 10, ref: 'pi_1' });
    const res = await handleWebhookRequest(
      runtime,
      stripeRequest(body, { 'Stripe-Signature': sign(body, 'override-secret'), 'Idempotency-Key': 'evt_ovr' }),
      { resolveSecret: () => 'override-secret' },
    );
    expect(res.status).toBe(200);
  });

  it('returns a 500 diagnostic for an unsupported signature algorithm', async () => {
    const ir = await compileToIR(SOURCE);
    const stripe = (ir.webhooks ?? []).find((w) => w.name === 'StripePayment');
    // Inject an algorithm the parser/IR would never produce (forward-compat / hand-authored IR).
    (stripe!.signature as { algorithm: string }).algorithm = 'hmac-md5';
    const runtime = new RuntimeEngine(ir, { stripeSecret: SECRET }, { idempotencyStore: new MemoryIdempotencyStore() });
    const body = JSON.stringify({ orderId: 'order-1', amount: 10, ref: 'pi_1' });
    const res = await handleWebhookRequest(
      runtime,
      stripeRequest(body, { 'Stripe-Signature': sign(body), 'Idempotency-Key': 'evt_1' }),
    );
    expect(res.status).toBe(500);
    expect((res.body as { error: string }).error).toContain('hmac-md5');
  });
});

describe('webhook idempotency', () => {
  it('returns 400 when the idempotency header is missing', async () => {
    const { runtime } = await makeRuntime({ withStore: true });
    const body = JSON.stringify({ orderId: 'order-1', amount: 10, ref: 'pi_1' });
    const res = await handleWebhookRequest(runtime, stripeRequest(body, { 'Stripe-Signature': sign(body) }));
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain('Idempotency-Key');
  });

  it('fails closed with 500 when idempotencyHeader is declared but no store is configured', async () => {
    const { runtime } = await makeRuntime({ withStore: false });
    const body = JSON.stringify({ orderId: 'order-1', amount: 10, ref: 'pi_1' });
    const res = await handleWebhookRequest(
      runtime,
      stripeRequest(body, { 'Stripe-Signature': sign(body), 'Idempotency-Key': 'evt_1' }),
    );
    expect(res.status).toBe(500);
    expect((res.body as { error: string }).error).toContain('IdempotencyStore');
  });

  it('executes the command exactly once across duplicate deliveries', async () => {
    const { runtime, store } = await makeRuntime({ withStore: true });
    await runtime.createInstance('Order', { id: 'order-1', status: 'pending', amount: 0, externalRef: '' });

    const firstBody = JSON.stringify({ orderId: 'order-1', amount: 4200, ref: 'pi_first' });
    const first = await handleWebhookRequest(
      runtime,
      stripeRequest(firstBody, { 'Stripe-Signature': sign(firstBody), 'Idempotency-Key': 'evt_dup' }),
    );
    expect(first.status).toBe(200);

    // Same key, DIFFERENT payload: must be deduped, command body must not re-run.
    const secondBody = JSON.stringify({ orderId: 'order-1', amount: 9999, ref: 'pi_second' });
    const second = await handleWebhookRequest(
      runtime,
      stripeRequest(secondBody, { 'Stripe-Signature': sign(secondBody), 'Idempotency-Key': 'evt_dup' }),
    );
    expect(second.status).toBe(200);

    const order = await runtime.getInstance('Order', 'order-1');
    expect(order?.amount).toBe(4200); // NOT 9999 → command ran once
    expect(order?.externalRef).toBe('pi_first');
    expect(store?.size()).toBe(1); // exactly one cached result
  });
});

describe('webhook transform + body parsing', () => {
  it('maps payload fields onto command params via transform', async () => {
    const { runtime } = await makeRuntime();
    const res = await handleWebhookRequest(runtime, {
      method: 'POST',
      path: '/webhooks/slack',
      headers: {},
      rawBody: JSON.stringify({ channel: 'alerts', text: 'ship it' }),
    });
    expect(res.status).toBe(200);
    const events = (res.body as { events: Array<{ name: string }> }).events;
    expect(events.map((e) => e.name)).toContain('SlackNotification');
  });

  it('returns 400 for an invalid JSON body', async () => {
    const { runtime } = await makeRuntime();
    const res = await handleWebhookRequest(runtime, {
      method: 'POST',
      path: '/webhooks/slack',
      headers: {},
      rawBody: '{ not json',
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain('JSON');
  });

  it('returns 400 (never partial-executes) when a transform expression throws', async () => {
    const { runtime } = await makeRuntime();
    const spy = vi
      .spyOn(runtime, 'evaluateExpression')
      .mockRejectedValueOnce(new Error('boom during transform'));
    const res = await handleWebhookRequest(runtime, {
      method: 'POST',
      path: '/webhooks/slack',
      headers: {},
      rawBody: JSON.stringify({ channel: 'alerts', text: 'ship it' }),
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain('transform failed');
    spy.mockRestore();
  });

  it('passes the parsed body through as-is when no transform is declared', async () => {
    // Compile a variant whose Slack webhook has no transform; the command reads
    // its params straight from the JSON body.
    const noTransform = `
command NotifySlack(channel: string, text: string) {
  emit SlackNotification
}
webhook SlackInbound "/webhooks/slack" run NotifySlack
`;
    const ir = await compileToIR(noTransform);
    const runtime = new RuntimeEngine(ir);
    const res = await handleWebhookRequest(runtime, {
      method: 'POST',
      path: '/webhooks/slack',
      headers: {},
      rawBody: JSON.stringify({ channel: 'alerts', text: 'passthrough' }),
    });
    expect(res.status).toBe(200);
    const events = (res.body as { events: Array<{ name: string }> }).events;
    expect(events.map((e) => e.name)).toContain('SlackNotification');
  });
});

describe('webhook end-to-end integration', () => {
  it('verifies signature, dedupes, transforms, and mutates entity state', async () => {
    const { runtime } = await makeRuntime({ withStore: true });
    await runtime.createInstance('Order', {
      id: 'order-42',
      status: 'pending',
      amount: 0,
      externalRef: '',
    });

    const rawBody = JSON.stringify({ orderId: 'order-42', amount: 7350, ref: 'pi_live_1' });
    const res = await handleWebhookRequest(
      runtime,
      stripeRequest(rawBody, {
        'Stripe-Signature': sign(rawBody),
        'Idempotency-Key': 'evt_live_1',
      }),
    );

    expect(res.status).toBe(200);
    const order = await runtime.getInstance('Order', 'order-42');
    expect(order?.status).toBe('paid');
    expect(order?.amount).toBe(7350);
    expect(order?.externalRef).toBe('pi_live_1');
  });
});
