/**
 * Tests for the Express `express.webhooks` surface.
 *
 * Emits an Express Router serving each declared webhook at its DECLARED path
 * (verbatim, no mount prefix), WITHOUT the requireAuth middleware (webhooks
 * authenticate via HMAC signature), capturing the RAW body with express.raw and
 * delegating to handleWebhookRequest. Fastify is not auto-emitted (raw-body
 * needs an external plugin).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import type { IR } from '../../ir';
import { compileToIR } from '../../ir-compiler';
import { ExpressProjection } from './generator';

const projection = new ExpressProjection();

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

describe('express.webhooks — emission', () => {
  it('emits one Router at routes/webhooks.ts with a route per declared webhook', () => {
    const result = projection.generate(ir, { surface: 'express.webhooks' });
    expect(result.artifacts).toHaveLength(1);
    const artifact = result.artifacts[0];
    expect(artifact.id).toBe('express.webhooks');
    // routes/ so the relative ./lib/manifest-runtime import resolves to the companion.
    expect(artifact.pathHint).toBe('routes/webhooks.ts');
    expect(artifact.code).toContain('export function createManifestWebhookRouter(): Router {');
    expect(artifact.code).toContain("router.post('/webhooks/slack', express.raw({ type: '*/*' })");
    // method: "PUT" → router.put; the declared path is served verbatim.
    expect(artifact.code).toContain("router.put('/webhooks/stripe', express.raw({ type: '*/*' })");
  });

  it('captures the RAW body via express.raw and bridges method/path/headers/query', () => {
    const code = projection.generate(ir, { surface: 'express.webhooks' }).artifacts[0].code;
    expect(code).toContain("import { handleWebhookRequest } from '@angriff36/manifest/webhooks';");
    expect(code).toContain("import { createManifestEngine } from './lib/manifest-runtime';");
    expect(code).toContain("const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';");
    expect(code).toContain('method: req.method,');
    expect(code).toContain('headers: req.headers,');
    expect(code).toContain('query: req.query as Record<string, string | undefined>,');
    expect(code).toContain('res.status(result.status).json(result.body);');
  });

  it('does NOT apply requireAuth to webhook routes', () => {
    const code = projection.generate(ir, { surface: 'express.webhooks' }).artifacts[0].code;
    // Only express.raw is in the middleware chain — no requireAuth.
    expect(code).toContain("express.raw({ type: '*/*' }), async");
    expect(code).not.toMatch(/requireAuth\s*,/);
  });

  it('defers Fastify webhook emission with an info diagnostic (raw-body needs a plugin)', () => {
    const result = projection.generate(ir, { surface: 'express.webhooks', options: { framework: 'fastify' } });
    expect(result.artifacts).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('EXPRESS_WEBHOOKS_FASTIFY_UNSUPPORTED');
  });
});

describe('express.webhooks — gating', () => {
  it('emits nothing but an info diagnostic when no webhooks are declared', async () => {
    const compiled = await compileToIR(`
      entity Widget {
        property name: string
        command rename(name: string) { mutate name = name }
      }
    `);
    const result = projection.generate(compiled.ir!, { surface: 'express.webhooks' });
    expect(result.artifacts).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('EXPRESS_NO_WEBHOOKS');
  });
});
