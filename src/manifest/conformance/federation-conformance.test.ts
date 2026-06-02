import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { compileToIR } from '../ir-compiler';

import {
  FederationRegistry,
  FederationClient,
  buildDescriptor,
  generateHttpAdapter,
  buildBridgeFromContext,
  contextFromBridgeHeaders,
  parseBridgeHeaders,
  ensureCorrelationId,
  validateBridgeHeaders,
} from '../federation';
import type { IR } from '../ir';
import type {
  FederationResponse,
  FederationTransport,
  ServiceDescriptor,
} from '../federation';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, 'fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf-8');
}

// ─── Conformance: IR compilation of federation surface ──────────────────

describe('Federation Conformance: 87-federation.manifest', () => {
  const source = loadFixture('87-federation.manifest');
  let ir: IR;

  beforeAll(async () => {
    const result = await compileToIR(source, { sourcePath: '87-federation.manifest' });
    if (result.diagnostics.filter((d) => d.severity === 'error').length > 0) {
      throw new Error('IR compilation failed: ' + JSON.stringify(result.diagnostics));
    }
    if (!result.ir) throw new Error('IR compilation returned null');
    ir = result.ir;
  });

  it('compiles to a valid IR with exposed entities', () => {
    expect(ir).toBeDefined();
    expect(ir.entities).toHaveLength(1);
    expect(ir.entities[0].name).toBe('Order');
    expect(ir.commands.length).toBeGreaterThanOrEqual(3);
  });

  it('builds a federation descriptor with correct command metadata', () => {
    const desc = buildDescriptor('orders', ir, {
      endpoint: 'https://orders.svc:8080',
      auth: { scheme: 'bearer' },
      commandPolicies: {
        createOrder: ['authenticated'],
        completeOrder: ['authenticated'],
        getOrderSummary: ['canRead'],
      },
    });
    expect(desc.serviceId).toBe('orders');
    expect(desc.entities[0].commands).toHaveLength(3);

    const createOrder = desc.entities[0].commands.find((c) => c.name === 'createOrder')!;
    expect(createOrder).toBeDefined();
    // Bare `emit` statements go into the emits list, not actions, so from
    // the IR perspective this command has no side-effect actions.
    expect(createOrder.idempotent).toBe(true);
    expect(createOrder.requiredPolicies).toContain('authenticated');

    const getSummary = desc.entities[0].commands.find((c) => c.name === 'getOrderSummary')!;
    expect(getSummary).toBeDefined();
    expect(getSummary.idempotent).toBe(true); // no side effects
  });

  it('registers services and finds commands across the federation', () => {
    const ordersDesc = buildDescriptor('orders', ir, { endpoint: 'https://orders.svc:8080' });
    const invDesc: ServiceDescriptor = {
      serviceId: 'inventory',
      endpoint: 'https://inv.svc:8080',
      schemaVersion: '1.0',
      entities: [
        {
          name: 'Item',
          commands: [{ name: 'reserve', idempotent: false, requiredPolicies: ['authenticated'] }],
        },
      ],
    };

    const registry = new FederationRegistry({ healthCheckIntervalMs: 0 });
    registry.registerAll([ordersDesc, invDesc]);

    expect(registry.list()).toHaveLength(2);
    const found = registry.findCommand('Order', 'createOrder');
    expect(found?.service.serviceId).toBe('orders');
    const invFound = registry.findCommand('Item', 'reserve');
    expect(invFound?.service.serviceId).toBe('inventory');
  });

  it('round-trips identity through the policy bridge', () => {
    const original = {
      actorId: 'u-42',
      tenantId: 't-acme',
      orgId: 'o-acme',
      requestId: 'req-1',
      user: { id: 'u-42', role: 'admin' },
    };
    const bridge = buildBridgeFromContext(original);
    const headerMap: Record<string, string> = {};
    const HEADER_PAIRS: Array<[string, string | undefined]> = [
      ['X-Manifest-Actor', bridge.actorId],
      ['X-Manifest-Tenant', bridge.tenantId],
      ['X-Manifest-Org', bridge.orgId],
      ['X-Manifest-Roles', bridge.actorRoles?.join(',')],
      ['X-Request-Id', bridge.requestId],
    ];
    for (const [k, v] of HEADER_PAIRS) if (v) headerMap[k] = v;

    const parsed = parseBridgeHeaders(headerMap);
    const reconstructed = contextFromBridgeHeaders(parsed);

    expect(reconstructed.actorId).toBe(original.actorId);
    expect(reconstructed.tenantId).toBe(original.tenantId);
    expect(reconstructed.orgId).toBe(original.orgId);
    expect(reconstructed.user?.role).toBe('admin');
  });

  it('rejects federation calls with missing actor identity', () => {
    const result = validateBridgeHeaders({ tenantId: 't-1' });
    expect(result).toContain('missing actor identity');
  });

  it('generates correlation IDs for distributed tracing', () => {
    const existing = ensureCorrelationId('workflow-abc');
    expect(existing).toBe('workflow-abc');
    const generated = ensureCorrelationId();
    expect(generated).toMatch(/^fed-/);
  });

  it('end-to-end: orders service invokes inventory reservation via federation', async () => {
    const ordersDesc = buildDescriptor('orders', ir, { endpoint: 'https://orders.svc:8080' });
    const invDesc: ServiceDescriptor = {
      serviceId: 'inventory',
      endpoint: 'https://inv.svc:8080',
      schemaVersion: '1.0',
      entities: [
        {
          name: 'Item',
          commands: [{ name: 'reserve', idempotent: true, requiredPolicies: ['authenticated'] }],
        },
      ],
    };

    const registry = new FederationRegistry({ healthCheckIntervalMs: 0 });
    registry.registerAll([ordersDesc, invDesc]);

    const invocations: Array<{ entity: string; command: string; input: unknown; bridge: Record<string, string> }> = [];

    const transport: FederationTransport = {
      invoke: async (descriptor, request) => {
        // Record what the client sent so we can assert on the wire format
        invocations.push({
          entity: request.entity,
          command: request.command,
          input: request.input,
          bridge: Object.fromEntries(
            Object.entries({
              'X-Manifest-Actor': request.bridge.actorId,
              'X-Manifest-Tenant': request.bridge.tenantId,
            }).filter(([_, v]) => v !== undefined)
          ) as Record<string, string>,
        });
        const response: FederationResponse = {
          success: true,
          result: { reservationId: 'res-1', quantity: request.input },
          emittedEvents: [],
          handledBy: descriptor.serviceId,
          respondedAt: Date.now(),
        };
        return response;
      },
    };

    const client = new FederationClient(registry, {}, transport);
    const res = await client.invoke({
      serviceId: 'inventory',
      entity: 'Item',
      command: 'reserve',
      input: { skuId: 'sku-1', quantity: 5 },
      bridge: { actorId: 'u-42', tenantId: 't-acme', correlationId: 'wf-1' },
    });

    expect(res.success).toBe(true);
    expect(res.handledBy).toBe('inventory');
    expect(invocations).toHaveLength(1);
    expect(invocations[0].entity).toBe('Item');
    expect(invocations[0].command).toBe('reserve');
    expect(invocations[0].bridge['X-Manifest-Actor']).toBe('u-42');
    expect(invocations[0].bridge['X-Manifest-Tenant']).toBe('t-acme');
  });

  it('generates a typed HTTP adapter with one method per command', () => {
    const desc = buildDescriptor('orders', ir, { endpoint: 'https://orders.svc:8080' });
    const adapter = generateHttpAdapter(desc);
    const adapter2 = generateHttpAdapter(desc);

    // Determinism: same descriptor → same source
    expect(adapter.source).toBe(adapter2.source);

    // Contains generated client class
    expect(adapter.source).toContain('export class OrdersClient');

    // Contains one method per exposed command
    expect(adapter.source).toContain('orderCreateOrder');
    expect(adapter.source).toContain('orderCompleteOrder');
    expect(adapter.source).toContain('orderGetOrderSummary');
  });
});
