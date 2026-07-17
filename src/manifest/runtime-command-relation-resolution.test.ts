import { describe, expect, it } from 'vitest';
import type { IR, IRCommand, IREntity, IRExpression, IRProperty } from './ir';
import { RuntimeEngine } from './runtime-engine';

const id = (name: string): IRExpression => ({ kind: 'identifier', name });
const member = (object: IRExpression, property: string): IRExpression => ({
  kind: 'member',
  object,
  property,
});
const self = (property: string): IRExpression => member(id('self'), property);
const literal = (value: string): IRExpression => ({
  kind: 'literal',
  value: { kind: 'string', value },
});
const compare = (operator: string, left: IRExpression, right: IRExpression): IRExpression => ({
  kind: 'binary',
  operator,
  left,
  right,
});
const nullLiteral: IRExpression = { kind: 'literal', value: { kind: 'null' } };
const property = (name: string, required = true, nullable = false): IRProperty => ({
  name,
  type: { name: 'string', nullable },
  modifiers: required ? ['required'] : ['optional'],
});

function relationIR(): IR {
  const person: IREntity = {
    name: 'Person',
    properties: [property('id'), property('tenantId'), property('status')],
    computedProperties: [],
    relationships: [],
    commands: [],
    constraints: [],
    policies: [],
  };
  const shift: IREntity = {
    name: 'Shift',
    properties: [
      property('id'),
      property('tenantId'),
      property('personId'),
      property('locationId', false, true),
      property('status'),
    ],
    computedProperties: [],
    relationships: [
      {
        name: 'person',
        kind: 'belongsTo',
        target: 'Person',
        foreignKey: {
          fields: ['tenantId', 'personId'],
          references: ['tenantId', 'id'],
        },
      },
      {
        name: 'location',
        kind: 'ref',
        target: 'Location',
        foreignKey: { fields: ['locationId'], references: ['id'] },
      },
    ],
    commands: ['create', 'activate', 'confirmNoLocation'],
    constraints: [],
    policies: [],
  };
  const location: IREntity = {
    name: 'Location',
    properties: [property('id'), property('tenantId')],
    computedProperties: [],
    relationships: [],
    commands: [],
    constraints: [],
    policies: [],
  };
  const create: IRCommand = {
    name: 'create',
    entity: 'Shift',
    parameters: [
      { name: 'personId', type: { name: 'string', nullable: false }, required: true },
    ],
    guards: [
      compare('!=', self('person'), nullLiteral),
      compare('==', member(self('person'), 'status'), literal('active')),
    ],
    actions: [
      { kind: 'mutate', target: 'personId', expression: id('personId') },
      { kind: 'mutate', target: 'status', expression: literal('scheduled') },
    ],
    emits: [],
  };
  const activate: IRCommand = {
    name: 'activate',
    entity: 'Shift',
    parameters: [],
    guards: [compare('==', member(self('person'), 'status'), literal('active'))],
    actions: [{ kind: 'mutate', target: 'status', expression: literal('active') }],
    emits: [],
  };
  const confirmNoLocation: IRCommand = {
    name: 'confirmNoLocation',
    entity: 'Shift',
    parameters: [],
    guards: [compare('==', self('location'), nullLiteral)],
    actions: [{ kind: 'mutate', target: 'status', expression: literal('unassigned') }],
    emits: [],
  };

  return {
    version: '1.0',
    provenance: {
      contentHash: 'runtime-command-relations',
      compilerVersion: 'test',
      schemaVersion: '1.0',
      compiledAt: '2026-07-16T00:00:00.000Z',
    },
    tenant: {
      property: 'tenantId',
      type: { name: 'string', nullable: false },
      contextPath: 'context.tenantId',
    },
    modules: [],
    values: [],
    entities: [person, shift, location],
    enums: [],
    stores: [
      { entity: 'Person', target: 'memory', config: {} },
      { entity: 'Shift', target: 'memory', config: {} },
      { entity: 'Location', target: 'memory', config: {} },
    ],
    events: [],
    commands: [create, activate, confirmNoLocation],
    policies: [],
  };
}

