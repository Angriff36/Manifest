/**
 * IR introspection helpers for AI agent consumption.
 * Pure functions that extract meaningful summaries from compiled IR.
 */

import type {
  IR,
  IREntity,
  IRCommand,
  IRExpression,
  IRType,
  IRValue,
  IRConstraint,
  IRPolicy,
} from '../ir';
import type {
  EntitySummary,
  EntityDetails,
  CommandSummary,
  CommandDetails,
  ParameterDescriptor,
  GuardDescriptor,
  RelationshipGraph,
  ConstraintDescriptor,
  PolicyDescriptor,
} from './types';

// ------------------------------------------------------------------------------------------------
// Expression formatter (reimplements RuntimeEngine private formatter)
// ------------------------------------------------------------------------------------------------

/** Standalone expression formatter — mirrors the algorithm from RuntimeEngine.formatExpression. */
export function formatExpression(expr: IRExpression): string {
  switch (expr.kind) {
    case 'literal':
      return formatValue(expr.value);
    case 'identifier':
      return expr.name;
    case 'member':
      return `${formatExpression(expr.object)}.${expr.property}`;
    case 'binary': {
      const left = wrapBinary(expr.left, expr.operator);
      const right = wrapBinary(expr.right, expr.operator);
      return `${left} ${expr.operator} ${right}`;
    }
    case 'unary':
      return `${expr.operator}${formatExpression(expr.operand)}`;
    case 'call':
      return `${formatExpression(expr.callee)}(${expr.args.map(formatExpression).join(', ')})`;
    case 'conditional':
      return `${formatExpression(expr.condition)} ? ${formatExpression(expr.consequent)} : ${formatExpression(expr.alternate)}`;
    case 'array':
      return `[${expr.elements.map(formatExpression).join(', ')}]`;
    case 'object':
      return `{${expr.properties.map((p) => `${p.key}: ${formatExpression(p.value)}`).join(', ')}}`;
    case 'lambda':
      return `(${expr.params.join(',')}) => ${formatExpression(expr.body)}`;
    case 'aggregate':
      return `count(${expr.entity} where ${expr.predicates.map((p) => `${p.field} == ${formatExpression(p.value)}`).join(', ')})`;
  }
}

function wrapBinary(expr: IRExpression, _operator: string): string {
  const s = formatExpression(expr);
  if (isCompound(expr)) return s;
  // No parens needed for identifiers and literals
  return s;
}

function isCompound(expr: IRExpression): boolean {
  return (
    expr.kind === 'binary' ||
    expr.kind === 'unary' ||
    expr.kind === 'conditional' ||
    expr.kind === 'lambda'
  );
}

function formatValue(v: IRValue): string {
  switch (v.kind) {
    case 'string':
      return `"${v.value}"`;
    case 'number':
    case 'boolean':
      return String(v.value);
    case 'null':
      return 'null';
    case 'array':
      return `[${v.elements.map(formatValue).join(', ')}]`;
    case 'object':
      return `{${Object.entries(v.properties)
        .map(([k, val]) => `"${k}": ${formatValue(val)}`)
        .join(', ')}}`;
  }
}

export function formatIRType(type: IRType): string {
  const base = type.name;
  const inner = type.generic ? `<${formatIRType(type.generic)}>` : '';
  const nullability = type.nullable ? ' | null' : '';
  return `${base}${inner}${nullability}`;
}

// ------------------------------------------------------------------------------------------------
// Entity Introspection
// ------------------------------------------------------------------------------------------------

/**
 * List all entities as lightweight summaries.
 */
export function listEntities(ir: IR): EntitySummary[] {
  return ir.entities.map((e) => entityToSummary(e, ir));
}

function entityToSummary(e: IREntity, ir: IR): EntitySummary {
  // Count commands that target this entity
  const commandCount = ir.commands.filter((c) => c.entity === e.name).length;
  return {
    name: e.name,
    module: e.module,
    propertyCount: e.properties.length,
    computedPropertyCount: e.computedProperties.length,
    relationshipCount: e.relationships.length,
    commandCount,
    constraintCount: e.constraints.length,
  };
}

/**
 * Get detailed information about a single entity.
 */
export function describeEntity(ir: IR, name: string): EntityDetails | null {
  const entity = ir.entities.find((e) => e.name === name);
  if (!entity) return null;

  return {
    summary: entityToSummary(entity, ir),
    properties: entity.properties.map((p) => ({
      name: p.name,
      type: formatIRType(p.type),
      required: p.modifiers.includes('required'),
      defaultValue: p.defaultValue !== undefined ? irValueToJson_(p.defaultValue) : undefined,
      modifiers: p.modifiers,
    })),
    computedProperties: entity.computedProperties.map((cp) => ({
      name: cp.name,
      type: formatIRType(cp.type),
      dependencies: cp.dependencies,
      expression: formatExpression(cp.expression),
    })),
    relationships: entity.relationships.map((r) => ({
      name: r.name,
      kind: r.kind,
      target: r.target,
      foreignKey: r.foreignKey,
      through: r.through,
    })),
    constraints: entity.constraints.map((c) => constraintToDescriptor(c)),
    policies: entity.policies.map((polName) => {
      const pol = ir.policies.find((p) => p.name === polName);
      return pol
        ? policyToDescriptor(pol)
        : { name: polName, action: 'unknown', expression: '', message: undefined };
    }),
    key: entity.key,
    alternateKeys: entity.alternateKeys,
    versionProperty: entity.versionProperty,
    transitions: entity.transitions,
  };
}

