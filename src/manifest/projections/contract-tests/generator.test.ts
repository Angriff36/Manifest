/**
 * Contract-tests projection — unit tests.
 */

import { describe, it, expect } from 'vitest';
import type { IR, IREntity, IRProperty, IRStore, IRCommand } from '../../ir';
import { ContractTestsProjection } from './generator.js';
import { describeProjection, hasProjection, clearProjections } from '../registry.js';

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

describe('contract-tests projection', () => {
  it('is registered and safely invokable', () => {
    clearProjections();
    expect(hasProjection('contract-tests')).toBe(true);
    const d = describeProjection('contract-tests');
    expect(d.safelyInvokable).toBe(true);
    expect(d.surfaceIds).toContain('contract-tests.convex');
    expect(d.compatibleCompanions).toContain('convex');
  });

  it('emits Vitest assertions for list/get and mutations', () => {
    const ir = emptyIR();
    const props: IRProperty[] = [
      { name: 'sku', type: { name: 'string', nullable: false }, modifiers: ['required'] },
    ];
    const e: IREntity = {
      name: 'Order',
      properties: props,
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    };
    ir.entities = [e];
    ir.stores = [{ entity: 'Order', target: 'durable', config: {} } satisfies IRStore];
    const cmd: IRCommand = {
      entity: 'Order',
      name: 'create',
      parameters: [],
      guards: [],
      actions: [],
      emits: [],
    };
    ir.commands = [cmd];

    const res = new ContractTestsProjection().generate(ir, {
      surface: 'contract-tests.convex',
    });
    const code = res.artifacts[0]!.code;
    expect(code).toContain('listOrder');
    expect(code).toContain('getOrder');
    expect(code).toContain('Order_create');
    expect(code).toContain('MANIFEST_CONTRACT_TEST_COUNT');
  });
});
