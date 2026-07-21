/**
 * Convex orchestration surfaces (crons / http / sagas) — unit tests.
 */

import { describe, it, expect } from 'vitest';
import type { IR, IRSchedule, IRWebhook, IRSaga } from '../../ir';
import { ConvexProjection } from './generator.js';

function emptyIR(): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'h',
      compilerVersion: 'test',
      schemaVersion: '1.0',
      compiledAt: '2025-01-01T00:00:00.000Z',
    },
    modules: [],
    values: [],
    entities: [],
    enums: [],
    stores: [],
    events: [],
    commands: [],
    policies: [],
  };
}
const gen = (ir: IR, surface: string) => new ConvexProjection().generate(ir, { surface });

describe('convex.crons', () => {
  it('emits cron + interval jobs referencing the command mutations', () => {
    const ir = emptyIR();
    ir.schedules = [
      {
        name: 'nightly',
        entityName: 'Report',
        commandName: 'build',
        trigger: { kind: 'cron', cron: '0 9 * * MON' },
      },
      {
        name: 'poll',
        entityName: 'Inbox',
        commandName: 'sync',
        trigger: { kind: 'interval', durationMs: 300000 },
      },
    ] as IRSchedule[];
    const code = gen(ir, 'convex.crons').artifacts[0].code;
    expect(code).toContain('import { cronJobs } from "convex/server";');
    expect(code).toContain('const crons = cronJobs();');
    expect(code).toContain('crons.cron("nightly", "0 9 * * MON", api.mutations.Report_build');
    expect(code).toContain('crons.interval("poll", { minutes: 5 }, api.mutations.Inbox_sync');
    expect(code).toContain('export default crons;');
  });

  it('emits an empty crons file + info diagnostic when none declared', () => {
    const res = gen(emptyIR(), 'convex.crons');
    expect(res.diagnostics.some((d) => d.code === 'CONVEX_NO_SCHEDULES')).toBe(true);
    expect(res.artifacts[0].code).toContain('export default crons;');
  });
});

describe('convex.http', () => {
  it('emits an httpAction route per webhook, resolving transform params against body', () => {
    const ir = emptyIR();
    ir.webhooks = [
      {
        name: 'stripe',
        path: '/webhooks/stripe',
        method: 'POST',
        command: 'record',
        entity: 'Payment',
        transform: [
          {
            name: 'amount',
            expression: {
              kind: 'member',
              object: { kind: 'identifier', name: 'body' },
              property: 'amount',
            },
          },
        ],
      },
    ] as IRWebhook[];
    const code = gen(ir, 'convex.http').artifacts[0].code;
    expect(code).toContain('import { httpRouter } from "convex/server";');
    expect(code).toContain('path: "/webhooks/stripe"');
    expect(code).toContain('method: "POST"');
    expect(code).toContain('const body = await request.json();');
    expect(code).toContain(
      'await ctx.runMutation(api.mutations.Payment_record, { amount: body.amount } as any);',
    );
    expect(code).toContain('export default http;');
  });

  it('emits an empty http router + info diagnostic when none declared', () => {
    const res = gen(emptyIR(), 'convex.http');
    expect(res.diagnostics.some((d) => d.code === 'CONVEX_NO_WEBHOOKS')).toBe(true);
  });
});

