/**
 * Config G2 validation.rules registry tests.
 */

import { describe, expect, it } from 'vitest';
import type { IR, IREntity, IRCommand, IRPolicy, IRRelationship } from './ir.js';
import { resolveValidationRules, runValidationRules } from './validation-rules.js';

function emptyIR(partial: Partial<IR> = {}): IR {
  return {
    version: '1.0.0',
    entities: [],
    commands: [],
    policies: [],
    stores: [],
    events: [],
    enums: [],
    provenance: {
      contentHash: 'x',
      compilerVersion: 'test',
      schemaVersion: '1',
      compiledAt: '1970-01-01T00:00:00.000Z',
    },
    ...partial,
  } as IR;
}

function entity(name: string, rels: IRRelationship[] = [], defaults?: string[]): IREntity {
  return {
    name,
    properties: [],
    relationships: rels,
    computedProperties: [],
    constraints: [],
    defaultPolicies: defaults,
    commands: [],
    policies: [],
  } as IREntity;
}

function command(entityName: string, name: string): IRCommand {
  return {
    name,
    entity: entityName,
    parameters: [],
    guards: [],
    actions: [],
    emits: [],
  } as IRCommand;
}

function policy(name: string, entityName: string): IRPolicy {
  return {
    name,
    entity: entityName,
    action: 'execute',
    expression: { kind: 'literal', value: { kind: 'boolean', value: true } },
  } as IRPolicy;
}

describe('resolveValidationRules', () => {
  it('defaults all rules off', () => {
    expect(resolveValidationRules(undefined)).toEqual({
      'missing-policy': 'off',
      'unused-entity': 'off',
      'orphan-relationship': 'off',
    });
  });

  it('honors configured severities', () => {
    expect(
      resolveValidationRules({
        'missing-policy': 'error',
        'unused-entity': 'warn',
      }),
    ).toMatchObject({
      'missing-policy': 'error',
      'unused-entity': 'warn',
      'orphan-relationship': 'off',
    });
  });
});

describe('runValidationRules', () => {
  it('emits nothing when rules are off', () => {
    const ir = emptyIR({
      entities: [entity('Lone')],
      commands: [command('Lone', 'create')],
    });
    expect(runValidationRules(ir, undefined)).toEqual([]);
  });

  it('missing-policy fires when entity has commands but no policies', () => {
    const ir = emptyIR({
      entities: [entity('Task')],
      commands: [command('Task', 'create')],
    });
    const diags = runValidationRules(ir, { 'missing-policy': 'warn' });
    expect(diags).toHaveLength(1);
    expect(diags[0]?.code).toBe('CONFIG_VALIDATION_RULE_MISSING_POLICY');
    expect(diags[0]?.severity).toBe('warning');
  });

  it('missing-policy silent when defaultPolicies or policy present', () => {
    const withDefault = emptyIR({
      entities: [entity('Task', [], ['staffWrite'])],
      commands: [command('Task', 'create')],
    });
    expect(runValidationRules(withDefault, { 'missing-policy': 'error' })).toEqual([]);

    const withPolicy = emptyIR({
      entities: [entity('Task')],
      commands: [command('Task', 'create')],
      policies: [policy('staffWrite', 'Task')],
    });
    expect(runValidationRules(withPolicy, { 'missing-policy': 'error' })).toEqual([]);
  });

  it('unused-entity fires for bare declarations', () => {
    const ir = emptyIR({ entities: [entity('Ghost')] });
    const diags = runValidationRules(ir, { 'unused-entity': 'error' });
    expect(diags[0]?.code).toBe('CONFIG_VALIDATION_RULE_UNUSED_ENTITY');
    expect(diags[0]?.severity).toBe('error');
  });

  it('orphan-relationship fires for one-sided belongsTo', () => {
    const ir = emptyIR({
      entities: [
        entity('Parent'),
        entity('Child', [{ name: 'parent', kind: 'belongsTo', target: 'Parent' }]),
      ],
    });
    const diags = runValidationRules(ir, { 'orphan-relationship': 'warn' });
    expect(diags[0]?.code).toBe('CONFIG_VALIDATION_RULE_ORPHAN_RELATIONSHIP');
  });
});
