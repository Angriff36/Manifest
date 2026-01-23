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

export interface EntityNode extends ASTNode {
  type: 'Entity';
  name: string;
  properties: PropertyNode[];
  behaviors: BehaviorNode[];
  constraints: ConstraintNode[];
}

export interface PropertyNode extends ASTNode {
  type: 'Property';
  name: string;
  dataType: TypeNode;
  defaultValue?: ExpressionNode;
  modifiers: string[];
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
  kind: 'mutate' | 'emit' | 'compute' | 'effect';
  target?: string;
  expression: ExpressionNode;
}

export interface ConstraintNode extends ASTNode {
  type: 'Constraint';
  name: string;
  expression: ExpressionNode;
  message?: string;
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
  from: { component: string; output: string };
  to: { component: string; input: string };
  transform?: ExpressionNode;
}

export type ExpressionNode =
  | LiteralNode
  | IdentifierNode
  | BinaryOpNode
  | UnaryOpNode
  | CallNode
  | MemberAccessNode
  | ConditionalNode
  | ArrayNode
  | ObjectNode
  | LambdaNode;

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
  properties: { key: string; value: ExpressionNode }[];
}

export interface LambdaNode extends ASTNode {
  type: 'Lambda';
  parameters: string[];
  body: ExpressionNode;
}

export interface ManifestProgram {
  entities: EntityNode[];
  flows: FlowNode[];
  effects: EffectNode[];
  exposures: ExposeNode[];
  compositions: CompositionNode[];
}

export interface CompilationResult {
  success: boolean;
  code?: string;
  errors?: CompilationError[];
  ast?: ManifestProgram;
}

export interface CompilationError {
  message: string;
  position?: Position;
  severity: 'error' | 'warning';
}
