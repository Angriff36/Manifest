import { Lexer } from './lexer';
import {
  Token, ManifestProgram, EntityNode, PropertyNode, TypeNode, BehaviorNode,
  ConstraintNode, FlowNode, FlowStepNode, EffectNode, ExposeNode, CompositionNode,
  ComponentRefNode, ConnectionNode, ExpressionNode, TriggerNode, ActionNode, CompilationError,
  CommandNode, ParameterNode, PolicyNode, StoreNode, OutboxEventNode, ModuleNode,
  ComputedPropertyNode, RelationshipNode
} from './types';

export class Parser {
  private tokens: Token[] = [];
  private pos = 0;
  private errors: CompilationError[] = [];

  parse(source: string): { program: ManifestProgram; errors: CompilationError[] } {
    this.tokens = new Lexer(source).tokenize();
    this.pos = 0;
    this.errors = [];

    const program: ManifestProgram = {
      modules: [], entities: [], commands: [], flows: [], effects: [],
      exposures: [], compositions: [], policies: [], stores: [], events: []
    };

    while (!this.isEnd()) {
      this.skipNL();
      if (this.isEnd()) break;
      try {
        if (this.check('KEYWORD', 'module')) program.modules.push(this.parseModule());
        else if (this.check('KEYWORD', 'entity')) program.entities.push(this.parseEntity());
        else if (this.check('KEYWORD', 'command')) program.commands.push(this.parseCommand());
        else if (this.check('KEYWORD', 'flow')) program.flows.push(this.parseFlow());
        else if (this.check('KEYWORD', 'effect')) program.effects.push(this.parseEffect());
        else if (this.check('KEYWORD', 'expose')) program.exposures.push(this.parseExpose());
        else if (this.check('KEYWORD', 'compose')) program.compositions.push(this.parseComposition());
        else if (this.check('KEYWORD', 'policy')) program.policies.push(this.parsePolicy());
        else if (this.check('KEYWORD', 'store')) program.stores.push(this.parseStore());
        else if (this.check('KEYWORD', 'event')) program.events.push(this.parseOutboxEvent());
        else this.advance();
      } catch (e) {
        this.errors.push({ message: e instanceof Error ? e.message : 'Parse error', position: this.current()?.position, severity: 'error' });
        this.sync();
      }
    }
    return { program, errors: this.errors };
  }

