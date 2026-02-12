import type {
  ManifestAdapter,
  RuntimeEngine,
  IR,
  CompileResult,
  CommandResult,
  EmittedEvent,
  GuardFailure,
  RuntimeContext,
} from '../types/index.js';

interface StubGuardCheck {
  path: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
  value: unknown;
}

interface StubGuard {
  expression: string;
  check: StubGuardCheck;
}

interface StubCommand {
  guards: StubGuard[];
  transitions: Record<string, unknown>;
  events: string[];
}

interface StubEntity {
  properties: Record<string, { type: string }>;
  commands: Record<string, StubCommand>;
}

interface StubIR {
  version: string;
  entities: Record<string, StubEntity>;
}

function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === 'object' && current !== null) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function evaluateOperator(actual: unknown, operator: string, expected: unknown): boolean {
  switch (operator) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'gt':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'gte':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'lt':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'lte':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    default:
      return false;
  }
}

class StubRuntimeEngine implements RuntimeEngine {
  private entities: Map<string, Map<string, Record<string, unknown>>>;
  private ir: StubIR;

  constructor(ir: IR) {
    this.ir = ir as unknown as StubIR;
    this.entities = new Map();
  }

  seedEntity(entity: string, id: string, properties: Record<string, unknown>): void {
    if (!this.entities.has(entity)) {
      this.entities.set(entity, new Map());
    }
    const entityMap = this.entities.get(entity);
    if (entityMap) {
      entityMap.set(id, { id, ...structuredClone(properties) });
    }
  }

  executeCommand(
    entity: string,
    id: string,
    command: string,
    _params: Record<string, unknown>,
    _context: RuntimeContext
  ): CommandResult {
    const entityDef = this.ir.entities[entity];
    if (!entityDef) {
      return {
        success: false,
        entityStateAfter: null,
        emittedEvents: [],
        guardFailures: null,
        constraintWarnings: [],
        error: { type: 'constraint', message: `Entity "${entity}" not found in IR` },
      };
    }

    const commandDef = entityDef.commands[command];
    if (!commandDef) {
      return {
        success: false,
        entityStateAfter: null,
        emittedEvents: [],
        guardFailures: null,
        constraintWarnings: [],
        error: { type: 'constraint', message: `Command "${command}" not found on entity "${entity}"` },
      };
    }

    const entityMap = this.entities.get(entity);
    const state = entityMap?.get(id);
    if (!state) {
      return {
        success: false,
        entityStateAfter: null,
        emittedEvents: [],
        guardFailures: null,
        constraintWarnings: [],
        error: { type: 'constraint', message: `Entity instance "${entity}:${id}" not found` },
      };
    }

    const guardFailures: GuardFailure[] = [];
    for (let i = 0; i < commandDef.guards.length; i++) {
      const guard = commandDef.guards[i];
      if (!guard) continue;

      const actualValue = resolvePath(state, guard.check.path);
      const passed = evaluateOperator(actualValue, guard.check.operator, guard.check.value);

      if (!passed) {
        guardFailures.push({
          guardIndex: i,
          expression: guard.expression,
          resolvedValues: { [`self.${guard.check.path}`]: actualValue },
          evaluatedTo: false,
        });
      }
    }

    if (guardFailures.length > 0) {
      return {
        success: false,
        entityStateAfter: structuredClone(state),
        emittedEvents: [],
        guardFailures,
        constraintWarnings: [],
        error: {
          type: 'guard',
          message: guardFailures.map((f) => f.expression).join('; '),
          guardIndex: guardFailures[0]?.guardIndex,
        },
      };
    }

    for (const [prop, value] of Object.entries(commandDef.transitions)) {
      state[prop] = value;
    }

    const emittedEvents: EmittedEvent[] = commandDef.events.map((name) => ({
      name,
      data: {},
    }));

    return {
      success: true,
      entityStateAfter: structuredClone(state),
      emittedEvents,
      guardFailures: null,
      constraintWarnings: [],
    };
  }

  getEntityState(entity: string, id: string): Record<string, unknown> | null {
    const entityMap = this.entities.get(entity);
    const state = entityMap?.get(id);
    return state ? structuredClone(state) : null;
  }
}

export const adapter: ManifestAdapter = {
  async compile(source: string): Promise<CompileResult> {
    try {
      const parsed = JSON.parse(source) as IR;
      return { ir: parsed, diagnostics: [] };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown parse error';
      return {
        ir: null,
        diagnostics: [{ severity: 'error', message: `Failed to parse manifest source: ${message}` }],
      };
    }
  },

  createRuntime(ir: IR): RuntimeEngine {
    return new StubRuntimeEngine(ir);
  },
};

export type { ManifestAdapter, RuntimeEngine, IR, CompileResult };
