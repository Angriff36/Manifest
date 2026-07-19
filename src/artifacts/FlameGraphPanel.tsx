import { useState, useEffect } from 'react';
import { compileToIR } from '../manifest/ir-compiler';
import { RuntimeEngine } from '../manifest/runtime-engine';
import type { CommandProfile, PhaseTiming } from '../manifest/profiling';
import { buildProfilerCommandOptions, type ProfilerCommandOption } from './profiler-options';
import { Flame, Zap, TrendingUp, ChevronDown, ChevronRight, Activity, Layers } from 'lucide-react';

interface FlameGraphPanelProps {
  source: string;
  disabled: boolean;
}

function resolveSelectedCommandLabel(current: string, options: ProfilerCommandOption[]): string {
  if (current && options.some((option) => option.label === current)) {
    return current;
  }
  return options[0]?.label || '';
}

interface FlameBarProps {
  phase: PhaseTiming;
  x: number;
  width: number;
  totalDuration: number;
  isSlowest: boolean;
}

function FlameBar({ phase, x, width, totalDuration, isSlowest }: FlameBarProps) {
  const percentage = (phase.duration / totalDuration) * 100;

  // Color coding by phase type and slowness
  let barColor = 'bg-blue-500';
  if (isSlowest) {
    barColor = 'bg-orange-500';
  } else if (percentage > 30) {
    barColor = 'bg-yellow-500';
  } else if (percentage > 10) {
    barColor = 'bg-emerald-500';
  }

  return (
    <div
      className={`h-8 rounded-sm flex items-center px-2 text-xs text-white font-medium transition-all hover:opacity-90 ${barColor}`}
      style={{
        position: 'absolute',
        left: `${x}%`,
        width: `${width}%`,
      }}
      title={`${phase.phase}: ${phase.duration.toFixed(2)}ms`}
    >
      <span className="truncate">{phase.phase}</span>
      <span className="ml-auto text-xs opacity-80">{phase.duration.toFixed(1)}ms</span>
    </div>
  );
}

