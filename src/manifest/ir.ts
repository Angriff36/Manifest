export interface IRProvenance {
  /** Content hash of the source manifest (SHA-256) */
  contentHash: string;
  /** Compiler version that generated this IR */
  compilerVersion: string;
  /** IR schema version */
  schemaVersion: string;
  /** ISO timestamp of compilation */
  compiledAt: string;
}

export interface IR {
  version: '1.0';
  /** Provenance metadata for traceability */
  provenance: IRProvenance;
  modules: IRModule[];
  entities: IREntity[];
  stores: IRStore[];
  events: IREvent[];
  commands: IRCommand[];
  policies: IRPolicy[];
}

export interface IRModule {
  name: string;
  entities: string[];
  commands: string[];
  stores: string[];
  events: string[];
  policies: string[];
}

export interface IREntity {
  name: string;
  module?: string;
  properties: IRProperty[];
  computedProperties: IRComputedProperty[];
  relationships: IRRelationship[];
  commands: string[];
  constraints: IRConstraint[];
  policies: string[];
}

export interface IRProperty {
  name: string;
  type: IRType;
  defaultValue?: IRValue;
  modifiers: PropertyModifier[];
}

export type PropertyModifier = 'required' | 'unique' | 'indexed' | 'private' | 'readonly' | 'optional';

export interface IRComputedProperty {
  name: string;
  type: IRType;
  expression: IRExpression;
  dependencies: string[];
}

export interface IRRelationship {
  name: string;
  kind: 'hasMany' | 'hasOne' | 'belongsTo' | 'ref';
  target: string;
  foreignKey?: string;
  through?: string;
}

export interface IRConstraint {
  name: string;
  expression: IRExpression;
  message?: string;
}

export interface IRStore {
  entity: string;
  target: 'memory' | 'localStorage' | 'postgres' | 'supabase';
  config: Record<string, IRValue>;
}

export interface IREvent {
  name: string;
  channel: string;
  payload: IRType | IREventField[];
}

export interface IREventField {
  name: string;
  type: IRType;
  required: boolean;
}

export interface IRCommand {
  name: string;
  module?: string;
  entity?: string;
  parameters: IRParameter[];
  guards: IRExpression[];
  actions: IRAction[];
  emits: string[];
  returns?: IRType;
}

export interface IRParameter {
  name: string;
  type: IRType;
  required: boolean;
  defaultValue?: IRValue;
}

export interface IRAction {
  kind: 'mutate' | 'emit' | 'compute' | 'effect' | 'publish' | 'persist';
  target?: string;
  expression: IRExpression;
}

export interface IRPolicy {
  name: string;
  module?: string;
  entity?: string;
  action: 'read' | 'write' | 'delete' | 'execute' | 'all';
  expression: IRExpression;
  message?: string;
}

export interface IRType {
  name: string;
  generic?: IRType;
  nullable: boolean;
}

export type IRValue =
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'null' }
  | { kind: 'array'; elements: IRValue[] }
  | { kind: 'object'; properties: Record<string, IRValue> };

export type IRExpression =
  | { kind: 'literal'; value: IRValue }
  | { kind: 'identifier'; name: string }
  | { kind: 'member'; object: IRExpression; property: string }
  | { kind: 'binary'; operator: string; left: IRExpression; right: IRExpression }
  | { kind: 'unary'; operator: string; operand: IRExpression }
  | { kind: 'call'; callee: IRExpression; args: IRExpression[] }
  | { kind: 'conditional'; condition: IRExpression; consequent: IRExpression; alternate: IRExpression }
  | { kind: 'array'; elements: IRExpression[] }
  | { kind: 'object'; properties: { key: string; value: IRExpression }[] }
  | { kind: 'lambda'; params: string[]; body: IRExpression };

export interface IRDiagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  line?: number;
  column?: number;
}

export interface CompileToIRResult {
  ir: IR | null;
  diagnostics: IRDiagnostic[];
}
