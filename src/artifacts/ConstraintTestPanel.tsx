import { useState, useEffect, useRef } from 'react';
import { Play, CheckCircle, AlertTriangle, XCircle, Shield, ShieldCheck, ChevronDown, ChevronRight, RotateCcw, Package } from 'lucide-react';
import { compileToIR } from '../manifest/ir-compiler';
import { RuntimeEngine } from '../manifest/runtime-engine';
import type { EntityInstance, Store } from '../manifest/runtime-engine';
import type { IREntity, IRValue, ConstraintOutcome } from '../manifest/ir';

class MemoryStore<T extends EntityInstance> implements Store<T> {
  private items: Map<string, T> = new Map();
  async getAll(): Promise<T[]> { return Array.from(this.items.values()); }
  async getById(id: string): Promise<T | undefined> { return this.items.get(id); }
  async create(data: Partial<T>): Promise<T> {
    const id = (data.id as string) || crypto.randomUUID();
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
  async delete(id: string): Promise<boolean> { return this.items.delete(id); }
  async clear(): Promise<void> { this.items.clear(); }
}

interface ConstraintTestPanelProps {
  source: string;
  disabled: boolean;
}

const severityIcon = (severity: 'ok' | 'warn' | 'block', passed: boolean) => {
  if (passed) return <CheckCircle size={14} className="text-emerald-400" />;
  switch (severity) {
    case 'ok': return <CheckCircle size={14} className="text-gray-400" />;
    case 'warn': return <AlertTriangle size={14} className="text-amber-400" />;
    case 'block': return <XCircle size={14} className="text-rose-400" />;
  }
};

const severityBg = (severity: 'ok' | 'warn' | 'block', passed: boolean) => {
  if (passed) return 'bg-emerald-900/20 border-emerald-800/50';
  switch (severity) {
    case 'ok': return 'bg-gray-900/20 border-gray-700';
    case 'warn': return 'bg-amber-900/20 border-amber-800/50';
    case 'block': return 'bg-rose-900/20 border-rose-800/50';
  }
};

const severityLabel = (severity: 'ok' | 'warn' | 'block') => {
  switch (severity) {
    case 'ok': return { text: 'OK', className: 'text-gray-400 bg-gray-800' };
    case 'warn': return { text: 'WARN', className: 'text-amber-400 bg-amber-900/40' };
    case 'block': return { text: 'BLOCK', className: 'text-rose-400 bg-rose-900/40' };
  }
};

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

export function ConstraintTestPanel({ source, disabled }: ConstraintTestPanelProps) {
  const [engine, setEngine] = useState<RuntimeEngine | null>(null);
  const [entities, setEntities] = useState<IREntity[]>([]);
  const [selectedEntityName, setSelectedEntityName] = useState<string>('');
  const [propertyValues, setPropertyValues] = useState<Record<string, string>>({});
  const [outcomes, setOutcomes] = useState<ConstraintOutcome[]>([]);
  const [expandedOutcomes, setExpandedOutcomes] = useState<Set<string>>(new Set());
  const [evaluated, setEvaluated] = useState(false);
  const [runtimeContextJson, setRuntimeContextJson] = useState('{\n  "user": {\n    "id": "u1",\n    "role": "admin"\n  }\n}');
  const [error, setError] = useState<string | null>(null);

  const memoryStoresRef = useRef<Map<string, Store>>(new Map());

  // Compile source to IR and create engine
  useEffect(() => {
    if (disabled || !source.trim()) {
      setEngine(null);
      setEntities([]);
      setSelectedEntityName('');
      return;
    }

    (async () => {
      try {
        const compileResult = await compileToIR(source);
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
        try { context = JSON.parse(runtimeContextJson); } catch { /* ignore */ }

        const storeProvider = (entityName: string): Store => {
          if (!memoryStoresRef.current.has(entityName)) {
            memoryStoresRef.current.set(entityName, new MemoryStore());
          }
          return memoryStoresRef.current.get(entityName)!;
        };

        const runtimeEngine = new RuntimeEngine(compileResult.ir, context, { storeProvider });
        setEngine(runtimeEngine);

        // Only show entities that have constraints
        const entityList = runtimeEngine.getEntities().filter(e => e.constraints.length > 0);
        setEntities(entityList);

        if (entityList.length > 0 && !selectedEntityName) {
          setSelectedEntityName(entityList[0].name);
        }
      } catch {
        setEngine(null);
        setEntities([]);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, disabled]);

  // Initialize property values when entity changes
  useEffect(() => {
    if (!selectedEntityName || !engine) {
      setPropertyValues({});
      setOutcomes([]);
      setEvaluated(false);
      return;
    }

    const entity = engine.getEntity(selectedEntityName);
    if (!entity) return;

    const defaults: Record<string, string> = {};
    for (const prop of entity.properties) {
      if (prop.name === 'id') {
        defaults.id = 'test-1';
        continue;
      }
      if (prop.defaultValue !== undefined) {
        const val = extractIRValue(prop.defaultValue);
        defaults[prop.name] = val === null ? '' : String(val);
      } else {
        switch (prop.type.name) {
          case 'string': defaults[prop.name] = ''; break;
          case 'number': defaults[prop.name] = '0'; break;
          case 'boolean': defaults[prop.name] = 'false'; break;
          default: defaults[prop.name] = '';
        }
      }
    }
    setPropertyValues(defaults);
    setOutcomes([]);
    setEvaluated(false);
  }, [selectedEntityName, engine]);

  const handleEvaluate = async () => {
    if (!engine || !selectedEntityName) return;

    setError(null);

    // Update context
    try {
      const context = JSON.parse(runtimeContextJson);
      engine.replaceContext(context);
    } catch (e) {
      setError(`Invalid runtime context JSON: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    const entity = engine.getEntity(selectedEntityName);
    if (!entity) return;

    // Convert string property values to typed values
    const data: Record<string, unknown> = {};
    for (const prop of entity.properties) {
      const raw = propertyValues[prop.name] ?? '';
      switch (prop.type.name) {
        case 'number':
        case 'decimal':
          data[prop.name] = raw === '' ? 0 : Number(raw);
          break;
        case 'boolean':
          data[prop.name] = raw === 'true';
          break;
        default:
          data[prop.name] = raw;
      }
    }

    try {
      const results = await engine.evaluateAllConstraints(selectedEntityName, data);
      setOutcomes(results);
      setEvaluated(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleReset = () => {
    setOutcomes([]);
    setEvaluated(false);
    setError(null);

    // Reset property values to defaults
    if (!engine || !selectedEntityName) return;
    const entity = engine.getEntity(selectedEntityName);
    if (!entity) return;

    const defaults: Record<string, string> = {};
    for (const prop of entity.properties) {
      if (prop.name === 'id') { defaults.id = 'test-1'; continue; }
      if (prop.defaultValue !== undefined) {
        const val = extractIRValue(prop.defaultValue);
        defaults[prop.name] = val === null ? '' : String(val);
      } else {
        switch (prop.type.name) {
          case 'string': defaults[prop.name] = ''; break;
          case 'number': defaults[prop.name] = '0'; break;
          case 'boolean': defaults[prop.name] = 'false'; break;
          default: defaults[prop.name] = '';
        }
      }
    }
    setPropertyValues(defaults);
  };

  const toggleOutcome = (code: string) => {
    setExpandedOutcomes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const selectedEntity = entities.find(e => e.name === selectedEntityName);

  // Summary counts
  const passedCount = outcomes.filter(o => o.passed).length;
  const warnCount = outcomes.filter(o => !o.passed && o.severity === 'warn').length;
  const blockCount = outcomes.filter(o => !o.passed && o.severity === 'block').length;

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Header */}
      <div className="flex-shrink-0 px-3 py-3 border-b border-gray-800 bg-gray-900/50">
        <div className="flex items-center gap-2 mb-2">
          <Shield size={16} className="text-sky-400" />
          <span className="text-sm font-medium text-gray-200">Constraint Tester</span>
          {entities.length > 0 && (
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
              {entities.length} {entities.length === 1 ? 'entity' : 'entities'}
            </span>
          )}
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Runtime Context</label>
          <textarea
            value={runtimeContextJson}
            onChange={(e) => setRuntimeContextJson(e.target.value)}
            disabled={disabled}
            className="w-full h-12 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs font-mono text-gray-300 resize-none focus:outline-none focus:border-sky-500 disabled:opacity-50"
            placeholder='{ "user": { "id": "u1", "role": "admin" } }'
          />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Entity sidebar */}
        <div className="w-48 flex-shrink-0 border-r border-gray-800 overflow-auto">
          <div className="px-3 py-2 border-b border-gray-800">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Entities</div>
          </div>
          <div className="p-2 space-y-1">
            {entities.length === 0 ? (
              <div className="text-xs text-gray-500 text-center py-4">
                No entities with constraints
              </div>
            ) : (
              entities.map(entity => (
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
                        {entity.constraints.length} constraint{entity.constraints.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Detail view */}
        <div className="flex-1 flex flex-col overflow-auto">
          {selectedEntity ? (
            <div className="flex-1 overflow-auto p-4">
              {/* Property editor */}
              <div className="mb-4">
                <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                  Property Values
                </h4>
                <div className="space-y-2">
                  {selectedEntity.properties.map(prop => {
                    const isRequired = prop.modifiers.includes('required');
                    return (
                      <div key={prop.name} className="flex items-center gap-2">
                        <label className="w-32 text-xs text-gray-400 truncate flex-shrink-0" title={prop.name}>
                          {prop.name}
                          {isRequired && <span className="text-rose-400 ml-0.5">*</span>}
                          <span className="text-gray-600 ml-1">({prop.type.name})</span>
                        </label>
                        {prop.type.name === 'boolean' ? (
                          <select
                            value={propertyValues[prop.name] ?? 'false'}
                            onChange={(e) => setPropertyValues(prev => ({ ...prev, [prop.name]: e.target.value }))}
                            className="flex-1 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs font-mono text-gray-300 focus:outline-none focus:border-sky-500"
                          >
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        ) : (
                          <input
                            type={prop.type.name === 'number' || prop.type.name === 'decimal' ? 'number' : 'text'}
                            value={propertyValues[prop.name] ?? ''}
                            onChange={(e) => setPropertyValues(prev => ({ ...prev, [prop.name]: e.target.value }))}
                            className="flex-1 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs font-mono text-gray-300 focus:outline-none focus:border-sky-500"
                            step={prop.type.name === 'decimal' ? '0.01' : undefined}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={handleEvaluate}
                  disabled={disabled || !engine}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded transition-colors ${
                    disabled || !engine
                      ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                      : 'bg-sky-600 hover:bg-sky-500 text-white'
                  }`}
                >
                  <Play size={14} />
                  Evaluate Constraints
                </button>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
                >
                  <RotateCcw size={14} />
                  Reset
                </button>
              </div>

              {/* Error display */}
              {error && (
                <div className="mb-4 p-3 bg-rose-900/20 rounded border border-rose-800/50 flex items-start gap-2">
                  <XCircle size={14} className="text-rose-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-rose-300">{error}</div>
                </div>
              )}

              {/* Results summary */}
              {evaluated && outcomes.length > 0 && (
                <div className="mb-4 flex items-center gap-3 px-3 py-2 bg-gray-900/50 rounded border border-gray-800">
                  <span className="text-xs text-gray-400">Results:</span>
                  <span className="flex items-center gap-1 text-xs">
                    <CheckCircle size={12} className="text-emerald-400" />
                    <span className="text-emerald-400">{passedCount} passed</span>
                  </span>
                  {warnCount > 0 && (
                    <span className="flex items-center gap-1 text-xs">
                      <AlertTriangle size={12} className="text-amber-400" />
                      <span className="text-amber-400">{warnCount} warn</span>
                    </span>
                  )}
                  {blockCount > 0 && (
                    <span className="flex items-center gap-1 text-xs">
                      <XCircle size={12} className="text-rose-400" />
                      <span className="text-rose-400">{blockCount} blocked</span>
                    </span>
                  )}
                </div>
              )}

              {/* Constraint outcomes */}
              {evaluated && (
                <div className="space-y-2">
                  <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                    Constraint Outcomes
                  </h4>
                  {outcomes.length === 0 ? (
                    <div className="text-xs text-gray-500 text-center py-4">
                      No constraints defined on this entity
                    </div>
                  ) : (
                    outcomes.map(outcome => {
                      const isExpanded = expandedOutcomes.has(outcome.code);
                      const sev = severityLabel(outcome.severity);
                      const constraint = selectedEntity.constraints.find(c => c.code === outcome.code);

                      return (
                        <div
                          key={outcome.code}
                          className={`rounded border ${severityBg(outcome.severity, outcome.passed)}`}
                        >
                          <button
                            onClick={() => toggleOutcome(outcome.code)}
                            className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-white/5 transition-colors rounded"
                          >
                            {isExpanded
                              ? <ChevronDown size={14} className="text-gray-400" />
                              : <ChevronRight size={14} className="text-gray-400" />
                            }
                            {severityIcon(outcome.severity, outcome.passed)}
                            <span className="text-sm font-medium text-gray-200 flex-1 truncate">
                              {outcome.constraintName}
                            </span>
                            <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${sev.className}`}>
                              {sev.text}
                            </span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              outcome.passed
                                ? 'text-emerald-400 bg-emerald-900/30'
                                : 'text-rose-400 bg-rose-900/30'
                            }`}>
                              {outcome.passed ? 'PASS' : 'FAIL'}
                            </span>
                          </button>

                          {isExpanded && (
                            <div className="px-3 pb-3 space-y-2">
                              {/* Expression */}
                              <div>
                                <div className="text-xs text-gray-500 mb-1">Expression:</div>
                                <div className="text-xs font-mono text-gray-300 bg-gray-950 px-2 py-1 rounded border border-gray-800">
                                  {outcome.formatted}
                                </div>
                              </div>

                              {/* Constraint code */}
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-gray-500">Code:</span>
                                <span className="font-mono text-gray-400">{outcome.code}</span>
                              </div>

                              {/* Message */}
                              {outcome.message && (
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">Message:</div>
                                  <div className="text-xs text-gray-300 bg-gray-950 px-2 py-1 rounded border border-gray-800">
                                    {outcome.message}
                                  </div>
                                </div>
                              )}

                              {/* Resolved values */}
                              {outcome.resolved && outcome.resolved.length > 0 && (
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">Resolved Values:</div>
                                  <div className="space-y-1">
                                    {outcome.resolved.map((rv, i) => (
                                      <div key={i} className="flex items-center gap-2 text-xs font-mono bg-gray-950 px-2 py-1 rounded border border-gray-800">
                                        <span className="text-gray-400">{rv.expression}</span>
                                        <span className="text-gray-600">=</span>
                                        <span className={
                                          typeof rv.value === 'string' ? 'text-amber-400' :
                                          typeof rv.value === 'number' ? 'text-cyan-400' :
                                          typeof rv.value === 'boolean' ? 'text-orange-400' :
                                          'text-gray-500'
                                        }>
                                          {typeof rv.value === 'string' ? `"${rv.value}"` : String(rv.value ?? 'null')}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Details mapping */}
                              {outcome.details && Object.keys(outcome.details).length > 0 && (
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">Details:</div>
                                  <div className="space-y-1">
                                    {Object.entries(outcome.details).map(([key, val]) => (
                                      <div key={key} className="flex items-center gap-2 text-xs font-mono bg-gray-950 px-2 py-1 rounded border border-gray-800">
                                        <span className="text-gray-400">{key}</span>
                                        <span className="text-gray-600">=</span>
                                        <span className="text-cyan-400">{JSON.stringify(val)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Override eligibility */}
                              {constraint && (
                                <div className="flex items-center gap-2 text-xs pt-1 border-t border-gray-800/50">
                                  {constraint.overrideable ? (
                                    <>
                                      <ShieldCheck size={12} className="text-emerald-400" />
                                      <span className="text-emerald-400">Overrideable</span>
                                      {constraint.overridePolicyRef && (
                                        <span className="text-gray-500">
                                          via policy <span className="font-mono text-gray-400">{constraint.overridePolicyRef}</span>
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      <Shield size={12} className="text-gray-500" />
                                      <span className="text-gray-500">Not overrideable</span>
                                    </>
                                  )}
                                  {outcome.overridden && (
                                    <span className="text-sky-400 ml-2">
                                      Overridden by {outcome.overriddenBy}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Pre-evaluation: show constraint listing */}
              {!evaluated && selectedEntity.constraints.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                    Constraints ({selectedEntity.constraints.length})
                  </h4>
                  {selectedEntity.constraints.map(constraint => {
                    const sev = severityLabel(constraint.severity || 'block');
                    return (
                      <div key={constraint.code} className="px-3 py-2 bg-gray-900/30 rounded border border-gray-800 flex items-center gap-2">
                        <Shield size={14} className="text-gray-500" />
                        <span className="text-sm text-gray-300 flex-1 truncate">{constraint.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${sev.className}`}>
                          {sev.text}
                        </span>
                        {constraint.overrideable && (
                          <span title="Overrideable"><ShieldCheck size={12} className="text-emerald-400" /></span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-sm p-4">
              {entities.length === 0 ? (
                <>
                  <Shield size={24} className="mb-2 opacity-50" />
                  <p>No entities with constraints found.</p>
                  <p className="text-xs text-gray-600 mt-1">Add constraint blocks to your entities to test them here.</p>
                </>
              ) : (
                <>
                  <Package size={24} className="mb-2 opacity-50" />
                  <p>Select an entity to test its constraints.</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