function engine(tenantId = 't1'): RuntimeEngine {
  return new RuntimeEngine(relationIR(), { tenantId }, { generateId: () => 'shift-created' });
}

describe('runtime command relation resolution', () => {
  it('allows an initialization guard when its composite-mapped target exists', async () => {
    const runtime = engine();
    await runtime.createInstance('Person', { id: 'p1', tenantId: 'ignored', status: 'active' });

    const result = await runtime.runCommand('create', { personId: 'p1' }, { entityName: 'Shift' });

    expect(result.success).toBe(true);
    expect((await runtime.getAllInstances('Shift'))).toHaveLength(1);
  });

  it('rejects an initialization guard when the relation target is missing', async () => {
    const runtime = engine();

    const result = await runtime.runCommand(
      'create',
      { personId: 'missing' },
      { entityName: 'Shift' },
    );

    expect(result.success).toBe(false);
    expect(result.guardFailure?.index).toBe(1);
    expect(await runtime.getAllInstances('Shift')).toEqual([]);
  });

  it('reads a target field from an initialization guard', async () => {
    const runtime = engine();
    await runtime.createInstance('Person', { id: 'p1', tenantId: 'ignored', status: 'inactive' });

    const result = await runtime.runCommand('create', { personId: 'p1' }, { entityName: 'Shift' });

    expect(result.success).toBe(false);
    expect(result.guardFailure?.index).toBe(2);
    expect(await runtime.getAllInstances('Shift')).toEqual([]);
  });

  it('resolves the same composite relation for an instance command', async () => {
    const runtime = engine();
    await runtime.createInstance('Person', { id: 'p1', tenantId: 'ignored', status: 'active' });
    await runtime.createInstance('Shift', {
      id: 's1',
      tenantId: 'ignored',
      personId: 'p1',
      status: 'scheduled',
    });

    const result = await runtime.runCommand('activate', {}, { entityName: 'Shift', instanceId: 's1' });

    expect(result.success).toBe(true);
    expect((await runtime.getInstance('Shift', 's1'))?.status).toBe('active');
  });

  it('fails closed when the only matching target belongs to another tenant', async () => {
    const runtime = engine('t1');
    await runtime.restore({
      stores: {
        Person: [{ id: 'p1', tenantId: 't2', status: 'active' }],
        Shift: [],
        Location: [],
      },
    });

    const result = await runtime.runCommand('create', { personId: 'p1' }, { entityName: 'Shift' });

    expect(result.success).toBe(false);
    expect(result.guardFailure?.index).toBe(1);
    expect(await runtime.getAllInstances('Shift')).toEqual([]);
  });

  it('preserves null behavior for an absent optional relation', async () => {
    const runtime = engine();
    await runtime.createInstance('Shift', {
      id: 's1',
      tenantId: 'ignored',
      personId: 'missing',
      status: 'scheduled',
    });

    const result = await runtime.runCommand(
      'confirmNoLocation',
      {},
      { entityName: 'Shift', instanceId: 's1' },
    );

    expect(result.success).toBe(true);
    expect((await runtime.getInstance('Shift', 's1'))?.status).toBe('unassigned');
  });

  it('never persists the hydrated relation object on the created row', async () => {
    const runtime = engine();
    await runtime.createInstance('Person', { id: 'p1', tenantId: 'ignored', status: 'active' });
    await runtime.runCommand('create', { personId: 'p1' }, { entityName: 'Shift' });

    const stored = (await runtime.serialize()).stores.Shift[0]!;
    expect(stored.personId).toBe('p1');
    expect(stored).not.toHaveProperty('person');
    expect(stored).not.toHaveProperty('_entity');
  });
});
