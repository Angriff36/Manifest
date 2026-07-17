import { describe, expect, it } from 'vitest';
import type { IR, IRCommand, IREntity, IRExpression, IRProperty } from './ir';
import { buildRelationDependencyPlan, relationReferenceMapping } from './relation-plan';

const id = (name: string): IRExpression => ({ kind: 'identifier', name });
const member = (object: IRExpression, property: string): IRExpression => ({
  kind: 'member',
  object,
  property,
});
const self = (property: string): IRExpression => member(id('self'), property);
const notNull = (expression: IRExpression): IRExpression => ({
  kind: 'binary',
  operator: '!=',
  left: expression,
  right: { kind: 'literal', value: { kind: 'null' } },
});
const stringProperty = (name: string, nullable = false): IRProperty => ({
  name,
  type: { name: 'string', nullable },
  modifiers: nullable ? ['optional'] : [],
});

function fixture(): { ir: IR; shift: IREntity; command: IRCommand } {
  const shift: IREntity = {
    name: 'Shift',
    properties: [
      stringProperty('id'),
      stringProperty('tenantId'),
      stringProperty('personId'),
      stringProperty('locationId', true),
      stringProperty('status'),
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
        foreignKey: { fields: ['locationId'] },
      },
    ],
    commands: ['activate'],
    constraints: [
      {
        name: 'activePerson',
        code: 'activePerson',
        expression: {
          kind: 'binary',
          operator: '==',
          left: member(self('person'), 'status'),
          right: { kind: 'literal', value: { kind: 'string', value: 'active' } },
        },
      },
    ],
    policies: [],
  };
  const command: IRCommand = {
    name: 'activate',
    entity: 'Shift',
    parameters: [],
    policies: ['canActivate'],
    guards: [notNull(self('person'))],
    constraints: [
      {
        name: 'personStillPresent',
        code: 'personStillPresent',
        expression: notNull(id('person')),
      },
    ],
    actions: [{ kind: 'mutate', target: 'status', expression: member(self('person'), 'status') }],
    emits: [],
  };
  const ir: IR = {
    version: '1.0',
    provenance: {
      contentHash: 'relation-plan',
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
    entities: [
      shift,
      {
        name: 'Person',
        properties: [stringProperty('id'), stringProperty('tenantId'), stringProperty('status')],
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [],
        policies: [],
      },
      {
        name: 'Location',
        properties: [stringProperty('id'), stringProperty('tenantId')],
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [],
        policies: [],
      },
    ],
    enums: [],
    stores: [],
    events: [],
    commands: [command],
    policies: [
      {
        name: 'canActivate',
        entity: 'Shift',
        action: 'execute',
        expression: notNull(self('person')),
      },
    ],
  };
  return { ir, shift, command };
}

describe('relation dependency plan', () => {
  it('derives one normalized dependency across every evaluating phase', () => {
    const { ir, shift, command } = fixture();
    const plan = buildRelationDependencyPlan(ir, shift, command);

    expect(plan.relations).toEqual([
      {
        relationName: 'person',
        sourceEntity: 'Shift',
        targetEntity: 'Person',
        kind: 'belongsTo',
        localFields: ['tenantId', 'personId'],
        targetFields: ['tenantId', 'id'],
        optional: false,
        tenantOwnershipRequired: true,
        tenantProperty: 'tenantId',
        phases: ['policy', 'guard', 'commandConstraint', 'entityConstraint', 'action'],
        accessModes: ['value'],
        targetFieldsRead: ['status'],
      },
    ]);
  });

  it('includes only relations actually dereferenced by command evaluation', () => {
    const { ir, shift, command } = fixture();
    const plan = buildRelationDependencyPlan(ir, shift, command);

    expect(plan.relations.map((relation) => relation.relationName)).toEqual(['person']);
    expect(plan.relations.some((relation) => relation.relationName === 'location')).toBe(false);
  });

  it('keeps bare relation identifiers shadowed by command parameters as locals', () => {
    const { ir, shift, command } = fixture();
    command.parameters = [
      { name: 'location', type: { name: 'string', nullable: false }, required: true },
    ];
    command.guards = [notNull(id('location'))];
    command.constraints = [];
    command.actions = [];
    shift.constraints = [];
    ir.policies = [];
    command.policies = [];

    expect(buildRelationDependencyPlan(ir, shift, command).relations).toEqual([]);
  });

  it('normalizes the single-column convention and records optionality', () => {
    const { ir, shift, command } = fixture();
    command.guards = [notNull(self('location'))];
    command.constraints = [];
    command.actions = [];
    shift.constraints = [];
    ir.policies = [];
    command.policies = [];

    const relation = buildRelationDependencyPlan(ir, shift, command).relations[0]!;
    expect(relation.localFields).toEqual(['locationId']);
    expect(relation.targetFields).toEqual(['id']);
    expect(relation.optional).toBe(true);
  });

  it('uses the target composite key when references are omitted with matching arity', () => {
    const { ir, shift } = fixture();
    const relation = shift.relationships[0]!;
    relation.foreignKey = { fields: ['tenantId', 'personId'] };
    const person = ir.entities.find((entity) => entity.name === 'Person')!;
    person.key = ['tenantId', 'id'];

    expect(relationReferenceMapping(shift, relation, person)).toEqual({
      localFields: ['tenantId', 'personId'],
      targetFields: ['tenantId', 'id'],
    });
  });
});
