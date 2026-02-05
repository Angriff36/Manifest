import { useState, useEffect, useRef } from 'react';
import { Play, AlertCircle, CheckCircle, Code, User, Trash2, Clock, ChevronDown, ChevronRight, Shield, Ban, Plus, List, Info, Package } from 'lucide-react';
import { compileToIR } from '../manifest/ir-compiler';
import { RuntimeEngine } from '../manifest/runtime-engine';
import type { CommandResult, EmittedEvent, PolicyDenial, EntityInstance, Store } from '../manifest/runtime-engine';
import type { IREntity, IRValue } from '../manifest/ir';

// Inline MemoryStore for browser demo (copied from runtime-engine)
class MemoryStore<T extends EntityInstance> implements Store<T> {
  private items: Map<string, T> = new Map();
  private generateId: () => string;

  constructor(generateId?: () => string) {
    this.generateId = generateId || (() => crypto.randomUUID());
  }

  async getAll(): Promise<T[]> {
    return Array.from(this.items.values());
  }

  async getById(id: string): Promise<T | undefined> {
    return this.items.get(id);
  }

  async create(data: Partial<T>): Promise<T> {
    const id = (data.id as string) || this.generateId();
    const full = { ...data, id } as T;
    this.items.set(id, full);
    return full;
  }

  async update(id: string, data: Partial<T>): Promise<T | undefined> {
    const existing = this.items.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data };
    this.items.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.items.delete(id);
  }

  async clear(): Promise<void> {
    this.items.clear();
  }
}

interface RuntimePanelProps {
  source: string;
  disabled: boolean;
}

