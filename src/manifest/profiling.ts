/**
 * Performance profiling instrumentation for Manifest runtime engine.
 *
 * Records timing data for each execution phase to enable performance analysis
 * and flame graph visualization in diagnostic tools.
 */

/**
 * Execution phases that can be profiled during command execution.
 * These correspond to the fixed execution order defined in the spec:
 * policies -> constraints -> guards -> approval gate -> actions -> emits -> return
 */
export type ExecutionPhase =
  | 'total'                    // End-to-end command execution
  | 'tenantContextGate'        // Tenant context validation
  | 'idempotencyCheck'         // Command deduplication check
  | 'asyncDispatch'            // Async command job enqueuing
  | 'policyEvaluation'         // Policy authorization checks
  | 'constraintValidation'     // Constraint evaluation with override support
  | 'guardEvaluation'          // Guard condition evaluation loop
  | 'approvalGate'            // Approval workflow check
  | 'autoCreate'               // Automatic instance creation for create commands
  | 'actionExecution'          // Action execution loop (persist/compute/publish/effect)
  | 'eventEmission'            // Event emission and notification
  | 'reactionCascading'        // Event-reaction recursive execution
  | 'computedEvaluation';     // Computed property evaluation (lazy)

/**
 * Detailed timing information for a single execution phase.
 */
export interface PhaseTiming {
  /** The phase being measured */
  phase: ExecutionPhase;
  /** Duration in milliseconds (high precision) */
  duration: number;
  /** Timestamp when the phase started (relative to command start) */
  startOffset: number;
  /** Timestamp when the phase ended (relative to command start) */
  endOffset: number;
  /** Nested timing data for sub-operations (e.g., individual guards, actions) */
  children?: PhaseTiming[];
  /** Optional metadata about the phase (e.g., expression evaluated, constraint name) */
  metadata?: PhaseMetadata;
}

/**
 * Optional metadata attached to phase timing for context.
 */
export interface PhaseMetadata {
  /** Name of the item being executed (e.g., guard index, action type) */
  name?: string;
  /** Expression or operation being performed */
  expression?: string;
  /** Count of items processed (e.g., number of policies evaluated) */
  count?: number;
  /** Index of the item in a loop (e.g., guard index) */
  index?: number;
  /** Entity name if applicable */
  entityName?: string;
  /** Command name if applicable */
  commandName?: string;
}

/**
 * Complete profile data for a single command execution.
 */
export interface CommandProfile {
  /** Entity name (if applicable) */
  entityName?: string;
  /** Command being executed */
  commandName: string;
  /** Instance ID (if applicable) */
  instanceId?: string;
  /** Total execution duration in milliseconds */
  totalDuration: number;
  /** Timestamp when execution started (Unix timestamp ms) */
  startTime: number;
  /** Timestamp when execution ended (Unix timestamp ms) */
  endTime: number;
  /** Whether the command succeeded */
  success: boolean;
  /** Per-phase timing data (ordered by execution) */
  phases: PhaseTiming[];
  /** Slowest individual expression evaluation (if available) */
  slowestExpression?: {
    phase: ExecutionPhase;
    expression: string;
    duration: number;
  };
  /** Number of entities in the entity graph (for complexity analysis) */
  entityGraphSize?: number;
  /** Number of instances loaded during execution */
  instancesLoaded?: number;
}

/**
 * Aggregated profile data across multiple command executions.
 * Used for CLI summary output.
 */
export interface ProfileSummary {
  /** Total commands profiled */
  totalCommands: number;
  /** Total execution time across all commands */
  totalDuration: number;
  /** Average command duration */
  averageDuration: number;
  /** Slowest command */
  slowestCommand: {
    commandName: string;
    entityName?: string;
    duration: number;
  };
  /** Fastest command */
  fastestCommand: {
    commandName: string;
    entityName?: string;
    duration: number;
  };
  /** Per-phase statistics */
  phaseStats: Map<ExecutionPhase, PhaseStats>;
  /** Commands sorted by duration (slowest first) */
  slowestCommands: Array<{
    commandName: string;
    entityName?: string;
    duration: number;
  }>;
}

/**
 * Statistics for a single execution phase across multiple runs.
 */
export interface PhaseStats {
  /** Total time spent in this phase */
  totalDuration: number;
  /** Average duration per command */
  averageDuration: number;
  /** Maximum duration */
  maxDuration: number;
  /** Percentage of total execution time */
  percentOfTotal: number;
  /** Number of times this phase was executed */
  executionCount: number;
}

/**
 * A collector that accumulates timing data during command execution.
 * Instances are created per-command and attached to the execution context.
 */
export class ProfileCollector {
  private phases: PhaseTiming[] = [];
  private startTime: number = 0;
  private commandStartTime: number = 0;
  private currentPhaseStart: Map<ExecutionPhase, number> = new Map();
  private slowestExpression: { phase: ExecutionPhase; expression: string; duration: number } | undefined;

  /** Start a new command profiling session */
  start(startTime: number): void {
    this.commandStartTime = startTime;
    this.startTime = performance.now();
    this.phases = [];
    this.currentPhaseStart.clear();
    this.slowestExpression = undefined;
  }

  /** Mark the start of a phase */
  startPhase(phase: ExecutionPhase): void {
    this.currentPhaseStart.set(phase, performance.now());
  }

