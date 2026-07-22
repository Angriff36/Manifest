/**
 * Federation policy-bridge, descriptor, and HTTP adapter tests.
 */

import { describe, it, expect, vi } from 'vitest';
import {
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
import { makeDescriptor, makeMinimalIR } from './test-fixtures';

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