function PhaseDetail({ phase, totalDuration }: { phase: PhaseTiming; totalDuration: number }) {
  const [expanded, setExpanded] = useState(false);

  const percentage = (phase.duration / totalDuration) * 100;

  return (
    <div className="border-l-2 border-gray-700 pl-3 py-2">
      <div
        className="flex items-center justify-between cursor-pointer hover:bg-gray-800/50 rounded px-2 py-1"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown size={14} className="text-gray-500" />
          ) : (
            <ChevronRight size={14} className="text-gray-500" />
          )}
          <span className="font-medium text-gray-300">{phase.phase}</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-400">{phase.duration.toFixed(2)}ms</span>
          <span className="text-gray-500">{percentage.toFixed(1)}%</span>
        </div>
      </div>

      {expanded && (
        <div className="mt-2 space-y-2">
          {phase.metadata && (
            <div className="bg-gray-900/50 rounded p-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                {phase.metadata.name && (
                  <div>
                    <span className="text-gray-500">Name:</span>
                    <span className="text-gray-300 ml-2">{phase.metadata.name}</span>
                  </div>
                )}
                {phase.metadata.expression && (
                  <div className="col-span-2">
                    <span className="text-gray-500">Expression:</span>
                    <span className="text-gray-300 ml-2 font-mono">
                      {phase.metadata.expression}
                    </span>
                  </div>
                )}
                {phase.metadata.count !== undefined && (
                  <div>
                    <span className="text-gray-500">Count:</span>
                    <span className="text-gray-300 ml-2">{phase.metadata.count}</span>
                  </div>
                )}
                {phase.metadata.index !== undefined && (
                  <div>
                    <span className="text-gray-500">Index:</span>
                    <span className="text-gray-300 ml-2">{phase.metadata.index}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {phase.children && phase.children.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-gray-500 mb-2">Sub-operations:</div>
              {phase.children.map((child, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs bg-gray-900/30 rounded px-2 py-1"
                >
                  <span className="text-gray-400">{child.metadata?.name || child.phase}</span>
                  <span className="text-gray-500">{child.duration.toFixed(2)}ms</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FlameGraphPanel({ source, disabled }: FlameGraphPanelProps) {
  const [engine, setEngine] = useState<RuntimeEngine | null>(null);
  const [profiles, setProfiles] = useState<CommandProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<CommandProfile | null>(null);
  const [commandOptions, setCommandOptions] = useState<ProfilerCommandOption[]>([]);
  const [selectedCommandLabel, setSelectedCommandLabel] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isProfiling, setIsProfiling] = useState(false);

  // Async compilation effect
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (disabled || !source.trim()) {
        // Defer to a microtask so state resets never run synchronously
        // inside the effect (react-hooks/set-state-in-effect).
        await Promise.resolve();
        if (cancelled) return;
        setEngine(null);
        setProfiles([]);
        setSelectedProfile(null);
        setCommandOptions([]);
        setSelectedCommandLabel('');
        return;
      }

      try {
        const compileResult = await compileToIR(source);
        if (cancelled) return;

        if (compileResult.diagnostics.some((d: { severity: string }) => d.severity === 'error')) {
          setEngine(null);
          setProfiles([]);
          setSelectedProfile(null);
          setCommandOptions([]);
          setSelectedCommandLabel('');
          setError('Compilation errors detected');
          return;
        }

        if (!compileResult.ir) {
          setEngine(null);
          setProfiles([]);
          setSelectedProfile(null);
          setCommandOptions([]);
          setSelectedCommandLabel('');
          setError('Failed to compile IR');
          return;
        }

        // Create runtime with profiling enabled
        const runtimeEngine = new RuntimeEngine(
          compileResult.ir,
          {},
          {
            profiling: {
              enabled: true,
              detailed: false,
            },
          },
        );

        setEngine(runtimeEngine);
        setProfiles([]);
        setSelectedProfile(null);
        const nextCommandOptions = buildProfilerCommandOptions(compileResult.ir);
        setCommandOptions(nextCommandOptions);
        setSelectedCommandLabel((current) =>
          resolveSelectedCommandLabel(current, nextCommandOptions),
        );
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Unknown error');
        setEngine(null);
        setProfiles([]);
        setSelectedProfile(null);
        setCommandOptions([]);
        setSelectedCommandLabel('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, disabled]);

  const handleRunCommand = async (commandName: string, entityName?: string) => {
    if (!engine) return;

    setIsProfiling(true);
    setError(null);

    try {
      const result = await engine.runCommand(commandName, {}, { entityName });

      const newProfiles = engine.getProfiles();
      setProfiles(newProfiles);

      if (newProfiles.length > 0) {
        setSelectedProfile(newProfiles[newProfiles.length - 1]);
      }

      if (!result.success) {
        setError(result.error || 'Command execution failed during profiling');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Command execution failed');
    } finally {
      setIsProfiling(false);
    }
  };

  const selectedCommand =
    commandOptions.find((option) => option.label === selectedCommandLabel) || null;

  const handleRunSelectedCommand = async () => {
    if (!selectedCommand) return;
    await handleRunCommand(selectedCommand.commandName, selectedCommand.entityName);
  };

  // Calculate statistics
  const stats =
    profiles.length > 0
      ? {
          totalCommands: profiles.length,
          totalDuration: profiles.reduce((sum, p) => sum + p.totalDuration, 0),
          averageDuration: profiles.reduce((sum, p) => sum + p.totalDuration, 0) / profiles.length,
          slowestCommand: profiles.reduce((max, p) =>
            p.totalDuration > max.totalDuration ? p : max,
          ),
          fastestCommand: profiles.reduce((min, p) =>
            p.totalDuration < min.totalDuration ? p : min,
          ),
        }
      : null;

  const currentProfile = selectedProfile || profiles[profiles.length - 1] || null;

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-800 bg-gray-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame size={16} className="text-orange-400" />
            <span className="text-sm font-medium text-gray-200">Performance Profiler</span>
          </div>
          <div className="flex items-center gap-2">
            {commandOptions.length > 0 && (
              <>
                <select
                  value={selectedCommandLabel}
                  onChange={(event) => setSelectedCommandLabel(event.target.value)}
                  disabled={isProfiling}
                  className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-orange-500 disabled:opacity-50"
                >
                  {commandOptions.map((option) => (
                    <option key={option.label} value={option.label}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleRunSelectedCommand}
                  disabled={isProfiling || !selectedCommand}
                  className="rounded bg-orange-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-gray-700"
                >
                  {isProfiling ? 'Profiling...' : 'Profile Command'}
                </button>
              </>
            )}
            {stats && (
              <div className="text-xs text-gray-500">
                {stats.totalCommands} command{stats.totalCommands !== 1 ? 's' : ''} profiled
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="flex-shrink-0 px-4 py-2 bg-red-900/20 border-b border-red-900/50">
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <Activity size={14} />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {!engine ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <Flame size={32} className="mx-auto mb-2 opacity-50" />
              <p>Compile a Manifest to enable profiling</p>
            </div>
          </div>
        ) : profiles.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <Zap size={32} className="mx-auto mb-2 opacity-50" />
              {commandOptions.length === 0 ? (
                <p>No commands available to profile in the current manifest</p>
              ) : (
                <p className="mb-2">
                  Select a command above and run it to collect the first profile
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Statistics Overview */}
            {stats && (
              <div className="bg-gray-900/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp size={16} className="text-emerald-400" />
                  <span className="text-sm font-medium text-gray-300">Overview</span>
                </div>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Total Duration</div>
                    <div className="text-lg font-semibold text-gray-200">
                      {stats.totalDuration.toFixed(2)}ms
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Average</div>
                    <div className="text-lg font-semibold text-gray-200">
                      {stats.averageDuration.toFixed(2)}ms
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Slowest</div>
                    <div className="text-lg font-semibold text-orange-400">
                      {stats.slowestCommand.totalDuration.toFixed(2)}ms
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Fastest</div>
                    <div className="text-lg font-semibold text-emerald-400">
                      {stats.fastestCommand.totalDuration.toFixed(2)}ms
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Flame Graph */}
            {currentProfile && (
              <div className="bg-gray-900/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Layers size={16} className="text-blue-400" />
                    <span className="text-sm font-medium text-gray-300">
                      {currentProfile.entityName ? `${currentProfile.entityName}.` : ''}
                      {currentProfile.commandName}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {currentProfile.totalDuration.toFixed(2)}ms total
                  </div>
                </div>

                {/* Flame visualization */}
                <div className="relative h-8 bg-gray-800 rounded-sm overflow-hidden mb-4">
                  {currentProfile.phases.map((phase, i) => {
                    const x = (phase.startOffset / currentProfile.totalDuration) * 100;
                    const width = (phase.duration / currentProfile.totalDuration) * 100;
                    const isSlowest =
                      i ===
                      currentProfile.phases.findIndex(
                        (p) =>
                          p.duration === Math.max(...currentProfile.phases.map((p) => p.duration)),
                      );
                    return (
                      <FlameBar
                        key={i}
                        phase={phase}
                        x={x}
                        width={width}
                        totalDuration={currentProfile.totalDuration}
                        isSlowest={isSlowest}
                      />
                    );
                  })}
                </div>

                {/* Phase breakdown */}
                <div className="space-y-1">
                  {currentProfile.phases.map((phase, i) => (
                    <PhaseDetail
                      key={i}
                      phase={phase}
                      totalDuration={currentProfile.totalDuration}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Profile selector */}
            {profiles.length > 1 && (
              <div className="bg-gray-900/50 rounded-lg p-4">
                <div className="text-xs text-gray-500 mb-2">Recent Profiles</div>
                <div className="space-y-1">
                  {profiles
                    .slice(-5)
                    .reverse()
                    .map((profile, i) => (
                      <div
                        key={i}
                        onClick={() => setSelectedProfile(profile)}
                        className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors ${
                          selectedProfile === profile
                            ? 'bg-blue-900/30 text-blue-300'
                            : 'bg-gray-800/50 text-gray-400 hover:bg-gray-800'
                        }`}
                      >
                        <span className="text-sm">
                          {profile.entityName ? `${profile.entityName}.` : ''}
                          {profile.commandName}
                        </span>
                        <span className="text-xs">{profile.totalDuration.toFixed(2)}ms</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
