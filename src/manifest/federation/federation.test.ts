import { describe, it, expect, vi } from 'vitest';
import {
  FederationRegistry,
  FederationClient,
  buildBridgeHeaders,
  isTransientFailure,
  buildBridgeFromContext,
  contextFromBridgeHeaders,
  parseBridgeHeaders,
  validateBridgeHeaders,
  ensureCorrelationId,
  buildDescriptor,
  generateHttpAdapter,
  renderAdapterSource,
} from './index';
import type { ServiceDescriptor, FederationTransport } from './types';
import type { IR } from '../ir';

// ─── Test Fixtures ───────────────────────────────────────────────────────

function makeDescriptor(overrides: Partial<ServiceDescriptor> = {}): ServiceDescriptor {
  return {
    serviceId: 'orders',
    displayName: 'Orders Service',
    endpoint: 'https://orders.test',
    schemaVersion: '1.0',
    entities: [
      {
        name: 'Order',
        module: 'Sales',
        commands: [
          { name: 'createOrder', idempotent: false, requiredPolicies: ['authenticated'] },
          { name: 'getOrder', idempotent: true, requiredPolicies: [] },
        ],
      },
    ],
    auth: { scheme: 'bearer' },
    ...overrides,
  };
}

function makeMinimalIR(): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'abc123',
      compilerVersion: '1.8.0',
      schemaVersion: '1.0',
      compiledAt: '2026-01-01T00:00:00.000Z',
    },
    modules: [],
    values: [],
    entities: [
      {
        name: 'Order',
        properties: [],
        computedProperties: [],
        relationships: [],
        commands: ['createOrder', 'getOrder'],
        constraints: [],
        policies: [],
      },
    ],
    enums: [],
    stores: [],
    events: [],
    commands: [
      {
        name: 'createOrder',
        entity: 'Order',
        parameters: [],
        guards: [],
        actions: [{ kind: 'persist', expression: { kind: 'literal', value: null } as any }],
        emits: [],
      },
      {
        name: 'getOrder',
        entity: 'Order',
        parameters: [],
        guards: [],
        actions: [],
        emits: [],
      },
    ],
    policies: [
      {
        name: 'authenticated',
        action: 'execute',
        expression: { kind: 'literal', value: true } as any,
      },
    ],
  };
}

// ─── Registry Tests ─────────────────────────────────────────────────────

describe('FederationRegistry', () => {
  it('registers and retrieves services', () => {
    const registry = new FederationRegistry({ healthCheckIntervalMs: 0 });
    const desc = makeDescriptor();
    registry.register(desc);
    const stored = registry.get('orders');
    expect(stored).toBeDefined();
    expect(stored!.serviceId).toBe(desc.serviceId);
    expect(stored!.entities).toEqual(desc.entities);
    expect(registry.list()).toHaveLength(1);
  });

  it('unregisters services', () => {
    const registry = new FederationRegistry({ healthCheckIntervalMs: 0 });
    registry.register(makeDescriptor());
    expect(registry.unregister('orders')).toBe(true);
    expect(registry.get('orders')).toBeUndefined();
  });

  it('registers multiple services at once', () => {
    const registry = new FederationRegistry({ healthCheckIntervalMs: 0 });
    registry.registerAll([
      makeDescriptor({ serviceId: 'orders' }),
      makeDescriptor({ serviceId: 'inventory', endpoint: 'https://inv.test' }),
    ]);
    expect(registry.list()).toHaveLength(2);
  });

  it('finds commands by entity name', () => {
    const registry = new FederationRegistry({ healthCheckIntervalMs: 0 });
    registry.register(makeDescriptor());
    const cmds = registry.findCommandsByEntity('Order');
    expect(cmds).toHaveLength(2);
    expect(cmds.map((c) => c.command.name).sort()).toEqual(['createOrder', 'getOrder']);
  });

  it('finds a specific command by entity + command name', () => {
    const registry = new FederationRegistry({ healthCheckIntervalMs: 0 });
    registry.register(makeDescriptor());
    const found = registry.findCommand('Order', 'createOrder');
    expect(found).toBeDefined();
    expect(found!.command.requiredPolicies).toContain('authenticated');
  });

  it('returns undefined for unknown entity/command', () => {
    const registry = new FederationRegistry({ healthCheckIntervalMs: 0 });
    registry.register(makeDescriptor());
    expect(registry.findCommand('Unknown', 'foo')).toBeUndefined();
  });

  it('filters reachable services', () => {
    const registry = new FederationRegistry({ healthCheckIntervalMs: 0 });
    const desc = makeDescriptor();
    desc.health = { reachable: true, lastCheckedAt: Date.now() };
    registry.register(desc);
    registry.register(
      makeDescriptor({
        serviceId: 'down',
        health: { reachable: false, lastCheckedAt: Date.now() },
      }),
    );
    expect(registry.getReachable()).toHaveLength(1);
  });

  it('stops the health check timer', () => {
    const registry = new FederationRegistry({ healthCheckIntervalMs: 1000 });
    registry.stop();
    // Should not throw and timer should be cleared
  });
});

