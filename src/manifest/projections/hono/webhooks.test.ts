/**
 * Tests for the Hono `hono.webhooks` surface.
 *
 * Emits a standalone Hono app serving each declared webhook at its DECLARED path
 * (verbatim, no basePath), WITHOUT the requireAuth middleware (webhooks
 * authenticate via HMAC signature), reading the RAW body and delegating to
 * handleWebhookRequest.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import type { IR } from '../../ir';
import { compileToIR } from '../../ir-compiler';
import { HonoProjection } from './generator';

const projection = new HonoProjection();

const SOURCE = `
  entity Order {
    property status: string
    property amount: number
    command UpdatePayment(paymentId: string, amountPaid: number) {
      mutate amount = amountPaid
    }
  }

  command NotifySlack(channel: string, message: string) {
    emit SlackNotification
  }

  webhook SlackInbound "/webhooks/slack" run NotifySlack
    transform: {
      channel: payload.channel,
      message: payload.text
    }

  webhook StripePayment "/webhooks/stripe" run Order.UpdatePayment
    method: "PUT"
    signature {
      algorithm: "hmac-sha256"
      header: "Stripe-Signature"
      secret: "context.stripeWebhookSecret"
    }
    transform: {
      paymentId: payload.data.object.id,
      amountPaid: payload.data.object.amount
    }
`;

let ir: IR;

beforeAll(async () => {
  const compiled = await compileToIR(SOURCE);
  expect(compiled.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  ir = compiled.ir!;
});

describe('hono.webhooks — emission', () => {
  it('emits one Hono app at src/webhooks.ts with a route per declared webhook', () => {
    const result = projection.generate(ir, { surface: 'hono.webhooks' });
    expect(result.artifacts).toHaveLength(1);
    const artifact = result.artifacts[0];
    expect(artifact.id).toBe('hono.webhooks');
    // src/ so the relative ./lib/manifest-runtime import resolves to the companion.
    expect(artifact.pathHint).toBe('src/webhooks.ts');
    expect(artifact.code).toContain("app.post('/webhooks/slack'");
    // method: "PUT" → app.put; the declared path is served verbatim (no basePath).
    expect(artifact.code).toContain("app.put('/webhooks/stripe'");
    expect(artifact.code).toContain('export default app;');
  });

  it('imports the webhook handler and the raw engine factory from the runtime companion', () => {
    const code = projection.generate(ir, { surface: 'hono.webhooks' }).artifacts[0].code;
    expect(code).toContain("import { handleWebhookRequest } from '@angriff36/manifest/webhooks';");
    expect(code).toContain("import { createManifestEngine } from './lib/manifest-runtime';");
    expect(code).toContain('const runtime = await createManifestEngine();');
  });

  it('reads the RAW body and bridges method/path/headers/query', () => {
    const code = projection.generate(ir, { surface: 'hono.webhooks' }).artifacts[0].code;
    expect(code).toContain('const rawBody = await c.req.text();');
    expect(code).toContain('method: c.req.method,');
    expect(code).toContain('headers: c.req.header(),');
    expect(code).toContain('query: c.req.query(),');
    expect(code).toContain('return Response.json(result.body, { status: result.status });');
  });

  it('does NOT apply requireAuth to webhook routes', () => {
    const code = projection.generate(ir, { surface: 'hono.webhooks' }).artifacts[0].code;
    // The handler follows the path directly — no auth middleware in the chain.
    expect(code).toContain("app.post('/webhooks/slack', async (c) =>");
    expect(code).not.toMatch(/requireAuth\s*,/);
  });

  it('honors a custom runtimeFactoryName by importing the de-collided engine factory', () => {
    const code = projection.generate(ir, {
      surface: 'hono.webhooks',
      options: { runtimeFactoryName: 'createManifestEngine' },
    }).artifacts[0].code;
    // The facade would collide with the engine factory name → engine factory is renamed.
    expect(code).toContain("import { createManifestEngineInternal } from './lib/manifest-runtime';");
    expect(code).toContain('const runtime = await createManifestEngineInternal();');
  });
});

describe('hono.webhooks — gating', () => {
  it('emits nothing but an info diagnostic when no webhooks are declared', async () => {
    const compiled = await compileToIR(`
      entity Widget {
        property name: string
        command rename(name: string) { mutate name = name }
      }
    `);
    const result = projection.generate(compiled.ir!, { surface: 'hono.webhooks' });
    expect(result.artifacts).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('HONO_NO_WEBHOOKS');
  });
});
