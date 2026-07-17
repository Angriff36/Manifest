/**
 * Authoritative IR-derived relation dependencies for command evaluation.
 *
 * The plan is intentionally not serialized into IR: relationships and command
 * expressions already contain the complete contract. Runtime and projections
 * derive this immutable view so they cannot drift into separate expression
 * scanners or foreign-key fallback rules.
 */

import type {
  IR,
  IRCommand,
  IREntity,
  IRExpression,
  IRRelationship,
} from './ir.js';

export type RelationEvaluationPhase =
  | 'policy'
  | 'guard'
  | 'commandConstraint'
  | 'entityConstraint'
  | 'action'
  | 'emit';

export type RelationAccessMode = 'value' | 'countOf';

export interface RelationReferenceMapping {
  localFields: readonly string[];
  targetFields: readonly string[];
}

export interface RelationDependency extends RelationReferenceMapping {
  relationName: string;
  sourceEntity: string;
  targetEntity: string;
  kind: IRRelationship['kind'];
  through?: string;
  optional: boolean;
  tenantOwnershipRequired: boolean;
  tenantProperty?: string;
  phases: readonly RelationEvaluationPhase[];
  accessModes: readonly RelationAccessMode[];
  /** Direct target fields read after the relation root (e.g. `status`). */
  targetFieldsRead: readonly string[];
}

export interface RelationDependencyPlan {
  entityName: string;
  commandName: string;
  relations: readonly RelationDependency[];
}

const PHASE_ORDER: readonly RelationEvaluationPhase[] = [
  'policy',
  'guard',
  'commandConstraint',
  'entityConstraint',
  'action',
  'emit',
];

const ACCESS_ORDER: readonly RelationAccessMode[] = ['value', 'countOf'];

const GLOBAL_IDENTIFIERS = new Set([
  'self',
  'this',
  'user',
  'context',
  'args',
  'payload',
  'request',
  'true',
  'false',
  'null',
  'now',
  'uuid',
]);

/**
 * Normalize a forward relationship's local/target columns once for every
 * consumer. Single-column references default to target identity; composite
 * references fall back to the target key when arity matches, then same-name
 * columns, matching the reference runtime's existing composite semantics.
 */
export function relationReferenceMapping(
  _entity: IREntity,
  relationship: IRRelationship,
  targetEntity?: IREntity,
): RelationReferenceMapping {
  const localFields = relationship.foreignKey?.fields?.length
    ? [...relationship.foreignKey.fields]
    : [`${relationship.name}Id`];
  const explicitReferences = relationship.foreignKey?.references;
  let targetFields: string[];
  if (explicitReferences?.length === localFields.length) {
    targetFields = [...explicitReferences];
  } else if (localFields.length === 1) {
    targetFields = ['id'];
  } else if (targetEntity?.key?.length === localFields.length) {
    targetFields = [...targetEntity.key];
  } else {
    targetFields = [...localFields];
  }
  return { localFields, targetFields };
}

interface CollectedDependency {
  phases: Set<RelationEvaluationPhase>;
  accessModes: Set<RelationAccessMode>;
  targetFieldsRead: Set<string>;
}

function memberChain(expression: IRExpression): { root: string; properties: string[] } | undefined {
  const properties: string[] = [];
  let current: IRExpression = expression;
  while (current.kind === 'member') {
    properties.unshift(current.property);
    current = current.object;
  }
  if (current.kind !== 'identifier') return undefined;
  return { root: current.name, properties };
}

function collectExpressionRelations(
  expression: IRExpression | undefined,
  phase: RelationEvaluationPhase,
  relationships: ReadonlyMap<string, IRRelationship>,
  collected: Map<string, CollectedDependency>,
  locals: ReadonlySet<string>,
  accessMode: RelationAccessMode = 'value',
): void {
  if (!expression) return;

  const record = (relationName: string, targetField?: string): void => {
    if (!relationships.has(relationName)) return;
    let entry = collected.get(relationName);
    if (!entry) {
      entry = { phases: new Set(), accessModes: new Set(), targetFieldsRead: new Set() };
      collected.set(relationName, entry);
    }
    entry.phases.add(phase);
    entry.accessModes.add(accessMode);
    if (targetField) entry.targetFieldsRead.add(targetField);
  };

  switch (expression.kind) {
    case 'literal':
      return;
    case 'identifier':
      if (!GLOBAL_IDENTIFIERS.has(expression.name) && !locals.has(expression.name)) {
        record(expression.name);
      }
      return;
    case 'member': {
      const chain = memberChain(expression);
      if (chain) {
        if (chain.root === 'self' || chain.root === 'this') {
          const relationName = chain.properties[0];
          if (relationName) record(relationName, chain.properties[1]);
          return;
        }
        if (!GLOBAL_IDENTIFIERS.has(chain.root) && !locals.has(chain.root)) {
          record(chain.root, chain.properties[0]);
          return;
        }
      }
      collectExpressionRelations(
        expression.object,
        phase,
        relationships,
        collected,
        locals,
        accessMode,
      );
      return;
    }
    case 'binary':
      collectExpressionRelations(
        expression.left,
        phase,
        relationships,
        collected,
        locals,
        accessMode,
      );
      collectExpressionRelations(
        expression.right,
        phase,
        relationships,
        collected,
        locals,
        accessMode,
      );
      return;
    case 'unary':
      collectExpressionRelations(
        expression.operand,
        phase,
        relationships,
        collected,
        locals,
        accessMode,
      );
      return;
    case 'call': {
      const countOf =
        expression.callee.kind === 'identifier' && expression.callee.name === 'count_of';
      expression.args.forEach((argument, index) =>
        collectExpressionRelations(
          argument,
          phase,
          relationships,
          collected,
          locals,
          countOf && index === 0 ? 'countOf' : accessMode,
        ),
      );
      return;
    }
    case 'conditional':
      collectExpressionRelations(
        expression.condition,
        phase,
        relationships,
        collected,
        locals,
        accessMode,
      );
      collectExpressionRelations(
        expression.consequent,
        phase,
        relationships,
        collected,
        locals,
        accessMode,
      );
      collectExpressionRelations(
        expression.alternate,
        phase,
        relationships,
        collected,
        locals,
        accessMode,
      );
      return;
    case 'array':
      for (const element of expression.elements) {
        collectExpressionRelations(
          element,
          phase,
          relationships,
          collected,
          locals,
          accessMode,
        );
      }
      return;
    case 'object':
      for (const property of expression.properties) {
        collectExpressionRelations(
          property.value,
          phase,
          relationships,
          collected,
          locals,
          accessMode,
        );
      }
      return;
    case 'lambda': {
      const lambdaLocals = new Set(locals);
      for (const parameter of expression.params) lambdaLocals.add(parameter);
      collectExpressionRelations(
        expression.body,
        phase,
        relationships,
        collected,
        lambdaLocals,
        accessMode,
      );
      return;
    }
    case 'aggregate':
      for (const predicate of expression.predicates) {
        collectExpressionRelations(
          predicate.value,
          phase,
          relationships,
          collected,
          locals,
          accessMode,
        );
      }
      return;
  }
}