  private parseModule(): ModuleNode {
    this.consume('KEYWORD', 'module');
    const name = this.consumeIdentifier().value;
    this.consume('PUNCTUATION', '{');
    this.skipNL();

    const entities: EntityNode[] = [], commands: CommandNode[] = [], policies: PolicyNode[] = [], stores: StoreNode[] = [], events: OutboxEventNode[] = [];

    while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
      this.skipNL();
      if (this.check('PUNCTUATION', '}')) break;
      if (this.check('KEYWORD', 'entity')) entities.push(this.parseEntity());
      else if (this.check('KEYWORD', 'command')) commands.push(this.parseCommand());
      else if (this.check('KEYWORD', 'policy')) policies.push(this.parsePolicy());
      else if (this.check('KEYWORD', 'store')) stores.push(this.parseStore());
      else if (this.check('KEYWORD', 'event')) events.push(this.parseOutboxEvent());
      else this.advance();
      this.skipNL();
    }
    this.consume('PUNCTUATION', '}');
    return { type: 'Module', name, entities, commands, policies, stores, events };
  }

  private parseEntity(): EntityNode {
    this.consume('KEYWORD', 'entity');
    const name = this.consumeIdentifier().value;
    this.consume('PUNCTUATION', '{');
    this.skipNL();

    const properties: PropertyNode[] = [], computedProperties: ComputedPropertyNode[] = [], relationships: RelationshipNode[] = [];
    const behaviors: BehaviorNode[] = [], commands: CommandNode[] = [], constraints: ConstraintNode[] = [], policies: PolicyNode[] = [];
    let store: string | undefined;

    while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
      this.skipNL();
      if (this.check('PUNCTUATION', '}')) break;

      if (this.check('KEYWORD', 'property')) properties.push(this.parseProperty());
      else if (this.check('KEYWORD', 'computed') || this.check('KEYWORD', 'derived')) computedProperties.push(this.parseComputedProperty());
      else if (this.check('KEYWORD', 'hasMany') || this.check('KEYWORD', 'hasOne') || this.check('KEYWORD', 'belongsTo') || this.check('KEYWORD', 'ref')) relationships.push(this.parseRelationship());
      else if (this.check('KEYWORD', 'behavior') || this.check('KEYWORD', 'on')) behaviors.push(this.parseBehavior());
      else if (this.check('KEYWORD', 'command')) commands.push(this.parseCommand());
      else if (this.check('KEYWORD', 'constraint')) constraints.push(this.parseConstraint());
      else if (this.check('KEYWORD', 'policy')) policies.push(this.parsePolicy());
      else if (this.check('KEYWORD', 'store')) { this.advance(); store = this.advance().value; }
      else this.advance();
      this.skipNL();
    }
    this.consume('PUNCTUATION', '}');
    return { type: 'Entity', name, properties, computedProperties, relationships, behaviors, commands, constraints, policies, store };
  }

  private parseProperty(): PropertyNode {
    this.consume('KEYWORD', 'property');
    const modifiers: string[] = [];
    while (['required', 'unique', 'indexed', 'private', 'readonly', 'optional'].includes(this.current()?.value || '')) {
      modifiers.push(this.advance().value);
    }
    const name = this.consumeIdentifier().value;
    this.consume('OPERATOR', ':');
    const dataType = this.parseType();
    let defaultValue: ExpressionNode | undefined;
    if (this.check('OPERATOR', '=')) { this.advance(); defaultValue = this.parseExpr(); }
    return { type: 'Property', name, dataType, defaultValue, modifiers };
  }

  private parseComputedProperty(): ComputedPropertyNode {
    this.advance();
    const name = this.consumeIdentifier().value;
    this.consume('OPERATOR', ':');
    const dataType = this.parseType();
    this.consume('OPERATOR', '=');
    const expression = this.parseExpr();
    const dependencies = this.extractDependencies(expression);
    return { type: 'ComputedProperty', name, dataType, expression, dependencies };
  }

  private extractDependencies(expr: ExpressionNode): string[] {
    const deps = new Set<string>();
    const RESERVED = ['self', 'this', 'user', 'context'];

    const walk = (e: ExpressionNode) => {
      switch (e.type) {
        case 'Identifier':
          if (!RESERVED.includes(e.name)) {
            deps.add(e.name);
          }
          break;
        case 'MemberAccess':
          walk(e.object);
          break;
        case 'BinaryOp':
          walk(e.left);
          walk(e.right);
          break;
        case 'UnaryOp':
          walk(e.operand);
          break;
        case 'Call':
          walk(e.callee);
          e.arguments.forEach(walk);
          break;
        case 'Conditional':
          walk(e.condition);
          walk(e.consequent);
          walk(e.alternate);
          break;
        case 'Array':
          e.elements.forEach(walk);
          break;
        case 'Object':
          e.properties.forEach((p) => walk(p.value));
          break;
        case 'Lambda':
          walk(e.body);
          break;
        case 'Literal':
          // No dependencies in literals
          break;
      }
    };
    walk(expr);
    return Array.from(deps);
  }

  private parseRelationship(): RelationshipNode {
    const kind = this.advance().value as RelationshipNode['kind'];
    const name = this.consumeIdentifier().value;
    this.consume('OPERATOR', ':');
    const target = this.consumeIdentifier().value;
    let foreignKey: string | undefined, through: string | undefined;
    if (this.check('KEYWORD', 'through')) { this.advance(); through = this.consumeIdentifier().value; }
    if (this.check('KEYWORD', 'with')) { this.advance(); foreignKey = this.consumeIdentifier().value; }
    return { type: 'Relationship', kind, name, target, foreignKey, through };
  }

  private parseCommand(): CommandNode {
    this.consume('KEYWORD', 'command');
    const name = this.consumeIdentifier().value;
    this.consume('PUNCTUATION', '(');
    const parameters: ParameterNode[] = [];
    while (!this.check('PUNCTUATION', ')') && !this.isEnd()) {
      const required = !this.check('KEYWORD', 'optional');
      if (!required) this.advance();
      const pname = this.consumeIdentifier().value;
      this.consume('OPERATOR', ':');
      const dataType = this.parseType();
      let defaultValue: ExpressionNode | undefined;
      if (this.check('OPERATOR', '=')) { this.advance(); defaultValue = this.parseExpr(); }
      parameters.push({ type: 'Parameter', name: pname, dataType, required, defaultValue });
      if (this.check('PUNCTUATION', ',')) this.advance();
    }
    this.consume('PUNCTUATION', ')');

    let returns: TypeNode | undefined;
    if (this.check('KEYWORD', 'returns')) { this.advance(); returns = this.parseType(); }

    const guards: ExpressionNode[] = [], actions: ActionNode[] = [], emits: string[] = [];

    if (this.check('PUNCTUATION', '{')) {
      this.advance(); this.skipNL();
      while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
        this.skipNL();
        if (this.check('PUNCTUATION', '}')) break;
        if (this.check('KEYWORD', 'guard') || this.check('KEYWORD', 'when')) { this.advance(); guards.push(this.parseExpr()); }
        else if (this.check('KEYWORD', 'emit')) { this.advance(); emits.push(this.consumeIdentifier().value); }
        else actions.push(this.parseAction());
        this.skipNL();
      }
      this.consume('PUNCTUATION', '}');
    } else if (this.check('OPERATOR', '=>')) {
      this.advance();
      actions.push(this.parseAction());
    }

    return { type: 'Command', name, parameters, guards: guards.length ? guards : undefined, actions, emits: emits.length ? emits : undefined, returns };
  }

  private parsePolicy(): PolicyNode {
    this.consume('KEYWORD', 'policy');
    const name = this.consumeIdentifier().value;
    let action: PolicyNode['action'] = 'all';
    if (this.check('KEYWORD', 'read') || this.check('KEYWORD', 'write') || this.check('KEYWORD', 'delete') || this.check('KEYWORD', 'execute') || this.check('KEYWORD', 'all')) {
      action = this.advance().value as PolicyNode['action'];
    }
    this.consume('OPERATOR', ':');
    const expression = this.parseExpr();
    const message = this.check('STRING') ? this.advance().value : undefined;
    return { type: 'Policy', name, action, expression, message };
  }

  private parseStore(): StoreNode {
    this.consume('KEYWORD', 'store');
    const entity = this.consumeIdentifier().value;
    this.consume('KEYWORD', 'in');
    const target = this.advance().value as StoreNode['target'];
    const config: Record<string, ExpressionNode> = {};
    if (this.check('PUNCTUATION', '{')) {
      this.advance(); this.skipNL();
      while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
        this.skipNL();
        if (this.check('PUNCTUATION', '}')) break;
        // Config keys are like object literal keys - allow keywords
        const key = this.consumeIdentifierOrKeyword().value;
        this.consume('OPERATOR', ':');
        config[key] = this.parseExpr();
        this.skipNL();
      }
      this.consume('PUNCTUATION', '}');
    }
    return { type: 'Store', entity, target, config: Object.keys(config).length ? config : undefined };
  }

  private parseOutboxEvent(): OutboxEventNode {
    this.consume('KEYWORD', 'event');
    const name = this.consumeIdentifier().value;
    this.consume('OPERATOR', ':');
    const channel = this.check('STRING') ? this.advance().value : name;
    let payload: OutboxEventNode['payload'] = { type: 'Type', name: 'unknown', nullable: false };
    if (this.check('PUNCTUATION', '{')) {
      this.advance(); this.skipNL();
      const fields: ParameterNode[] = [];
      while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
        this.skipNL();
        if (this.check('PUNCTUATION', '}')) break;
        const fname = this.consumeIdentifier().value;
        this.consume('OPERATOR', ':');
        const ftype = this.parseType();
        fields.push({ type: 'Parameter', name: fname, dataType: ftype, required: true });
        this.skipNL();
      }
      this.consume('PUNCTUATION', '}');
      payload = { fields };
    } else if (this.check('IDENTIFIER') || this.check('KEYWORD')) {
      payload = this.parseType();
    }
    return { type: 'OutboxEvent', name, channel, payload };
  }

  private parseType(): TypeNode {
    const name = this.advance().value;
    let generic: TypeNode | undefined;
    if (this.check('OPERATOR', '<')) { this.advance(); generic = this.parseType(); this.consume('OPERATOR', '>'); }
    const nullable = this.check('OPERATOR', '?') ? (this.advance(), true) : false;
    return { type: 'Type', name, generic, nullable };
  }

  private parseBehavior(): BehaviorNode {
    if (this.check('KEYWORD', 'behavior')) this.advance();
    this.consume('KEYWORD', 'on');
    const trigger = this.parseTrigger();
    const guards: ExpressionNode[] = [];
    while (this.check('KEYWORD', 'guard') || this.check('KEYWORD', 'when')) { this.advance(); guards.push(this.parseExpr()); }
    const actions: ActionNode[] = [];
    if (this.check('PUNCTUATION', '{')) {
      this.advance(); this.skipNL();
      while (!this.check('PUNCTUATION', '}') && !this.isEnd()) { this.skipNL(); if (this.check('PUNCTUATION', '}')) break; actions.push(this.parseAction()); this.skipNL(); }
      this.consume('PUNCTUATION', '}');
    } else if (this.check('KEYWORD', 'then') || this.check('OPERATOR', '=>')) { this.advance(); actions.push(this.parseAction()); }
    return { type: 'Behavior', name: trigger.event, trigger, actions, guards: guards.length ? guards : undefined };
  }

  private parseTrigger(): TriggerNode {
    const event = this.consumeIdentifier().value;
    let parameters: string[] | undefined;
    if (this.check('PUNCTUATION', '(')) {
      this.advance(); parameters = [];
      while (!this.check('PUNCTUATION', ')') && !this.isEnd()) { parameters.push(this.consumeIdentifier().value); if (this.check('PUNCTUATION', ',')) this.advance(); }
      this.consume('PUNCTUATION', ')');
    }
    return { type: 'Trigger', event, parameters };
  }

  private parseAction(): ActionNode {
    let kind: ActionNode['kind'] = 'compute', target: string | undefined;
    if (this.check('KEYWORD', 'mutate')) { this.advance(); kind = 'mutate'; target = this.consumeIdentifier().value; this.consume('OPERATOR', '='); }
    else if (this.check('KEYWORD', 'emit')) { this.advance(); kind = 'emit'; }
    else if (this.check('KEYWORD', 'effect')) { this.advance(); kind = 'effect'; }
    else if (this.check('KEYWORD', 'publish')) { this.advance(); kind = 'publish'; }
    else if (this.check('KEYWORD', 'persist')) { this.advance(); kind = 'persist'; }
    else if (this.check('KEYWORD', 'compute')) {
      this.advance(); kind = 'compute';
      // Check for assignment form: compute <identifier> = <expr>
      const nextToken = this.tokens[this.pos + 1];
      if (this.check('IDENTIFIER') && nextToken?.type === 'OPERATOR' && nextToken?.value === '=') {
        target = this.consumeIdentifier().value;
        this.consume('OPERATOR', '=');
      }
    }
    return { type: 'Action', kind, target, expression: this.parseExpr() };
  }

  private parseConstraint(): ConstraintNode {
    this.consume('KEYWORD', 'constraint');
    const name = this.consumeIdentifier().value;
    this.consume('OPERATOR', ':');
    const expression = this.parseExpr();
    const message = this.check('STRING') ? this.advance().value : undefined;
    return { type: 'Constraint', name, expression, message };
  }

  private parseFlow(): FlowNode {
    this.consume('KEYWORD', 'flow');
    const name = this.consumeIdentifier().value;
    this.consume('PUNCTUATION', '('); const input = this.parseType(); this.consume('PUNCTUATION', ')');
    this.consume('OPERATOR', '->'); const output = this.parseType();
    this.consume('PUNCTUATION', '{'); this.skipNL();
    const steps: FlowStepNode[] = [];
    while (!this.check('PUNCTUATION', '}') && !this.isEnd()) { this.skipNL(); if (this.check('PUNCTUATION', '}')) break; steps.push(this.parseFlowStep()); this.skipNL(); }
    this.consume('PUNCTUATION', '}');
    return { type: 'Flow', name, input, output, steps };
  }

  private parseFlowStep(): FlowStepNode {
    const operation = this.advance().value;
    let condition: ExpressionNode | undefined;
    if (this.check('KEYWORD', 'when')) { this.advance(); condition = this.parseExpr(); }
    this.consume('OPERATOR', ':');
    return { type: 'FlowStep', operation, expression: this.parseExpr(), condition };
  }

  private parseEffect(): EffectNode {
    this.consume('KEYWORD', 'effect');
    const name = this.consumeIdentifier().value;
    this.consume('OPERATOR', ':');
    const kind = this.advance().value as EffectNode['kind'];
    const config: Record<string, ExpressionNode> = {};
    if (this.check('PUNCTUATION', '{')) {
      this.advance(); this.skipNL();
      while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
        this.skipNL(); if (this.check('PUNCTUATION', '}')) break;
        // Config keys are like object literal keys - allow keywords
        const key = this.consumeIdentifierOrKeyword().value; this.consume('OPERATOR', ':'); config[key] = this.parseExpr(); this.skipNL();
      }
      this.consume('PUNCTUATION', '}');
    }
    return { type: 'Effect', name, kind, config };
  }

  private parseExpose(): ExposeNode {
    this.consume('KEYWORD', 'expose');
    const entity = this.consumeIdentifier().value;
    this.consume('KEYWORD', 'as');
    const protocol = this.advance().value as ExposeNode['protocol'];
    let name = entity.toLowerCase();
    let generateServer = false;
    if (this.check('KEYWORD', 'server')) { this.advance(); generateServer = true; }
    if (this.check('STRING')) name = this.advance().value;
    const operations: string[] = [], middleware: string[] = [];
    if (this.check('PUNCTUATION', '{')) {
      this.advance(); this.skipNL();
      while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
        this.skipNL(); if (this.check('PUNCTUATION', '}')) break;
        const val = this.advance().value;
        if (val === 'middleware') { this.consume('OPERATOR', ':'); middleware.push(this.consumeIdentifier().value); }
        else operations.push(val);
        if (this.check('PUNCTUATION', ',')) this.advance();
        this.skipNL();
      }
      this.consume('PUNCTUATION', '}');
    }
    return { type: 'Expose', name, protocol, entity, operations, generateServer, middleware: middleware.length ? middleware : undefined };
  }

  private parseComposition(): CompositionNode {
    this.consume('KEYWORD', 'compose');
    const name = this.consumeIdentifier().value;
    this.consume('PUNCTUATION', '{'); this.skipNL();
    const components: ComponentRefNode[] = [], connections: ConnectionNode[] = [];
    while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
      this.skipNL(); if (this.check('PUNCTUATION', '}')) break;
      if (this.check('KEYWORD', 'connect')) connections.push(this.parseConnection());
      else components.push(this.parseComponentRef());
      this.skipNL();
    }
    this.consume('PUNCTUATION', '}');
    return { type: 'Composition', name, components, connections };
  }

  private parseComponentRef(): ComponentRefNode {
    const entity = this.consumeIdentifier().value;
    let alias: string | undefined;
    if (this.check('KEYWORD', 'as')) { this.advance(); alias = this.consumeIdentifier().value; }
    return { type: 'ComponentRef', entity, alias };
  }

  private parseConnection(): ConnectionNode {
    this.consume('KEYWORD', 'connect');
    // Component names are references to declared components (use consumeIdentifier for declaration-like reference)
    // Port names after '.' are member-access-like (use consumeIdentifierOrKeyword to allow keywords)
    const fromComponent = this.consumeIdentifier().value; this.consume('OPERATOR', '.'); const fromOutput = this.consumeIdentifierOrKeyword().value;
    this.consume('OPERATOR', '->');
    const toComponent = this.consumeIdentifier().value; this.consume('OPERATOR', '.'); const toInput = this.consumeIdentifierOrKeyword().value;
    let transform: ExpressionNode | undefined;
    if (this.check('KEYWORD', 'with')) { this.advance(); transform = this.parseExpr(); }
    return { type: 'Connection', from: { component: fromComponent, output: fromOutput }, to: { component: toComponent, input: toInput }, transform };
  }

  private parseExpr(): ExpressionNode { return this.parseTernary(); }

  private parseTernary(): ExpressionNode {
    const expr = this.parseOr();
    if (this.check('OPERATOR', '?')) { this.advance(); const cons = this.parseExpr(); this.consume('OPERATOR', ':'); const alt = this.parseExpr(); return { type: 'Conditional', condition: expr, consequent: cons, alternate: alt }; }
    return expr;
  }

  private parseOr(): ExpressionNode {
    let left = this.parseAnd();
    while (this.check('OPERATOR', '||') || this.check('KEYWORD', 'or')) { const op = this.advance().value; left = { type: 'BinaryOp', operator: op, left, right: this.parseAnd() }; }
    return left;
  }

  private parseAnd(): ExpressionNode {
    let left = this.parseEquality();
    while (this.check('OPERATOR', '&&') || this.check('KEYWORD', 'and')) { const op = this.advance().value; left = { type: 'BinaryOp', operator: op, left, right: this.parseEquality() }; }
    return left;
  }

  private parseEquality(): ExpressionNode {
    let left = this.parseComparison();
    while (['==', '!='].includes(this.current()?.value || '') || ['is', 'in', 'contains'].includes(this.current()?.value || '')) { const op = this.advance().value; left = { type: 'BinaryOp', operator: op, left, right: this.parseComparison() }; }
    return left;
  }

  private parseComparison(): ExpressionNode {
    let left = this.parseAdditive();
    while (['<', '>', '<=', '>='].includes(this.current()?.value || '')) { const op = this.advance().value; left = { type: 'BinaryOp', operator: op, left, right: this.parseAdditive() }; }
    return left;
  }

  private parseAdditive(): ExpressionNode {
    let left = this.parseMultiplicative();
    while (['+', '-'].includes(this.current()?.value || '')) { const op = this.advance().value; left = { type: 'BinaryOp', operator: op, left, right: this.parseMultiplicative() }; }
    return left;
  }

  private parseMultiplicative(): ExpressionNode {
    let left = this.parseUnary();
    while (['*', '/', '%'].includes(this.current()?.value || '')) { const op = this.advance().value; left = { type: 'BinaryOp', operator: op, left, right: this.parseUnary() }; }
    return left;
  }

  private parseUnary(): ExpressionNode {
    if (['!', '-'].includes(this.current()?.value || '') || this.check('KEYWORD', 'not')) { const op = this.advance().value; return { type: 'UnaryOp', operator: op, operand: this.parseUnary() }; }
    return this.parsePostfix();
  }

  private parsePostfix(): ExpressionNode {
    let expr = this.parsePrimary();
    while (true) {
      // Member access: allow both identifiers AND keywords as property names (e.g., obj.entity, obj.command)
      if (this.check('OPERATOR', '.') || this.check('OPERATOR', '?.')) { this.advance(); expr = { type: 'MemberAccess', object: expr, property: this.consumeIdentifierOrKeyword().value }; }
      else if (this.check('PUNCTUATION', '(')) {
        this.advance(); const args: ExpressionNode[] = [];
        while (!this.check('PUNCTUATION', ')') && !this.isEnd()) { args.push(this.parseExpr()); if (this.check('PUNCTUATION', ',')) this.advance(); }
        this.consume('PUNCTUATION', ')'); expr = { type: 'Call', callee: expr, arguments: args };
      }
      else if (this.check('PUNCTUATION', '[')) { this.advance(); const idx = this.parseExpr(); this.consume('PUNCTUATION', ']'); expr = { type: 'MemberAccess', object: expr, property: `[${'value' in idx ? idx.value : ''}]` }; }
      else break;
    }
    return expr;
  }

  private parsePrimary(): ExpressionNode {
    if (this.check('NUMBER')) return { type: 'Literal', value: parseFloat(this.advance().value), dataType: 'number' };
    if (this.check('STRING')) return { type: 'Literal', value: this.advance().value, dataType: 'string' };
    if (this.check('KEYWORD', 'true') || this.check('KEYWORD', 'false')) return { type: 'Literal', value: this.advance().value === 'true', dataType: 'boolean' };
    if (this.check('KEYWORD', 'null')) { this.advance(); return { type: 'Literal', value: null, dataType: 'null' }; }
    if (this.check('PUNCTUATION', '[')) { this.advance(); const els: ExpressionNode[] = []; while (!this.check('PUNCTUATION', ']') && !this.isEnd()) { els.push(this.parseExpr()); if (this.check('PUNCTUATION', ',')) this.advance(); } this.consume('PUNCTUATION', ']'); return { type: 'Array', elements: els }; }
    // Object literal: allow both identifiers AND keywords as unquoted keys (e.g., { entity: 1, command: 2 })
    if (this.check('PUNCTUATION', '{')) { this.advance(); this.skipNL(); const props: { key: string; value: ExpressionNode }[] = []; while (!this.check('PUNCTUATION', '}') && !this.isEnd()) { this.skipNL(); if (this.check('PUNCTUATION', '}')) break; const key = this.check('STRING') ? this.advance().value : this.consumeIdentifierOrKeyword().value; this.consume('OPERATOR', ':'); props.push({ key, value: this.parseExpr() }); if (this.check('PUNCTUATION', ',')) this.advance(); this.skipNL(); } this.consume('PUNCTUATION', '}'); return { type: 'Object', properties: props }; }
    // Lambda or parenthesized expression
    if (this.check('PUNCTUATION', '(')) {
      this.advance();
      const startPos = this.pos;
      const params: string[] = [];
      // Try to parse lambda parameters (identifiers only - reserved words not allowed as parameter declarations)
      while (this.check('IDENTIFIER') && !this.isEnd()) {
        params.push(this.advance().value);
        if (this.check('PUNCTUATION', ',')) this.advance(); else break;
      }
      // Check if this looks like a lambda: (params) =>
      if (this.check('PUNCTUATION', ')')) {
        this.advance();
        if (this.check('OPERATOR', '=>')) {
          this.advance();
          return { type: 'Lambda', parameters: params, body: this.parseExpr() };
        }
      }
      // Not a lambda, backtrack and parse as parenthesized expression
      this.pos = startPos;
      const expr = this.parseExpr(); this.consume('PUNCTUATION', ')'); return expr;
    }
    if (this.check('IDENTIFIER') || this.check('KEYWORD', 'user') || this.check('KEYWORD', 'self') || this.check('KEYWORD', 'context')) return { type: 'Identifier', name: this.advance().value };
    throw new Error(`Unexpected: ${this.current()?.value || 'EOF'}`);
  }

  private check(type: string, value?: string) { const t = this.current(); return t && t.type === type && (value === undefined || t.value === value); }
  private consume(type: string, value?: string) { if (this.check(type, value)) return this.advance(); throw new Error(`Expected ${value || type}, got ${this.current()?.value || 'EOF'}`); }

  /**
   * Consumes a declaration identifier token, enforcing the reserved word rule.
   * Use this ONLY at declaration sites (entity/module/command/property/parameter names, etc.).
   * Do NOT use for expression member access or object literal keys.
   *
   * If the current token is a KEYWORD (reserved word), emits a structured diagnostic
   * and returns a placeholder token to allow continued parsing (for better error recovery).
   */
  private consumeIdentifier(): Token {
    const token = this.current();
    if (token && token.type === 'KEYWORD') {
      // Emit structured diagnostic with position from the reserved word token
      this.errors.push({
        message: `Reserved word '${token.value}' cannot be used as an identifier`,
        position: token.position,
        severity: 'error'
      });
      // Advance past the keyword and return it as a placeholder to continue parsing
      return this.advance();
    }
    return this.consume('IDENTIFIER');
  }

  /**
   * Consumes any identifier-like token (IDENTIFIER or KEYWORD) for use in expressions.
   * This is used for member access properties and object literal keys where keywords are allowed.
   */
  private consumeIdentifierOrKeyword(): Token {
    const token = this.current();
    if (token && (token.type === 'IDENTIFIER' || token.type === 'KEYWORD')) {
      return this.advance();
    }
    throw new Error(`Expected identifier, got ${token?.value || 'EOF'}`);
  }

  private advance() { if (!this.isEnd()) this.pos++; return this.tokens[this.pos - 1]; }
  private current() { return this.tokens[this.pos]; }
  private isEnd() { return this.pos >= this.tokens.length || this.tokens[this.pos]?.type === 'EOF'; }
  private skipNL() { while (this.check('NEWLINE', '\n')) this.advance(); }
  private sync() { this.advance(); while (!this.isEnd() && !['entity', 'flow', 'effect', 'expose', 'compose', 'module', 'command', 'policy', 'store', 'event'].includes(this.current()?.value || '')) this.advance(); }
}
