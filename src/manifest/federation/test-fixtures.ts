/**
 * Shared fixtures for federation unit tests.
 */

import type { ServiceDescriptor } from './types';
import type { IR } from '../ir';
import { COMPILER_VERSION } from '../version';
// ─── Test Fixtures ───────────────────────────────────────────────────────

export function makeDescriptor(overrides: Partial<ServiceDescriptor> = {}): ServiceDescriptor {
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

export function makeMinimalIR(): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'abc123',
      compilerVersion: COMPILER_VERSION,
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
