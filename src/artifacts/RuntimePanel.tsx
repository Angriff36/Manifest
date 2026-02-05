import { useState, useMemo, useEffect } from 'react';
import { Play, AlertCircle, CheckCircle, Code, User, Trash2, Clock, ChevronDown, ChevronRight, Shield, Ban } from 'lucide-react';
import { compileToIR } from '../manifest/ir-compiler';
import { RuntimeEngine } from '../manifest/runtime-engine';
import type { CommandResult, EmittedEvent, PolicyDenial } from '../manifest/runtime-engine';

interface RuntimePanelProps {
  source: string;
  disabled: boolean;
}

export function RuntimePanel({ source, disabled }: RuntimePanelProps) {
  const [runtimeContextJson, setRuntimeContextJson] = useState('{\n  "user": {\n    "id": "u1",\n    "role": "cook"\n  }\n}');
  const [commandName, setCommandName] = useState('claim');
  const [commandParams, setCommandParams] = useState('{\n  "employeeId": "e1"\n}');
  const [entityName, setEntityName] = useState('PrepTask');
  const [instanceId, setInstanceId] = useState('task-1');
  const [commandResult, setCommandResult] = useState<CommandResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eventLog, setEventLog] = useState<EmittedEvent[]>([]);
  const [expandedDiagnostics, setExpandedDiagnostics] = useState<Set<string>>(new Set());

  const { engine } = useMemo(() => {
    if (disabled || !source.trim()) {
      return { engine: null };
    }
    try {
      const compileResult = compileToIR(source);
      if (compileResult.diagnostics.some(d => d.severity === 'error')) {
        return { engine: null };
      }
      if (!compileResult.ir) {
        return { engine: null };
      }

      let context = {};
      try {
        context = JSON.parse(runtimeContextJson);
      } catch {
        // Invalid JSON, will be caught when executing
      }

      const runtimeEngine = new RuntimeEngine(compileResult.ir, context);
      return { engine: runtimeEngine };
    } catch {
      return { engine: null };
    }
  }, [source, runtimeContextJson, disabled]);

  // Update event log when engine changes or after command execution
  useEffect(() => {
    if (engine) {
      setEventLog(engine.getEventLog());
    } else {
      setEventLog([]);
    }
  }, [engine, commandResult]);

  const handleClearEventLog = () => {
    if (engine) {
      engine.clearEventLog();
      setEventLog([]);
    }
  };

  const handleExecute = async () => {
    if (!engine) {
      setError('Engine not initialized. Check compilation errors.');
      return;
    }

    setError(null);
    setCommandResult(null);

    try {
      let params = {};
      try {
        params = commandParams.trim() ? JSON.parse(commandParams) : {};
      } catch (e) {
        setError(`Invalid command parameters JSON: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }

      let context = {};
      try {
        context = JSON.parse(runtimeContextJson);
      } catch (e) {
        setError(`Invalid runtime context JSON: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }

      engine.replaceContext(context);

      if (!commandName.trim()) {
        setError('Command name is required');
        return;
      }

      const options: { entityName?: string; instanceId?: string } = {};
      if (entityName.trim()) options.entityName = entityName.trim();
      if (instanceId.trim()) options.instanceId = instanceId.trim();

      const result = await engine.runCommand(commandName.trim(), params, options);
      setCommandResult(result);
      // Refresh event log after command execution
      setEventLog(engine.getEventLog());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const formatGuardFailure = (failure: CommandResult['guardFailure']) => {
    if (!failure) return null;

    const guardKey = `guard-${failure.index}`;
    const isExpanded = expandedDiagnostics.has(guardKey);
    const toggleExpanded = () => {
      setExpandedDiagnostics(prev => {
        const next = new Set(prev);
        if (next.has(guardKey)) {
          next.delete(guardKey);
        } else {
          next.add(guardKey);
        }
        return next;
      });
    };

    const resolvedValues = failure.resolved || [];
    const resolvedText = resolvedValues
      .map(rv => {
        const valueStr = typeof rv.value === 'string'
          ? `"${rv.value}"`
          : String(rv.value ?? 'undefined');
        return `${rv.expression} = ${valueStr}`;
      })
      .join(', ');

    return (
      <div className="mt-2 bg-rose-900/20 rounded border border-rose-800/50">
        <button
          onClick={toggleExpanded}
          className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-rose-900/30 transition-colors rounded"
        >
          {isExpanded ? <ChevronDown size={14} className="text-rose-400" /> : <ChevronRight size={14} className="text-rose-400" />}
          <Ban size={14} className="text-rose-400" />
          <span className="text-sm font-medium text-rose-300">
            Guard #{failure.index} failed
          </span>
        </button>
        {isExpanded && (
          <div className="px-3 pb-3">
            <div className="text-xs text-rose-400 font-mono mb-2 bg-rose-950/30 px-2 py-1 rounded">
              {failure.formatted}
            </div>
            {resolvedText && (
              <div className="text-xs text-rose-400">
                <span className="font-medium">Resolved:</span> {resolvedText}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const formatPolicyDenial = (denial: PolicyDenial) => {
    const policyKey = `policy-${denial.policyName}`;
    const isExpanded = expandedDiagnostics.has(policyKey);
    const toggleExpanded = () => {
      setExpandedDiagnostics(prev => {
        const next = new Set(prev);
        if (next.has(policyKey)) {
          next.delete(policyKey);
        } else {
          next.add(policyKey);
        }
        return next;
      });
    };

    const contextKeysText = denial.contextKeys.length > 0
      ? denial.contextKeys.join(', ')
      : 'none';

    return (
      <div className="mt-2 bg-amber-900/20 rounded border border-amber-800/50">
        <button
          onClick={toggleExpanded}
          className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-amber-900/30 transition-colors rounded"
        >
          {isExpanded ? <ChevronDown size={14} className="text-amber-400" /> : <ChevronRight size={14} className="text-amber-400" />}
          <Shield size={14} className="text-amber-400" />
          <span className="text-sm font-medium text-amber-300">
            Policy Denial: <code className="text-amber-400">{denial.policyName}</code>
          </span>
        </button>
        {isExpanded && (
          <div className="px-3 pb-3 space-y-2">
            {denial.formatted && (
              <div>
                <div className="text-xs text-amber-500 mb-1">Policy Expression:</div>
                <div className="text-xs text-amber-400 font-mono bg-amber-950/30 px-2 py-1 rounded">
                  {denial.formatted}
                </div>
              </div>
            )}
            {denial.message && (
              <div className="text-xs text-amber-400">
                <span className="font-medium">Message:</span> {denial.message}
              </div>
            )}
            <div className="text-xs text-amber-400">
              <span className="font-medium">Context Keys:</span> <span className="font-mono">{contextKeysText}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-gray-950">
      <div className="flex-shrink-0 px-3 py-3 border-b border-gray-800 bg-gray-900/50">
        <div className="flex items-center gap-2 mb-3">
          <Code size={16} className="text-sky-400" />
          <span className="text-sm font-medium text-gray-200">Runtime</span>
        </div>

        <div className="space-y-3">
          <div>
            <label className="flex items-center gap-1 text-xs text-gray-400 mb-1">
              <User size={12} />
              Runtime Context (JSON)
            </label>
            <div className="text-xs text-gray-500 mb-1">
              Expected shape: <code className="text-amber-400">{`{ "user": { "id": string, "role": string }, ... }`}</code>
            </div>
            <textarea
              value={runtimeContextJson}
              onChange={(e) => setRuntimeContextJson(e.target.value)}
              disabled={disabled}
              className="w-full h-24 px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-xs font-mono text-gray-300 resize-none focus:outline-none focus:border-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder='{ "user": { "id": "u1", "role": "cook" } }'
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Entity Name</label>
              <input
                type="text"
                value={entityName}
                onChange={(e) => setEntityName(e.target.value)}
                disabled={disabled}
                className="w-full px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-xs text-gray-300 focus:outline-none focus:border-sky-500 disabled:opacity-50"
                placeholder="PrepTask"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Instance ID</label>
              <input
                type="text"
                value={instanceId}
                onChange={(e) => setInstanceId(e.target.value)}
                disabled={disabled}
                className="w-full px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-xs text-gray-300 focus:outline-none focus:border-sky-500 disabled:opacity-50"
                placeholder="task-1"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Command Name</label>
            <input
              type="text"
              value={commandName}
              onChange={(e) => setCommandName(e.target.value)}
              disabled={disabled}
              className="w-full px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-xs text-gray-300 focus:outline-none focus:border-sky-500 disabled:opacity-50"
              placeholder="claim"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Command Parameters (JSON)</label>
            <textarea
              value={commandParams}
              onChange={(e) => setCommandParams(e.target.value)}
              disabled={disabled}
              className="w-full h-20 px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-xs font-mono text-gray-300 resize-none focus:outline-none focus:border-sky-500 disabled:opacity-50"
              placeholder='{ "employeeId": "e1" }'
            />
          </div>

          <button
            onClick={handleExecute}
            disabled={disabled || !engine}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2 text-sm rounded transition-colors ${
              disabled || !engine
                ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                : 'bg-sky-600 hover:bg-sky-500 text-white'
            }`}
          >
            <Play size={14} />
            Execute Command
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {error && (
          <div className="mb-3 p-3 bg-rose-900/20 rounded border border-rose-800/50 flex items-start gap-2">
            <AlertCircle size={16} className="text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-rose-300">{error}</div>
          </div>
        )}

        {commandResult && (
          <div className="space-y-3">
            <div className={`p-3 rounded border ${
              commandResult.success
                ? 'bg-emerald-900/20 border-emerald-800/50'
                : 'bg-rose-900/20 border-rose-800/50'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {commandResult.success ? (
                  <CheckCircle size={16} className="text-emerald-400" />
                ) : (
                  <AlertCircle size={16} className="text-rose-400" />
                )}
                <span className={`text-sm font-medium ${
                  commandResult.success ? 'text-emerald-300' : 'text-rose-300'
                }`}>
                  {commandResult.success ? 'Success' : 'Failed'}
                </span>
              </div>

              {commandResult.error && (
                <div className="text-sm text-rose-300 mb-2">{commandResult.error}</div>
              )}

              {commandResult.guardFailure && formatGuardFailure(commandResult.guardFailure)}

              {commandResult.policyDenial && formatPolicyDenial(commandResult.policyDenial)}

              {commandResult.emittedEvents.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs text-gray-400 mb-1">Emitted Events:</div>
                  {commandResult.emittedEvents.map((event, i) => (
                    <div key={i} className="text-xs font-mono text-emerald-300 bg-gray-900/50 p-2 rounded mt-1">
                      {event.name} ({event.channel})
                    </div>
                  ))}
                </div>
              )}

              {commandResult.result !== undefined && (
                <div className="mt-3">
                  <div className="text-xs text-gray-400 mb-1">Result:</div>
                  <pre className="text-xs font-mono text-gray-300 bg-gray-900/50 p-2 rounded overflow-auto">
                    {JSON.stringify(commandResult.result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {!commandResult && !error && (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Execute a command to see results
          </div>
        )}

        {/* Event Log Section */}
        <div className="mt-6 border-t border-gray-800 pt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-purple-400" />
              <span className="text-sm font-medium text-gray-200">Event Log</span>
              {eventLog.length > 0 && (
                <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                  {eventLog.length}
                </span>
              )}
            </div>
            {eventLog.length > 0 && (
              <button
                onClick={handleClearEventLog}
                disabled={disabled || !engine}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 size={12} />
                Clear Log
              </button>
            )}
          </div>

          {eventLog.length === 0 ? (
            <div className="text-xs text-gray-500 text-center py-4">
              No events yet. Execute a command that emits events to see them here.
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-auto">
              {eventLog.map((event, index) => (
                <div
                  key={index}
                  className="p-3 bg-gray-900/50 rounded border border-gray-800 hover:border-purple-800/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-purple-300">{event.name}</span>
                        <span className="text-xs text-gray-500 font-mono">({event.channel})</span>
                      </div>
                      <div className="text-xs text-gray-400">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="text-xs text-gray-500 mb-1">Payload:</div>
                    <pre className="text-xs font-mono text-gray-300 bg-gray-950 p-2 rounded overflow-auto border border-gray-800">
                      {JSON.stringify(event.payload, null, 2)}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