describe('convex.http — HMAC signature verification', () => {
  it('emits HMAC helper functions and secret env-var read when signature declared', () => {
    const ir = emptyIR();
    ir.webhooks = [
      {
        name: 'stripe',
        path: '/webhooks/stripe',
        method: 'POST',
        command: 'record',
        entity: 'Payment',
        signature: {
          algorithm: 'hmac-sha256',
          header: 'X-Hub-Signature-256',
          secret: 'context.stripeWebhookSecret',
        },
      },
    ] as IRWebhook[];
    const code = gen(ir, 'convex.http').artifacts[0].code;
    // HMAC helper functions present
    expect(code).toContain('_verifyHmac(');
    expect(code).toContain('crypto.subtle.importKey(');
    expect(code).toContain('crypto.subtle.verify(');
    // Secret resolved from env var (context.stripeWebhookSecret → STRIPE_WEBHOOK_SECRET)
    expect(code).toContain('process.env["STRIPE_WEBHOOK_SECRET"]');
    // Config error (no secret) → 500
    expect(code).toContain('status: 500');
    // Signature header read
    expect(code).toContain('"X-Hub-Signature-256"');
    // Missing header or invalid sig → 401
    expect(code).toContain('status: 401');
  });

  it('emits SHA-512 hash algo for hmac-sha512', () => {
    const ir = emptyIR();
    ir.webhooks = [
      {
        name: 'gh',
        path: '/webhooks/gh',
        method: 'POST',
        command: 'push',
        entity: 'Repo',
        signature: { algorithm: 'hmac-sha512', header: 'X-Signature', secret: 'context.ghSecret' },
      },
    ] as IRWebhook[];
    const code = gen(ir, 'convex.http').artifacts[0].code;
    expect(code).toContain('"SHA-512"');
    expect(code).toContain('"hmac-sha512"');
    expect(code).toContain('process.env["GH_SECRET"]');
  });

  it('does NOT emit HMAC helpers when no signature declared', () => {
    const ir = emptyIR();
    ir.webhooks = [
      {
        name: 'simple',
        path: '/webhooks/simple',
        method: 'POST',
        command: 'act',
        entity: 'Foo',
      },
    ] as IRWebhook[];
    const code = gen(ir, 'convex.http').artifacts[0].code;
    expect(code).not.toContain('_verifyHmac');
    expect(code).not.toContain('process.env');
    expect(code).not.toContain('crypto.subtle');
    // existing body-read pattern unchanged
    expect(code).toContain('const body = await request.json();');
  });

  it('reads raw body as text (not json) when signature is declared', () => {
    const ir = emptyIR();
    ir.webhooks = [
      {
        name: 'gh',
        path: '/webhooks/gh',
        method: 'POST',
        command: 'push',
        entity: 'Repo',
        signature: { algorithm: 'hmac-sha256', header: 'X-Sig', secret: 'context.secret' },
      },
    ] as IRWebhook[];
    const code = gen(ir, 'convex.http').artifacts[0].code;
    expect(code).toContain('request.text()');
    expect(code).not.toContain('request.json()');
  });
});

describe('convex.http — idempotency dedup', () => {
  it('emits internalMutation + key check when idempotencyHeader declared', () => {
    const ir = emptyIR();
    ir.webhooks = [
      {
        name: 'stripe',
        path: '/webhooks/stripe',
        method: 'POST',
        command: 'record',
        entity: 'Payment',
        idempotencyHeader: 'Idempotency-Key',
      },
    ] as IRWebhook[];
    const result = gen(ir, 'convex.http');
    const code = result.artifacts[0].code;
    expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(false);
    // Import additions
    expect(code).toContain('internalMutation');
    expect(code).toContain('internal');
    expect(code).toContain('import { v } from "convex/values";');
    // Exported idempotency mutation
    expect(code).toContain('export const _checkIdempotencyKey');
    expect(code).toContain('.withIndex("by_key"');
    // httpAction references it
    expect(code).toContain('internal.http._checkIdempotencyKey');
    expect(code).toContain('"Idempotency-Key"');
    // Missing header → 400
    expect(code).toContain('status: 400');
    // Duplicate delivery (replay) → 200
    expect(code).toContain('status: 200');
  });

  it('does NOT emit idempotency mutation when no idempotencyHeader declared', () => {
    const ir = emptyIR();
    ir.webhooks = [
      {
        name: 'simple',
        path: '/webhooks/simple',
        method: 'POST',
        command: 'act',
        entity: 'Foo',
      },
    ] as IRWebhook[];
    const code = gen(ir, 'convex.http').artifacts[0].code;
    expect(code).not.toContain('_checkIdempotencyKey');
    expect(code).not.toContain('internalMutation');
    expect(code).not.toContain('internal.http');
  });

  it('HMAC check runs before idempotency check when both declared', () => {
    const ir = emptyIR();
    ir.webhooks = [
      {
        name: 'stripe',
        path: '/webhooks/stripe',
        method: 'POST',
        command: 'record',
        entity: 'Payment',
        signature: {
          algorithm: 'hmac-sha256',
          header: 'X-Hub-Signature-256',
          secret: 'context.stripeWebhookSecret',
        },
        idempotencyHeader: 'Idempotency-Key',
      },
    ] as IRWebhook[];
    const code = gen(ir, 'convex.http').artifacts[0].code;
    const hmacPos = code.indexOf('_verifyHmac(');
    const idempPos = code.indexOf('_checkIdempotencyKey');
    expect(hmacPos).toBeGreaterThanOrEqual(0);
    expect(idempPos).toBeGreaterThanOrEqual(0);
    // HMAC verification (in the route handler) must appear before idempotency check
    // Find positions within the route body (after the helper definitions)
    const httpRoutePos = code.indexOf('http.route(');
    const hmacInRoute = code.indexOf('_verifyHmac(', httpRoutePos);
    const idempInRoute = code.indexOf('_checkIdempotencyKey', httpRoutePos);
    expect(hmacInRoute).toBeLessThan(idempInRoute);
  });

  it('stores idempotency key using the configured table name', () => {
    const ir = emptyIR();
    ir.webhooks = [
      {
        name: 'pay',
        path: '/webhooks/pay',
        method: 'POST',
        command: 'handle',
        entity: 'Tx',
        idempotencyHeader: 'X-Idempotency',
      },
    ] as IRWebhook[];
    const code = gen(ir, 'convex.http').artifacts[0].code;
    // Default table name
    expect(code).toContain('"webhookIdempotencyKeys"');
  });
});

