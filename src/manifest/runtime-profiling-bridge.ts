import type { ExecutionPhase, CommandProfile, PhaseMetadata, ProfilingOptions } from './profiling.js';
import { ProfileCollector } from './profiling.js';

/**
 * Per-command profiling session attached to RuntimeEngine when profiling is enabled.
 */
export class RuntimeProfilingBridge {
  private collector: ProfileCollector | null = null;
  private readonly profiles: CommandProfile[] = [];
  private currentCommand?: string;
  private currentEntity?: string;
  private currentInstanceId?: string;

  constructor(private readonly options: ProfilingOptions | undefined) {}

  isEnabled(): boolean {
    return this.options?.enabled === true;
  }

  beginCommand(
    commandName: string,
    entityName: string | undefined,
    instanceId: string | undefined,
    startTime: number,
  ): void {
    if (!this.isEnabled()) return;
    this.collector = new ProfileCollector();
    this.collector.start(startTime);
    this.currentCommand = commandName;
    this.currentEntity = entityName;
    this.currentInstanceId = instanceId;
  }

  startPhase(phase: ExecutionPhase, metadata?: PhaseMetadata): void {
    if (!this.collector) return;
    this.collector.startPhase(phase);
    if (metadata && this.options?.detailed) {
      // metadata is applied on endPhase in ProfileCollector — stash for end
      this.pendingMetadata = metadata;
    }
  }

  private pendingMetadata?: PhaseMetadata;

  endPhase(phase: ExecutionPhase): void {
    if (!this.collector) return;
    this.collector.endPhase(phase, this.pendingMetadata);
    this.pendingMetadata = undefined;
  }

  async trackPhase<T>(phase: ExecutionPhase, fn: () => Promise<T>, metadata?: PhaseMetadata): Promise<T> {
    if (!this.collector) return fn();
    this.startPhase(phase, metadata);
    try {
      return await fn();
    } finally {
      this.endPhase(phase);
    }
  }

  complete(success: boolean, entityGraphSize?: number, instancesLoaded?: number): void {
    if (!this.collector || !this.currentCommand) return;
    const profile = this.collector.complete(
      this.currentCommand,
      this.currentEntity,
      this.currentInstanceId,
      success,
      entityGraphSize,
      instancesLoaded,
    );
    this.profiles.push(profile);
    this.options?.onProfileComplete?.(profile);
    this.collector = null;
    this.currentCommand = undefined;
    this.currentEntity = undefined;
    this.currentInstanceId = undefined;
  }

  getProfiles(): readonly CommandProfile[] {
    return this.profiles;
  }
}
