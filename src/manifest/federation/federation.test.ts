import { describe, it, expect, vi } from 'vitest';
import {
  FederationRegistry,
  FederationClient,
} from './index';
import type { ServiceDescriptor, FederationTransport } from './types';
import { makeDescriptor } from './test-fixtures';

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
