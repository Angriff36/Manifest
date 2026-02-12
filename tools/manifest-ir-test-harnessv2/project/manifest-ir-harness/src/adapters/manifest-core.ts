export interface IRProperty {
  name: string;
  type: string;
  default?: unknown;
}

export interface IRCommandParam {
  name: string;
  type: string;
}

export interface IRGuard {
  expression: string;
}

export interface IRMutation {
  property: string;
  value: unknown;
  expression?: string;
}

export interface IREvent {
  name: string;
}

export interface IRCommand {
  name: string;
  params?: IRCommandParam[];
  guards?: IRGuard[];
  mutations?: IRMutation[];
  events?: IREvent[];
}

export interface IREntity {
  name: string;
  properties: IRProperty[];
  commands?: IRCommand[];
  [key: string]: unknown;
}

export interface IR {
  entities: IREntity[];
  [key: string]: unknown;
}

export interface CommandResult {
  success: boolean;
  instance?: Record<string, unknown>;
  emittedEvents?: Array<{ name: string; data: unknown }>;
  error?: {
    type: string;
    message: string;
    guardIndex?: number;
    expression?: string;
    resolvedValues?: Record<string, unknown>;
  };
}

export interface RuntimeEngine {
  executeCommand(
    entityName: string,
    instanceId: string,
    commandName: string,
    params: Record<string, unknown>,
    context?: Record<string, unknown>
  ): Promise<CommandResult>;

  createInstance(
    entityName: string,
    id: string,
    properties: Record<string, unknown>
  ): Record<string, unknown>;
}

export interface ManifestAdapter {
  compile(source: string): Promise<{ ir: IR | null; diagnostics: unknown[] }>;
  createRuntime(ir: IR): RuntimeEngine;
}

export const adapter: ManifestAdapter = {
  async compile(_source: string) {
    throw new Error('Adapter not implemented - wire to Manifest compiler');
  },

  createRuntime(_ir: IR): RuntimeEngine {
    throw new Error('Adapter not implemented - wire to Manifest runtime');
  },
};
