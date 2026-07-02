import { describe, it, expect, beforeAll } from 'vitest';
import type { IR } from '../../ir';
import { compileToIR } from '../../ir-compiler';
import { generateWebhookRoutes, type WebhookGeneratorOptions } from './webhook-generator.js';

const DEFAULT_OPTIONS: WebhookGeneratorOptions = {
  runtimeImportPath: '@/lib/manifest-runtime',
  appDir: 'app/api',
};

// A program with two webhooks: a simple one (POST default) and a full-featured
// one (entity-scoped, signature, idempotency, non-default method) so the tests
// cover path mapping, method export, and bridging.
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
    idempotencyHeader: "Idempotency-Key"
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

describe('generateWebhookRoutes — route emission', () => {
  it('emits one route per declared webhook, served at the declared path under the app root', () => {
    const result = generateWebhookRoutes(ir, DEFAULT_OPTIONS);

    const slack = result.artifacts.find((a) => a.id === 'nextjs.webhook.SlackInbound');
    expect(slack).toBeDefined();
    // appDir 'app/api' → app root 'app'; the served URL must equal the declared
    // /webhooks/slack, so the file lives at app/webhooks/slack/route.ts.
    expect(slack!.pathHint).toBe('app/webhooks/slack/route.ts');
    expect(slack!.contentType).toBe('typescript');

    const stripe = result.artifacts.find((a) => a.id === 'nextjs.webhook.StripePayment');
    expect(stripe!.pathHint).toBe('app/webhooks/stripe/route.ts');
  });

  it('exports the declared HTTP method handler (POST default, override honored)', () => {
    const result = generateWebhookRoutes(ir, DEFAULT_OPTIONS);
    const slack = result.artifacts.find((a) => a.id === 'nextjs.webhook.SlackInbound')!;
    const stripe = result.artifacts.find((a) => a.id === 'nextjs.webhook.StripePayment')!;

    expect(slack.code).toContain('export async function POST(request: Request)');
    // method: "PUT" on the declaration → the route exports PUT, not POST.
    expect(stripe.code).toContain('export async function PUT(request: Request)');
    expect(stripe.code).not.toContain('export async function POST');
  });

  it('bridges the raw body, headers, query into handleWebhookRequest with the companion runtime', () => {
    const result = generateWebhookRoutes(ir, DEFAULT_OPTIONS);
    const slack = result.artifacts.find((a) => a.id === 'nextjs.webhook.SlackInbound')!;

    expect(slack.code).toContain('import { createManifestRuntime } from "@/lib/manifest-runtime";');
    expect(slack.code).toContain('import { handleWebhookRequest } from "@angriff36/manifest/webhooks";');
    // RAW body — HMAC needs the exact bytes; the route reads text(), not json().
    expect(slack.code).toContain('const rawBody = await request.text();');
    expect(slack.code).not.toContain('request.json()');
    expect(slack.code).toContain('headers: Object.fromEntries(request.headers),');
    expect(slack.code).toContain('path: "/webhooks/slack",');
    expect(slack.code).toContain('return NextResponse.json(result.body, { status: result.status });');
  });

  it('emits no auth guard (webhooks authenticate via signature, not app auth)', () => {
    const result = generateWebhookRoutes(ir, DEFAULT_OPTIONS);
    const slack = result.artifacts.find((a) => a.id === 'nextjs.webhook.SlackInbound')!;
    // No Unauthorized/auth() guard is emitted — the signature is the auth.
    expect(slack.code).not.toContain('Unauthorized');
    expect(slack.code).not.toContain('CRON_SECRET');
  });
});

describe('generateWebhookRoutes — appDir mapping', () => {
  it('serves at the declared path under a src/app project root', () => {
    const result = generateWebhookRoutes(ir, { runtimeImportPath: '@/lib/manifest-runtime', appDir: 'src/app/api' });
    const slack = result.artifacts.find((a) => a.id === 'nextjs.webhook.SlackInbound')!;
    // appDir 'src/app/api' → app root 'src/app' → src/app/webhooks/slack/route.ts,
    // still served at /webhooks/slack (App Router strips through `app`).
    expect(slack.pathHint).toBe('src/app/webhooks/slack/route.ts');
  });
});

describe('generateWebhookRoutes — gating', () => {
  it('emits nothing but an info diagnostic when the IR declares no webhooks', async () => {
    const compiled = await compileToIR(`
      entity Widget {
        property name: string
        command rename(name: string) { mutate name = name }
      }
    `);
    expect(compiled.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const result = generateWebhookRoutes(compiled.ir!, DEFAULT_OPTIONS);

    expect(result.artifacts).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('NEXTJS_NO_WEBHOOK_ARTIFACTS');
  });
});