function irValueToJson_(v: IRValue): unknown {
  switch (v.kind) {
    case 'string':
    case 'number':
    case 'boolean':
      return v.value;
    case 'null':
      return null;
    case 'array':
      return v.elements.map(irValueToJson_);
    case 'object':
      return Object.fromEntries(
        Object.entries(v.properties).map(([k, val]) => [k, irValueToJson_(val)]),
      );
  }
}

// ------------------------------------------------------------------------------------------------
// Command Introspection
// ------------------------------------------------------------------------------------------------

/**
 * List all commands as lightweight summaries.
 * Optional filter by entity or module.
 */
export function listCommands(
  ir: IR,
  opts?: { entity?: string; module?: string },
): CommandSummary[] {
  return ir.commands
    .filter((c) => (opts?.entity ? c.entity === opts.entity : true))
    .filter((c) => (opts?.module ? c.module === opts.module : true))
    .map((c) => commandToSummary(c));
}

function commandToSummary(c: IRCommand): CommandSummary {
  return {
    name: c.name,
    module: c.module,
    entity: c.entity,
    parameterCount: c.parameters.length,
    guardCount: c.guards.length,
    constraintCount: c.constraints?.length ?? 0,
    policyCount: c.policies?.length ?? 0,
    emitsCount: c.emits.length,
  };
}

/**
 * Get detailed information about a single command.
 */
export function describeCommand(
  ir: IR,
  name: string,
  opts?: { includeGuardExpressions?: boolean; includeActionExpressions?: boolean },
): CommandDetails | null {
  const cmd = ir.commands.find((c) => c.name === name);
  if (!cmd) return null;

  const parameters: ParameterDescriptor[] = cmd.parameters.map((p) => ({
    name: p.name,
    type: formatIRType(p.type),
    required: p.required && p.defaultValue === undefined,
    defaultValue: p.defaultValue !== undefined ? irValueToJson_(p.defaultValue) : undefined,
  }));

  const guards: GuardDescriptor[] = cmd.guards.map((g, i) => ({
    index: i,
    expression: formatExpression(g),
  }));

  const constraints: ConstraintDescriptor[] = (cmd.constraints ?? []).map(constraintToDescriptor);

  const policies: PolicyDescriptor[] = (cmd.policies ?? []).map((polName) => {
    const pol = ir.policies.find((p) => p.name === polName);
    return pol
      ? policyToDescriptor(pol)
      : { name: polName, action: 'execute', expression: '', message: undefined };
  });

  const actions = opts?.includeActionExpressions
    ? cmd.actions.map((a) => ({
        kind: a.kind,
        target: a.target,
        expression: formatExpression(a.expression),
      }))
    : cmd.actions.map((a) => ({
        kind: a.kind,
        target: a.target,
        expression: '[redacted]',
      }));

  return {
    summary: commandToSummary(cmd),
    parameters,
    guards,
    constraints,
    policies,
    emits: cmd.emits,
    returns: cmd.returns ? formatIRType(cmd.returns) : undefined,
    actions,
  };
}

function constraintToDescriptor(c: IRConstraint): ConstraintDescriptor {
  return {
    name: c.name,
    code: c.code,
    severity: c.severity ?? 'block',
    message: c.message,
    expression: formatExpression(c.expression),
    overrideable: c.overrideable,
  };
}

function policyToDescriptor(p: IRPolicy): PolicyDescriptor {
  return {
    name: p.name,
    action: p.action,
    expression: formatExpression(p.expression),
    message: p.message,
  };
}

// ------------------------------------------------------------------------------------------------
// Relationship Graph
// ------------------------------------------------------------------------------------------------

/**
 * Get the relationship graph for an entity.
 * Shows both outgoing relationships (this entity → others) and incoming (others → this).
 */
export function getEntityRelationships(ir: IR, name: string): RelationshipGraph {
  const entity = ir.entities.find((e) => e.name === name);
  if (!entity) return { entity: name, relationships: [] };

  const rels: RelationshipGraph['relationships'] = [];

  // Outgoing from this entity
  for (const r of entity.relationships) {
    rels.push({
      name: r.name,
      kind: r.kind,
      target: r.target,
      direction: 'outgoing',
      foreignKey: r.foreignKey,
      through: r.through,
    });
  }

  // Incoming: find other entities that have a relationship targeting this entity
  for (const other of ir.entities) {
    if (other.name === name) continue;
    for (const r of other.relationships) {
      if (r.target === name) {
        rels.push({
          name: r.name,
          kind: r.kind,
          target: other.name,
          direction: 'incoming',
          foreignKey: r.foreignKey,
          through: r.through,
        });
      }
    }
  }

  return { entity: name, relationships: rels };
}

// ------------------------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------------------------

/**
 * Get entities that have commands — useful for showing which entities are "actionable".
 */
export function getActionableEntities(ir: IR): EntitySummary[] {
  const actionableNames = new Set(
    ir.commands.map((c) => c.entity).filter((n): n is string => n !== undefined),
  );
  return listEntities(ir).filter((e) => actionableNames.has(e.name));
}
