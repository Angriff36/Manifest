/**
 * LLM Context projection — generates a structured manifest-context.json
 * optimized for AI agent context injection.
 *
 * Enables agents to fully understand the domain model (entities, commands,
 * policies, constraints, relationships, enums, events) in a single context load.
 *
 * Surfaces:
 *   - llm-context.full    — complete manifest-context.json with all sections
 *   - llm-context.summary — lightweight summary without full IR or expressions
 *   - llm-context.ir      — raw IR passthrough as JSON
 */

import type { IR, IRExpression, IRType, IRValue } from '../../ir';
import type {
  ProjectionTarget,
  ProjectionRequest,
  ProjectionResult,
} from '../interface';
import type {
  LlmContextProjectionOptions,
  ManifestContext,
  ManifestContextMeta,
  DomainSummary,
  EntityContext,
  CommandContext,
  PolicyContext,
  ConstraintContext,
  RelationshipEdge,
  EnumContext,
  EventContext,
  StoreContext,
} from './types';

// ---------------------------------------------------------------------------
// Expression formatting (standalone, mirrors agent-sdk/introspect.ts)
// ---------------------------------------------------------------------------

function formatExpression(expr: IRExpression): string {
  switch (expr.kind) {
    case 'literal':
      return formatValue(expr.value);
    case 'identifier':
      return expr.name;
    case 'member':
      return `${formatExpression(expr.object)}.${expr.property}`;
    case 'binary':
      return `${formatExpression(expr.left)} ${expr.operator} ${formatExpression(expr.right)}`;
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
      return `(${expr.params.join(', ')}) => ${formatExpression(expr.body)}`;
    case 'aggregate':
      return `count(${expr.entity} where ${expr.predicates.map((p) => `${p.field} == ${formatExpression(p.value)}`).join(', ')})`;
  }
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

function formatIRType(type: IRType): string {
  const base = type.name;
  const inner = type.generic ? `<${formatIRType(type.generic)}>` : '';
  const nullability = type.nullable ? ' | null' : '';
  return `${base}${inner}${nullability}`;
}

function irValueToJson(v: IRValue): unknown {
  switch (v.kind) {
    case 'string':
    case 'number':
    case 'boolean':
      return v.value;
    case 'null':
      return null;
    case 'array':
      return v.elements.map(irValueToJson);
    case 'object':
      return Object.fromEntries(
        Object.entries(v.properties).map(([k, val]) => [k, irValueToJson(val)])
      );
  }
}

// ---------------------------------------------------------------------------
// Context builders
// ---------------------------------------------------------------------------

function buildMeta(ir: IR): ManifestContextMeta {
  return {
    generatedAt: new Date().toISOString(),
    compilerVersion: ir.provenance.compilerVersion,
    schemaVersion: ir.provenance.schemaVersion,
    contentHash: ir.provenance.contentHash,
    projection: 'llm-context',
  };
}

function buildDomainSummary(ir: IR): DomainSummary {
  const allConstraints = ir.entities.reduce(
    (sum, e) => sum + e.constraints.length,
    0
  );
  return {
    entityCount: ir.entities.length,
    commandCount: ir.commands.length,
    policyCount: ir.policies.length,
    constraintCount: allConstraints,
    enumCount: ir.enums.length,
    eventCount: ir.events.length,
    modules: ir.modules.map((m) => m.name),
    multiTenant: ir.tenant !== undefined,
  };
}

function buildEntityContexts(ir: IR, includeExpressions: boolean): EntityContext[] {
  return ir.entities.map((entity) => {
    const entityCommands = ir.commands
      .filter((c) => c.entity === entity.name)
      .map((c) => c.name);

    return {
      name: entity.name,
      module: entity.module,
      properties: entity.properties.map((p) => ({
        name: p.name,
        type: formatIRType(p.type),
        required: p.modifiers.includes('required'),
        modifiers: [...p.modifiers],
        defaultValue: p.defaultValue !== undefined ? irValueToJson(p.defaultValue) : undefined,
      })),
      computedProperties: entity.computedProperties.map((cp) => ({
        name: cp.name,
        type: formatIRType(cp.type),
        expression: includeExpressions ? formatExpression(cp.expression) : '[omitted]',
        dependencies: [...cp.dependencies],
      })),
      relationships: entity.relationships.map((r) => ({
        name: r.name,
        kind: r.kind,
        target: r.target,
        foreignKey: r.foreignKey,
        through: r.through,
      })),
      constraints: entity.constraints.map((c) => ({
        name: c.name,
        code: c.code,
        severity: c.severity ?? 'block',
        expression: includeExpressions ? formatExpression(c.expression) : '[omitted]',
        message: c.message,
        overrideable: c.overrideable,
      })),
      commands: entityCommands,
      policies: [...entity.policies],
      key: entity.key,
      transitions: entity.transitions,
    };
  });
}

function buildCommandContexts(ir: IR, includeExpressions: boolean): CommandContext[] {
  return ir.commands.map((cmd) => ({
    name: cmd.name,
    module: cmd.module,
    entity: cmd.entity,
    parameters: cmd.parameters.map((p) => ({
      name: p.name,
      type: formatIRType(p.type),
      required: p.required && p.defaultValue === undefined,
      defaultValue: p.defaultValue !== undefined ? irValueToJson(p.defaultValue) : undefined,
    })),
    guards: cmd.guards.map((g) =>
      includeExpressions ? formatExpression(g) : '[omitted]'
    ),
    constraints: (cmd.constraints ?? []).map((c) => ({
      name: c.name,
      code: c.code,
      severity: c.severity ?? 'block',
      expression: includeExpressions ? formatExpression(c.expression) : '[omitted]',
      message: c.message,
    })),
    policies: [...(cmd.policies ?? [])],
    actions: cmd.actions.map((a) => ({
      kind: a.kind,
      target: a.target,
      expression: includeExpressions ? formatExpression(a.expression) : '[omitted]',
    })),
    emits: [...cmd.emits],
    returns: cmd.returns ? formatIRType(cmd.returns) : undefined,
  }));
}

function buildPolicies(ir: IR): PolicyContext[] {
  return ir.policies.map((p) => ({
    name: p.name,
    module: p.module,
    entity: p.entity,
    action: p.action,
    expression: formatExpression(p.expression),
    message: p.message,
  }));
}

function buildConstraints(ir: IR, includeExpressions: boolean): ConstraintContext[] {
  const result: ConstraintContext[] = [];
  for (const entity of ir.entities) {
    for (const c of entity.constraints) {
      result.push({
        entity: entity.name,
        name: c.name,
        code: c.code,
        severity: c.severity ?? 'block',
        expression: includeExpressions ? formatExpression(c.expression) : '[omitted]',
        message: c.message,
        overrideable: c.overrideable,
      });
    }
  }
  return result;
}

function buildRelationshipEdges(ir: IR): RelationshipEdge[] {
  const edges: RelationshipEdge[] = [];
  for (const entity of ir.entities) {
    for (const r of entity.relationships) {
      edges.push({
        source: entity.name,
        target: r.target,
        kind: r.kind,
        name: r.name,
        foreignKey: r.foreignKey,
        through: r.through,
      });
    }
  }
  return edges;
}

function buildEnums(ir: IR): EnumContext[] {
  return ir.enums.map((e) => ({
    name: e.name,
    module: e.module,
    values: e.values.map((v) => ({
      name: v.name,
      label: v.label,
      ordinal: v.ordinal,
    })),
  }));
}

function buildEvents(ir: IR): EventContext[] {
  return ir.events.map((e) => {
    let payload: string;
    if (Array.isArray(e.payload)) {
      payload = `{${e.payload.map((f) => `${f.name}: ${formatIRType(f.type)}`).join(', ')}}`;
    } else {
      payload = formatIRType(e.payload);
    }
    return { name: e.name, channel: e.channel, payload };
  });
}

function buildStores(ir: IR): StoreContext[] {
  return ir.stores.map((s) => ({
    entity: s.entity,
    target: s.target,
  }));
}

// ---------------------------------------------------------------------------
// Full context assembly
// ---------------------------------------------------------------------------

function buildManifestContext(
  ir: IR,
  opts: Required<LlmContextProjectionOptions>
): ManifestContext {
  const ctx: ManifestContext = {
    $schema: 'manifest-context/v1',
    meta: buildMeta(ir),
    domain: buildDomainSummary(ir),
    entities: buildEntityContexts(ir, opts.includeExpressions),
    commands: buildCommandContexts(ir, opts.includeExpressions),
    policies: buildPolicies(ir),
    constraints: buildConstraints(ir, opts.includeExpressions),
    relationships: buildRelationshipEdges(ir),
  };

  if (opts.includeEnums) {
    ctx.enums = buildEnums(ir);
  }
  if (opts.includeEvents) {
    ctx.events = buildEvents(ir);
  }
  if (opts.includeStores) {
    ctx.stores = buildStores(ir);
  }
  if (opts.includeRawIR) {
    ctx.ir = ir;
  }

  return ctx;
}

// ---------------------------------------------------------------------------
// Projection class
// ---------------------------------------------------------------------------

const DEFAULT_OPTIONS: Required<LlmContextProjectionOptions> = {
  includeRawIR: true,
  includeExpressions: true,
  includeEnums: true,
  includeEvents: true,
  includeStores: true,
  emitHeader: true,
};

function resolveOptions(
  request: ProjectionRequest
): Required<LlmContextProjectionOptions> {
  return { ...DEFAULT_OPTIONS, ...(request.options as LlmContextProjectionOptions) };
}

export class LlmContextProjection implements ProjectionTarget {
  readonly name = 'llm-context';
  readonly description =
    'Structured manifest-context.json for LLM context injection — entities, commands, policies, constraints, and relationships in one document.';
  readonly surfaces = [
    'llm-context.full',
    'llm-context.summary',
    'llm-context.ir',
  ] as const;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    const { surface } = request;
    const opts = resolveOptions(request);

    switch (surface) {
      case 'llm-context.full':
        return this.generateFull(ir, opts);
      case 'llm-context.summary':
        return this.generateSummary(ir, opts);
      case 'llm-context.ir':
        return this.generateIR(ir, opts);
      default:
        return {
          artifacts: [],
          diagnostics: [
            {
              severity: 'warning',
              message: `Unknown surface "${surface}". Available: ${this.surfaces.join(', ')}`,
            },
          ],
        };
    }
  }

  private generateFull(
    ir: IR,
    opts: Required<LlmContextProjectionOptions>
  ): ProjectionResult {
    const ctx = buildManifestContext(ir, opts);
    const code = JSON.stringify(ctx, null, 2);

    return {
      artifacts: [
        {
          id: 'llm-context-full',
          pathHint: 'manifest-context.json',
          contentType: 'json',
          code,
        },
      ],
      diagnostics: [],
    };
  }

  private generateSummary(
    ir: IR,
    opts: Required<LlmContextProjectionOptions>
  ): ProjectionResult {
    // Summary mode: no raw IR, no expressions
    const summaryOpts: Required<LlmContextProjectionOptions> = {
      ...opts,
      includeRawIR: false,
      includeExpressions: false,
    };
    const ctx = buildManifestContext(ir, summaryOpts);
    const code = JSON.stringify(ctx, null, 2);

    return {
      artifacts: [
        {
          id: 'llm-context-summary',
          pathHint: 'manifest-context-summary.json',
          contentType: 'json',
          code,
        },
      ],
      diagnostics: [],
    };
  }

  private generateIR(
    ir: IR,
    _opts: Required<LlmContextProjectionOptions>
  ): ProjectionResult {
    const code = JSON.stringify(ir, null, 2);

    return {
      artifacts: [
        {
          id: 'llm-context-ir',
          pathHint: 'manifest-ir.json',
          contentType: 'json',
          code,
        },
      ],
      diagnostics: [],
    };
  }
}
