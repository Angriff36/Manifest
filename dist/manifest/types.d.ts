export interface Position {
    line: number;
    column: number;
}
export interface Token {
    type: 'KEYWORD' | 'IDENTIFIER' | 'STRING' | 'NUMBER' | 'OPERATOR' | 'PUNCTUATION' | 'NEWLINE' | 'EOF';
    value: string;
    position: Position;
}
export interface ASTNode {
    type: string;
    position?: Position;
}
export interface ModuleNode extends ASTNode {
    type: 'Module';
    name: string;
    entities: EntityNode[];
    commands: CommandNode[];
    policies: PolicyNode[];
    stores: StoreNode[];
    events: OutboxEventNode[];
}
export interface TransitionNode extends ASTNode {
    type: 'Transition';
    property: string;
    from: string;
    to: string[];
}
export interface EntityNode extends ASTNode {
    type: 'Entity';
    name: string;
    properties: PropertyNode[];
    computedProperties: ComputedPropertyNode[];
    relationships: RelationshipNode[];
    behaviors: BehaviorNode[];
    commands: CommandNode[];
    constraints: ConstraintNode[];
    policies: PolicyNode[];
    transitions: TransitionNode[];
    store?: string;
    /** Optimistic concurrency: property name for version number */
    versionProperty?: string;
    /** Optimistic concurrency: property name for version timestamp */
    versionAtProperty?: string;
}
export interface PropertyNode extends ASTNode {
    type: 'Property';
    name: string;
    dataType: TypeNode;
    defaultValue?: ExpressionNode;
    modifiers: string[];
}
export interface ComputedPropertyNode extends ASTNode {
    type: 'ComputedProperty';
    name: string;
    dataType: TypeNode;
    expression: ExpressionNode;
    dependencies: string[];
}
export interface RelationshipNode extends ASTNode {
    type: 'Relationship';
    kind: 'hasMany' | 'hasOne' | 'belongsTo' | 'ref';
    name: string;
    target: string;
    foreignKey?: string;
    through?: string;
}
export interface CommandNode extends ASTNode {
    type: 'Command';
    name: string;
    parameters: ParameterNode[];
    guards?: ExpressionNode[];
    /** Command-level constraints (pre-execution validation) */
    constraints?: ConstraintNode[];
    actions: ActionNode[];
    emits?: string[];
    returns?: TypeNode;
}
export interface ParameterNode extends ASTNode {
    type: 'Parameter';
    name: string;
    dataType: TypeNode;
    required: boolean;
    defaultValue?: ExpressionNode;
}
export interface PolicyNode extends ASTNode {
    type: 'Policy';
    name: string;
    action: 'read' | 'write' | 'delete' | 'execute' | 'all' | 'override';
    expression: ExpressionNode;
    message?: string;
    isDefault?: boolean;
}
export interface StoreNode extends ASTNode {
    type: 'Store';
    entity: string;
    target: 'memory' | 'postgres' | 'supabase' | 'localStorage';
    config?: Record<string, ExpressionNode>;
}
export interface OutboxEventNode extends ASTNode {
    type: 'OutboxEvent';
    name: string;
    channel: string;
    payload: TypeNode | {
        fields: ParameterNode[];
    };
}
export interface TypeNode extends ASTNode {
    type: 'Type';
    name: string;
    generic?: TypeNode;
    nullable: boolean;
}
export interface BehaviorNode extends ASTNode {
    type: 'Behavior';
    name: string;
    trigger: TriggerNode;
    actions: ActionNode[];
    guards?: ExpressionNode[];
}
export interface TriggerNode extends ASTNode {
    type: 'Trigger';
    event: string;
    parameters?: string[];
}
export interface ActionNode extends ASTNode {
    type: 'Action';
    kind: 'mutate' | 'emit' | 'compute' | 'effect' | 'publish' | 'persist';
    target?: string;
    expression: ExpressionNode;
}
export interface ConstraintNode extends ASTNode {
    type: 'Constraint';
    name: string;
    /** Stable identifier for overrides/auditing (defaults to name) */
    code?: string;
    expression: ExpressionNode;
    /** Constraint severity level (default: block) */
    severity?: 'ok' | 'warn' | 'block';
    message?: string;
    /** Template for error messages with interpolation */
    messageTemplate?: string;
    /** Structured details for UI (key-value pairs with expressions) */
    detailsMapping?: Record<string, ExpressionNode>;
    /** Can this constraint be overridden? */
    overrideable?: boolean;
    /** Policy that authorizes overrides */
    overridePolicyRef?: string;
}
export interface FlowNode extends ASTNode {
    type: 'Flow';
    name: string;
    input: TypeNode;
    output: TypeNode;
    steps: FlowStepNode[];
}
export interface FlowStepNode extends ASTNode {
    type: 'FlowStep';
    operation: string;
    expression: ExpressionNode;
    condition?: ExpressionNode;
}
export interface EffectNode extends ASTNode {
    type: 'Effect';
    name: string;
    kind: 'http' | 'storage' | 'timer' | 'event' | 'custom';
    config: Record<string, ExpressionNode>;
}
export interface ExposeNode extends ASTNode {
    type: 'Expose';
    name: string;
    protocol: 'rest' | 'graphql' | 'websocket' | 'function';
    entity: string;
    operations: string[];
    generateServer: boolean;
    middleware?: string[];
}
export interface CompositionNode extends ASTNode {
    type: 'Composition';
    name: string;
    components: ComponentRefNode[];
    connections: ConnectionNode[];
}
export interface ComponentRefNode extends ASTNode {
    type: 'ComponentRef';
    entity: string;
    alias?: string;
    config?: Record<string, ExpressionNode>;
}
export interface ConnectionNode extends ASTNode {
    type: 'Connection';
    from: {
        component: string;
        output: string;
    };
    to: {
        component: string;
        input: string;
    };
    transform?: ExpressionNode;
}
export type ExpressionNode = LiteralNode | IdentifierNode | BinaryOpNode | UnaryOpNode | CallNode | MemberAccessNode | ConditionalNode | ArrayNode | ObjectNode | LambdaNode;
export interface LiteralNode extends ASTNode {
    type: 'Literal';
    value: string | number | boolean | null;
    dataType: 'string' | 'number' | 'boolean' | 'null';
}
export interface IdentifierNode extends ASTNode {
    type: 'Identifier';
    name: string;
}
export interface BinaryOpNode extends ASTNode {
    type: 'BinaryOp';
    operator: string;
    left: ExpressionNode;
    right: ExpressionNode;
}
export interface UnaryOpNode extends ASTNode {
    type: 'UnaryOp';
    operator: string;
    operand: ExpressionNode;
}
export interface CallNode extends ASTNode {
    type: 'Call';
    callee: ExpressionNode;
    arguments: ExpressionNode[];
}
export interface MemberAccessNode extends ASTNode {
    type: 'MemberAccess';
    object: ExpressionNode;
    property: string;
}
export interface ConditionalNode extends ASTNode {
    type: 'Conditional';
    condition: ExpressionNode;
    consequent: ExpressionNode;
    alternate: ExpressionNode;
}
export interface ArrayNode extends ASTNode {
    type: 'Array';
    elements: ExpressionNode[];
}
export interface ObjectNode extends ASTNode {
    type: 'Object';
    properties: {
        key: string;
        value: ExpressionNode;
    }[];
}
export interface LambdaNode extends ASTNode {
    type: 'Lambda';
    parameters: string[];
    body: ExpressionNode;
}
export interface ManifestProgram {
    modules: ModuleNode[];
    entities: EntityNode[];
    commands: CommandNode[];
    flows: FlowNode[];
    effects: EffectNode[];
    exposures: ExposeNode[];
    compositions: CompositionNode[];
    policies: PolicyNode[];
    stores: StoreNode[];
    events: OutboxEventNode[];
}
export interface CompilationResult {
    success: boolean;
    code?: string;
    serverCode?: string;
    testCode?: string;
    errors?: CompilationError[];
    ast?: ManifestProgram;
}
export interface CompilationError {
    message: string;
    position?: Position;
    severity: 'error' | 'warning';
}
//# sourceMappingURL=types.d.ts.map