  /** Mark the end of a phase and record its timing */
  endPhase(phase: ExecutionPhase, metadata?: PhaseMetadata, children?: PhaseTiming[]): void {
    const phaseStart = this.currentPhaseStart.get(phase);
    if (phaseStart === undefined) {
      console.warn(`ProfileCollector: endPhase called without startPhase for ${phase}`);
      return;
    }

    const now = performance.now();
    const duration = now - phaseStart;
    const startOffset = phaseStart - this.startTime;
    const endOffset = now - this.startTime;

    this.phases.push({
      phase,
      duration,
      startOffset,
      endOffset,
      children,
      metadata,
    });

    // Track slowest expression if metadata includes expression info
    if (metadata?.expression && duration > 0) {
      if (!this.slowestExpression || duration > this.slowestExpression.duration) {
        this.slowestExpression = {
          phase,
          expression: metadata.expression,
          duration,
        };
      }
    }

    this.currentPhaseStart.delete(phase);
  }

  /** Complete profiling and return the final profile data */
  complete(
    commandName: string,
    entityName: string | undefined,
    instanceId: string | undefined,
    success: boolean,
    entityGraphSize?: number,
    instancesLoaded?: number,
  ): CommandProfile {
    const endTime = performance.now();
    const totalDuration = endTime - this.startTime;

    return {
      entityName,
      commandName,
      instanceId,
      totalDuration,
      startTime: this.commandStartTime,
      endTime: this.commandStartTime + totalDuration,
      success,
      phases: [...this.phases],
      slowestExpression: this.slowestExpression,
      entityGraphSize,
      instancesLoaded,
    };
  }

  /** Get current phase timing data (for intermediate reporting) */
  getPhases(): ReadonlyArray<PhaseTiming> {
    return this.phases;
  }

  /** Get the current elapsed time since profiling started */
  getElapsed(): number {
    return performance.now() - this.startTime;
  }
}

/**
 * Runtime options for enabling/disabling profiling.
 */
export interface ProfilingOptions {
  /** If true, collect detailed timing data for each command execution */
  enabled?: boolean;
  /** Optional callback to receive profile data after each command */
  onProfileComplete?: (profile: CommandProfile) => void;
  /** If true, include detailed per-operation timing (e.g., each guard, each action) */
  detailed?: boolean;
}

/**
 * Aggregate multiple command profiles into a summary.
 */
export function summarizeProfiles(profiles: CommandProfile[]): ProfileSummary {
  if (profiles.length === 0) {
    return {
      totalCommands: 0,
      totalDuration: 0,
      averageDuration: 0,
      slowestCommand: { commandName: 'N/A', duration: 0 },
      fastestCommand: { commandName: 'N/A', duration: 0 },
      phaseStats: new Map(),
      slowestCommands: [],
    };
  }

  const totalDuration = profiles.reduce((sum, p) => sum + p.totalDuration, 0);
  const averageDuration = totalDuration / profiles.length;

  // Find slowest and fastest
  let slowest = profiles[0];
  let fastest = profiles[0];
  for (const profile of profiles) {
    if (profile.totalDuration > slowest.totalDuration) slowest = profile;
    if (profile.totalDuration < fastest.totalDuration) fastest = profile;
  }

  // Aggregate per-phase stats
  const phaseStats = new Map<ExecutionPhase, PhaseStats>();
  const phaseTotals = new Map<ExecutionPhase, { total: number; count: number }>();

  for (const profile of profiles) {
    for (const phase of profile.phases) {
      const existing = phaseTotals.get(phase.phase) || { total: 0, count: 0 };
      existing.total += phase.duration;
      existing.count += 1;
      phaseTotals.set(phase.phase, existing);
    }
  }

  for (const [phase, data] of phaseTotals.entries()) {
    phaseStats.set(phase, {
      totalDuration: data.total,
      averageDuration: data.total / data.count,
      maxDuration: Math.max(...profiles.flatMap(p =>
        p.phases.filter(ph => ph.phase === phase).map(ph => ph.duration)
      )),
      percentOfTotal: (data.total / totalDuration) * 100,
      executionCount: data.count,
    });
  }

  // Sort commands by duration (slowest first)
  const slowestCommands = [...profiles]
    .sort((a, b) => b.totalDuration - a.totalDuration)
    .slice(0, 10)
    .map(p => ({
      commandName: p.commandName,
      entityName: p.entityName,
      duration: p.totalDuration,
    }));

  return {
    totalCommands: profiles.length,
    totalDuration,
    averageDuration,
    slowestCommand: {
      commandName: slowest.commandName,
      entityName: slowest.entityName,
      duration: slowest.totalDuration,
    },
    fastestCommand: {
      commandName: fastest.commandName,
      entityName: fastest.entityName,
      duration: fastest.totalDuration,
    },
    phaseStats,
    slowestCommands,
  };
}

/**
 * Convert profile data to a flame graph format suitable for visualization.
 * Returns a hierarchical structure with phases and children.
 */
export function toFlameGraph(profile: CommandProfile): FlameGraphNode {
  const root: FlameGraphNode = {
    name: profile.entityName
      ? `${profile.entityName}.${profile.commandName}`
      : profile.commandName,
    value: profile.totalDuration,
    phase: 'total',
    children: profile.phases.map(phase => ({
      name: phase.phase,
      value: phase.duration,
      phase: phase.phase,
      children: phase.children?.map(child => ({
        name: child.metadata?.name || child.phase,
        value: child.duration,
        phase: child.phase,
        metadata: child.metadata,
      })) || [],
      metadata: phase.metadata,
    })),
  };

  return root;
}

/**
 * Flame graph node structure for visualization.
 */
export interface FlameGraphNode {
  /** Display name for the node */
  name: string;
  /** Duration in milliseconds */
  value: number;
  /** Execution phase */
  phase: ExecutionPhase;
  /** Child nodes (sub-operations) */
  children?: FlameGraphNode[];
  /** Optional metadata */
  metadata?: PhaseMetadata;
}
