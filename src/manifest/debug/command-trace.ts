import type { RuntimeEngine, EntityInstance } from '../runtime-engine.js';

export interface SerializedRuntimeSnapshot {
  ir: unknown;
  stores: Record<string, EntityInstance[]>;
  context?: Record<string, unknown>;
}

export interface CommandTraceStep {
  index: number;
  label: string;
  snapshot: SerializedRuntimeSnapshot;
}

/**
 * Records store snapshots around command execution for step replay via
 * RuntimeEngine.restore(). v1 captures before/after the full command; optional
 * per-action steps when actionTraceHook is wired on RuntimeOptions.
 */
export class CommandTraceRecorder {
  private steps: CommandTraceStep[] = [];
  private actionIndex = 0;

  constructor(private readonly engine: RuntimeEngine) {}

  async runCommand(
    commandName: string,
    input: Record<string, unknown>,
    options: {
      entityName?: string;
      instanceId?: string;
    } = {},
  ) {
    this.steps = [];
    this.actionIndex = 0;
    this.steps.push({
      index: 0,
      label: 'before',
      snapshot: (await this.engine.serialize()) as SerializedRuntimeSnapshot,
    });

    const result = await this.engine.runCommand(commandName, input, options);

    this.steps.push({
      index: this.steps.length,
      label: 'after',
      snapshot: (await this.engine.serialize()) as SerializedRuntimeSnapshot,
    });

    return result;
  }

  getSteps(): readonly CommandTraceStep[] {
    return this.steps;
  }

  async restoreToStep(stepIndex: number): Promise<void> {
    const step = this.steps[stepIndex];
    if (!step) {
      throw new Error(`CommandTraceRecorder: no step at index ${stepIndex}`);
    }
    await this.engine.restore(step.snapshot);
  }

  /** Register on RuntimeOptions.actionTraceHook to capture per-action snapshots. */
  createActionHook(): (info: {
    index: number;
    kind: string;
    target?: string;
    entityName?: string;
    instanceId?: string;
  }) => Promise<void> {
    return async (info) => {
      this.actionIndex += 1;
      this.steps.push({
        index: this.steps.length,
        label: `action:${info.index}:${info.kind}${info.target ? `:${info.target}` : ''}`,
        snapshot: (await this.engine.serialize()) as SerializedRuntimeSnapshot,
      });
    };
  }
}