export function RuntimePanel({ source, disabled }: RuntimePanelProps) {
  const [engine, setEngine] = useState<RuntimeEngine | null>(null);
  const [runtimeContextJson, setRuntimeContextJson] = useState('{\n  "user": {\n    "id": "u1",\n    "role": "cook"\n  }\n}');

  // Entity and instance management
  const [entities, setEntities] = useState<IREntity[]>([]);
  const [selectedEntityName, setSelectedEntityName] = useState<string>('');
  const [instances, setInstances] = useState<EntityInstance[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);

  // Command execution
  const [selectedCommand, setSelectedCommand] = useState<string>('');
  const [commandParams, setCommandParams] = useState<string>('{}');
  const [commandResult, setCommandResult] = useState<CommandResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Event log and diagnostics
  const [eventLog, setEventLog] = useState<EmittedEvent[]>([]);
  const [expandedDiagnostics, setExpandedDiagnostics] = useState<Set<string>>(new Set());

  // Computed property values for the selected instance
  const [computedValues, setComputedValues] = useState<Record<string, unknown>>({});

  // Persistent store map for browser demo - survives re-renders
  const memoryStoresRef = useRef<Map<string, Store>>(new Map());

  // Helper to extract JavaScript value from IRValue
  const extractIRValue = (irValue: IRValue): unknown => {
    if (irValue.kind === 'null') return null;
    if ('value' in irValue) return irValue.value;
    if (irValue.kind === 'array') return irValue.elements.map(extractIRValue);
    if (irValue.kind === 'object') {
      const obj: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(irValue.properties)) {
        obj[key] = extractIRValue(val);
      }
      return obj;
    }
    return undefined;
  };

  // Async compilation effect
  useEffect(() => {
    if (disabled || !source.trim()) {
      setEngine(null);
      setEntities([]);
      setSelectedEntityName('');
      setInstances([]);
      return;
    }

    (async () => {
      try {
        console.log('[RuntimePanel] Compiling source:', source?.substring(0, 100));
        const compileResult = await compileToIR(source);
        console.log('[RuntimePanel] Compile result:', {
          hasDiagnostics: !!compileResult.diagnostics,
          diagnosticsCount: compileResult.diagnostics?.length,
          diagnostics: compileResult.diagnostics,
          hasIR: !!compileResult.ir,
          entityCount: compileResult.ir?.entities?.length,
          entities: compileResult.ir?.entities?.map((e: IREntity) => e.name)
        });
        if (compileResult.diagnostics.some(d => d.severity === 'error')) {
          setEngine(null);
          setEntities([]);
          return;
        }
        if (!compileResult.ir) {
          setEngine(null);
          setEntities([]);
          return;
        }

        let context = {};
        try {
          context = JSON.parse(runtimeContextJson);
        } catch {
          // Invalid JSON, will be caught when executing
        }

        // Create a store provider that uses memory stores for browser demo
        // This allows manifests with Supabase/Postgres storage to work in the browser
        const storeProvider = (entityName: string): Store => {
          if (!memoryStoresRef.current.has(entityName)) {
            memoryStoresRef.current.set(entityName, new MemoryStore());
          }
          return memoryStoresRef.current.get(entityName)!;
        };

        const runtimeEngine = new RuntimeEngine(compileResult.ir, context, { storeProvider });
        setEngine(runtimeEngine);

        // Populate entities
        const entityList = runtimeEngine.getEntities();
        setEntities(entityList);

        // Auto-select first entity if available
        if (entityList.length > 0 && !selectedEntityName) {
          setSelectedEntityName(entityList[0].name);
        }
      } catch (e) {
        console.error('[RuntimePanel] Compilation error:', e);
        setEngine(null);
        setEntities([]);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, disabled]);

  // Load instances when entity selection changes
  useEffect(() => {
    if (!engine || !selectedEntityName) {
      setInstances([]);
      setSelectedInstanceId(null);
      return;
    }

    (async () => {
      try {
        const instanceList = await engine.getAllInstances(selectedEntityName);
        setInstances(instanceList);

        // Auto-select first instance if available
        if (instanceList.length > 0 && !selectedInstanceId) {
          setSelectedInstanceId(instanceList[0].id);
        }
      } catch (e) {
        console.error('Failed to load instances:', e);
        setInstances([]);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Only re-run when entity changes, not when selectedInstanceId changes (intentional)
  }, [engine, selectedEntityName]);

  // Load computed values when instance selection changes
  useEffect(() => {
    if (!engine || !selectedEntityName || !selectedInstanceId) {
      setComputedValues({});
      return;
    }

    (async () => {
      try {
        const entity = engine.getEntity(selectedEntityName);
        if (!entity) return;

        const computed: Record<string, unknown> = {};
        for (const comp of entity.computedProperties) {
          try {
            computed[comp.name] = await engine.evaluateComputed(selectedEntityName, selectedInstanceId, comp.name);
          } catch {
            computed[comp.name] = '<error>';
          }
        }
        setComputedValues(computed);
      } catch (e) {
        console.error('Failed to load computed values:', e);
      }
    })();
  }, [engine, selectedEntityName, selectedInstanceId]);

  // Update event log when engine changes or after command execution
  useEffect(() => {
    if (engine) {
      setEventLog(engine.getEventLog());
    } else {
      setEventLog([]);
    }
  }, [engine, commandResult]);

  // Update command options when entity changes
  useEffect(() => {
    if (!engine || !selectedEntityName) {
      setSelectedCommand('');
      return;
    }

    const entity = engine.getEntity(selectedEntityName);
    if (entity && entity.commands.length > 0) {
      setSelectedCommand(entity.commands[0]);
    } else {
      setSelectedCommand('');
    }
  }, [engine, selectedEntityName]);

  const handleClearEventLog = () => {
    if (engine) {
      engine.clearEventLog();
      setEventLog([]);
    }
  };

  const handleCreateInstance = async () => {
    if (!engine || !selectedEntityName) return;

    try {
      const entity = engine.getEntity(selectedEntityName);
      if (!entity) return;

      // Create instance with default values
      // Generate a proper ID for the instance
      const defaultValues: Record<string, unknown> = { id: crypto.randomUUID() };
      for (const prop of entity.properties) {
        // Skip id - we already generated it
        if (prop.name === 'id') continue;

        if (prop.defaultValue !== undefined) {
          defaultValues[prop.name] = extractIRValue(prop.defaultValue);
        } else {
          const isRequired = prop.modifiers.includes('required');
          // Use type-appropriate defaults
          switch (prop.type.name) {
            case 'string':
              // For required strings, provide a meaningful default
              defaultValues[prop.name] = isRequired ? `New ${selectedEntityName}` : '';
              break;
            case 'number': defaultValues[prop.name] = 0; break;
            case 'boolean': defaultValues[prop.name] = false; break;
            default: defaultValues[prop.name] = null;
          }
        }
      }

      const newInstance = await engine.createInstance(selectedEntityName, defaultValues as unknown as EntityInstance);
      if (newInstance) {
        // Refresh instances
        const instanceList = await engine.getAllInstances(selectedEntityName);
        setInstances(instanceList);
        setSelectedInstanceId(newInstance.id);
        setEventLog(engine.getEventLog());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDeleteInstance = (instanceId: string) => {
    // Filter from local state (RuntimeEngine doesn't have delete method)
    setInstances(prev => prev.filter(i => i.id !== instanceId));
    if (selectedInstanceId === instanceId) {
      setSelectedInstanceId(null);
    }
  };

  const handleExecute = async () => {
    if (!engine) {
      setError('Engine not initialized. Check compilation errors.');
      return;
    }

    if (!selectedEntityName || !selectedInstanceId) {
      setError('Select an entity and instance first');
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

      const result = await engine.runCommand(selectedCommand, params, {
        entityName: selectedEntityName,
        instanceId: selectedInstanceId
      });
      setCommandResult(result);

      // Refresh instances after command execution
      const instanceList = await engine.getAllInstances(selectedEntityName);
      setInstances(instanceList);

      // Refresh computed values
      const entity = engine.getEntity(selectedEntityName);
      if (entity) {
        const computed: Record<string, unknown> = {};
        for (const comp of entity.computedProperties) {
          try {
            computed[comp.name] = await engine.evaluateComputed(selectedEntityName, selectedInstanceId!, comp.name);
          } catch {
            computed[comp.name] = '<error>';
          }
        }
        setComputedValues(computed);
      }

      // Refresh event log
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

    const resolvedValues = denial.resolved || [];
    const resolvedText = resolvedValues
      .map(rv => {
        const valueStr = typeof rv.value === 'string'
          ? `"${rv.value}"`
          : String(rv.value ?? 'undefined');
        return `${rv.expression} = ${valueStr}`;
      })
      .join(', ');

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
            {resolvedText && (
              <div className="text-xs text-amber-400">
                <span className="font-medium">Resolved:</span> {resolvedText}
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

  // Get current entity and command info
  const selectedEntity = entities.find(e => e.name === selectedEntityName);
  const selectedInstance = instances.find(i => i.id === selectedInstanceId);
  const selectedCommandInfo = selectedEntity
    ? engine?.getCommand(selectedCommand, selectedEntityName)
    : null;

  // Get command parameters for building the form
  const commandParamsInfo = selectedCommandInfo?.parameters || [];

  // Build parameter hints
  const getParameterHint = () => {
    if (commandParamsInfo.length === 0) return 'No parameters';

    const hints = commandParamsInfo.map(p => {
      const required = p.required ? 'required' : 'optional';
      const defaultHint = p.defaultValue !== undefined ? ` (default: ${JSON.stringify(p.defaultValue)})` : '';
      return `${p.name}: ${p.type.name} (${required})${defaultHint}`;
    });

    return hints.join(', ');
  };

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Header with runtime context */}
      <div className="flex-shrink-0 px-3 py-3 border-b border-gray-800 bg-gray-900/50">
        <div className="flex items-center gap-2 mb-3">
          <Code size={16} className="text-sky-400" />
          <span className="text-sm font-medium text-gray-200">Runtime</span>
          {entities.length > 0 && (
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
              {entities.length} entities
            </span>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label className="flex items-center gap-1 text-xs text-gray-400 mb-1">
              <User size={12} />
              Runtime Context (JSON)
            </label>
            <textarea
              value={runtimeContextJson}
              onChange={(e) => setRuntimeContextJson(e.target.value)}
              disabled={disabled}
              className="w-full h-16 px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-xs font-mono text-gray-300 resize-none focus:outline-none focus:border-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder='{ "user": { "id": "u1", "role": "cook" } }'
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Entity List Sidebar */}
        <div className="w-56 flex-shrink-0 border-r border-gray-800 overflow-auto">
          <div className="px-3 py-2 border-b border-gray-800">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Entities</div>
          </div>
          <div className="p-2 space-y-1">
            {entities.map(entity => (
              <button
                key={entity.name}
                onClick={() => setSelectedEntityName(entity.name)}
                className={`w-full p-2 text-left rounded transition-colors ${
                  selectedEntityName === entity.name
                    ? 'bg-sky-900/30 border border-sky-700'
                    : 'hover:bg-gray-900 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Package size={14} className={selectedEntityName === entity.name ? 'text-sky-400' : 'text-gray-500'} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-200 truncate">{entity.name}</div>
                    <div className="text-xs text-gray-500">
                      {entity.properties.length} props, {entity.computedProperties.length} computed
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {selectedEntity && (
            <>
              <div className="px-3 py-2 border-b border-gray-800 mt-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-500 uppercase tracking-wider">
                    {selectedEntity.name} ({instances.length})
                  </div>
                  <button
                    onClick={handleCreateInstance}
                    disabled={disabled || !engine}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus size={10} />
                    New
                  </button>
                </div>
              </div>
              <div className="p-2 space-y-1 max-h-64 overflow-auto">
                {instances.length === 0 ? (
                  <div className="text-xs text-gray-500 text-center py-4">
                    No instances. Create one to get started.
                  </div>
                ) : (
                  instances.map(instance => (
                    <button
                      key={instance.id}
                      onClick={() => setSelectedInstanceId(instance.id)}
                      className={`w-full p-2 text-left rounded transition-colors ${
                        selectedInstanceId === instance.id
                          ? 'bg-sky-900/30 border border-sky-700'
                          : 'hover:bg-gray-900 border border-transparent'
                      }`}
                    >
                      <div className="text-sm font-medium text-gray-200 truncate">
                        {instance.id}
                      </div>
                      {/* Show a few key properties */}
                      {selectedEntity.properties.slice(0, 2).map(prop => (
                        <div key={prop.name} className="text-xs text-gray-500 truncate">
                          {prop.name}: {String(instance[prop.name] ?? '<null>')}
                        </div>
                      ))}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {/* Detail View */}
        <div className="flex-1 flex flex-col overflow-auto">
          {selectedInstance && selectedEntity ? (
            <>
              {/* Instance Header */}
              <div className="flex-shrink-0 px-4 py-3 border-b border-gray-800 bg-gray-900/30">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-base font-medium text-gray-200">{selectedEntity.name}</h3>
                    <p className="text-sm text-gray-500 mt-1 font-mono">{selectedInstance.id}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteInstance(selectedInstanceId!)}
                    className="p-1 text-gray-500 hover:text-rose-400 hover:bg-rose-900/20 rounded transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-4">
                {/* Properties Grid */}
                <div className="mb-6">
                  <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Info size={12} />
                    Properties
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedEntity.properties.map(prop => {
                      const value = selectedInstance[prop.name];
                      const isRequired = prop.modifiers.includes('required');
                      const displayValue = value === undefined || value === null
                        ? '<null>'
                        : typeof value === 'object'
                          ? JSON.stringify(value)
                          : String(value);

                      return (
                        <div key={prop.name} className="p-2 bg-gray-900/50 rounded border border-gray-800">
                          <div className="text-xs text-gray-500">
                            {prop.name}
                            {isRequired && <span className="text-rose-400 ml-1">*</span>}
                          </div>
                          <div className="text-sm text-gray-300 truncate" title={displayValue}>
                            {displayValue}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Computed Properties */}
                {selectedEntity.computedProperties.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Info size={12} />
                      Computed Properties
                    </h4>
                    <div className="grid grid-cols-3 gap-2">
                      {selectedEntity.computedProperties.map(comp => {
                        const value = computedValues[comp.name];
                        const displayValue = value === undefined || value === null
                          ? '<null>'
                          : typeof value === 'object'
                            ? JSON.stringify(value)
                            : String(value);

                        return (
                          <div key={comp.name} className="p-2 bg-gray-900/30 rounded border border-gray-800">
                            <div className="text-xs text-gray-500">{comp.name}</div>
                            <div className="text-sm text-gray-300 truncate" title={displayValue}>
                              {displayValue}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Command Execution */}
                {selectedEntity.commands.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Execute Command</h4>
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Command</label>
                        <select
                          value={selectedCommand}
                          onChange={(e) => setSelectedCommand(e.target.value)}
                          disabled={disabled || !engine}
                          className="w-full px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-xs text-gray-300 focus:outline-none focus:border-sky-500 disabled:opacity-50"
                        >
                          {selectedEntity.commands.map(cmdName => {
                            const cmd = engine?.getCommand(cmdName, selectedEntityName);
                            return (
                              <option key={cmdName} value={cmdName}>
                                {cmdName} {cmd?.parameters.length ? `(${cmd.parameters.map(p => p.name).join(', ')})` : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      {commandParamsInfo.length > 0 && (
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">Parameters (JSON)</label>
                          <input
                            type="text"
                            value={commandParams}
                            onChange={(e) => setCommandParams(e.target.value)}
                            disabled={disabled || !engine}
                            className="w-full px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-xs font-mono text-gray-300 focus:outline-none focus:border-sky-500 disabled:opacity-50"
                            placeholder={`{ ${commandParamsInfo.map(p => `"${p.name}": ${p.type.name}`).join(', ')} }`}
                          />
                          <div className="text-xs text-gray-500 mt-1">
                            {getParameterHint()}
                          </div>
                        </div>
                      )}
                      <button
                        onClick={handleExecute}
                        disabled={disabled || !engine || !selectedCommand}
                        className={`w-full flex items-center justify-center gap-2 px-3 py-2 text-sm rounded transition-colors ${
                          disabled || !engine || !selectedCommand
                            ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                            : 'bg-sky-600 hover:bg-sky-500 text-white'
                        }`}
                      >
                        <Play size={14} />
                        Execute Command
                      </button>
                    </div>
                  </div>
                )}

                {/* Command Result */}
                {error && (
                  <div className="mb-4 p-3 bg-rose-900/20 rounded border border-rose-800/50 flex items-start gap-2">
                    <AlertCircle size={16} className="text-rose-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-rose-300">{error}</div>
                  </div>
                )}

                {commandResult && (
                  <div className="mb-4">
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
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-sm p-4">
              {entities.length === 0 ? (
                <>
                  <Code size={24} className="mb-2 opacity-50" />
                  <p>No entities found. Compile a manifest to get started.</p>
                </>
              ) : !selectedEntity ? (
                <>
                  <Package size={24} className="mb-2 opacity-50" />
                  <p>Select an entity to view its instances.</p>
                </>
              ) : instances.length === 0 ? (
                <>
                  <Plus size={24} className="mb-2 opacity-50" />
                  <p>No instances yet. Create one to get started.</p>
                </>
              ) : (
                <>
                  <List size={24} className="mb-2 opacity-50" />
                  <p>Select an instance to view details.</p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Event Log Sidebar */}
        <div className="w-72 flex-shrink-0 border-l border-gray-800 overflow-auto">
          <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-purple-400" />
              <span className="text-xs text-gray-500 uppercase tracking-wider">Event Log</span>
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
                className="p-1 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
          <div className="p-2 space-y-2">
            {eventLog.length === 0 ? (
              <div className="text-xs text-gray-500 text-center py-4">
                No events yet
              </div>
            ) : (
              eventLog.slice().reverse().map((event, index) => (
                <div
                  key={index}
                  className="p-2 bg-gray-900/50 rounded border border-gray-800 hover:border-purple-800/50 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-purple-300">{event.name}</span>
                    <span className="text-xs text-gray-600 font-mono">({event.channel})</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </div>
                  <div className="mt-1">
                    <div className="text-xs text-gray-600 mb-1">Payload:</div>
                    <pre className="text-xs font-mono text-gray-400 bg-gray-950 p-1.5 rounded overflow-auto border border-gray-800">
                      {JSON.stringify(event.payload, null, 2)}
                    </pre>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