/** Build the authoritative relation dependency plan for one entity command. */
export function buildRelationDependencyPlan(
  ir: IR,
  entity: IREntity,
  command: IRCommand,
): RelationDependencyPlan {
  const relationships = new Map(entity.relationships.map((relation) => [relation.name, relation]));
  const collected = new Map<string, CollectedDependency>();
  const commandLocals = new Set((command.parameters ?? []).map((parameter) => parameter.name));
  for (const action of command.actions ?? []) {
    if (action.kind === 'compute' && action.target) commandLocals.add(action.target);
  }

  const namedPolicies = new Set(command.policies ?? []);
  const policies =
    namedPolicies.size > 0
      ? ir.policies.filter((policy) => namedPolicies.has(policy.name))
      : ir.policies.filter(
          (policy) =>
            (!policy.entity || policy.entity === entity.name) &&
            (policy.action === 'execute' || policy.action === 'all'),
        );
  for (const policy of policies) {
    collectExpressionRelations(
      policy.expression,
      'policy',
      relationships,
      collected,
      commandLocals,
    );
  }
  for (const guard of command.guards ?? []) {
    collectExpressionRelations(guard, 'guard', relationships, collected, commandLocals);
  }
  for (const constraint of command.constraints ?? []) {
    collectExpressionRelations(
      constraint.expression,
      'commandConstraint',
      relationships,
      collected,
      commandLocals,
    );
  }
  for (const constraint of entity.constraints ?? []) {
    collectExpressionRelations(
      constraint.expression,
      'entityConstraint',
      relationships,
      collected,
      new Set(),
    );
  }
  for (const action of command.actions ?? []) {
    collectExpressionRelations(
      action.expression,
      'action',
      relationships,
      collected,
      commandLocals,
    );
  }
  for (const emitPayload of command.emitPayloads ?? []) {
    for (const field of emitPayload.fields) {
      collectExpressionRelations(field.expression, 'emit', relationships, collected, commandLocals);
    }
  }

  const tenantProperty = ir.tenant?.property;
  const relations: RelationDependency[] = [];
  for (const relationship of entity.relationships) {
    const usage = collected.get(relationship.name);
    if (!usage) continue;
    const targetEntity = ir.entities.find((candidate) => candidate.name === relationship.target);
    const mapping = relationReferenceMapping(entity, relationship, targetEntity);
    const localProperties = mapping.localFields.map((field) =>
      entity.properties.find((property) => property.name === field),
    );
    const targetHasTenant =
      !!tenantProperty &&
      !!targetEntity?.properties.some((property) => property.name === tenantProperty);
    const tenantParticipates =
      !!tenantProperty &&
      (mapping.localFields.includes(tenantProperty) || mapping.targetFields.includes(tenantProperty));

    relations.push({
      relationName: relationship.name,
      sourceEntity: entity.name,
      targetEntity: relationship.target,
      kind: relationship.kind,
      ...(relationship.through ? { through: relationship.through } : {}),
      ...mapping,
      optional: localProperties.some(
        (property) =>
          !property || property.type.nullable || property.modifiers.includes('optional'),
      ),
      tenantOwnershipRequired: targetHasTenant && (!!ir.tenant || tenantParticipates),
      ...(tenantProperty ? { tenantProperty } : {}),
      phases: PHASE_ORDER.filter((phase) => usage.phases.has(phase)),
      accessModes: ACCESS_ORDER.filter((mode) => usage.accessModes.has(mode)),
      targetFieldsRead: [...usage.targetFieldsRead].sort((left, right) =>
        left.localeCompare(right),
      ),
    });
  }

  return { entityName: entity.name, commandName: command.name, relations };
}