describe('convex.schema — idempotency table', () => {
  it('emits idempotency table when any webhook has idempotencyHeader', () => {
    const ir = emptyIR();
    ir.webhooks = [
      {
        name: 'stripe',
        path: '/webhooks/stripe',
        method: 'POST',
        command: 'record',
        entity: 'Payment',
        idempotencyHeader: 'Idempotency-Key',
      },
    ] as IRWebhook[];
    const code = gen(ir, 'convex.schema').artifacts[0].code;
    expect(code).toContain('webhookIdempotencyKeys');
    expect(code).toContain('by_key');
    expect(code).toContain('key: v.string()');
    expect(code).toContain('webhookName: v.string()');
    expect(code).toContain('seenAt: v.number()');
  });

  it('does NOT emit idempotency table when no webhook has idempotencyHeader', () => {
    const ir = emptyIR();
    ir.webhooks = [
      {
        name: 'stripe',
        path: '/webhooks/stripe',
        method: 'POST',
        command: 'record',
      },
    ] as IRWebhook[];
    const code = gen(ir, 'convex.schema').artifacts[0].code;
    expect(code).not.toContain('webhookIdempotencyKeys');
  });

  it('does NOT emit idempotency table when no webhooks at all', () => {
    const code = gen(emptyIR(), 'convex.schema').artifacts[0].code;
    expect(code).not.toContain('webhookIdempotencyKeys');
  });
});

describe('convex.sagas', () => {
  function sagaIR(onFailure: 'compensate' | 'abort'): IR {
    const ir = emptyIR();
    ir.sagas = [
      {
        name: 'Provision',
        steps: [
          {
            name: 's1',
            commandEntity: 'Account',
            command: 'open',
            compensateEntity: 'Account',
            compensate: 'close',
          },
          { name: 's2', commandEntity: 'Billing', command: 'start' },
        ],
        onFailure,
        emits: [],
      },
    ] as IRSaga[];
    return ir;
  }

  it('emits an orchestrator action with forward steps and reverse compensation', () => {
    const code = gen(sagaIR('compensate'), 'convex.sagas').artifacts[0].code;
    expect(code).toContain('export const Provision = action({');
    expect(code).toContain('await ctx.runMutation(api.mutations.Account_open, input as any);');
    expect(code).toContain('await ctx.runMutation(api.mutations.Billing_start, input as any);');
    expect(code).toContain('completed.push(0)');
    // compensation only for the step that declares one
    expect(code).toContain(
      'if (completed.includes(0)) await ctx.runMutation(api.mutations.Account_close, input as any);',
    );
    expect(code).not.toContain('Billing_start, input as any);\n      throw'); // no compensate for s2
  });

  it('omits compensation when onFailure is abort', () => {
    const code = gen(sagaIR('abort'), 'convex.sagas').artifacts[0].code;
    expect(code).toContain('// onFailure: abort — no compensation');
    expect(code).not.toContain('Account_close');
  });

  it('emits an info diagnostic when no sagas declared', () => {
    expect(
      gen(emptyIR(), 'convex.sagas').diagnostics.some((d) => d.code === 'CONVEX_NO_SAGAS'),
    ).toBe(true);
  });
});

