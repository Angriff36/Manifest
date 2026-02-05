import { Parser } from './parser';
import {
  ManifestProgram,
  EntityNode,
  PropertyNode,
  ComputedPropertyNode,
  RelationshipNode,
  CommandNode,
  ParameterNode,
  PolicyNode,
  StoreNode,
  OutboxEventNode,
  ConstraintNode,
  ActionNode,
  ExpressionNode,
  TypeNode,
} from './types';
import {
  IR,
  IRModule,
  IREntity,
  IRProperty,
  IRComputedProperty,
  IRRelationship,
  IRConstraint,
  IRStore,
  IREvent,
  IRCommand,
  IRParameter,
  IRAction,
  IRPolicy,
  IRType,
  IRValue,
  IRExpression,
  IRDiagnostic,
  CompileToIRResult,
  PropertyModifier,
  IRProvenance,
} from './ir';

/** Compiler version (from package.json) */
const COMPILER_VERSION = '0.0.0';
/** IR schema version */
const SCHEMA_VERSION = '1.0';

/**
 * Compute SHA-256 hash of the source manifest
 */
async function computeContentHash(source: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(source);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create provenance metadata for the IR
 */
async function createProvenance(source: string, irHash?: string): Promise<IRProvenance> {
  return {
    contentHash: await computeContentHash(source),
    irHash,
    compilerVersion: COMPILER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    compiledAt: new Date().toISOString(),
  };
}

/**
 * Compute SHA-256 hash of the IR for runtime integrity verification
 * This creates a canonical representation by sorting keys and excluding the irHash itself
 */
async function computeIRHash(ir: IR): Promise<string> {
  // Create a copy of the IR without the irHash for hashing
  const { provenance, ...irWithoutProvenance } = ir as IR & { provenance: IRProvenance };
  const { irHash: _irHash, ...provenanceWithoutIrHash } = provenance;

  const canonical = {
    ...irWithoutProvenance,
    provenance: provenanceWithoutIrHash,
  };

  // Use deterministic JSON serialization
  const json = JSON.stringify(canonical, Object.keys(canonical).sort());
  const encoder = new TextEncoder();
  const data = encoder.encode(json);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export class IRCompiler {
  private diagnostics: IRDiagnostic[] = [];

  async compileToIR(source: string): Promise<CompileToIRResult> {
    this.diagnostics = [];

    const parser = new Parser();
    const { program, errors } = parser.parse(source);

    for (const err of errors) {
      this.diagnostics.push({
        severity: err.severity,
        message: err.message,
        line: err.position?.line,
        column: err.position?.column,
      });
    }

    if (errors.some(e => e.severity === 'error')) {
      return { ir: null, diagnostics: this.diagnostics };
    }

    const ir = await this.transformProgram(program, source);
    return { ir, diagnostics: this.diagnostics };
  }

  private async transformProgram(program: ManifestProgram, source: string): Promise<IR> {
    const modules: IRModule[] = program.modules.map(m => this.transformModule(m));
    const entities: IREntity[] = [
      ...program.entities.map(e => this.transformEntity(e)),
      ...program.modules.flatMap(m => m.entities.map(e => this.transformEntity(e, m.name))),
    ];
    const stores: IRStore[] = [
      ...program.stores.map(s => this.transformStore(s)),
      ...program.modules.flatMap(m => m.stores.map(s => this.transformStore(s))),
    ];
    const events: IREvent[] = [
      ...program.events.map(e => this.transformEvent(e)),
      ...program.modules.flatMap(m => m.events.map(e => this.transformEvent(e))),
    ];
    const commands: IRCommand[] = [
      ...program.commands.map(c => this.transformCommand(c)),
      ...program.modules.flatMap(m => m.commands.map(c => this.transformCommand(c, m.name))),
      ...program.entities.flatMap(e => e.commands.map(c => this.transformCommand(c, undefined, e.name))),
      ...program.modules.flatMap(m => m.entities.flatMap(e => e.commands.map(c => this.transformCommand(c, m.name, e.name)))),
    ];
    const policies: IRPolicy[] = [
      ...program.policies.map(p => this.transformPolicy(p)),
      ...program.modules.flatMap(m => m.policies.map(p => this.transformPolicy(p, m.name))),
    ];

    // Create IR without irHash first, then compute hash and add to provenance
    const irWithoutHash: IR = {
      version: '1.0',
      provenance: await createProvenance(source),
      modules,
      entities,
      stores,
      events,
      commands,
      policies,
    };

    // Compute the IR hash and create final IR with hash in provenance
    const irHash = await computeIRHash(irWithoutHash);
    return {
      ...irWithoutHash,
      provenance: await createProvenance(source, irHash),
    };
  }

  private transformModule(m: { name: string; entities: EntityNode[]; commands: CommandNode[]; stores: StoreNode[]; events: OutboxEventNode[]; policies: PolicyNode[] }): IRModule {
    return {
      name: m.name,
      entities: m.entities.map(e => e.name),
      commands: m.commands.map(c => c.name),
      stores: m.stores.map(s => s.entity),
      events: m.events.map(e => e.name),
      policies: m.policies.map(p => p.name),
    };
  }

  private transformEntity(e: EntityNode, moduleName?: string): IREntity {
    return {
      name: e.name,
      module: moduleName,
      properties: e.properties.map(p => this.transformProperty(p)),
      computedProperties: e.computedProperties.map(cp => this.transformComputedProperty(cp)),
      relationships: e.relationships.map(r => this.transformRelationship(r)),
      commands: e.commands.map(c => c.name),
      constraints: e.constraints.map(c => this.transformConstraint(c)),
      policies: e.policies.map(p => p.name),
    };
  }

  private transformProperty(p: PropertyNode): IRProperty {
    return {
      name: p.name,
      type: this.transformType(p.dataType),
      defaultValue: p.defaultValue ? this.transformExprToValue(p.defaultValue) : undefined,
      modifiers: p.modifiers as PropertyModifier[],
    };
  }

  private transformComputedProperty(cp: ComputedPropertyNode): IRComputedProperty {
    return {
      name: cp.name,
      type: this.transformType(cp.dataType),
      expression: this.transformExpression(cp.expression),
      dependencies: cp.dependencies,
    };
  }

  private transformRelationship(r: RelationshipNode): IRRelationship {
    return {
      name: r.name,
      kind: r.kind,
      target: r.target,
      foreignKey: r.foreignKey,
      through: r.through,
    };
  }

  private transformConstraint(c: ConstraintNode): IRConstraint {
    return {
      name: c.name,
      expression: this.transformExpression(c.expression),
      message: c.message,
    };
  }

  private transformStore(s: StoreNode): IRStore {
    const config: Record<string, IRValue> = {};
    if (s.config) {
      for (const [k, v] of Object.entries(s.config)) {
        const val = this.transformExprToValue(v);
        if (val) config[k] = val;
      }
    }
    return {
      entity: s.entity,
      target: s.target,
      config,
    };
  }

  private transformEvent(e: OutboxEventNode): IREvent {
    if ('fields' in e.payload) {
      return {
        name: e.name,
        channel: e.channel,
        payload: (e.payload.fields as ParameterNode[]).map(f => ({
          name: f.name,
          type: this.transformType(f.dataType),
          required: f.required,
        })),
      };
    }
    return {
      name: e.name,
      channel: e.channel,
      payload: this.transformType(e.payload as TypeNode),
    };
  }

  private transformCommand(c: CommandNode, moduleName?: string, entityName?: string): IRCommand {
    return {
      name: c.name,
      module: moduleName,
      entity: entityName,
      parameters: c.parameters.map(p => this.transformParameter(p)),
      guards: (c.guards || []).map(g => this.transformExpression(g)),
      actions: c.actions.map(a => this.transformAction(a)),
      emits: c.emits || [],
      returns: c.returns ? this.transformType(c.returns) : undefined,
    };
  }

  private transformParameter(p: ParameterNode): IRParameter {
    return {
      name: p.name,
      type: this.transformType(p.dataType),
      required: p.required,
      defaultValue: p.defaultValue ? this.transformExprToValue(p.defaultValue) : undefined,
    };
  }

  private transformAction(a: ActionNode): IRAction {
    return {
      kind: a.kind,
      target: a.target,
      expression: this.transformExpression(a.expression),
    };
  }

  private transformPolicy(p: PolicyNode, moduleName?: string, entityName?: string): IRPolicy {
    return {
      name: p.name,
      module: moduleName,
      entity: entityName,
      action: p.action,
      expression: this.transformExpression(p.expression),
      message: p.message,
    };
  }

  private transformType(t: TypeNode): IRType {
    return {
      name: t.name,
      generic: t.generic ? this.transformType(t.generic) : undefined,
      nullable: t.nullable,
    };
  }

  private transformExpression(expr: ExpressionNode): IRExpression {
    switch (expr.type) {
      case 'Literal': {
        const lit = expr as { value: string | number | boolean | null; dataType: string };
        return {
          kind: 'literal',
          value: this.literalToValue(lit.value, lit.dataType),
        };
      }
      case 'Identifier': {
        return { kind: 'identifier', name: (expr as { name: string }).name };
      }
      case 'MemberAccess': {
        const ma = expr as { object: ExpressionNode; property: string };
        return {
          kind: 'member',
          object: this.transformExpression(ma.object),
          property: ma.property,
        };
      }
      case 'BinaryOp': {
        const bo = expr as { operator: string; left: ExpressionNode; right: ExpressionNode };
        return {
          kind: 'binary',
          operator: bo.operator,
          left: this.transformExpression(bo.left),
          right: this.transformExpression(bo.right),
        };
      }
      case 'UnaryOp': {
        const uo = expr as { operator: string; operand: ExpressionNode };
        return {
          kind: 'unary',
          operator: uo.operator,
          operand: this.transformExpression(uo.operand),
        };
      }
      case 'Call': {
        const call = expr as { callee: ExpressionNode; arguments: ExpressionNode[] };
        return {
          kind: 'call',
          callee: this.transformExpression(call.callee),
          args: call.arguments.map(a => this.transformExpression(a)),
        };
      }
      case 'Conditional': {
        const cond = expr as { condition: ExpressionNode; consequent: ExpressionNode; alternate: ExpressionNode };
        return {
          kind: 'conditional',
          condition: this.transformExpression(cond.condition),
          consequent: this.transformExpression(cond.consequent),
          alternate: this.transformExpression(cond.alternate),
        };
      }
      case 'Array': {
        const arr = expr as { elements: ExpressionNode[] };
        return {
          kind: 'array',
          elements: arr.elements.map(e => this.transformExpression(e)),
        };
      }
      case 'Object': {
        const obj = expr as { properties: { key: string; value: ExpressionNode }[] };
        return {
          kind: 'object',
          properties: obj.properties.map(p => ({
            key: p.key,
            value: this.transformExpression(p.value),
          })),
        };
      }
      case 'Lambda': {
        const lam = expr as { parameters: string[]; body: ExpressionNode };
        return {
          kind: 'lambda',
          params: lam.parameters,
          body: this.transformExpression(lam.body),
        };
      }
      default:
        return { kind: 'literal', value: { kind: 'null' } };
    }
  }

  private transformExprToValue(expr: ExpressionNode): IRValue | undefined {
    if (expr.type === 'Literal') {
      const lit = expr as { value: string | number | boolean | null; dataType: string };
      return this.literalToValue(lit.value, lit.dataType);
    }
    if (expr.type === 'Array') {
      const arr = expr as { elements: ExpressionNode[] };
      const elements = arr.elements.map(e => this.transformExprToValue(e)).filter((v): v is IRValue => v !== undefined);
      return { kind: 'array', elements };
    }
    if (expr.type === 'Object') {
      const obj = expr as { properties: { key: string; value: ExpressionNode }[] };
      const properties: Record<string, IRValue> = {};
      for (const p of obj.properties) {
        const v = this.transformExprToValue(p.value);
        if (v) properties[p.key] = v;
      }
      return { kind: 'object', properties };
    }
    return undefined;
  }

  private literalToValue(value: string | number | boolean | null, dataType: string): IRValue {
    if (dataType === 'string') return { kind: 'string', value: value as string };
    if (dataType === 'number') return { kind: 'number', value: value as number };
    if (dataType === 'boolean') return { kind: 'boolean', value: value as boolean };
    return { kind: 'null' };
  }
}

export async function compileToIR(source: string): Promise<CompileToIRResult> {
  const compiler = new IRCompiler();
  return compiler.compileToIR(source);
}