// ─── Client Tests ───────────────────────────────────────────────────────

describe('FederationClient', () => {
  it('invokes a command via a custom transport', async () => {
    const registry = new FederationRegistry({ healthCheckIntervalMs: 0 });
    registry.register(makeDescriptor());

    const invoke = vi.fn(async (descriptor: ServiceDescriptor) => ({
      success: true,
      result: { id: 'order-1' },
      emittedEvents: [],
      handledBy: descriptor.serviceId,
      respondedAt: Date.now(),
    }));

    const transport: FederationTransport = { invoke };

    const client = new FederationClient(registry, {}, transport);
    const res = await client.invoke({
      serviceId: 'orders',
      entity: 'Order',
      command: 'createOrder',
      input: { customerId: 'c-1' },
      bridge: { actorId: 'u-1', tenantId: 't-1' },
    });

    expect(res.success).toBe(true);
    expect(res.result).toEqual({ id: 'order-1' });
    expect(invoke).toHaveBeenCalledOnce();
  });

  it('returns an error for unknown entity/command', async () => {
    const registry = new FederationRegistry({ healthCheckIntervalMs: 0 });
    registry.register(makeDescriptor());

    const client = new FederationClient(
      registry,
      {},
      {
        invoke: async () => ({
          success: false,
          error: '',
          emittedEvents: [],
          handledBy: 'orders',
          respondedAt: Date.now(),
        }),
      },
    );
    const res = await client.invoke({
      serviceId: 'orders',
      entity: 'Order',
      command: 'unknown',
      input: {},
      bridge: {},
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('not found in federation registry');
  });

  it('retries idempotent commands on transient failure', async () => {
    const registry = new FederationRegistry({ healthCheckIntervalMs: 0 });
    registry.register(makeDescriptor());

    let attempts = 0;
    const transport: FederationTransport = {
      invoke: async (descriptor, _request) => {
        attempts++;
        if (attempts < 3) {
          return {
            success: false,
            error: 'ECONNREFUSED',
            emittedEvents: [],
            handledBy: descriptor.serviceId,
            respondedAt: Date.now(),
          };
        }
        return {
          success: true,
          result: { ok: true },
          emittedEvents: [],
          handledBy: descriptor.serviceId,
          respondedAt: Date.now(),
        };
      },
    };

    const client = new FederationClient(registry, { maxRetries: 3, retryDelayMs: 1 }, transport);

    const res = await client.invoke({
      serviceId: 'orders',
      entity: 'Order',
      command: 'getOrder', // idempotent
      input: {},
      bridge: {},
    });

    expect(res.success).toBe(true);
    expect(attempts).toBe(3);
  });

  it('does not retry non-idempotent commands', async () => {
    const registry = new FederationRegistry({ healthCheckIntervalMs: 0 });
    registry.register(makeDescriptor());

    let attempts = 0;
    const transport: FederationTransport = {
      invoke: async (descriptor) => {
        attempts++;
        return {
          success: false,
          error: 'ECONNREFUSED',
          emittedEvents: [],
          handledBy: descriptor.serviceId,
          respondedAt: Date.now(),
        };
      },
    };

    const client = new FederationClient(registry, { maxRetries: 3, retryDelayMs: 1 }, transport);

    await client.invoke({
      serviceId: 'orders',
      entity: 'Order',
      command: 'createOrder', // NOT idempotent
      input: {},
      bridge: {},
    });

    expect(attempts).toBe(1);
  });
});

// ─── Policy Bridge Tests ────────────────────────────────────────────────

describe('buildBridgeHeaders', () => {
  it('extracts identity fields into header map', () => {
    const headers = buildBridgeHeaders({
      actorId: 'u-1',
      tenantId: 't-1',
      orgId: 'o-1',
      actorRoles: ['admin', 'user'],
      requestId: 'r-1',
      correlationId: 'c-1',
    });
    expect(headers['X-Manifest-Actor']).toBe('u-1');
    expect(headers['X-Manifest-Tenant']).toBe('t-1');
    expect(headers['X-Manifest-Org']).toBe('o-1');
    expect(headers['X-Manifest-Roles']).toBe('admin,user');
    expect(headers['X-Request-Id']).toBe('r-1');
    expect(headers['X-Correlation-Id']).toBe('c-1');
  });

  it('omits undefined fields', () => {
    const headers = buildBridgeHeaders({ actorId: 'u-1' });
    expect(headers['X-Manifest-Actor']).toBe('u-1');
    expect(headers['X-Manifest-Tenant']).toBeUndefined();
  });
});

describe('buildBridgeFromContext', () => {
  it('extracts identity from RuntimeContext', () => {
    const bridge = buildBridgeFromContext({
      actorId: 'u-1',
      tenantId: 't-1',
      orgId: 'o-1',
      requestId: 'r-1',
      user: { id: 'u-1', role: 'admin' },
    });
    expect(bridge.actorId).toBe('u-1');
    expect(bridge.tenantId).toBe('t-1');
    expect(bridge.actorRoles).toEqual(['admin']);
  });

  it('handles context without user role', () => {
    const bridge = buildBridgeFromContext({ actorId: 'u-1' });
    expect(bridge.actorRoles).toBeUndefined();
  });
});

describe('contextFromBridgeHeaders', () => {
  it('reconstructs RuntimeContext from bridge headers', () => {
    const ctx = contextFromBridgeHeaders({
      actorId: 'u-1',
      tenantId: 't-1',
      orgId: 'o-1',
      actorRoles: ['admin'],
      requestId: 'r-1',
      correlationId: 'c-1',
    });
    expect(ctx.actorId).toBe('u-1');
    expect(ctx.tenantId).toBe('t-1');
    expect(ctx.user?.role).toBe('admin');
  });

  it('preserves undefined fields for fail-closed policies', () => {
    const ctx = contextFromBridgeHeaders({});
    expect(ctx.actorId).toBeUndefined();
    expect(ctx.tenantId).toBeUndefined();
  });
});

describe('parseBridgeHeaders', () => {
  it('parses from a plain object (case-insensitive)', () => {
    const bridge = parseBridgeHeaders({
      'x-manifest-actor': 'u-1',
      'X-Manifest-Tenant': 't-1',
      'X-MANIFEST-ROLES': 'admin,user',
    });
    expect(bridge.actorId).toBe('u-1');
    expect(bridge.tenantId).toBe('t-1');
    expect(bridge.actorRoles).toEqual(['admin', 'user']);
  });

  it('extracts bearer token from Authorization header', () => {
    const bridge = parseBridgeHeaders({ Authorization: 'Bearer abc123' });
    expect(bridge.bearerToken).toBe('abc123');
  });
});

describe('validateBridgeHeaders', () => {
  it('passes when actor is present', () => {
    expect(validateBridgeHeaders({ actorId: 'u-1' })).toBeNull();
  });

  it('fails when actor is missing', () => {
    const result = validateBridgeHeaders({ tenantId: 't-1' });
    expect(result).toContain('missing actor identity');
  });
});

describe('ensureCorrelationId', () => {
  it('returns existing ID if provided', () => {
    expect(ensureCorrelationId('existing')).toBe('existing');
  });

  it('generates a new ID with fed- prefix', () => {
    const id = ensureCorrelationId();
    expect(id).toMatch(/^fed-/);
  });
});

describe('isTransientFailure', () => {
  it('returns true for network errors', () => {
    expect(
      isTransientFailure({
        success: false,
        error: 'ECONNREFUSED',
        emittedEvents: [],
        handledBy: 's',
        respondedAt: 0,
      }),
    ).toBe(true);
    expect(
      isTransientFailure({
        success: false,
        error: 'fetch failed',
        emittedEvents: [],
        handledBy: 's',
        respondedAt: 0,
      }),
    ).toBe(true);
    expect(
      isTransientFailure({
        success: false,
        error: 'request timeout',
        emittedEvents: [],
        handledBy: 's',
        respondedAt: 0,
      }),
    ).toBe(true);
  });

  it('returns false for successful responses', () => {
    expect(
      isTransientFailure({ success: true, emittedEvents: [], handledBy: 's', respondedAt: 0 }),
    ).toBe(false);
  });

  it('returns false for application-level errors', () => {
    expect(
      isTransientFailure({
        success: false,
        error: 'Policy denied',
        emittedEvents: [],
        handledBy: 's',
        respondedAt: 0,
      }),
    ).toBe(false);
  });
});

// ─── Descriptor Builder Tests ───────────────────────────────────────────

describe('buildDescriptor', () => {
  it('builds a descriptor from an IR', () => {
    const ir = makeMinimalIR();
    const desc = buildDescriptor('orders', ir, {
      endpoint: 'https://orders.test',
    });
    expect(desc.serviceId).toBe('orders');
    expect(desc.schemaVersion).toBe('1.0');
    expect(desc.entities).toHaveLength(1);
    expect(desc.entities[0].name).toBe('Order');
    expect(desc.entities[0].commands).toHaveLength(2);
  });

  it('filters to specified entities', () => {
    const ir = makeMinimalIR();
    ir.entities.push({
      name: 'Customer',
      properties: [],
      computedProperties: [],
      relationships: [],
      commands: ['createCustomer'],
      constraints: [],
      policies: [],
    });
    ir.commands.push({
      name: 'createCustomer',
      entity: 'Customer',
      parameters: [],
      guards: [],
      actions: [],
      emits: [],
    });
    const desc = buildDescriptor('sales', ir, {
      endpoint: 'https://sales.test',
      exposeEntities: ['Customer'],
    });
    expect(desc.entities).toHaveLength(1);
    expect(desc.entities[0].name).toBe('Customer');
  });

  it('marks emit/effect actions as non-idempotent', () => {
    const ir = makeMinimalIR();
    ir.commands[0].actions = [
      { kind: 'emit', expression: { kind: 'literal', value: null } as any },
    ];
    const desc = buildDescriptor('orders', ir, { endpoint: 'https://x.test' });
    const createOrder = desc.entities[0].commands.find((c) => c.name === 'createOrder')!;
    expect(createOrder.idempotent).toBe(false);
  });
});

// ─── HTTP Adapter Generator Tests ───────────────────────────────────────

describe('generateHttpAdapter', () => {
  it('generates deterministic TypeScript source', () => {
    const desc = makeDescriptor();
    const adapter = generateHttpAdapter(desc);
    expect(adapter.serviceId).toBe('orders');
    expect(adapter.source).toContain('Typed HTTP client adapter for service "orders"');
    expect(adapter.source).toContain('export class OrdersClient');
    expect(adapter.source).toContain('async function invokeCommand');
  });

  it('generates one method per exposed command', () => {
    const desc = makeDescriptor();
    const source = renderAdapterSource(desc);
    expect(source).toContain('orderCreateOrder');
    expect(source).toContain('orderGetOrder');
  });

  it('includes policy bridge header logic', () => {
    const desc = makeDescriptor();
    const source = renderAdapterSource(desc);
    expect(source).toContain('X-Manifest-Actor');
    expect(source).toContain('X-Manifest-Tenant');
    expect(source).toContain('X-Correlation-Id');
  });

  it('create factory returns an object with callable methods', async () => {
    const desc = makeDescriptor();
    const adapter = generateHttpAdapter(desc);
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        result: { id: '1' },
        emittedEvents: [],
        handledBy: 'orders',
        respondedAt: 0,
      }),
    }));
    // Override global fetch for the test
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = mockFetch;
    try {
      const client = adapter.create('https://orders.test', { authToken: 'tok' });
      const result = await (client as any).orderCreateOrder(
        { x: 1 },
        { actorId: 'u-1', tenantId: 't-1' },
      );
      expect(mockFetch).toHaveBeenCalled();
      expect(result.success).toBe(true);
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });
});