describe('convex.http — authenticated command dispatcher', () => {
  function irWithInstanceReserveCommand(): IR {
    const ir = emptyIR();
    ir.commands = [
      {
        name: 'reserve',
        entity: 'InventoryReservation',
        parameters: [
          { name: 'inventoryItemId', type: { name: 'string', nullable: false }, required: true },
          { name: 'quantity', type: { name: 'number', nullable: false }, required: true },
          {
            name: 'actorId',
            type: { name: 'string', nullable: false },
            required: true,
            trustedSource: 'context.actorId',
          },
        ],
        guards: [],
        actions: [],
        emits: [],
      },
    ];
    return ir;
  }

  function irWithInitializationReserveCommand(): IR {
    const ir = irWithInstanceReserveCommand();
    ir.entities = [
      {
        name: 'InventoryReservation',
        properties: [
          {
            name: 'inventoryItemId',
            type: { name: 'string', nullable: false },
            modifiers: ['required'],
          },
          {
            name: 'quantity',
            type: { name: 'number', nullable: false },
            modifiers: ['required'],
          },
        ],
        computedProperties: [],
        relationships: [],
        commands: ['reserve', 'release'],
        constraints: [],
        policies: [],
      },
    ];
    const plan = {
      initializationInputs: ['inventoryItemId', 'quantity'],
      authenticatedOwnershipFields: [],
      declaredDefaults: [],
      initialLifecycleState: [],
      commandOwnedFields: ['inventoryItemId', 'quantity'],
      draftFields: ['inventoryItemId', 'quantity'],
      finalDocumentRequirements: ['inventoryItemId', 'quantity'],
      dynamicGuardIndexes: [],
      redundantGuardIndexes: [],
    };
    ir.commands![0]!.initialization = plan;
    // Peer instance command may also carry a plan in hand-built IR; only the
    // selected initialization command may route to createVia*.
    ir.commands!.push({
      name: 'release',
      entity: 'InventoryReservation',
      parameters: [
        {
          name: 'reason',
          type: { name: 'string', nullable: false },
          required: true,
        },
      ],
      guards: [],
      actions: [],
      emits: [],
      initialization: {
        ...plan,
        initializationInputs: ['reason'],
        commandOwnedFields: ['reason'],
        draftFields: ['reason'],
        finalDocumentRequirements: [],
      },
    });
    return ir;
  }

  it('requires getUserIdentity (401) and dispatches to the governed mutation', () => {
    const code = gen(irWithInstanceReserveCommand(), 'convex.http').artifacts[0].code;
    expect(code).toContain('pathPrefix: "/api/manifest/"');
    expect(code).toContain('method: "POST"');
    expect(code).toContain('const identity = await ctx.auth.getUserIdentity()');
    expect(code).toContain('status: 401');
    expect(code).toContain('"InventoryReservation.reserve"');
    expect(code).toContain('ref: api.mutations.InventoryReservation_reserve');
    expect(code).toContain('await ctx.runMutation(entry.ref, args as any)');
    expect(code).toContain('"inventoryItemId"');
    expect(code).toContain('"quantity"');
    // Instance commands forward docId (+ optional OCC version)
    expect(code).toContain('"docId"');
    expect(code).toContain('"version"');
    // trustedSource / identity params are not client-owned
    expect(code).not.toMatch(/params: \[[^\]]*"actorId"/);
  });

  it('routes selected initialization commands to createVia mutations without docId', () => {
    const code = gen(irWithInitializationReserveCommand(), 'convex.http').artifacts[0].code;
    expect(code).toContain('"InventoryReservation.reserve"');
    expect(code).toContain('ref: api.mutations.InventoryReservation_createViaReserve');
    expect(code).not.toContain('ref: api.mutations.InventoryReservation_reserve');
    expect(code).toContain('"inventoryItemId"');
    expect(code).toContain('"quantity"');
    expect(code).not.toMatch(/"InventoryReservation\.reserve": \{\s*ref:[^}]*"docId"/);
    // Peer commands stay on the instance mutation + docId even if they carry a plan.
    expect(code).toContain('ref: api.mutations.InventoryReservation_release');
    expect(code).not.toContain('InventoryReservation_createViaRelease');
    expect(code).toMatch(/"InventoryReservation\.release": \{[\s\S]*?"docId"/);
  });

  it('never copies caller-supplied auth fields into mutation args', () => {
    const code = gen(irWithInstanceReserveCommand(), 'convex.http').artifacts[0].code;
    expect(code).toContain('DISPATCHER_FORBIDDEN_BODY_KEYS');
    expect(code).toContain('"__auth"');
    expect(code).toContain('"tenantId"');
    expect(code).toContain('"role"');
    expect(code).toContain('"user"');
    expect(code).toContain('if (DISPATCHER_FORBIDDEN_BODY_KEYS.has(name)) continue');
    // Must not accept a body.__auth passthrough pattern
    expect(code).not.toContain('__auth: body');
    expect(code).not.toContain('tenantId: body');
    expect(code).not.toContain('role: body');
  });

  it('can be disabled via options.dispatcher.enabled', () => {
    const res = new ConvexProjection().generate(irWithInstanceReserveCommand(), {
      surface: 'convex.http',
      options: { dispatcher: { enabled: false } },
    });
    expect(res.diagnostics.some((d) => d.code === 'CONVEX_DISPATCHER_DISABLED')).toBe(true);
    expect(res.artifacts[0].code).not.toContain('pathPrefix: "/api/manifest/"');
    expect(res.artifacts[0].code).not.toContain('COMMAND_DISPATCH');
  });
});
