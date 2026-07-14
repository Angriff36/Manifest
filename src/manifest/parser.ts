import { Lexer } from './lexer.js';
import { PROPERTY_MODIFIERS, type PropertyModifier } from './property-modifiers.js';
import {
  Token,
  ManifestProgram,
  EntityNode,
  PropertyNode,
  TypeNode,
  BehaviorNode,
  ConstraintNode,
  FlowNode,
  FlowStepNode,
  EffectNode,
  ExposeNode,
  CompositionNode,
  ComponentRefNode,
  ConnectionNode,
  ExpressionNode,
  TriggerNode,
  ActionNode,
  CompilationError,
  CommandNode,
  ParameterNode,
  PolicyNode,
  StoreNode,
  OutboxEventNode,
  ModuleNode,
  ComputedPropertyNode,
  RelationshipNode,
  TransitionNode,
  RefAction,
  EnumNode,
  EnumValueNode,
  ValueObjectNode,
  TenantNode,
  ReactionNode,
  ReactionParamMapping,
  ApprovalNode,
  ApprovalStageNode,
  UseNode,
  RoleNode,
  RolePermissionNode,
  SagaNode,
  SagaStepNode,
  PropertyMaskStrategyNode,
  WebhookNode,
  WebhookSignatureNode,
  WebhookParamMapping,
  RetryPolicyNode,
  RateLimitNode,
  ScheduleNode,
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
      uses: [],
      modules: [],
      entities: [],
      enums: [],
      values: [],
      commands: [],
      flows: [],
      effects: [],
      exposures: [],
      compositions: [],
      policies: [],
      stores: [],
      events: [],
      reactions: [],
      sagas: [],
      roles: [],
      webhooks: [],
      schedules: [],
    };

    // Parse use declarations (must appear before any other declarations)
    let pastUseDeclarations = false;
    while (!this.isEnd()) {
      this.skipNL();
      if (this.isEnd()) break;
      if (this.check('KEYWORD', 'use') && !pastUseDeclarations) {
        program.uses.push(this.parseUse());
        continue;
      }
      pastUseDeclarations = true;
      break;
    }

    while (!this.isEnd()) {
      this.skipNL();
      if (this.isEnd()) break;
      try {
        if (this.check('KEYWORD', 'use')) {
          this.errors.push({
            message: "'use' declarations must appear before all other declarations",
            position: this.current()?.position,
            severity: 'error',
          });
          this.advance(); // consume 'use'
          if (this.check('STRING')) this.advance(); // consume path
        } else if (this.check('KEYWORD', 'module')) program.modules.push(this.parseModule());
        else if (this.check('KEYWORD', 'entity')) program.entities.push(this.parseEntity());
        else if (this.check('IDENTIFIER', 'external') && this.peekIsKeyword(1, 'entity'))
          program.entities.push(this.parseEntity());
        else if (this.check('KEYWORD', 'enum')) program.enums.push(this.parseEnum());
        else if (this.check('IDENTIFIER', 'value') || this.check('KEYWORD', 'value')) {
          program.values.push(this.parseValueObject());
        } else if (this.check('KEYWORD', 'tenant')) {
          if (program.tenant) {
            this.errors.push({
              message:
                'Duplicate tenant declaration; only one tenant declaration is allowed per program',
              position: this.current()?.position,
              severity: 'error',
            });
          }
          program.tenant = this.parseTenant();
        } else if (this.check('KEYWORD', 'async')) {
          this.advance(); // consume 'async'
          if (!this.check('KEYWORD', 'command')) {
            throw new Error("Expected 'command' after 'async'");
          }
          const cmd = this.parseCommand();
          cmd.async = true;
          program.commands.push(cmd);
        } else if (this.check('KEYWORD', 'command')) program.commands.push(this.parseCommand());
        else if (this.check('KEYWORD', 'flow')) program.flows.push(this.parseFlow());
        else if (this.check('KEYWORD', 'effect')) program.effects.push(this.parseEffect());
        else if (this.check('KEYWORD', 'expose')) program.exposures.push(this.parseExpose());
        else if (this.check('KEYWORD', 'compose'))
          program.compositions.push(this.parseComposition());
        else if (this.check('KEYWORD', 'policy')) program.policies.push(this.parsePolicy(false));
        else if (this.check('KEYWORD', 'store')) program.stores.push(this.parseStore());
        else if (this.check('KEYWORD', 'event')) program.events.push(this.parseOutboxEvent());
        else if (this.check('KEYWORD', 'on')) program.reactions.push(this.parseReaction());
        else if (this.check('KEYWORD', 'saga')) program.sagas.push(this.parseSaga());
        else if (this.check('IDENTIFIER', 'role')) program.roles.push(this.parseRole());
        else if (this.check('KEYWORD', 'webhook')) program.webhooks.push(this.parseWebhook());
        else if (this.check('IDENTIFIER', 'schedule'))
          program.schedules!.push(this.parseSchedule());
        else this.advance();
      } catch (e) {
        this.errors.push({
          message: e instanceof Error ? e.message : 'Parse error',
          position: this.current()?.position,
          severity: 'error',
        });
        this.sync();
      }
    }
    return { program, errors: this.errors };
  }

  private parseUse(): UseNode {
    const position = this.current()?.position;
    this.consume('KEYWORD', 'use');
    if (!this.check('STRING')) {
      throw new Error("Expected string path after 'use'");
    }
    const path = this.advance().value;
    if (!path.startsWith('./') && !path.startsWith('../')) {
      this.errors.push({
        message: `use path must be relative (start with './' or '../'), got '${path}'`,
        position,
        severity: 'error',
      });
    }
    if (!path.endsWith('.manifest')) {
      this.errors.push({
        message: `use path must end with '.manifest', got '${path}'`,
        position,
        severity: 'error',
      });
    }
    return { type: 'Use', path, position };
  }

  private parseModule(): ModuleNode {
    this.consume('KEYWORD', 'module');
    const name = this.consumeIdentifier().value;
    this.consume('PUNCTUATION', '{');
    this.skipNL();

    const entities: EntityNode[] = [],
      enums: EnumNode[] = [],
      commands: CommandNode[] = [],
      policies: PolicyNode[] = [],
      stores: StoreNode[] = [],
      events: OutboxEventNode[] = [],
      reactions: ReactionNode[] = [],
      sagas: SagaNode[] = [],
      roles: RoleNode[] = [],
      webhooks: WebhookNode[] = [],
      schedules: ScheduleNode[] = [];

    while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
      this.skipNL();
      if (this.check('PUNCTUATION', '}')) break;
      if (this.check('KEYWORD', 'entity')) entities.push(this.parseEntity());
      else if (this.check('IDENTIFIER', 'external') && this.peekIsKeyword(1, 'entity'))
        entities.push(this.parseEntity());
      else if (this.check('KEYWORD', 'enum')) enums.push(this.parseEnum());
      else if (this.check('KEYWORD', 'async')) {
        this.advance(); // consume 'async'
        if (!this.check('KEYWORD', 'command')) {
          throw new Error("Expected 'command' after 'async'");
        }
        const cmd = this.parseCommand();
        cmd.async = true;
        commands.push(cmd);
      } else if (this.check('KEYWORD', 'command')) commands.push(this.parseCommand());
      else if (this.check('KEYWORD', 'policy')) policies.push(this.parsePolicy(false));
      else if (this.check('KEYWORD', 'store')) stores.push(this.parseStore());
      else if (this.check('KEYWORD', 'event')) events.push(this.parseOutboxEvent());
      else if (this.check('KEYWORD', 'on')) reactions.push(this.parseReaction());
      else if (this.check('KEYWORD', 'saga')) sagas.push(this.parseSaga());
      else if (this.check('IDENTIFIER', 'role')) roles.push(this.parseRole());
      else if (this.check('KEYWORD', 'webhook')) webhooks.push(this.parseWebhook());
      else if (this.check('IDENTIFIER', 'schedule')) schedules.push(this.parseSchedule());
      else this.advance();
      this.skipNL();
    }
    this.consume('PUNCTUATION', '}');
    return {
      type: 'Module',
      name,
      entities,
      enums,
      commands,
      policies,
      stores,
      events,
      reactions,
      sagas,
      roles,
      webhooks,
      ...(schedules.length > 0 ? { schedules } : {}),
    };
  }

  private parseEntity(): EntityNode {
    // Optional contextual `external` modifier: `external entity X { ... }`.
    // Kept as a contextual identifier (not a reserved word) so that property
    // names like `property external: string` continue to parse.
    let external = false;
    if (this.check('IDENTIFIER', 'external')) {
      this.advance(); // consume 'external'
      external = true;
    }
    this.consume('KEYWORD', 'entity');
    const name = this.consumeIdentifier().value;

    // Parse optional `extends Parent`
    let parent: string | undefined;
    if (this.check('KEYWORD', 'extends')) {
      this.advance(); // consume 'extends'
      parent = this.consumeIdentifier().value;
    }

    // Parse optional `mixin A, B`
    let mixins: string[] | undefined;
    if (this.check('IDENTIFIER', 'mixin')) {
      this.advance(); // consume 'mixin'
      mixins = [];
      mixins.push(this.consumeIdentifier().value);
      while (this.check('PUNCTUATION', ',')) {
        this.advance(); // consume ','
        mixins.push(this.consumeIdentifier().value);
      }
    }

    this.consume('PUNCTUATION', '{');
    this.skipNL();

    const properties: PropertyNode[] = [],
      computedProperties: ComputedPropertyNode[] = [],
      relationships: RelationshipNode[] = [];
    const behaviors: BehaviorNode[] = [],
      commands: CommandNode[] = [],
      constraints: ConstraintNode[] = [],
      policies: PolicyNode[] = [];
    const transitions: TransitionNode[] = [],
      approvals: ApprovalNode[] = [],
      reactions: ReactionNode[] = [];
    let store: string | undefined;
    let key: string[] | undefined;
    const alternateKeys: string[][] = [];
    let versionProperty: string | undefined;
    let versionAtProperty: string | undefined;
    let timestamps: boolean | undefined;
    let realtime: boolean | undefined;
    let policyRefs: string[] | undefined;

    while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
      this.skipNL();
      if (this.check('PUNCTUATION', '}')) break;

      if (this.check('KEYWORD', 'property')) properties.push(this.parseProperty());
      else if (this.check('KEYWORD', 'computed') || this.check('KEYWORD', 'derived'))
        computedProperties.push(this.parseComputedProperty());
      else if (
        this.check('KEYWORD', 'hasMany') ||
        this.check('KEYWORD', 'hasOne') ||
        this.check('KEYWORD', 'belongsTo') ||
        this.check('KEYWORD', 'ref')
      )
        relationships.push(this.parseRelationship());
      else if (this.check('KEYWORD', 'behavior')) behaviors.push(this.parseBehavior());
      else if (this.check('KEYWORD', 'on')) {
        // Lookahead: "on <EventName> run" = reaction; otherwise = behavior
        if (this.isReactionLookahead()) reactions.push(this.parseReaction());
        else behaviors.push(this.parseBehavior());
      } else if (this.check('KEYWORD', 'async')) {
        this.advance(); // consume 'async'
        if (!this.check('KEYWORD', 'command')) {
          throw new Error("Expected 'command' after 'async'");
        }
        const cmd = this.parseCommand();
        cmd.async = true;
        commands.push(cmd);
      } else if (this.check('KEYWORD', 'command')) commands.push(this.parseCommand());
      else if (this.check('KEYWORD', 'constraint')) constraints.push(this.parseConstraint());
      else if (this.check('KEYWORD', 'policy')) policies.push(this.parsePolicy(false));
      // Parse contextual `policies { Name, ... }` block for policy references
      else if (this.check('IDENTIFIER', 'policies') && this.tokens[this.pos + 1]?.value === '{') {
        this.advance(); // consume 'policies'
        this.consume('PUNCTUATION', '{');
        this.skipNL();
        policyRefs = [];
        while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
          this.skipNL();
          if (this.check('PUNCTUATION', '}')) break;
          policyRefs.push(this.consumeIdentifier().value);
          if (this.check('PUNCTUATION', ',')) {
            this.advance();
          }
          this.skipNL();
        }
        this.consume('PUNCTUATION', '}');
        this.skipNL();
      } else if (this.check('KEYWORD', 'default')) {
        // Default policy syntax: "default policy execute: ..."
        this.advance(); // consume 'default'
        if (this.check('KEYWORD', 'policy')) {
          policies.push(this.parsePolicy(true));
        } else {
          throw new Error("Expected 'policy' after 'default'");
        }
      } else if (this.check('KEYWORD', 'store')) {
        // Check the syntax variant
        const nextToken = this.tokens[this.pos + 1];
        const afterNextToken = this.tokens[this.pos + 2];

        if (nextToken?.value === 'in') {
          // Entity-scoped syntax: "store in <target>"
          this.advance(); // consume 'store'
          this.advance(); // consume 'in'
          store = this.advance().value; // get target
        } else if (afterNextToken?.value === 'in') {
          // Full syntax inside entity: "store <Entity> in <target>"
          // Parse as store node and extract target
          const storeNode = this.parseStore();
          store = storeNode.target;
        } else {
          // Short syntax: "store <target>" (without "in")
          this.advance(); // consume 'store'
          store = this.advance().value; // get target directly
        }
      } else if (this.check('KEYWORD', 'versionProperty')) {
        // Syntax: versionProperty <name>: <type>
        this.advance(); // consume 'versionProperty'
        versionProperty = this.consumeIdentifier().value;
        // Skip type annotation (': number')
        if (this.check('OPERATOR', ':')) {
          this.advance(); // consume ':'
          this.advance(); // consume type name
        }
      } else if (this.check('KEYWORD', 'versionAtProperty')) {
        // Syntax: versionAtProperty <name>: <type>
        this.advance(); // consume 'versionAtProperty'
        versionAtProperty = this.consumeIdentifier().value;
        // Skip type annotation (': number')
        if (this.check('OPERATOR', ':')) {
          this.advance(); // consume ':'
          this.advance(); // consume type name
        }
      } else if (this.check('KEYWORD', 'key')) {
        this.advance();
        key = this.parseIdentifierArray();
      } else if (this.check('KEYWORD', 'unique') && this.tokens[this.pos + 1]?.value === '[') {
        this.advance();
        alternateKeys.push(this.parseIdentifierArray());
      } else if (this.check('KEYWORD', 'transition')) transitions.push(this.parseTransition());
      else if (this.check('KEYWORD', 'approval')) approvals.push(this.parseApproval());
      else if (this.check('KEYWORD', 'timestamps')) {
        this.advance();
        timestamps = true;
      }
      // Contextual `realtime` flag (not a reserved word, same approach as the
      // `masked` modifier): a bare `realtime` line inside an entity block marks
      // the entity as realtime. `property realtime: boolean` is unaffected —
      // property declarations are consumed by the `property` branch above.
      else if (this.check('IDENTIFIER', 'realtime')) {
        this.advance();
        realtime = true;
      } else if (this.check('KEYWORD', 'event')) {
        // Entity-scoped events are not supported - emit warning to prevent silent data loss
        const pos = this.current()?.position;
        this.errors.push({
          message:
            'Events cannot be declared inside entity blocks. Declare events at module or root level instead.',
          position: pos,
          severity: 'warning',
        });
        this.advance(); // consume the 'event' keyword to prevent infinite loop
        // Also skip the event name if present
        if (this.current()?.type === 'IDENTIFIER') this.advance();
      } else this.advance();
      this.skipNL();
    }
    this.consume('PUNCTUATION', '}');
    return {
      type: 'Entity',
      name,
      properties,
      computedProperties,
      relationships,
      behaviors,
      commands,
      constraints,
      policies,
      transitions,
      approvals,
      reactions,
      store,
      ...(parent ? { parent } : {}),
      ...(mixins ? { mixins } : {}),
      ...(policyRefs ? { policyRefs } : {}),
      ...(key ? { key } : {}),
      ...(alternateKeys.length > 0 ? { alternateKeys } : {}),
      versionProperty,
      versionAtProperty,
      ...(timestamps ? { timestamps } : {}),
      ...(realtime ? { realtime } : {}),
      ...(external ? { external } : {}),
    };
  }

  private parseEnum(): EnumNode {
    this.consume('KEYWORD', 'enum');
    const name = this.consumeIdentifier().value;
    this.consume('PUNCTUATION', '{');
    this.skipNL();

    const values: EnumValueNode[] = [];

    while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
      this.skipNL();
      if (this.check('PUNCTUATION', '}')) break;

      const valueName = this.consumeIdentifier().value;
      const enumValue: EnumValueNode = { type: 'EnumValue', name: valueName };

      // Check for optional label: "valueName = \"Display Label\""
      if (this.check('OPERATOR', '=')) {
        this.advance();
        if (this.check('STRING')) {
          enumValue.label = this.advance().value;
        }
      }

      // Check for optional ordinal: "valueName(123)" or "valueName = \"Label\" (123)"
      if (this.check('PUNCTUATION', '(')) {
        this.advance();
        if (this.check('NUMBER')) {
          enumValue.ordinal = parseFloat(this.advance().value);
        }
        this.consume('PUNCTUATION', ')');
      }

      values.push(enumValue);

      // Skip comma if present
      if (this.check('PUNCTUATION', ',')) {
        this.advance();
      }
      this.skipNL();
    }

    this.consume('PUNCTUATION', '}');
    return { type: 'Enum', name, values };
  }

  private parseValueObject(): ValueObjectNode {
    const token = this.current();
    if (
      token &&
      (token.type === 'IDENTIFIER' || token.type === 'KEYWORD') &&
      token.value === 'value'
    ) {
      this.advance();
    } else {
      throw new Error(`Expected 'value' keyword, got ${token?.value || 'EOF'}`);
    }
    const name = this.consumeIdentifier().value;
    this.consume('PUNCTUATION', '{');
    this.skipNL();

    const properties: PropertyNode[] = [];

    while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
      this.skipNL();
      if (this.check('PUNCTUATION', '}')) break;

      if (this.check('KEYWORD', 'property')) {
        properties.push(this.parseProperty());
      } else {
        this.errors.push({
          message: `Unexpected token '${this.current()?.value}' in value object '${name}'. Value objects may only contain property declarations.`,
          position: this.current()?.position,
          severity: 'error',
        });
        this.advance();
      }
      this.skipNL();
    }
    this.consume('PUNCTUATION', '}');
    return { type: 'ValueObject', name, properties };
  }

  private parseTenant(): TenantNode {
    const pos = this.current()?.position;
    this.consume('KEYWORD', 'tenant');
    const property = this.consumeIdentifierOrKeyword().value;
    this.consume('OPERATOR', ':');
    const dataType = this.parseType();
    this.consume('KEYWORD', 'from');
    let contextPath = '';
    contextPath += this.advance().value;
    while (this.check('OPERATOR', '.')) {
      contextPath += this.advance().value;
      contextPath += this.consumeIdentifierOrKeyword().value;
    }
    return { type: 'Tenant', property, dataType, contextPath, position: pos };
  }

  private parseProperty(): PropertyNode {
    this.consume('KEYWORD', 'property');
    const modifiers: string[] = [];
    let maskStrategy: PropertyMaskStrategyNode | undefined;
    for (;;) {
      const cur = this.current();
      if (
        cur &&
        PROPERTY_MODIFIERS.includes(cur.value as PropertyModifier) &&
        cur.value !== 'masked'
      ) {
        modifiers.push(this.advance().value);
        continue;
      }
      // Contextual `masked` modifier (not a reserved word). One-token lookahead:
      // if the next token is ':', `masked` is the property NAME (`property masked: string`).
      if (cur && cur.type === 'IDENTIFIER' && cur.value === 'masked') {
        const next = this.tokens[this.pos + 1];
        if (next && next.type === 'OPERATOR' && next.value === ':') break;
        this.advance(); // consume 'masked'
        modifiers.push('masked');
        if (this.check('PUNCTUATION', '(')) maskStrategy = this.parseMaskStrategyArgs();
        continue;
      }
      break;
    }
    const name = this.consumeIdentifier().value;
    this.consume('OPERATOR', ':');
    const dataType = this.parseType();
    let defaultValue: ExpressionNode | undefined;
    if (this.check('OPERATOR', '=')) {
      this.advance();
      defaultValue = this.parseExpr();
    }
    // Optional `unmask when <expr>` clause; compile error without the masked modifier.
    let unmaskWhen: ExpressionNode | undefined;
    if (this.check('IDENTIFIER', 'unmask')) {
      const unmaskPos = this.current()?.position;
      this.advance(); // consume 'unmask'
      this.consume('KEYWORD', 'when');
      unmaskWhen = this.parseExpr();
      if (!modifiers.includes('masked')) {
        this.errors.push({
          message: `'unmask when' requires the 'masked' modifier on property '${name}'`,
          position: unmaskPos,
          severity: 'error',
        });
        unmaskWhen = undefined;
      }
    }
    return {
      type: 'Property',
      name,
      dataType,
      defaultValue,
      modifiers,
      ...(maskStrategy ? { maskStrategy } : {}),
      ...(unmaskWhen ? { unmaskWhen } : {}),
    };
  }

  /** Parses the parenthesized arg list of `masked(strategy, ...numericParams)`. */
  private parseMaskStrategyArgs(): PropertyMaskStrategyNode {
    this.consume('PUNCTUATION', '(');
    let type = 'redact';
    const strategyTok = this.current();
    if (strategyTok && (strategyTok.type === 'IDENTIFIER' || strategyTok.type === 'KEYWORD')) {
      type = this.advance().value;
    } else {
      this.errors.push({
        message: "Expected a masking strategy name after 'masked('",
        position: strategyTok?.position,
        severity: 'error',
      });
    }
    const params: number[] = [];
    while (this.check('PUNCTUATION', ',')) {
      this.advance(); // consume ','
      this.skipNL();
      const tok = this.current();
      if (tok && tok.type === 'NUMBER') {
        params.push(parseFloat(this.advance().value));
      } else {
        this.errors.push({
          message: `Masking strategy parameters must be numeric literals, got '${tok?.value ?? 'EOF'}'`,
          position: tok?.position,
          severity: 'error',
        });
        if (tok && tok.type !== 'PUNCTUATION') this.advance();
      }
    }
    this.consume('PUNCTUATION', ')');
    return params.length > 0 ? { type, params } : { type };
  }

  private parseTransition(): TransitionNode {
    // Syntax: transition <property> from "<value>" to ["<value>", "<value>"]
    this.consume('KEYWORD', 'transition');
    const property = this.consumeIdentifier().value;
    this.consume('KEYWORD', 'from');
    const fromToken = this.advance(); // consume the "from" value (string literal)
    const from = fromToken.type === 'STRING' ? fromToken.value : fromToken.value;
    this.consume('KEYWORD', 'to');
    const to: string[] = [];
    if (this.check('PUNCTUATION', '[')) {
      this.advance(); // consume '['
      while (!this.check('PUNCTUATION', ']') && !this.isEnd()) {
        const valToken = this.advance();
        to.push(valToken.type === 'STRING' ? valToken.value : valToken.value);
        if (this.check('PUNCTUATION', ',')) this.advance(); // consume ','
      }
      this.consume('PUNCTUATION', ']');
    } else {
      // Single value: transition status from "draft" to "review"
      const valToken = this.advance();
      to.push(valToken.type === 'STRING' ? valToken.value : valToken.value);
    }
    return { type: 'Transition', property, from, to };
  }

  private parseApproval(): ApprovalNode {
    const position = this.current()?.position;
    this.consume('KEYWORD', 'approval');
    const name = this.consumeIdentifier().value;
    this.consume('PUNCTUATION', '{');
    this.skipNL();

    let command = '';
    const stages: ApprovalStageNode[] = [];
    let timeout: number | undefined;
    let onTimeout: 'cancel' | 'escalate' | undefined;
    const emits: string[] = [];

    while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
      this.skipNL();
      if (this.check('PUNCTUATION', '}')) break;

      if (this.check('KEYWORD', 'command')) {
        this.advance(); // consume 'command'
        this.consume('OPERATOR', ':');
        command = this.consumeIdentifier().value;
      } else if (this.check('KEYWORD', 'stages')) {
        this.advance(); // consume 'stages'
        this.consume('PUNCTUATION', '{');
        this.skipNL();
        while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
          this.skipNL();
          if (this.check('PUNCTUATION', '}')) break;
          if (this.check('IDENTIFIER') || this.check('KEYWORD', 'stage')) {
            // Support both "stage <name> { ... }" and bare "<name> { ... }"
            if (this.current()?.value === 'stage') this.advance();
            stages.push(this.parseApprovalStage());
          } else {
            this.advance();
          }
          this.skipNL();
        }
        this.consume('PUNCTUATION', '}');
      } else if (this.check('KEYWORD', 'timeout')) {
        this.advance(); // consume 'timeout'
        this.consume('OPERATOR', ':');
        const t = this.advance();
        timeout = t.type === 'NUMBER' ? parseFloat(t.value) : undefined;
      } else if (this.check('IDENTIFIER') && this.current()?.value === 'on_timeout') {
        this.advance(); // consume 'on_timeout'
        this.consume('OPERATOR', ':');
        const v = this.check('STRING') ? this.advance().value : this.advance().value;
        if (v === 'cancel' || v === 'escalate') onTimeout = v;
      } else if (this.check('KEYWORD', 'emit')) {
        this.advance(); // consume 'emit'
        emits.push(this.consumeIdentifier().value);
      } else {
        this.advance();
      }
      this.skipNL();
    }
    this.consume('PUNCTUATION', '}');

    if (!command) {
      throw new Error(`Approval '${name}' must specify a command`);
    }

    const node: ApprovalNode = { type: 'Approval', name, command, stages, emits, position };
    if (timeout !== undefined) node.timeout = timeout;
    if (onTimeout !== undefined) node.onTimeout = onTimeout;
    return node;
  }

  private parseApprovalStage(): ApprovalStageNode {
    const name = this.consumeIdentifier().value;
    this.consume('PUNCTUATION', '{');
    this.skipNL();

    let policy: ExpressionNode | undefined;
    let when: ExpressionNode | undefined;
    let required = 1;

    while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
      this.skipNL();
      if (this.check('PUNCTUATION', '}')) break;

      if (this.check('KEYWORD', 'policy')) {
        this.advance(); // consume 'policy'
        this.consume('OPERATOR', ':');
        policy = this.parseExpr();
      } else if (this.check('KEYWORD', 'when')) {
        this.advance(); // consume 'when'
        this.consume('OPERATOR', ':');
        when = this.parseExpr();
      } else if (this.check('KEYWORD', 'required')) {
        this.advance(); // consume 'required'
        this.consume('OPERATOR', ':');
        const r = this.advance();
        required = r.type === 'NUMBER' ? parseFloat(r.value) : 1;
      } else {
        this.advance();
      }
      this.skipNL();
    }
    this.consume('PUNCTUATION', '}');

    if (!policy) {
      throw new Error(`Approval stage '${name}' requires a policy expression`);
    }

    const node: ApprovalStageNode = { type: 'ApprovalStage', name, policy, required };
    if (when) node.when = when;
    return node;
  }

  private parseComputedProperty(): ComputedPropertyNode {
    this.advance();
    const name = this.consumeIdentifier().value;
    this.consume('OPERATOR', ':');
    const dataType = this.parseType();
    this.consume('OPERATOR', '=');
    const expression = this.parseExpr();
    const dependencies = this.extractDependencies(expression);
    const cache = this.parseComputedCache();
    const node: ComputedPropertyNode = {
      type: 'ComputedProperty',
      name,
      dataType,
      expression,
      dependencies,
    };
    if (cache) node.cache = cache;
    return node;
  }

  private parseComputedCache(): ComputedPropertyNode['cache'] | undefined {
    if (!this.check('KEYWORD', 'cache')) return undefined;
    this.advance(); // consume 'cache'

    if (this.check('KEYWORD', 'request')) {
      this.advance();
      return { strategy: 'request' };
    }
    if (this.check('KEYWORD', 'session')) {
      this.advance();
      return { strategy: 'session' };
    }
    if (this.check('KEYWORD', 'ttl')) {
      this.advance();
      const ttlToken = this.advance();
      if (ttlToken.type !== 'NUMBER') {
        throw new Error(`Expected TTL value in seconds after 'ttl', got '${ttlToken.value}'`);
      }
      return { strategy: 'ttl', ttlSeconds: Number(ttlToken.value) };
    }
    throw new Error(
      `Expected cache strategy: 'request', 'session', or 'ttl', got '${this.current()?.value}'`,
    );
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
          // self.X / this.X → X is an instance property the computed reads, so
          // it is a real dependency (the runtime's stale-marking keys on the
          // names of mutated properties). Previously the property was dropped,
          // so `self.totalTax` never listed `totalTax` and caches went stale.
          // Other bases (user.X, context.X, event.X, payload.X) recurse into
          // the object so their non-instance property names aren't captured;
          // a nested self.a.b recurses to capture `a`. Mirrors the self/this
          // member check in checkComputedRefsInGuardsAndConstraints (ir-compiler).
          if (
            e.object.type === 'Identifier' &&
            (e.object.name === 'self' || e.object.name === 'this') &&
            typeof e.property === 'string'
          ) {
            deps.add(e.property);
          } else {
            walk(e.object);
          }
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

  private parseIdentifierArray(): string[] {
    this.consume('PUNCTUATION', '[');
    const items: string[] = [];
    while (!this.check('PUNCTUATION', ']') && !this.isEnd()) {
      items.push(this.consumeIdentifierOrKeyword().value);
      if (this.check('PUNCTUATION', ',')) this.advance();
    }
    this.consume('PUNCTUATION', ']');
    return items;
  }

  private parseRelationship(): RelationshipNode {
    const kind = this.advance().value as RelationshipNode['kind'];
    const name = this.consumeIdentifierOrKeyword().value;
    this.consume('OPERATOR', ':');
    const target = this.consumeIdentifierOrKeyword().value;

    let fields: string[] | undefined;
    let references: string[] | undefined;
    let through: string | undefined;
    let onDelete: RefAction | undefined;
    let onUpdate: RefAction | undefined;

    if (this.check('KEYWORD', 'through')) {
      this.advance();
      through = this.consumeIdentifier().value;
    }

    if (this.check('KEYWORD', 'fields')) {
      this.advance();
      fields = this.parseIdentifierArray();
    }

    if (this.check('KEYWORD', 'references')) {
      this.advance();
      references = this.parseIdentifierArray();
    }

    // `with <single>` backward-compat: parsed as fields: [name], references absent
    if (this.check('KEYWORD', 'with')) {
      this.advance();
      fields = [this.consumeIdentifier().value];
    }

    // Case 3: references only, no fields — infer local from relName + "Id" (single only)
    if (references && !fields) {
      if (references.length > 1) {
        this.errors.push({
          message: `Composite references [...] requires explicit fields [...]`,
          position: this.current()?.position,
          severity: 'error',
        });
      }
      fields = [`${name}Id`];
    }

    if (this.check('KEYWORD', 'onDelete')) {
      this.advance();
      onDelete = this.advance().value as RefAction;
    }

    if (this.check('KEYWORD', 'onUpdate')) {
      this.advance();
      onUpdate = this.advance().value as RefAction;
    }

    return {
      type: 'Relationship',
      kind,
      name,
      target,
      fields,
      references,
      through,
      onDelete,
      onUpdate,
    };
  }

  private parseCommand(): CommandNode {
    this.consume('KEYWORD', 'command');
    const name = this.consumeIdentifier().value;
    this.consume('PUNCTUATION', '(');
    const parameters: ParameterNode[] = [];
    this.skipNL();
    while (!this.check('PUNCTUATION', ')') && !this.isEnd()) {
      this.skipNL();
      const required = !this.check('KEYWORD', 'optional');
      if (!required) this.advance();
      const pname = this.consumeIdentifier().value;
      this.consume('OPERATOR', ':');
      const dataType = this.parseType();
      let defaultValue: ExpressionNode | undefined;
      if (this.check('OPERATOR', '=')) {
        this.advance();
        defaultValue = this.parseExpr();
      }
      // Trusted server-owned source: `from context.actorId` (same grammar as tenant).
      let trustedSource: string | undefined;
      if (this.check('KEYWORD', 'from')) {
        this.advance();
        let contextPath = '';
        contextPath += this.advance().value;
        while (this.check('OPERATOR', '.')) {
          contextPath += this.advance().value;
          contextPath += this.consumeIdentifierOrKeyword().value;
        }
        if (!contextPath.startsWith('context.')) {
          throw new Error(
            `Trusted parameter source must be a context.* path, got '${contextPath}'`,
          );
        }
        trustedSource = contextPath;
      }
      parameters.push({
        type: 'Parameter',
        name: pname,
        dataType,
        required,
        defaultValue,
        ...(trustedSource ? { trustedSource } : {}),
      });
      this.skipNL();
      if (this.check('PUNCTUATION', ',')) {
        this.advance();
        this.skipNL();
      }
    }
    this.consume('PUNCTUATION', ')');

    let returns: TypeNode | undefined;
    if (this.check('KEYWORD', 'returns')) {
      this.advance();
      returns = this.parseType();
    }

    let retry: RetryPolicyNode | undefined;
    let rateLimit: RateLimitNode | undefined;
    const guards: ExpressionNode[] = [],
      constraints: ConstraintNode[] = [],
      actions: ActionNode[] = [],
      emits: string[] = [];
    const emitPayloads: NonNullable<CommandNode['emitPayloads']> = [];

    if (this.check('PUNCTUATION', '{')) {
      this.advance();
      this.skipNL();
      while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
        this.skipNL();
        if (this.check('PUNCTUATION', '}')) break;
        // Parse retry block
        if (this.check('IDENTIFIER', 'retry') && this.tokens[this.pos + 1]?.value === '{') {
          retry = this.parseRetryBlock();
        }
        // Parse rateLimit block
        else if (
          this.check('IDENTIFIER', 'rateLimit') &&
          this.tokens[this.pos + 1]?.value === '{'
        ) {
          rateLimit = this.parseRateLimitBlock();
        } else if (this.check('KEYWORD', 'guard') || this.check('KEYWORD', 'when')) {
          this.advance();
          guards.push(this.parseExpr());
        } else if (this.check('KEYWORD', 'constraint')) {
          constraints.push(this.parseConstraint());
        } else if (this.check('KEYWORD', 'emit')) {
          this.advance();
          const eventName = this.consumeIdentifier().value;
          emits.push(eventName);
          // Optional explicit payload: emit EventName { field: expr, ... }
          if (this.check('PUNCTUATION', '{')) {
            const payload = this.parsePrimary();
            if (payload.type === 'Object') emitPayloads.push({ eventName, payload });
          }
        } else actions.push(this.parseAction());
        this.skipNL();
      }
      this.consume('PUNCTUATION', '}');
    } else if (this.check('OPERATOR', '=>')) {
      this.advance();
      actions.push(this.parseAction());
    }

    return {
      type: 'Command',
      name,
      parameters,
      ...(retry ? { retry } : {}),
      ...(rateLimit ? { rateLimit } : {}),
      guards: guards.length ? guards : undefined,
      constraints: constraints.length ? constraints : undefined,
      actions,
      emits: emits.length ? emits : undefined,
      emitPayloads: emitPayloads.length ? emitPayloads : undefined,
      returns,
    };
  }

  private parsePolicy(isDefault = false): PolicyNode {
    this.consume('KEYWORD', 'policy');
    const name = this.consumeIdentifier().value;
    let action: PolicyNode['action'] = 'all';
    if (
      this.check('KEYWORD', 'read') ||
      this.check('KEYWORD', 'write') ||
      this.check('KEYWORD', 'delete') ||
      this.check('KEYWORD', 'execute') ||
      this.check('KEYWORD', 'all') ||
      this.check('KEYWORD', 'override')
    ) {
      action = this.advance().value as PolicyNode['action'];
    }
    this.consume('OPERATOR', ':');
    this.skipNL();
    const expression = this.parseExpr();

    // Parse optional rateLimit block after expression
    let rateLimit: RateLimitNode | undefined;
    if (this.check('IDENTIFIER', 'rateLimit') && this.tokens[this.pos + 1]?.value === '{') {
      rateLimit = this.parseRateLimitBlock();
    }

    const message = this.check('STRING') ? this.advance().value : undefined;
    return {
      type: 'Policy',
      name,
      action,
      expression,
      ...(rateLimit ? { rateLimit } : {}),
      message,
      isDefault,
    };
  }

  private parseRole(): RoleNode {
    const position = this.current()?.position;
    this.consume('IDENTIFIER', 'role');
    const name = this.consumeIdentifier().value;
    let parent: string | undefined;
    if (this.check('KEYWORD', 'extends')) {
      this.advance();
      parent = this.consumeIdentifier().value;
    }
    this.consume('PUNCTUATION', '{');
    this.skipNL();
    const permissions: RolePermissionNode[] = [];
    while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
      this.skipNL();
      if (this.check('PUNCTUATION', '}')) break;
      if (this.check('KEYWORD', 'allow') || this.check('KEYWORD', 'deny')) {
        const kind = this.advance().value as 'allow' | 'deny';
        const action = this.advance().value as RolePermissionNode['action'];
        let target: string | undefined;
        if (this.check('IDENTIFIER')) target = this.advance().value;
        permissions.push({ kind, action, target });
      } else {
        this.advance();
      }
      this.skipNL();
    }
    this.consume('PUNCTUATION', '}');
    return { type: 'Role', name, parent, permissions, position };
  }

  private parseStore(): StoreNode {
    this.consume('KEYWORD', 'store');
    const entity = this.consumeIdentifier().value;
    this.consume('KEYWORD', 'in');
    const target = this.advance().value as StoreNode['target'];
    const config: Record<string, ExpressionNode> = {};
    if (this.check('PUNCTUATION', '{')) {
      this.advance();
      this.skipNL();
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
    return {
      type: 'Store',
      entity,
      target,
      config: Object.keys(config).length ? config : undefined,
    };
  }

  private parseOutboxEvent(): OutboxEventNode {
    this.consume('KEYWORD', 'event');
    const name = this.consumeIdentifier().value;
    this.consume('OPERATOR', ':');
    const channel = this.check('STRING') ? this.advance().value : name;
    let payload: OutboxEventNode['payload'] = { type: 'Type', name: 'unknown', nullable: false };
    if (this.check('PUNCTUATION', '{')) {
      this.advance();
      this.skipNL();
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
    // Type parameters for decimal/decimal(money) types: decimal(10, 2)
    let params: { precision?: number; scale?: number } | undefined;
    if (this.check('PUNCTUATION', '(') && (name === 'decimal' || name === 'money')) {
      this.advance(); // consume (
      const precisionToken = this.advance();
      const precision =
        typeof precisionToken.value === 'number'
          ? precisionToken.value
          : parseInt(precisionToken.value, 10);
      this.consume('PUNCTUATION', ',');
      this.skipNL();
      const scaleToken = this.advance();
      const scale =
        typeof scaleToken.value === 'number' ? scaleToken.value : parseInt(scaleToken.value, 10);
      this.consume('PUNCTUATION', ')');
      params = { precision, scale };
    }
    if (this.check('OPERATOR', '<')) {
      this.advance();
      generic = this.parseType();
      this.consume('OPERATOR', '>');
    }
    const nullable = this.check('OPERATOR', '?') ? (this.advance(), true) : false;
    // Postfix [] array syntax: string[] is sugar for array<string>
    const isArray =
      this.check('PUNCTUATION', '[') &&
      this.tokens[this.pos + 1]?.type === 'PUNCTUATION' &&
      this.tokens[this.pos + 1]?.value === ']';
    if (isArray) {
      this.advance(); // consume [
      this.advance(); // consume ]
      return {
        type: 'Type',
        name: 'array',
        generic: { type: 'Type', name, nullable: false, params },
        nullable,
      };
    }
    return { type: 'Type', name, generic, nullable, params };
  }

  private parseBehavior(): BehaviorNode {
    if (this.check('KEYWORD', 'behavior')) this.advance();
    this.consume('KEYWORD', 'on');
    const trigger = this.parseTrigger();
    const guards: ExpressionNode[] = [];
    while (this.check('KEYWORD', 'guard') || this.check('KEYWORD', 'when')) {
      this.advance();
      guards.push(this.parseExpr());
    }
    const actions: ActionNode[] = [];
    if (this.check('PUNCTUATION', '{')) {
      this.advance();
      this.skipNL();
      while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
        this.skipNL();
        if (this.check('PUNCTUATION', '}')) break;
        actions.push(this.parseAction());
        this.skipNL();
      }
      this.consume('PUNCTUATION', '}');
    } else if (this.check('KEYWORD', 'then') || this.check('OPERATOR', '=>')) {
      this.advance();
      actions.push(this.parseAction());
    }
    return {
      type: 'Behavior',
      name: trigger.event,
      trigger,
      actions,
      guards: guards.length ? guards : undefined,
    };
  }

  private parseTrigger(): TriggerNode {
    const event = this.consumeIdentifier().value;
    let parameters: string[] | undefined;
    if (this.check('PUNCTUATION', '(')) {
      this.advance();
      parameters = [];
      while (!this.check('PUNCTUATION', ')') && !this.isEnd()) {
        parameters.push(this.consumeIdentifier().value);
        if (this.check('PUNCTUATION', ',')) this.advance();
      }
      this.consume('PUNCTUATION', ')');
    }
    return { type: 'Trigger', event, parameters };
  }

  /**
   * Lookahead to check if the current `on` keyword starts a reaction
   * (`on Event run ...` or `on Event fanOut ...`) or a behavior
   * (`on Event { ... }` / `on Event then ...`).
   */
  private isReactionLookahead(): boolean {
    // Current token is 'on'. A reaction is `on <Event> run|fanOut ...`.
    const eventToken = this.tokens[this.pos + 1];
    const actionToken = this.tokens[this.pos + 2];
    return (
      eventToken?.type === 'IDENTIFIER' &&
      actionToken?.type === 'KEYWORD' &&
      (actionToken?.value === 'run' || actionToken?.value === 'fanOut')
    );
  }

  /**
   * Parses an optional `params { name: <expr>, ... }` clause shared by all
   * reaction forms.
   */
  private parseReactionParams(): ReactionParamMapping[] | undefined {
    if (!this.check('KEYWORD', 'params')) return undefined;
    this.advance(); // consume 'params'
    const params: ReactionParamMapping[] = [];
    this.consume('PUNCTUATION', '{');
    this.skipNL();
    while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
      this.skipNL();
      if (this.check('PUNCTUATION', '}')) break;
      const name = this.consumeIdentifier().value;
      this.consume('OPERATOR', ':');
      const expression = this.parseExpr();
      params.push({ name, expression });
      if (this.check('PUNCTUATION', ',')) this.advance();
      this.skipNL();
    }
    this.consume('PUNCTUATION', '}');
    return params;
  }

  /**
   * Parses a reaction. Two forms:
   *
   *   on <Event> run <EntityType>.<commandName>
   *     resolve <expression>
   *     params { <name>: <expression>, ... }
   *
   *   on <Event> fanOut <EntityType> where <matchField> = <sourceExpr>
   *     run <commandName>
   *     params { <name>: <expression>, ... }
   *
   * The fan-out form dispatches the command on EVERY target row where
   * `row.<matchField> == <sourceExpr>` (evaluated against the event payload);
   * the collection match replaces `resolve`.
   */
  private parseReaction(): ReactionNode {
    const position = this.current()?.position;
    this.consume('KEYWORD', 'on');
    const event = this.consumeIdentifier().value;

    // Fan-out form: on <Event> fanOut <Target> where <field> = <source> run <cmd>
    if (this.check('KEYWORD', 'fanOut')) {
      this.advance(); // consume 'fanOut'
      const targetEntity = this.consumeIdentifier().value;
      this.consume('KEYWORD', 'where');
      const matchField = this.consumeIdentifier().value;
      this.consume('OPERATOR', '=');
      const matchSource = this.parseExpr();
      this.skipNL();
      this.consume('KEYWORD', 'run');
      const targetCommand = this.consumeIdentifier().value;
      this.skipNL();
      const params = this.parseReactionParams();
      return {
        type: 'Reaction',
        event,
        targetEntity,
        targetCommand,
        fanOut: { matchField, matchSource },
        ...(params ? { params } : {}),
        position,
      };
    }

    // Single-target form: on <Event> run <EntityType>.<command> resolve <expr>
    this.consume('KEYWORD', 'run');
    const targetEntity = this.consumeIdentifier().value;
    this.consume('OPERATOR', '.');
    const targetCommand = this.consumeIdentifier().value;
    this.skipNL();

    // Parse 'resolve' clause
    this.consume('KEYWORD', 'resolve');
    const resolve = this.parseExpr();
    this.skipNL();

    const params = this.parseReactionParams();
    return {
      type: 'Reaction',
      event,
      targetEntity,
      targetCommand,
      resolve,
      ...(params ? { params } : {}),
      position,
    };
  }

  /**
   * Parses: webhook <name> "<path>" run [Entity.]<command>
   *           [method: "POST"]
   *           [signature { algorithm: "hmac-sha256", header: "X-Sig", secret: "context.secret" }]
   *           [idempotencyHeader: "X-Idempotency-Key"]
   *           [transform: { <param>: <expr>, ... }]
   */
  private parseWebhook(): WebhookNode {
    const position = this.current()?.position;
    this.consume('KEYWORD', 'webhook');
    const name = this.consumeIdentifier().value;
    this.skipNL();

    // Parse path string
    if (!this.check('STRING')) {
      throw new Error(`Expected path string after webhook '${name}'`);
    }
    const path = this.advance().value;
    this.skipNL();

    // 'run' keyword
    this.consume('KEYWORD', 'run');

    // Parse optional Entity.commandName
    let entity: string | undefined;
    let command: string;
    const firstIdent = this.consumeIdentifier().value;
    if (this.check('OPERATOR', '.')) {
      this.advance(); // consume '.'
      entity = firstIdent;
      command = this.consumeIdentifier().value;
    } else {
      command = firstIdent;
    }
    this.skipNL();

    // Parse optional block clauses
    let method: string | undefined;
    let signature: WebhookSignatureNode | undefined;
    let idempotencyHeader: string | undefined;
    let transform: WebhookParamMapping[] | undefined;

    // Lookahead: continue parsing clauses while we see webhook-specific keywords
    while (
      !this.isEnd() &&
      (this.check('IDENTIFIER', 'method') ||
        this.check('KEYWORD', 'signature') ||
        this.check('KEYWORD', 'idempotencyHeader') ||
        this.check('KEYWORD', 'transform'))
    ) {
      if (this.check('IDENTIFIER', 'method')) {
        this.advance();
        this.consume('OPERATOR', ':');
        if (!this.check('STRING')) {
          throw new Error(`Expected string method after 'method:'`);
        }
        method = this.advance().value;
      } else if (this.check('KEYWORD', 'signature')) {
        this.advance();
        signature = this.parseWebhookSignature();
      } else if (this.check('KEYWORD', 'idempotencyHeader')) {
        this.advance();
        this.consume('OPERATOR', ':');
        if (!this.check('STRING')) {
          throw new Error(`Expected string header name after 'idempotencyHeader:'`);
        }
        idempotencyHeader = this.advance().value;
      } else if (this.check('KEYWORD', 'transform')) {
        this.advance();
        this.consume('OPERATOR', ':');
        this.consume('PUNCTUATION', '{');
        this.skipNL();
        transform = [];
        while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
          this.skipNL();
          if (this.check('PUNCTUATION', '}')) break;
          const pname = this.consumeIdentifier().value;
          this.consume('OPERATOR', ':');
          const pexpr = this.parseExpr();
          transform.push({ name: pname, expression: pexpr });
          if (this.check('PUNCTUATION', ',')) this.advance();
          this.skipNL();
        }
        this.consume('PUNCTUATION', '}');
      }
      this.skipNL();
    }

    const node: WebhookNode = {
      type: 'Webhook',
      name,
      path,
      command,
      position,
    };
    if (method) node.method = method;
    if (entity) node.entity = entity;
    if (signature) node.signature = signature;
    if (idempotencyHeader) node.idempotencyHeader = idempotencyHeader;
    if (transform && transform.length > 0) node.transform = transform;
    return node;
  }

  /**
   * Parses: { algorithm: "hmac-sha256", header: "X-Hub-Signature-256", secret: "context.secret" }
   */
  private parseWebhookSignature(): WebhookSignatureNode {
    this.consume('PUNCTUATION', '{');
    this.skipNL();

    let algorithm: 'hmac-sha256' | 'hmac-sha512' | undefined;
    let header: string | undefined;
    let secret: string | undefined;

    while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
      this.skipNL();
      if (this.check('PUNCTUATION', '}')) break;

      const field = this.consumeIdentifierOrKeyword().value;
      this.consume('OPERATOR', ':');

      if (field === 'algorithm') {
        if (!this.check('STRING')) {
          throw new Error(`Expected string algorithm in signature block`);
        }
        const alg = this.advance().value;
        if (alg === 'hmac-sha256' || alg === 'hmac-sha512') {
          algorithm = alg;
        } else {
          throw new Error(
            `Unsupported signature algorithm '${alg}'. Supported: hmac-sha256, hmac-sha512`,
          );
        }
      } else if (field === 'header') {
        if (!this.check('STRING')) {
          throw new Error(`Expected string header name in signature block`);
        }
        header = this.advance().value;
      } else if (field === 'secret') {
        if (!this.check('STRING')) {
          throw new Error(`Expected string secret path in signature block`);
        }
        secret = this.advance().value;
      } else {
        // Skip unknown field
        this.parseExpr();
      }
      this.skipNL();
      if (this.check('PUNCTUATION', ',')) this.advance();
    }
    this.consume('PUNCTUATION', '}');

    if (!algorithm || !header || !secret) {
      throw new Error(`Signature block requires algorithm, header, and secret fields`);
    }

    return { type: 'WebhookSignature', algorithm, header, secret };
  }

  /**
   * Parses: saga <Name> {
   *   step <name> { command: Entity.cmd [compensate: Entity.cmd] }
   *   ...
   *   [on_failure: "compensate"|"abort"]
   *   [emit EventName]
   * }
   *
   * Note: 'step' and 'compensate' are NOT keywords — matched as IDENTIFIERs
   * to avoid breaking existing code that uses 'step' as a property name.
   */
  private parseSaga(): SagaNode {
    const position = this.current()?.position;
    this.consume('KEYWORD', 'saga');
    const name = this.consumeIdentifier().value;
    this.consume('PUNCTUATION', '{');
    this.skipNL();

    const steps: SagaStepNode[] = [];
    let onFailure: 'compensate' | 'abort' = 'compensate';
    const emits: string[] = [];

    while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
      this.skipNL();
      if (this.check('PUNCTUATION', '}')) break;

      if (this.check('IDENTIFIER') && this.current()?.value === 'step') {
        steps.push(this.parseSagaStep());
      } else if (this.check('IDENTIFIER') && this.current()?.value === 'on_failure') {
        this.advance(); // consume 'on_failure'
        this.consume('OPERATOR', ':');
        const v = this.check('STRING') ? this.advance().value : this.advance().value;
        if (v === 'compensate' || v === 'abort') onFailure = v;
      } else if (this.check('KEYWORD', 'emit')) {
        this.advance(); // consume 'emit'
        emits.push(this.consumeIdentifier().value);
      } else {
        this.advance();
      }
      this.skipNL();
    }
    this.consume('PUNCTUATION', '}');

    if (steps.length === 0) {
      throw new Error(`Saga '${name}' must declare at least one step`);
    }

    return { type: 'Saga', name, steps, onFailure, emits, position };
  }

  private parseSagaStep(): SagaStepNode {
    this.advance(); // consume 'step' (IDENTIFIER, not keyword)
    const name = this.consumeIdentifier().value;
    this.consume('PUNCTUATION', '{');
    this.skipNL();

    let commandEntity = '',
      command = '';
    let compensateEntity: string | undefined, compensate: string | undefined;

    while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
      this.skipNL();
      if (this.check('PUNCTUATION', '}')) break;

      if (this.check('KEYWORD', 'command')) {
        this.advance(); // consume 'command'
        this.consume('OPERATOR', ':');
        commandEntity = this.consumeIdentifier().value;
        this.consume('OPERATOR', '.');
        command = this.consumeIdentifier().value;
      } else if (this.check('IDENTIFIER') && this.current()?.value === 'compensate') {
        this.advance(); // consume 'compensate'
        this.consume('OPERATOR', ':');
        compensateEntity = this.consumeIdentifier().value;
        this.consume('OPERATOR', '.');
        compensate = this.consumeIdentifier().value;
      } else {
        this.advance();
      }
      this.skipNL();
    }
    this.consume('PUNCTUATION', '}');

    if (!command) {
      throw new Error(`Saga step '${name}' must specify a command`);
    }

    const node: SagaStepNode = { type: 'SagaStep', name, commandEntity, command };
    if (compensate) {
      node.compensateEntity = compensateEntity;
      node.compensate = compensate;
    }
    return node;
  }

  private parseAction(): ActionNode {
    const position = this.current()?.position;
    let kind: ActionNode['kind'] = 'compute',
      target: string | undefined;
    if (this.check('KEYWORD', 'mutate')) {
      this.advance();
      kind = 'mutate';
      target = this.consumeIdentifier().value;
      this.consume('OPERATOR', '=');
    } else if (this.check('KEYWORD', 'emit') || this.check('KEYWORD', 'publish')) {
      kind = this.advance().value as 'emit' | 'publish';
      // Named target event: `emit EventName` / `publish EventName [payloadExpr]`.
      // The event name is required (compiler enforces EMIT_ACTION_UNKNOWN_EVENT);
      // an optional inline expression supplies the payload, else it defaults to {}.
      if (this.check('IDENTIFIER')) target = this.consumeIdentifier().value;
      if (this.atStatementEnd()) {
        return {
          type: 'Action',
          kind,
          target,
          position,
          expression: { type: 'Literal', value: null, dataType: 'null' },
        };
      }
      return { type: 'Action', kind, target, position, expression: this.parseExpr() };
    } else if (this.check('KEYWORD', 'effect')) {
      this.advance();
      kind = 'effect';
      // Optional naming form mirrors compute: `effect <name> = <expr>` names the
      // effect for the host handler; bare `effect <expr>` is unnamed.
      const nextToken = this.tokens[this.pos + 1];
      if (this.check('IDENTIFIER') && nextToken?.type === 'OPERATOR' && nextToken?.value === '=') {
        target = this.consumeIdentifier().value;
        this.consume('OPERATOR', '=');
      }
    } else if (this.check('KEYWORD', 'persist')) {
      this.advance();
      kind = 'persist';
    } else if (this.check('KEYWORD', 'compute')) {
      this.advance();
      kind = 'compute';
      // Check for assignment form: compute <identifier> = <expr>
      const nextToken = this.tokens[this.pos + 1];
      if (this.check('IDENTIFIER') && nextToken?.type === 'OPERATOR' && nextToken?.value === '=') {
        target = this.consumeIdentifier().value;
        this.consume('OPERATOR', '=');
      }
    }
    return { type: 'Action', kind, target, position, expression: this.parseExpr() };
  }

  /** True when the current token ends the current action (newline, block close, or EOF). */
  private atStatementEnd(): boolean {
    return this.check('NEWLINE') || this.check('PUNCTUATION', '}') || this.isEnd();
  }

  private parseConstraint(): ConstraintNode {
    this.consume('KEYWORD', 'constraint');

    // Check for overrideable modifier
    let overrideable = false;
    if (this.check('KEYWORD', 'overrideable')) {
      this.advance();
      overrideable = true;
    }

    // Check for failWhen modifier (before the name)
    let failWhenModifier: boolean | undefined;
    if (this.check('KEYWORD', 'failWhen')) {
      this.advance();
      failWhenModifier = true;
    }

    const name = this.consumeIdentifier().value;

    // Declare variables that may be used in both paths
    let code: string | undefined;
    let severity: 'ok' | 'warn' | 'block' | undefined;
    let failWhen: boolean | undefined = failWhenModifier;
    let message: string | undefined;
    let messageTemplate: string | undefined;
    let detailsMapping: Record<string, ExpressionNode> | undefined;
    let overridePolicyRef: string | undefined;

    // Check for block syntax: constraint <name> { ... }
    if (this.check('PUNCTUATION', '{')) {
      this.advance();
      this.skipNL();

      let expression: ExpressionNode | undefined;

      while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
        this.skipNL();
        if (this.check('PUNCTUATION', '}')) break;

        const field = this.consumeIdentifierOrKeyword().value;
        this.consume('OPERATOR', ':');

        switch (field) {
          case 'code':
            code = this.consumeIdentifier().value;
            break;
          case 'severity': {
            const sev = this.consumeIdentifierOrKeyword().value;
            if (sev === 'ok' || sev === 'warn' || sev === 'block') {
              severity = sev;
            }
            break;
          }
          case 'expression':
            expression = this.parseExpr();
            break;
          case 'message':
            message = this.check('STRING') ? this.advance().value : undefined;
            break;
          case 'messageTemplate':
            messageTemplate = this.check('STRING') ? this.advance().value : undefined;
            break;
          case 'overridePolicy':
            overridePolicyRef = this.consumeIdentifier().value;
            break;
          case 'failWhen': {
            const fw = this.consumeIdentifierOrKeyword().value;
            failWhen = fw === 'true' || fw === 'yes';
            break;
          }
          case 'details':
            detailsMapping = {};
            if (this.check('PUNCTUATION', '{')) {
              this.advance();
              this.skipNL();
              while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
                this.skipNL();
                if (this.check('PUNCTUATION', '}')) break;
                const key = this.consumeIdentifierOrKeyword().value;
                this.consume('OPERATOR', ':');
                detailsMapping![key] = this.parseExpr();
                this.skipNL();
                if (this.check('PUNCTUATION', ',')) this.advance();
              }
              this.consume('PUNCTUATION', '}');
            }
            break;
          default:
            // Unknown field, skip the expression
            this.parseExpr();
        }
        this.skipNL();
        if (this.check('PUNCTUATION', ',')) this.advance();
      }

      this.consume('PUNCTUATION', '}');

      if (!expression) {
        throw new Error('Constraint block must include an expression');
      }

      return {
        type: 'Constraint',
        name,
        code,
        expression,
        severity: severity || 'block',
        failWhen,
        message,
        messageTemplate,
        detailsMapping,
        overrideable,
        overridePolicyRef,
      };
    }

    // Inline syntax: constraint <name>[:severity] <expression> ["<message>"]
    this.consume('OPERATOR', ':');

    // Check for severity suffix (name:ok, name:warn, name:block)
    if (
      this.check('KEYWORD', 'ok') ||
      this.check('KEYWORD', 'warn') ||
      this.check('KEYWORD', 'block')
    ) {
      const sev = this.advance().value;
      severity = sev as 'ok' | 'warn' | 'block';
    }

    const expression = this.parseExpr();
    message = this.check('STRING') ? this.advance().value : undefined;

    // Check for optional block after inline expression:
    //   constraint name:severity <expr> { messageTemplate: "...", details: { ... } }
    // This is the hybrid inline+block syntax used in production manifests.
    if (this.check('PUNCTUATION', '{')) {
      this.advance();
      this.skipNL();
      while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
        this.skipNL();
        if (this.check('PUNCTUATION', '}')) break;
        const field = this.consumeIdentifierOrKeyword().value;
        this.consume('OPERATOR', ':');
        switch (field) {
          case 'code':
            code = this.consumeIdentifier().value;
            break;
          case 'message':
            message = this.check('STRING') ? this.advance().value : undefined;
            break;
          case 'messageTemplate':
            messageTemplate = this.check('STRING') ? this.advance().value : undefined;
            break;
          case 'overridePolicy':
            overridePolicyRef = this.consumeIdentifier().value;
            break;
          case 'details':
            detailsMapping = {};
            if (this.check('PUNCTUATION', '{')) {
              this.advance();
              this.skipNL();
              while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
                this.skipNL();
                if (this.check('PUNCTUATION', '}')) break;
                const key = this.consumeIdentifierOrKeyword().value;
                this.consume('OPERATOR', ':');
                detailsMapping![key] = this.parseExpr();
                this.skipNL();
                if (this.check('PUNCTUATION', ',')) this.advance();
              }
              this.consume('PUNCTUATION', '}');
            }
            break;
          default:
            // Unknown field, skip the expression
            this.parseExpr();
        }
        this.skipNL();
        if (this.check('PUNCTUATION', ',')) this.advance();
      }
      this.consume('PUNCTUATION', '}');
    }

    return {
      type: 'Constraint',
      name,
      code,
      expression,
      severity: severity || 'block',
      failWhen,
      message,
      messageTemplate,
      detailsMapping,
      overrideable,
      overridePolicyRef,
    };
  }

  private parseFlow(): FlowNode {
    this.consume('KEYWORD', 'flow');
    const name = this.consumeIdentifier().value;
    this.consume('PUNCTUATION', '(');
    const input = this.parseType();
    this.consume('PUNCTUATION', ')');
    this.consume('OPERATOR', '->');
    const output = this.parseType();
    this.consume('PUNCTUATION', '{');
    this.skipNL();
    const steps: FlowStepNode[] = [];
    while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
      this.skipNL();
      if (this.check('PUNCTUATION', '}')) break;
      steps.push(this.parseFlowStep());
      this.skipNL();
    }
    this.consume('PUNCTUATION', '}');
    return { type: 'Flow', name, input, output, steps };
  }

  private parseFlowStep(): FlowStepNode {
    const operation = this.advance().value;
    let condition: ExpressionNode | undefined;
    if (this.check('KEYWORD', 'when')) {
      this.advance();
      condition = this.parseExpr();
    }
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
      this.advance();
      this.skipNL();
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
    return { type: 'Effect', name, kind, config };
  }

  private parseExpose(): ExposeNode {
    this.consume('KEYWORD', 'expose');
    const entity = this.consumeIdentifier().value;
    this.consume('KEYWORD', 'as');
    const protocol = this.advance().value as ExposeNode['protocol'];
    let name = entity.toLowerCase();
    let generateServer = false;
    if (this.check('KEYWORD', 'server')) {
      this.advance();
      generateServer = true;
    }
    if (this.check('STRING')) name = this.advance().value;
    const operations: string[] = [],
      middleware: string[] = [];
    if (this.check('PUNCTUATION', '{')) {
      this.advance();
      this.skipNL();
      while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
        this.skipNL();
        if (this.check('PUNCTUATION', '}')) break;
        const val = this.advance().value;
        if (val === 'middleware') {
          this.consume('OPERATOR', ':');
          middleware.push(this.consumeIdentifier().value);
        } else operations.push(val);
        if (this.check('PUNCTUATION', ',')) this.advance();
        this.skipNL();
      }
      this.consume('PUNCTUATION', '}');
    }
    return {
      type: 'Expose',
      name,
      protocol,
      entity,
      operations,
      generateServer,
      middleware: middleware.length ? middleware : undefined,
    };
  }

  private parseComposition(): CompositionNode {
    this.consume('KEYWORD', 'compose');
    const name = this.consumeIdentifier().value;
    this.consume('PUNCTUATION', '{');
    this.skipNL();
    const components: ComponentRefNode[] = [],
      connections: ConnectionNode[] = [];
    while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
      this.skipNL();
      if (this.check('PUNCTUATION', '}')) break;
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
    if (this.check('KEYWORD', 'as')) {
      this.advance();
      alias = this.consumeIdentifier().value;
    }
    return { type: 'ComponentRef', entity, alias };
  }

  private parseConnection(): ConnectionNode {
    this.consume('KEYWORD', 'connect');
    // Component names are references to declared components (use consumeIdentifier for declaration-like reference)
    // Port names after '.' are member-access-like (use consumeIdentifierOrKeyword to allow keywords)
    const fromComponent = this.consumeIdentifier().value;
    this.consume('OPERATOR', '.');
    const fromOutput = this.consumeIdentifierOrKeyword().value;
    this.consume('OPERATOR', '->');
    const toComponent = this.consumeIdentifier().value;
    this.consume('OPERATOR', '.');
    const toInput = this.consumeIdentifierOrKeyword().value;
    let transform: ExpressionNode | undefined;
    if (this.check('KEYWORD', 'with')) {
      this.advance();
      transform = this.parseExpr();
    }
    return {
      type: 'Connection',
      from: { component: fromComponent, output: fromOutput },
      to: { component: toComponent, input: toInput },
      transform,
    };
  }

  private parseExpr(): ExpressionNode {
    return this.parseTernary();
  }

  private parseTernary(): ExpressionNode {
    const expr = this.parseOr();
    if (this.check('OPERATOR', '?')) {
      this.advance();
      const cons = this.parseExpr();
      this.consume('OPERATOR', ':');
      const alt = this.parseExpr();
      return { type: 'Conditional', condition: expr, consequent: cons, alternate: alt };
    }
    return expr;
  }

  private parseOr(): ExpressionNode {
    let left = this.parseAnd();
    while (this.check('OPERATOR', '||') || this.check('KEYWORD', 'or')) {
      const op = this.advance().value;
      left = { type: 'BinaryOp', operator: op, left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): ExpressionNode {
    let left = this.parseEquality();
    while (this.check('OPERATOR', '&&') || this.check('KEYWORD', 'and')) {
      const op = this.advance().value;
      left = { type: 'BinaryOp', operator: op, left, right: this.parseEquality() };
    }
    return left;
  }

  private parseEquality(): ExpressionNode {
    let left = this.parseComparison();
    while (
      ['==', '!='].includes(this.current()?.value || '') ||
      ['is', 'in', 'contains'].includes(this.current()?.value || '')
    ) {
      const op = this.advance().value;
      left = { type: 'BinaryOp', operator: op, left, right: this.parseComparison() };
    }
    return left;
  }

  private parseComparison(): ExpressionNode {
    let left = this.parseAdditive();
    while (['<', '>', '<=', '>='].includes(this.current()?.value || '')) {
      const op = this.advance().value;
      left = { type: 'BinaryOp', operator: op, left, right: this.parseAdditive() };
    }
    return left;
  }

  private parseAdditive(): ExpressionNode {
    let left = this.parseMultiplicative();
    while (['+', '-'].includes(this.current()?.value || '')) {
      const op = this.advance().value;
      left = { type: 'BinaryOp', operator: op, left, right: this.parseMultiplicative() };
    }
    return left;
  }

  private parseMultiplicative(): ExpressionNode {
    let left = this.parseUnary();
    while (['*', '/', '%'].includes(this.current()?.value || '')) {
      const op = this.advance().value;
      left = { type: 'BinaryOp', operator: op, left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): ExpressionNode {
    if (['!', '-'].includes(this.current()?.value || '') || this.check('KEYWORD', 'not')) {
      const op = this.advance().value;
      return { type: 'UnaryOp', operator: op, operand: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): ExpressionNode {
    let expr = this.parsePrimary();
    while (true) {
      // Member access: allow both identifiers AND keywords as property names (e.g., obj.entity, obj.command)
      if (this.check('OPERATOR', '.') || this.check('OPERATOR', '?.')) {
        this.advance();
        expr = {
          type: 'MemberAccess',
          object: expr,
          property: this.consumeIdentifierOrKeyword().value,
        };
      } else if (this.check('PUNCTUATION', '(')) {
        this.advance();
        const args: ExpressionNode[] = [];
        while (!this.check('PUNCTUATION', ')') && !this.isEnd()) {
          args.push(this.parseExpr());
          if (this.check('PUNCTUATION', ',')) this.advance();
        }
        this.consume('PUNCTUATION', ')');
        expr = { type: 'Call', callee: expr, arguments: args };
      } else if (this.check('PUNCTUATION', '[')) {
        this.advance();
        const idx = this.parseExpr();
        this.consume('PUNCTUATION', ']');
        expr = {
          type: 'MemberAccess',
          object: expr,
          property: `[${'value' in idx ? idx.value : ''}]`,
        };
      } else break;
    }
    return expr;
  }

  private parsePrimary(): ExpressionNode {
    if (this.check('NUMBER'))
      return { type: 'Literal', value: parseFloat(this.advance().value), dataType: 'number' };
    if (this.check('STRING'))
      return { type: 'Literal', value: this.advance().value, dataType: 'string' };
    if (this.check('KEYWORD', 'true') || this.check('KEYWORD', 'false'))
      return { type: 'Literal', value: this.advance().value === 'true', dataType: 'boolean' };
    if (this.check('KEYWORD', 'null')) {
      this.advance();
      return { type: 'Literal', value: null, dataType: 'null' };
    }
    // Aggregate count expression — `count(Entity where field == value, ...)`.
    // `count` is a contextual keyword (NOT reserved): recognized only when it
    // starts the unambiguous aggregate shape `count ( <Entity> where`. Any other
    // `count(...)` parses as an ordinary function call below / in parsePostfix.
    if (this.isAggregateCountLookahead()) return this.parseAggregateCount();
    if (this.check('PUNCTUATION', '[')) {
      this.advance();
      const els: ExpressionNode[] = [];
      while (!this.check('PUNCTUATION', ']') && !this.isEnd()) {
        els.push(this.parseExpr());
        if (this.check('PUNCTUATION', ',')) this.advance();
      }
      this.consume('PUNCTUATION', ']');
      return { type: 'Array', elements: els };
    }
    // Object literal: allow both identifiers AND keywords as unquoted keys (e.g., { entity: 1, command: 2 })
    if (this.check('PUNCTUATION', '{')) {
      this.advance();
      this.skipNL();
      const props: { key: string; value: ExpressionNode }[] = [];
      while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
        this.skipNL();
        if (this.check('PUNCTUATION', '}')) break;
        const key = this.check('STRING')
          ? this.advance().value
          : this.consumeIdentifierOrKeyword().value;
        this.consume('OPERATOR', ':');
        props.push({ key, value: this.parseExpr() });
        if (this.check('PUNCTUATION', ',')) this.advance();
        this.skipNL();
      }
      this.consume('PUNCTUATION', '}');
      return { type: 'Object', properties: props };
    }
    // Lambda or parenthesized expression
    if (this.check('PUNCTUATION', '(')) {
      this.advance();
      const startPos = this.pos;
      const params: string[] = [];
      // Try to parse lambda parameters (identifiers only - reserved words not allowed as parameter declarations)
      while (this.check('IDENTIFIER') && !this.isEnd()) {
        params.push(this.advance().value);
        if (this.check('PUNCTUATION', ',')) this.advance();
        else break;
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
      const expr = this.parseExpr();
      this.consume('PUNCTUATION', ')');
      return expr;
    }
    if (
      this.check('IDENTIFIER') ||
      this.check('KEYWORD', 'user') ||
      this.check('KEYWORD', 'self') ||
      this.check('KEYWORD', 'context')
    )
      return { type: 'Identifier', name: this.advance().value };
    throw new Error(`Unexpected: ${this.current()?.value || 'EOF'}`);
  }

  /**
   * True when the upcoming tokens form the aggregate-count shape
   * `count ( <Entity> where ...` — the only form in which the otherwise-free
   * identifier `count` is treated as the aggregate operator.
   */
  private isAggregateCountLookahead(): boolean {
    if (!this.check('IDENTIFIER', 'count')) return false;
    const t1 = this.tokens[this.pos + 1];
    const t2 = this.tokens[this.pos + 2];
    const t3 = this.tokens[this.pos + 3];
    return (
      !!t1 &&
      t1.type === 'PUNCTUATION' &&
      t1.value === '(' &&
      !!t2 &&
      t2.type === 'IDENTIFIER' &&
      !!t3 &&
      t3.type === 'KEYWORD' &&
      t3.value === 'where'
    );
  }

  /**
   * Parses `count(Entity where field == value, field2 == value2, ...)`.
   * Every predicate is a pure equality (`==`); predicates are ANDed. At least
   * one predicate (the foreign-key match) is required — a zero-predicate count
   * would be an unbounded table scan, the analytics/reporting smell this
   * primitive deliberately avoids.
   */
  private parseAggregateCount(): ExpressionNode {
    const position = this.current()?.position;
    this.advance(); // consume 'count'
    this.consume('PUNCTUATION', '(');
    const entity = this.consumeIdentifier().value;
    this.consume('KEYWORD', 'where');
    const predicates: { field: string; value: ExpressionNode }[] = [];
    this.skipNL();
    while (!this.check('PUNCTUATION', ')') && !this.isEnd()) {
      this.skipNL();
      if (this.check('PUNCTUATION', ')')) break;
      const field = this.consumeIdentifier().value;
      this.consume('OPERATOR', '==');
      const value = this.parseExpr();
      predicates.push({ field, value });
      if (this.check('PUNCTUATION', ',')) this.advance();
      this.skipNL();
    }
    this.consume('PUNCTUATION', ')');
    if (predicates.length === 0) {
      this.errors.push({
        message: `count(${entity} where ...) requires at least one equality predicate (the foreign-key match)`,
        position,
        severity: 'error',
      });
    }
    return { type: 'AggregateCount', entity, predicates, position };
  }

  private check(type: string, value?: string) {
    const t = this.current();
    return t && t.type === type && (value === undefined || t.value === value);
  }
  /** Lookahead: true if the token `offset` positions ahead is a keyword with the given value. */
  private peekIsKeyword(offset: number, value: string) {
    const t = this.tokens[this.pos + offset];
    return !!t && t.type === 'KEYWORD' && t.value === value;
  }
  private consume(type: string, value?: string) {
    if (this.check(type, value)) return this.advance();
    throw new Error(`Expected ${value || type}, got ${this.current()?.value || 'EOF'}`);
  }

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
        severity: 'error',
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

  private parseRetryBlock(): RetryPolicyNode {
    this.advance(); // consume 'retry'
    this.consume('PUNCTUATION', '{');
    this.skipNL();

    let maxAttempts: number | undefined;
    let backoff: 'fixed' | 'exponential' | 'linear' | undefined;
    let delay: number | undefined;
    let delayMs: number | undefined;
    let jitter: boolean | number | undefined;
    const retryOn: string[] = [];

    while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
      this.skipNL();
      if (this.check('PUNCTUATION', '}')) break;

      const field = this.consumeIdentifier().value;
      this.consume('OPERATOR', ':');

      if (field === 'maxAttempts') {
        maxAttempts = Number(this.advance().value);
      } else if (field === 'backoff') {
        backoff = this.consumeIdentifierOrKeyword().value as 'fixed' | 'exponential' | 'linear';
      } else if (field === 'delay') {
        delay = Number(this.advance().value);
      } else if (field === 'delayMs') {
        delayMs = Number(this.advance().value);
      } else if (field === 'jitter') {
        if (this.check('KEYWORD', 'true') || this.check('KEYWORD', 'false')) {
          jitter = this.advance().value === 'true';
        } else {
          jitter = Number(this.advance().value);
        }
      } else if (field === 'retryOn') {
        retryOn.push(
          this.check('STRING') ? this.advance().value : this.consumeIdentifierOrKeyword().value,
        );
      }

      if (this.check('PUNCTUATION', ',')) {
        this.advance();
      }
      this.skipNL();
    }

    this.consume('PUNCTUATION', '}');
    this.skipNL();

    return {
      type: 'RetryPolicy',
      ...(maxAttempts !== undefined ? { maxAttempts } : {}),
      ...(backoff ? { backoff } : {}),
      ...(delay !== undefined ? { delay } : {}),
      ...(delayMs !== undefined ? { delayMs } : {}),
      ...(jitter !== undefined ? { jitter } : {}),
      ...(retryOn.length > 0 ? { retryOn } : {}),
    };
  }

  private parseSchedule(): ScheduleNode {
    this.advance(); // consume 'schedule'
    const name = this.consumeIdentifier().value;

    let scheduleType: 'cron' | 'interval' | 'every' = 'cron';
    let cronExpression: string | undefined;
    let value: number | undefined;
    let unit: string | undefined;

    // Parse schedule type: cron <expr> | interval <num> <unit> | every <num> <unit>
    let intervalDuration: string | undefined;
    if (this.check('IDENTIFIER', 'cron')) {
      this.advance(); // consume 'cron'
      scheduleType = 'cron';
      cronExpression = this.consume('STRING').value;
    } else if (this.check('IDENTIFIER', 'interval')) {
      this.advance(); // consume 'interval'
      scheduleType = 'interval';
      if (this.check('STRING')) {
        intervalDuration = this.advance().value;
      } else {
        value = Number(this.advance().value);
        unit = this.consumeIdentifierOrKeyword().value;
      }
    } else if (this.check('IDENTIFIER', 'every')) {
      this.advance(); // consume 'every'
      scheduleType = 'every';
      value = Number(this.advance().value);
      unit = this.consumeIdentifierOrKeyword().value;
    } else {
      throw new Error('Expected cron, interval, or every in schedule declaration');
    }

    this.skipNL();
    if (this.check('KEYWORD', 'run') || this.check('IDENTIFIER', 'run')) {
      this.advance();
    } else {
      throw new Error("Expected 'run' in schedule declaration");
    }
    this.skipNL();

    // Parse optional Entity.commandName
    let targetEntity: string | undefined;
    let targetCommand: string;
    const firstIdent = this.consumeIdentifier().value;
    if (this.check('OPERATOR', '.')) {
      this.advance(); // consume '.'
      targetEntity = firstIdent;
      targetCommand = this.consumeIdentifier().value;
    } else {
      targetCommand = firstIdent;
    }

    // Parse optional parameters: (paramName: value, ...)
    let parameters: Record<string, ExpressionNode> | undefined;
    if (this.check('PUNCTUATION', '(')) {
      this.advance(); // consume '('
      this.skipNL();
      parameters = {};
      while (!this.check('PUNCTUATION', ')') && !this.isEnd()) {
        this.skipNL();
        if (this.check('PUNCTUATION', ')')) break;
        const paramName = this.consumeIdentifier().value;
        this.consume('OPERATOR', ':');
        const paramValue = this.parseExpr();
        parameters[paramName] = paramValue;
        if (this.check('PUNCTUATION', ',')) {
          this.advance();
        }
        this.skipNL();
      }
      this.consume('PUNCTUATION', ')');
    }

    return {
      type: 'Schedule',
      name,
      scheduleType,
      ...(cronExpression ? { cronExpression } : {}),
      ...(intervalDuration ? { intervalDuration } : {}),
      ...(value !== undefined ? { value } : {}),
      ...(unit ? { unit } : {}),
      ...(targetEntity ? { targetEntity } : {}),
      targetCommand,
      ...(parameters ? { parameters } : {}),
    };
  }

  private parseRateLimitBlock(): RateLimitNode {
    this.advance(); // consume 'rateLimit'
    this.consume('PUNCTUATION', '{');
    this.skipNL();

    let maxRequests: number | undefined;
    let windowMs: number | undefined;
    let scope: 'user' | 'tenant' | 'global' | undefined;
    let burstAllowance: number | undefined;

    while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
      this.skipNL();
      if (this.check('PUNCTUATION', '}')) break;

      const field = this.consumeIdentifier().value;
      this.consume('OPERATOR', ':');

      if (field === 'maxRequests') {
        maxRequests = Number(this.advance().value);
      } else if (field === 'windowMs') {
        windowMs = Number(this.advance().value);
      } else if (field === 'scope') {
        scope = this.consumeIdentifierOrKeyword().value as 'user' | 'tenant' | 'global';
      } else if (field === 'burstAllowance') {
        burstAllowance = Number(this.advance().value);
      }

      if (this.check('PUNCTUATION', ',')) {
        this.advance();
      }
      this.skipNL();
    }

    this.consume('PUNCTUATION', '}');
    this.skipNL();

    return {
      type: 'RateLimit',
      ...(maxRequests !== undefined ? { maxRequests } : {}),
      ...(windowMs !== undefined ? { windowMs } : {}),
      ...(scope ? { scope } : {}),
      ...(burstAllowance !== undefined ? { burstAllowance } : {}),
    };
  }

  private advance() {
    if (!this.isEnd()) this.pos++;
    return this.tokens[this.pos - 1];
  }
  private current() {
    return this.tokens[this.pos];
  }
  private isEnd() {
    return this.pos >= this.tokens.length || this.tokens[this.pos]?.type === 'EOF';
  }
  private skipNL() {
    while (this.check('NEWLINE', '\n')) this.advance();
  }
  private sync() {
    this.advance();
    while (
      !this.isEnd() &&
      ![
        'entity',
        'enum',
        'flow',
        'effect',
        'expose',
        'compose',
        'module',
        'command',
        'policy',
        'store',
        'event',
        'tenant',
        'async',
        'saga',
        'role',
        'webhook',
      ].includes(this.current()?.value || '')
    )
      this.advance();
  }
}
