export function generateIndexHtml(projectName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName} - Manifest App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;
}

export function generateViteConfig(): string {
  return `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.manifest'],
});`;
}

export function generateTsConfig(): string {
  return JSON.stringify({
    compilerOptions: {
      target: "ES2020",
      useDefineForClassFields: true,
      lib: ["ES2020", "DOM", "DOM.Iterable"],
      module: "ESNext",
      skipLibCheck: true,
      moduleResolution: "bundler",
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      jsx: "react-jsx",
      strict: true,
      noUnusedLocals: false,
      noUnusedParameters: false,
      noFallthroughCasesInSwitch: true
    },
    include: ["src"]
  }, null, 2);
}

export function generatePackageJson(projectName: string): string {
  return JSON.stringify({
    name: projectName,
    private: true,
    version: "0.0.0",
    type: "module",
    scripts: {
      dev: "vite",
      build: "tsc && vite build",
      preview: "vite preview"
    },
    dependencies: {
      react: "^18.3.1",
      "react-dom": "^18.3.1"
    },
    devDependencies: {
      "@types/react": "^18.3.5",
      "@types/react-dom": "^18.3.0",
      "@vitejs/plugin-react": "^4.3.1",
      typescript: "^5.5.3",
      vite: "^5.4.2"
    }
  }, null, 2);
}

export function generateMainTsx(): string {
  return `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`;
}

export function generateIndexCss(): string {
  return `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background: #0f172a;
  color: #e2e8f0;
  min-height: 100vh;
}

#root {
  min-height: 100vh;
}

button {
  cursor: pointer;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

button:hover:not(:disabled) {
  opacity: 0.9;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

input, textarea, select {
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: #1e293b;
  color: #e2e8f0;
  font-size: 14px;
}

input:focus, textarea:focus, select:focus {
  outline: none;
  border-color: #0ea5e9;
}

textarea {
  resize: vertical;
  font-family: 'Monaco', 'Menlo', monospace;
}`;
}

export function generateAppTsx(): string {
  return `import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { compileToIR } from './manifest/ir/ir-compiler';
import { RuntimeEngine, EmittedEvent, EntityInstance } from './manifest/ir/runtime-engine';
import type { IR, IREntity, IRCommand, IRDiagnostic, IRParameter, IRType } from './manifest/ir/types';
import manifestSource from './manifest/source.manifest?raw';

const EXAMPLE_MANIFEST = \`module TaskManager {
  entity Task {
    property required title: string
    property description: string = ""
    property completed: boolean = false
    property priority: number = 1
    property createdAt: string

    constraint validPriority: priority >= 1 and priority <= 5 "Priority must be 1-5"

    command complete() {
      guard not self.completed
      mutate completed = true
      emit TaskCompleted
    }

    command setPriority(level: number) {
      guard level >= 1 and level <= 5
      mutate priority = level
    }
  }

  store Task in localStorage {
    key: "tasks"
  }

  entity User {
    property required email: string
    property name: string = ""
    property role: string = "user"
  }

  store User in memory

  command createTask(title: string, description: string, priority: number) {
    guard title != ""
    emit TaskCreated
  }

  event TaskCompleted: "task.completed" {
    taskId: string
  }

  event TaskCreated: "task.created" {
    title: string
  }

  policy adminOnly execute: user.role == "admin" "Admin access required"
}
\`;

interface CompileState {
  ir: IR | null;
  diagnostics: IRDiagnostic[];
  compileTime: number;
  success: boolean;
}

interface RuntimeState {
  engine: RuntimeEngine | null;
  lastGoodEngine: RuntimeEngine | null;
  events: EmittedEvent[];
}

type TabId = 'status' | 'explorer' | 'entities' | 'commands' | 'events';

function RuntimeStatus({
  compileState,
  manifestPath,
  onRecompile,
  isCompiling
}: {
  compileState: CompileState | null;
  manifestPath: string;
  onRecompile: () => void;
  isCompiling: boolean;
}) {
  const ir = compileState?.ir;

  return (
    <div className="runtime-status">
      <div className="status-header">
        <div className="status-indicator">
          <span className={\`dot \${compileState?.success ? 'success' : compileState ? 'error' : 'pending'}\`} />
          <span className="status-text">
            {compileState?.success ? 'Compiled' : compileState ? 'Errors' : 'Not compiled'}
          </span>
        </div>
        <button className="recompile-btn" onClick={onRecompile} disabled={isCompiling}>
          {isCompiling ? 'Compiling...' : 'Recompile'}
        </button>
      </div>

      <div className="status-details">
        <div className="detail-row">
          <span className="label">Manifest:</span>
          <span className="value mono">{manifestPath}</span>
        </div>
        {compileState && (
          <>
            <div className="detail-row">
              <span className="label">Compile time:</span>
              <span className="value">{compileState.compileTime}ms</span>
            </div>
            {ir && (
              <div className="counts">
                <div className="count-item">
                  <span className="count-num">{ir.modules.length}</span>
                  <span className="count-label">Modules</span>
                </div>
                <div className="count-item">
                  <span className="count-num">{ir.entities.length}</span>
                  <span className="count-label">Entities</span>
                </div>
                <div className="count-item">
                  <span className="count-num">{ir.commands.length}</span>
                  <span className="count-label">Commands</span>
                </div>
                <div className="count-item">
                  <span className="count-num">{ir.events.length}</span>
                  <span className="count-label">Events</span>
                </div>
                <div className="count-item">
                  <span className="count-num">{ir.stores.length}</span>
                  <span className="count-label">Stores</span>
                </div>
                <div className="count-item">
                  <span className="count-num">{ir.policies.length}</span>
                  <span className="count-label">Policies</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {compileState && !compileState.success && compileState.diagnostics.length > 0 && (
        <div className="errors-panel">
          <div className="errors-title">Compilation Errors</div>
          {compileState.diagnostics.filter(d => d.severity === 'error').map((err, i) => (
            <div key={i} className="error-item">
              <span className="error-icon">!</span>
              <span className="error-msg">{err.message}</span>
              {err.line && <span className="error-pos">Line {err.line}:{err.column || 0}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RuntimeContextEditor({
  value,
  error,
  onChange
}: {
  value: string;
  error: string | null;
  onChange: (next: string) => void;
}) {
  return (
    <div className="runtime-context">
      <div className="context-header">
        <span>Runtime Context</span>
        <span className="context-hint">JSON</span>
      </div>
      <div className="context-shape mono">Expected: {'{ "user": { "id": "u1", "role": "cook" } }'}</div>
      <textarea
        className={\`context-editor \${error ? 'has-error' : ''}\`}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder='{\n  "user": { "id": "u1", "role": "cook" }\n}'
        spellCheck={false}
        rows={6}
      />
      {error ? (
        <div className="context-error">{error}</div>
      ) : (
        <div className="context-help">Runtime context object only.</div>
      )}
    </div>
  );
}

function ModelExplorer({ ir }: { ir: IR | null }) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['modules', 'entities', 'commands']));

  const toggleExpand = (path: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const getSelectedData = () => {
    if (!ir || !selectedPath) return null;
    const parts = selectedPath.split('/');
    if (parts[0] === 'entity') return ir.entities.find(e => e.name === parts[1]);
    if (parts[0] === 'command') return ir.commands.find(c => c.name === parts[1]);
    if (parts[0] === 'store') return ir.stores.find(s => s.entity === parts[1]);
    if (parts[0] === 'event') return ir.events.find(e => e.name === parts[1]);
    if (parts[0] === 'policy') return ir.policies.find(p => p.name === parts[1]);
    if (parts[0] === 'module') return ir.modules.find(m => m.name === parts[1]);
    return null;
  };

  if (!ir) {
    return <div className="model-explorer"><div className="tree-empty">No IR loaded</div></div>;
  }

  const renderTreeNode = (id: string, label: string, type: string, hasChildren: boolean, depth: number) => {
    const isExpanded = expanded.has(id);
    const isSelected = selectedPath === id;

    return (
      <div
        key={id}
        className={\`tree-node \${isSelected ? 'selected' : ''}\`}
        style={{ paddingLeft: \`\${depth * 16 + 8}px\` }}
        onClick={() => {
          if (hasChildren) toggleExpand(id);
          setSelectedPath(id);
        }}
      >
        {hasChildren ? (
          <span className={\`expand-icon \${isExpanded ? 'expanded' : ''}\`}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.5" fill="none"/>
            </svg>
          </span>
        ) : <span className="expand-icon-placeholder" />}
        <span className={\`node-icon \${type}\`}>{type[0].toUpperCase()}</span>
        <span className="node-name">{label}</span>
      </div>
    );
  };

  return (
    <div className="model-explorer">
      <div className="explorer-tree">
        <div className="tree-header">IR Structure</div>

        {renderTreeNode('modules', \`Modules (\${ir.modules.length})\`, 'module', ir.modules.length > 0, 0)}
        {expanded.has('modules') && ir.modules.map(m => (
          renderTreeNode(\`module/\${m.name}\`, m.name, 'module', false, 1)
        ))}

        {renderTreeNode('entities', \`Entities (\${ir.entities.length})\`, 'entity', ir.entities.length > 0, 0)}
        {expanded.has('entities') && ir.entities.map(e => (
          <React.Fragment key={e.name}>
            {renderTreeNode(\`entity/\${e.name}\`, e.name, 'entity', e.properties.length > 0, 1)}
            {expanded.has(\`entity/\${e.name}\`) && e.properties.map(p => (
              renderTreeNode(\`entity/\${e.name}/prop/\${p.name}\`, \`\${p.name}: \${p.type.name}\`, 'property', false, 2)
            ))}
          </React.Fragment>
        ))}

        {renderTreeNode('commands', \`Commands (\${ir.commands.length})\`, 'command', ir.commands.length > 0, 0)}
        {expanded.has('commands') && ir.commands.map(c => (
          renderTreeNode(\`command/\${c.name}\`, c.name, 'command', false, 1)
        ))}

        {renderTreeNode('stores', \`Stores (\${ir.stores.length})\`, 'store', ir.stores.length > 0, 0)}
        {expanded.has('stores') && ir.stores.map(s => (
          renderTreeNode(\`store/\${s.entity}\`, \`\${s.entity} -> \${s.target}\`, 'store', false, 1)
        ))}

        {renderTreeNode('events', \`Events (\${ir.events.length})\`, 'event', ir.events.length > 0, 0)}
        {expanded.has('events') && ir.events.map(e => (
          renderTreeNode(\`event/\${e.name}\`, e.name, 'event', false, 1)
        ))}

        {renderTreeNode('policies', \`Policies (\${ir.policies.length})\`, 'policy', ir.policies.length > 0, 0)}
        {expanded.has('policies') && ir.policies.map(p => (
          renderTreeNode(\`policy/\${p.name}\`, p.name, 'policy', false, 1)
        ))}
      </div>
      <div className="explorer-detail">
        <div className="detail-header">{selectedPath || 'Select a node'}</div>
        <div className="detail-content">
          {selectedPath ? (
            <pre>{JSON.stringify(getSelectedData(), null, 2)}</pre>
          ) : (
            <div className="detail-empty">Select a node from the tree</div>
          )}
        </div>
      </div>
    </div>
  );
}

function getDefaultValue(type: IRType): unknown {
  if (type.nullable) return null;
  switch (type.name) {
    case 'string': return '';
    case 'number': return 0;
    case 'boolean': return false;
    default: return '';
  }
}

function omitEmptyStrings(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== '') {
      result[key] = value;
    }
  }
  return result;
}

function EntityPanel({
  entity,
  engine
}: {
  entity: IREntity;
  engine: RuntimeEngine;
}) {
  const [items, setItems] = useState<EntityInstance[]>([]);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadItems = useCallback(() => {
    setItems(engine.getAllInstances(entity.name));
  }, [engine, entity.name]);

  useEffect(() => {
    loadItems();
    const interval = setInterval(loadItems, 500);
    return () => clearInterval(interval);
  }, [loadItems]);

  useEffect(() => {
    const initial: Record<string, unknown> = {};
    entity.properties.forEach(p => {
      initial[p.name] = getDefaultValue(p.type);
    });
    setFormData(initial);
  }, [entity]);

  const handleCreate = () => {
    const payload = omitEmptyStrings(formData);
    engine.createInstance(entity.name, payload);
    loadItems();
    const initial: Record<string, unknown> = {};
    entity.properties.forEach(p => {
      initial[p.name] = getDefaultValue(p.type);
    });
    setFormData(initial);
  };

  const handleDelete = (id: string) => {
    engine.deleteInstance(entity.name, id);
    loadItems();
  };

  const handleUpdate = (id: string) => {
    const payload = omitEmptyStrings(formData);
    engine.updateInstance(entity.name, id, payload);
    setEditingId(null);
    loadItems();
  };

  const startEdit = (item: EntityInstance) => {
    setEditingId(item.id);
    setFormData({ ...item });
  };

  const renderInput = (name: string, type: IRType, value: unknown, onChange: (v: unknown) => void) => {
    if (type.name === 'boolean') {
      return (
        <select value={String(value)} onChange={e => onChange(e.target.value === 'true')}>
          <option value="false">false</option>
          <option value="true">true</option>
        </select>
      );
    }
    if (type.name === 'number') {
      return (
        <input
          type="number"
          value={value as number}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
        />
      );
    }
    return (
      <input
        type="text"
        value={value as string}
        onChange={e => onChange(e.target.value)}
        placeholder={name}
      />
    );
  };

  return (
    <div className="entity-panel">
      <h2>{entity.name}</h2>
      <div className="entity-meta">
        {entity.properties.length} properties
        {entity.commands.length > 0 && \` | \${entity.commands.length} commands\`}
      </div>

      <div className="create-form-grid">
        {entity.properties.filter(p => !p.modifiers.includes('readonly')).map(prop => (
          <div key={prop.name} className="form-field">
            <label>{prop.name}</label>
            {renderInput(prop.name, prop.type, formData[prop.name], v => setFormData(d => ({ ...d, [prop.name]: v })))}
          </div>
        ))}
        <button className="btn-primary" onClick={handleCreate}>Create</button>
      </div>

      <div className="items-list">
        {items.length === 0 ? (
          <div className="items-empty">No {entity.name.toLowerCase()}s yet</div>
        ) : (
          items.map(item => (
            <div key={item.id} className="item-card">
              {editingId === item.id ? (
                <div className="edit-form">
                  {entity.properties.map(prop => (
                    <div key={prop.name} className="form-field-inline">
                      <label>{prop.name}:</label>
                      {renderInput(prop.name, prop.type, formData[prop.name], v => setFormData(d => ({ ...d, [prop.name]: v })))}
                    </div>
                  ))}
                  <div className="edit-actions">
                    <button className="btn-primary" onClick={() => handleUpdate(item.id)}>Save</button>
                    <button className="btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <pre>{JSON.stringify(item, null, 2)}</pre>
                  <div className="item-actions">
                    <button className="btn-secondary" onClick={() => startEdit(item)}>Edit</button>
                    <button className="btn-danger" onClick={() => handleDelete(item.id)}>Delete</button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CommandsPanel({
  engine,
  onEventEmitted
}: {
  engine: RuntimeEngine;
  onEventEmitted: (event: EmittedEvent) => void;
}) {
  const [selectedCommand, setSelectedCommand] = useState<IRCommand | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [targetInstance, setTargetInstance] = useState<string>('');
  const [result, setResult] = useState<{ success: boolean; message: string; events: EmittedEvent[]; guardFailure?: { index: number; formatted: string; resolved?: { expression: string; value: string }[] } } | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const commands = engine.getCommands();
  const entityCommands = commands.filter(c => c.entity);
  const moduleCommands = commands.filter(c => !c.entity);

  useEffect(() => {
    if (selectedCommand) {
      const initial: Record<string, unknown> = {};
      selectedCommand.parameters.forEach(p => {
        initial[p.name] = getDefaultValue(p.type);
      });
      setFormData(initial);
      setResult(null);
      setTargetInstance('');
    }
  }, [selectedCommand]);

  const formatResolvedValue = (value: unknown) => {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
      const json = JSON.stringify(value);
      return json === undefined ? String(value) : json;
    } catch {
      return String(value);
    }
  };

  const executeCommand = async () => {
    if (!selectedCommand) return;
    setIsExecuting(true);
    setResult(null);

    try {
      const cmdResult = await engine.runCommand(
        selectedCommand.name,
        formData,
        {
          entityName: selectedCommand.entity,
          instanceId: targetInstance || undefined
        }
      );

      cmdResult.emittedEvents.forEach(onEventEmitted);

      setResult({
        success: cmdResult.success,
        message: cmdResult.success
          ? \`Command executed successfully\${cmdResult.result !== undefined ? \`: \${JSON.stringify(cmdResult.result)}\` : ''}\`
          : cmdResult.error || 'Unknown error',
        events: cmdResult.emittedEvents,
        guardFailure: cmdResult.guardFailure
          ? {
              index: cmdResult.guardFailure.index,
              formatted: cmdResult.guardFailure.formatted,
              resolved: cmdResult.guardFailure.resolved
                ? cmdResult.guardFailure.resolved.map(entry => ({
                    expression: entry.expression,
                    value: formatResolvedValue(entry.value),
                  }))
                : undefined
            }
          : undefined
      });
    } catch (err: any) {
      setResult({
        success: false,
        message: err.message,
        events: []
      });
    }

    setIsExecuting(false);
  };

  const renderParamInput = (param: IRParameter) => {
    const value = formData[param.name];
    if (param.type.name === 'boolean') {
      return (
        <select value={String(value)} onChange={e => setFormData(d => ({ ...d, [param.name]: e.target.value === 'true' }))}>
          <option value="false">false</option>
          <option value="true">true</option>
        </select>
      );
    }
    if (param.type.name === 'number') {
      return (
        <input
          type="number"
          value={value as number}
          onChange={e => setFormData(d => ({ ...d, [param.name]: parseFloat(e.target.value) || 0 }))}
        />
      );
    }
    return (
      <input
        type="text"
        value={value as string}
        onChange={e => setFormData(d => ({ ...d, [param.name]: e.target.value }))}
        placeholder={param.name}
      />
    );
  };

  const instances = selectedCommand?.entity ? engine.getAllInstances(selectedCommand.entity) : [];

  return (
    <div className="commands-panel">
      <div className="commands-sidebar">
        <div className="commands-header">Commands</div>

        {moduleCommands.length > 0 && (
          <>
            <div className="commands-section-title">Module Commands</div>
            {moduleCommands.map(cmd => (
              <div
                key={cmd.name}
                className={\`command-item \${selectedCommand?.name === cmd.name ? 'selected' : ''}\`}
                onClick={() => setSelectedCommand(cmd)}
              >
                <span className="command-name">{cmd.name}</span>
                <span className="command-params">({cmd.parameters.length} params)</span>
              </div>
            ))}
          </>
        )}

        {entityCommands.length > 0 && (
          <>
            <div className="commands-section-title">Entity Commands</div>
            {entityCommands.map(cmd => (
              <div
                key={\`\${cmd.entity}-\${cmd.name}\`}
                className={\`command-item \${selectedCommand?.name === cmd.name && selectedCommand?.entity === cmd.entity ? 'selected' : ''}\`}
                onClick={() => setSelectedCommand(cmd)}
              >
                <span className="command-entity">{cmd.entity}.</span>
                <span className="command-name">{cmd.name}</span>
              </div>
            ))}
          </>
        )}

        {commands.length === 0 && (
          <div className="commands-empty">No commands defined</div>
        )}
      </div>

      <div className="commands-main">
        {selectedCommand ? (
          <div className="command-form">
            <h3>{selectedCommand.entity ? \`\${selectedCommand.entity}.\` : ''}{selectedCommand.name}</h3>

            {selectedCommand.guards.length > 0 && (
              <div className="command-guards">
                <span className="guards-label">Guards:</span>
                <span className="guards-count">{selectedCommand.guards.length} condition(s)</span>
              </div>
            )}

            {selectedCommand.entity && instances.length > 0 && (
              <div className="form-field">
                <label>Target Instance</label>
                <select value={targetInstance} onChange={e => setTargetInstance(e.target.value)}>
                  <option value="">Select an instance...</option>
                  {instances.map(inst => (
                    <option key={inst.id} value={inst.id}>
                      {inst.id.slice(0, 8)}... {Object.entries(inst).filter(([k]) => k !== 'id').slice(0, 2).map(([k, v]) => \`\${k}=\${v}\`).join(', ')}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedCommand.parameters.length > 0 && (
              <div className="command-params-form">
                {selectedCommand.parameters.map(param => (
                  <div key={param.name} className="form-field">
                    <label>
                      {param.name}
                      {param.required && <span className="required">*</span>}
                      <span className="type-hint">{param.type.name}</span>
                    </label>
                    {renderParamInput(param)}
                  </div>
                ))}
              </div>
            )}

            <button
              className="btn-execute"
              onClick={executeCommand}
              disabled={isExecuting || (selectedCommand.entity && !targetInstance && instances.length > 0)}
            >
              {isExecuting ? 'Executing...' : 'Execute Command'}
            </button>

            {result && (
              <div className={\`command-result \${result.success ? 'success' : 'error'}\`}>
                <div className="result-status">{result.success ? 'Success' : 'Failed'}</div>
                <div className="result-message">{result.message}</div>
                {!result.success && result.guardFailure && (
                  <div className="guard-failure">
                    <div className="guard-failure-title">Guard #{result.guardFailure.index} failed</div>
                    <div className="guard-failure-detail mono">{result.guardFailure.formatted}</div>
                    {result.guardFailure.resolved && result.guardFailure.resolved.length > 0 && (
                      <div className="guard-failure-resolved">
                        <span className="guard-failure-label">Resolved:</span>
                        <span className="guard-failure-detail mono">
                         {result.guardFailure.resolved.map(entry => String(entry.expression) + ' = ' + String(entry.value)).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {result.events.length > 0 && (
                  <div className="result-events">
                    <div className="events-title">Emitted Events:</div>
                    {result.events.map((e, i) => (
                      <div key={i} className="event-badge">{e.name}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="command-placeholder">
            Select a command from the list to execute it
          </div>
        )}
      </div>
    </div>
  );
}

function EventFeed({ events }: { events: EmittedEvent[] }) {
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div className="event-feed">
      <div className="feed-header">
        <span>Event Feed</span>
        <span className="event-count">{events.length} events</span>
      </div>
      <div className="feed-list" ref={feedRef}>
        {events.length === 0 ? (
          <div className="feed-empty">No events emitted yet. Execute commands to see events appear here.</div>
        ) : (
          events.map((event, i) => (
            <div key={i} className="event-item">
              <div className="event-header">
                <span className="event-name">{event.name}</span>
                <span className="event-channel">{event.channel}</span>
                <span className="event-time">{new Date(event.timestamp).toLocaleTimeString()}</span>
              </div>
              <pre className="event-payload">{JSON.stringify(event.payload, null, 2)}</pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function EmptyState({ onInsertExample }: { onInsertExample: () => void }) {
  return (
    <div className="empty-state-panel">
      <div className="empty-icon">
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
          <rect x="8" y="8" width="48" height="48" rx="8" stroke="#475569" strokeWidth="2" strokeDasharray="4 4"/>
          <path d="M32 24V40M24 32H40" stroke="#475569" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
      <h2>No Entities Defined</h2>
      <p>Your manifest has no entity declarations. Click below to load an example manifest with Tasks, Users, and Commands.</p>
      <button className="insert-example-btn" onClick={onInsertExample}>Insert Example Manifest</button>
    </div>
  );
}

export default function App() {
  const [source, setSource] = useState<string>(manifestSource);
  const [compileState, setCompileState] = useState<CompileState | null>(null);
  const [runtimeState, setRuntimeState] = useState<RuntimeState>({ engine: null, lastGoodEngine: null, events: [] });
  const [runtimeContextText, setRuntimeContextText] = useState<string>('{}');
  const [runtimeContext, setRuntimeContext] = useState<Record<string, unknown>>({});
  const [runtimeContextError, setRuntimeContextError] = useState<string | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('status');
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);

  const handleContextChange = useCallback((next: string) => {
    setRuntimeContextText(next);
    const trimmed = next.trim();
    if (trimmed.length === 0) {
      setRuntimeContext({});
      setRuntimeContextError(null);
      return;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setRuntimeContextError('Runtime context must be a JSON object.');
        return;
      }
      setRuntimeContext(parsed as Record<string, unknown>);
      setRuntimeContextError(null);
    } catch (err: any) {
      setRuntimeContextError(err?.message || 'Invalid JSON');
    }
  }, []);

  const compile = useCallback((src: string) => {
    setIsCompiling(true);
    const start = performance.now();

    setTimeout(() => {
      const { ir, diagnostics } = compileToIR(src);
      const compileTime = Math.round(performance.now() - start);
      const success = ir !== null;

      setCompileState({ ir, diagnostics, compileTime, success });

      if (success && ir) {
        const newEngine = new RuntimeEngine(ir, runtimeContext);

        if (runtimeState.engine) {
          try {
            const data = runtimeState.engine.serialize();
            newEngine.restore({ stores: data.stores });
          } catch {}
        }

        setRuntimeState(prev => ({
          engine: newEngine,
          lastGoodEngine: newEngine,
          events: prev.events
        }));

        if (ir.entities.length > 0) {
          setSelectedEntity(ir.entities[0].name);
        }
      }

      setIsCompiling(false);
    }, 50);
  }, [runtimeContext, runtimeState.engine]);

  useEffect(() => {
    if (runtimeContextError) return;
    const activeEngine = runtimeState.engine || runtimeState.lastGoodEngine;
    if (!activeEngine) return;
    activeEngine.replaceContext(runtimeContext);
  }, [runtimeContext, runtimeContextError, runtimeState.engine, runtimeState.lastGoodEngine]);

  useEffect(() => {
    compile(source);
  }, []);

  const handleRecompile = () => compile(source);

  const handleInsertExample = () => {
    setSource(EXAMPLE_MANIFEST);
    compile(EXAMPLE_MANIFEST);
    setActiveTab('entities');
  };

  const handleEventEmitted = (event: EmittedEvent) => {
    setRuntimeState(prev => ({
      ...prev,
      events: [...prev.events, event]
    }));
  };

  const engine = runtimeState.engine || runtimeState.lastGoodEngine;
  const ir = compileState?.ir;
  const entities = ir?.entities || [];

  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="url(#grad)" />
            <path d="M10 16L14 20L22 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <defs>
              <linearGradient id="grad" x1="0" y1="0" x2="32" y2="32">
                <stop stopColor="#0ea5e9" />
                <stop offset="1" stopColor="#06b6d4" />
              </linearGradient>
            </defs>
          </svg>
          <span>Manifest Runtime</span>
        </div>
        <nav className="nav">
          {(['status', 'explorer', 'entities', 'commands', 'events'] as TabId[]).map(tab => (
            <button
              key={tab}
              className={\`nav-btn \${activeTab === tab ? 'active' : ''}\`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </header>

      <div className="content">
        <aside className="sidebar">
          <RuntimeStatus
            compileState={compileState}
            manifestPath="manifest/source.manifest"
            onRecompile={handleRecompile}
            isCompiling={isCompiling}
          />
          <RuntimeContextEditor
            value={runtimeContextText}
            error={runtimeContextError}
            onChange={handleContextChange}
          />
        </aside>

        <main className="main">
          {activeTab === 'status' && (
            <div className="tab-content">
              <h2>IR Output</h2>
              {ir ? (
                <div className="code-preview">
                  <div className="code-header">Intermediate Representation (IR)</div>
                  <pre className="code-block">{JSON.stringify(ir, null, 2)}</pre>
                </div>
              ) : (
                <div className="status-message">
                  {compileState ? 'Fix errors to see IR output' : 'Compiling...'}
                </div>
              )}
            </div>
          )}

          {activeTab === 'explorer' && <ModelExplorer ir={ir || null} />}

          {activeTab === 'entities' && (
            <div className="tab-content">
              {!engine || entities.length === 0 ? (
                <EmptyState onInsertExample={handleInsertExample} />
              ) : (
                <>
                  <div className="entity-tabs">
                    {entities.map(e => (
                      <button
                        key={e.name}
                        className={\`entity-tab \${selectedEntity === e.name ? 'active' : ''}\`}
                        onClick={() => setSelectedEntity(e.name)}
                      >
                        {e.name}
                      </button>
                    ))}
                  </div>
                  {selectedEntity && entities.find(e => e.name === selectedEntity) && (
                    <EntityPanel
                      entity={entities.find(e => e.name === selectedEntity)!}
                      engine={engine}
                    />
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'commands' && engine && (
            <CommandsPanel engine={engine} onEventEmitted={handleEventEmitted} />
          )}

          {activeTab === 'events' && <EventFeed events={runtimeState.events} />}
        </main>
      </div>

      <style>{\`
        .app { min-height: 100vh; display: flex; flex-direction: column; }
        .header { display: flex; align-items: center; justify-content: space-between; padding: 12px 24px; background: #1e293b; border-bottom: 1px solid #334155; }
        .logo { display: flex; align-items: center; gap: 12px; font-size: 18px; font-weight: 600; }
        .nav { display: flex; gap: 4px; }
        .nav-btn { background: transparent; color: #94a3b8; padding: 8px 16px; border-radius: 6px; }
        .nav-btn:hover { background: #334155; }
        .nav-btn.active { background: #0ea5e9; color: white; }
        .content { flex: 1; display: flex; overflow: hidden; }
        .sidebar { width: 320px; flex-shrink: 0; border-right: 1px solid #334155; overflow-y: auto; background: #0f172a; }
        .main { flex: 1; overflow-y: auto; padding: 24px; }

        .runtime-status { padding: 16px; }
        .status-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .status-indicator { display: flex; align-items: center; gap: 8px; }
        .dot { width: 10px; height: 10px; border-radius: 50%; background: #475569; }
        .dot.success { background: #10b981; box-shadow: 0 0 8px #10b98166; }
        .dot.error { background: #ef4444; box-shadow: 0 0 8px #ef444466; }
        .dot.pending { background: #f59e0b; }
        .status-text { font-weight: 500; }
        .recompile-btn { background: #334155; color: #e2e8f0; padding: 6px 12px; font-size: 13px; }
        .recompile-btn:hover:not(:disabled) { background: #475569; }
        .status-details { display: flex; flex-direction: column; gap: 8px; }
        .detail-row { display: flex; justify-content: space-between; font-size: 13px; }
        .label { color: #64748b; }
        .value { color: #e2e8f0; }
        .mono { font-family: 'Monaco', 'Menlo', monospace; font-size: 12px; }
        .counts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #334155; }
        .count-item { text-align: center; padding: 8px; background: #1e293b; border-radius: 6px; }
        .count-num { display: block; font-size: 20px; font-weight: 600; color: #0ea5e9; }
        .count-label { font-size: 11px; color: #64748b; text-transform: uppercase; }
        .errors-panel { margin-top: 16px; padding: 12px; background: #7f1d1d33; border: 1px solid #ef444433; border-radius: 8px; }
        .errors-title { font-weight: 500; color: #fca5a5; margin-bottom: 8px; font-size: 13px; }
        .error-item { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; padding: 4px 0; }
        .error-icon { width: 18px; height: 18px; background: #ef4444; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; flex-shrink: 0; }
        .error-msg { color: #fca5a5; flex: 1; }
        .error-pos { color: #94a3b8; font-family: monospace; font-size: 11px; }

        .runtime-context { padding: 16px; border-top: 1px solid #1f2937; }
        .context-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-weight: 600; }
        .context-hint { font-size: 11px; color: #64748b; border: 1px solid #334155; padding: 2px 6px; border-radius: 999px; }
        .context-shape { font-size: 11px; color: #94a3b8; margin-bottom: 8px; }
        .context-editor { width: 100%; min-height: 120px; background: #0b1220; border: 1px solid #334155; border-radius: 8px; color: #e2e8f0; font-family: 'Monaco', 'Menlo', monospace; font-size: 12px; padding: 10px; resize: vertical; }
        .context-editor.has-error { border-color: #ef4444; }
        .context-help { margin-top: 6px; font-size: 11px; color: #64748b; }
        .context-error { margin-top: 6px; font-size: 11px; color: #fca5a5; }

        .model-explorer { display: flex; height: calc(100vh - 140px); background: #1e293b; border-radius: 8px; overflow: hidden; }
        .explorer-tree { width: 280px; border-right: 1px solid #334155; overflow-y: auto; }
        .tree-header { padding: 12px 16px; font-weight: 500; border-bottom: 1px solid #334155; background: #0f172a; }
        .tree-empty { padding: 24px; text-align: center; color: #64748b; }
        .tree-node { display: flex; align-items: center; gap: 4px; padding: 6px 8px; cursor: pointer; font-size: 13px; }
        .tree-node:hover { background: #334155; }
        .tree-node.selected { background: #0ea5e933; }
        .expand-icon { width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; color: #64748b; transition: transform 0.15s; }
        .expand-icon.expanded { transform: rotate(90deg); }
        .expand-icon-placeholder { width: 16px; }
        .node-icon { width: 18px; height: 18px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; flex-shrink: 0; }
        .node-icon.entity { background: #0ea5e9; color: white; }
        .node-icon.module { background: #8b5cf6; color: white; }
        .node-icon.command { background: #10b981; color: white; }
        .node-icon.store { background: #f59e0b; color: white; }
        .node-icon.event { background: #ec4899; color: white; }
        .node-icon.policy { background: #ef4444; color: white; }
        .node-icon.property { background: #475569; color: white; }
        .node-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .explorer-detail { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        .detail-header { padding: 12px 16px; font-weight: 500; border-bottom: 1px solid #334155; background: #0f172a; }
        .detail-content { flex: 1; padding: 16px; overflow: auto; }
        .detail-content pre { font-size: 12px; line-height: 1.5; color: #94a3b8; white-space: pre-wrap; word-break: break-word; }
        .detail-empty { color: #64748b; text-align: center; padding: 24px; }

        .empty-state-panel { text-align: center; padding: 60px 40px; max-width: 500px; margin: 0 auto; }
        .empty-icon { margin-bottom: 24px; }
        .empty-state-panel h2 { font-size: 24px; margin-bottom: 16px; color: #f1f5f9; }
        .empty-state-panel p { color: #94a3b8; line-height: 1.6; margin-bottom: 24px; }
        .insert-example-btn { background: linear-gradient(135deg, #0ea5e9, #06b6d4); color: white; padding: 12px 24px; font-size: 15px; font-weight: 500; }
        .insert-example-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px #0ea5e933; }

        .tab-content h2 { font-size: 20px; margin-bottom: 20px; color: #f1f5f9; }
        .entity-tabs { display: flex; gap: 8px; margin-bottom: 24px; flex-wrap: wrap; }
        .entity-tab { background: #334155; color: #94a3b8; }
        .entity-tab.active { background: #0ea5e9; color: white; }
        .entity-panel h2 { font-size: 20px; margin-bottom: 4px; }
        .entity-meta { font-size: 13px; color: #64748b; margin-bottom: 20px; }
        .create-form-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-bottom: 24px; padding: 16px; background: #1e293b; border-radius: 8px; align-items: end; }
        .form-field { display: flex; flex-direction: column; gap: 4px; }
        .form-field label { font-size: 12px; color: #94a3b8; }
        .form-field input, .form-field select { width: 100%; }
        .form-field-inline { display: flex; align-items: center; gap: 8px; }
        .form-field-inline label { font-size: 12px; color: #94a3b8; min-width: 80px; }
        .edit-form { display: flex; flex-direction: column; gap: 8px; width: 100%; }
        .edit-actions { display: flex; gap: 8px; margin-top: 8px; }
        .btn-primary { background: #0ea5e9; color: white; }
        .btn-secondary { background: #334155; color: #e2e8f0; }
        .btn-danger { background: #ef4444; color: white; }
        .items-list { display: flex; flex-direction: column; gap: 12px; }
        .items-empty { text-align: center; padding: 40px; color: #64748b; background: #1e293b; border-radius: 8px; }
        .item-card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 16px; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
        .item-card pre { font-size: 13px; color: #94a3b8; margin: 0; white-space: pre-wrap; flex: 1; }
        .item-actions { display: flex; flex-direction: column; gap: 4px; }

        .commands-panel { display: flex; height: calc(100vh - 140px); background: #1e293b; border-radius: 8px; overflow: hidden; }
        .commands-sidebar { width: 260px; border-right: 1px solid #334155; overflow-y: auto; }
        .commands-header { padding: 12px 16px; font-weight: 500; border-bottom: 1px solid #334155; background: #0f172a; }
        .commands-section-title { padding: 8px 16px; font-size: 11px; text-transform: uppercase; color: #64748b; background: #0f172a; }
        .command-item { padding: 10px 16px; cursor: pointer; display: flex; align-items: center; gap: 4px; font-size: 13px; }
        .command-item:hover { background: #334155; }
        .command-item.selected { background: #0ea5e933; }
        .command-entity { color: #64748b; }
        .command-name { color: #e2e8f0; }
        .command-params { color: #64748b; font-size: 11px; margin-left: auto; }
        .commands-empty { padding: 24px; text-align: center; color: #64748b; }
        .commands-main { flex: 1; padding: 24px; overflow-y: auto; }
        .command-form h3 { font-size: 18px; margin-bottom: 16px; color: #f1f5f9; }
        .command-guards { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #f59e0b22; border: 1px solid #f59e0b44; border-radius: 6px; margin-bottom: 16px; font-size: 13px; }
        .guards-label { color: #f59e0b; font-weight: 500; }
        .guards-count { color: #fcd34d; }
        .command-params-form { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
        .form-field .required { color: #ef4444; margin-left: 2px; }
        .form-field .type-hint { color: #64748b; font-size: 11px; margin-left: 4px; }
        .btn-execute { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 12px 24px; font-size: 15px; }
        .btn-execute:disabled { background: #334155; }
        .command-result { margin-top: 16px; padding: 16px; border-radius: 8px; }
        .command-result.success { background: #10b98122; border: 1px solid #10b98144; }
        .command-result.error { background: #ef444422; border: 1px solid #ef444444; }
        .result-status { font-weight: 600; margin-bottom: 4px; }
        .command-result.success .result-status { color: #34d399; }
        .command-result.error .result-status { color: #f87171; }
        .guard-failure { margin-top: 10px; padding: 10px; border-radius: 6px; background: #1f2937; border: 1px dashed #ef444466; }
        .guard-failure-title { font-size: 12px; font-weight: 600; color: #fca5a5; margin-bottom: 4px; }
        .guard-failure-detail { font-size: 12px; color: #e2e8f0; white-space: pre-wrap; word-break: break-word; }
        .guard-failure-resolved { margin-top: 6px; display: flex; gap: 6px; flex-wrap: wrap; }
        .guard-failure-label { font-size: 12px; color: #cbd5f5; }
        .result-message { font-size: 13px; color: #94a3b8; }
        .result-events { margin-top: 12px; }
        .events-title { font-size: 12px; color: #64748b; margin-bottom: 8px; }
        .event-badge { display: inline-block; padding: 4px 8px; background: #ec4899; color: white; border-radius: 4px; font-size: 12px; margin-right: 4px; }
        .command-placeholder { display: flex; align-items: center; justify-content: center; height: 100%; color: #64748b; }

        .event-feed { height: calc(100vh - 140px); background: #1e293b; border-radius: 8px; display: flex; flex-direction: column; overflow: hidden; }
        .feed-header { padding: 12px 16px; font-weight: 500; border-bottom: 1px solid #334155; background: #0f172a; display: flex; justify-content: space-between; align-items: center; }
        .event-count { font-size: 12px; color: #64748b; }
        .feed-list { flex: 1; overflow-y: auto; padding: 16px; }
        .feed-empty { text-align: center; padding: 40px; color: #64748b; }
        .event-item { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 12px; margin-bottom: 8px; }
        .event-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .event-name { font-weight: 500; color: #ec4899; }
        .event-channel { font-size: 12px; color: #64748b; background: #334155; padding: 2px 6px; border-radius: 4px; }
        .event-time { font-size: 11px; color: #64748b; margin-left: auto; }
        .event-payload { font-size: 12px; color: #94a3b8; margin: 0; white-space: pre-wrap; }

        .code-preview { background: #1e293b; border-radius: 8px; overflow: hidden; }
        .code-header { padding: 10px 16px; background: #0f172a; font-size: 13px; font-weight: 500; border-bottom: 1px solid #334155; }
        .code-block { padding: 16px; font-size: 12px; line-height: 1.5; color: #94a3b8; max-height: 500px; overflow: auto; margin: 0; }
        .status-message { text-align: center; padding: 40px; color: #64748b; }
      \`}</style>
    </div>
  );
}`;
}

export function generateReadme(projectName: string): string {
  return `# ${projectName}

Generated by Manifest Compiler v2.0 - IR Runtime Edition

## Quick Start

\`\`\`bash
npm install
npm run dev
\`\`\`

Then open http://localhost:5173 in your browser.

## Project Structure

- \`src/manifest/source.manifest\` - Original Manifest source
- \`src/manifest/generated.ts\` - Legacy compiled TypeScript (for debugging)
- \`src/manifest/runtime.ts\` - Legacy runtime library
- \`src/manifest/ir/\` - IR compiler and runtime engine
  - \`types.ts\` - IR type definitions
  - \`ir-compiler.ts\` - Source to IR compiler
  - \`runtime-engine.ts\` - IR execution engine
- \`src/manifest/compiler/\` - Legacy AST compiler
- \`src/App.tsx\` - React application UI

## Features

### IR-Driven Runtime

The application is powered by an Intermediate Representation (IR) that represents:
- Modules, Entities, Commands, Stores, Events, Policies
- All property definitions, computed fields, and constraints
- Command parameters, guards, mutations, and emits

### Runtime Status Panel

Always visible sidebar showing:
- Compilation status (success/error)
- Compile time and model statistics
- Compilation errors with locations

### Model Explorer

Interactive tree view of the IR structure:
- Browse all IR nodes by category
- View raw JSON for any selected node

### Entity Management

Full CRUD operations via RuntimeEngine:
- Auto-generated forms based on entity properties
- LocalStorage persistence for configured stores
- Edit and delete existing instances

### Commands Tab

Execute commands defined in your manifest:
- List of module and entity commands
- Input forms for command parameters
- Target instance selection for entity commands
- Guard condition indicators
- Execution results and denial reasons
- Emitted events display

### Event Feed

Real-time display of all emitted events:
- Event name and channel
- Timestamp
- Full payload data

### Last-Good State Preservation

If recompilation fails:
- Previous working RuntimeEngine stays active
- You can continue using the app
- Errors are displayed for fixing

## How It Works

1. Source manifest is compiled to IR (not generated TypeScript)
2. RuntimeEngine interprets the IR at runtime
3. Commands execute with guard/policy checks
4. Events are emitted to the event bus
5. Entity state is managed through stores

## Build for Production

\`\`\`bash
npm run build
\`\`\`
`;
}

export const RUNTIME_SOURCE = `export type Subscriber<T> = (value: T) => void;
export type User = { id: string; role?: string; [key: string]: unknown };
export type Context = { user?: User; [key: string]: unknown };

let _context: Context = {};
export const setContext = (ctx: Context) => { _context = ctx; };
export const getContext = () => _context;

export class Observable<T> {
  private subs: Set<Subscriber<T>> = new Set();
  private _v: T;
  constructor(v: T) { this._v = v; }
  get value(): T { return this._v; }
  set(v: T) { this._v = v; this.subs.forEach(fn => fn(v)); }
  subscribe(fn: Subscriber<T>) { this.subs.add(fn); fn(this._v); return () => this.subs.delete(fn); }
}

export class EventEmitter<T extends Record<string, unknown>> {
  private listeners: Map<keyof T, Set<(d: unknown) => void>> = new Map();
  on<K extends keyof T>(e: K, fn: (d: T[K]) => void) {
    if (!this.listeners.has(e)) this.listeners.set(e, new Set());
    this.listeners.get(e)!.add(fn as (d: unknown) => void);
    return () => this.listeners.get(e)?.delete(fn as (d: unknown) => void);
  }
  emit<K extends keyof T>(e: K, d: T[K]) {
    this.listeners.get(e)?.forEach(fn => fn(d));
  }
}

export class EventBus {
  private static channels: Map<string, Set<(d: unknown) => void>> = new Map();
  static publish(channel: string, data: unknown) {
    this.channels.get(channel)?.forEach(fn => fn(data));
  }
  static subscribe(channel: string, fn: (d: unknown) => void) {
    if (!this.channels.has(channel)) this.channels.set(channel, new Set());
    this.channels.get(channel)!.add(fn);
    return () => this.channels.get(channel)?.delete(fn);
  }
}

export interface Store<T> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | null>;
  create(item: Partial<T>): Promise<T>;
  update(id: string, item: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;
  query(filter: (item: T) => boolean): Promise<T[]>;
  onChange(fn: (items: T[]) => void): () => void;
}

export class MemoryStore<T extends { id: string }> implements Store<T> {
  private data: Map<string, T> = new Map();
  private listeners: Set<(items: T[]) => void> = new Set();

  private notify() {
    const items = Array.from(this.data.values());
    this.listeners.forEach(fn => fn(items));
  }

  async getAll() { return Array.from(this.data.values()); }
  async getById(id: string) { return this.data.get(id) || null; }
  async create(item: Partial<T>) {
    const id = (item as { id?: string }).id || crypto.randomUUID();
    const full = { ...item, id } as T;
    this.data.set(id, full);
    this.notify();
    return full;
  }
  async update(id: string, item: Partial<T>) {
    const existing = this.data.get(id);
    if (!existing) throw new Error("Not found");
    const updated = { ...existing, ...item };
    this.data.set(id, updated);
    this.notify();
    return updated;
  }
  async delete(id: string) {
    const result = this.data.delete(id);
    this.notify();
    return result;
  }
  async query(filter: (item: T) => boolean) {
    return Array.from(this.data.values()).filter(filter);
  }
  onChange(fn: (items: T[]) => void) {
    this.listeners.add(fn);
    fn(Array.from(this.data.values()));
    return () => this.listeners.delete(fn);
  }
}

export class LocalStorageStore<T extends { id: string }> implements Store<T> {
  private listeners: Set<(items: T[]) => void> = new Set();
  constructor(private key: string) {}

  private load(): T[] {
    try {
      const d = localStorage.getItem(this.key);
      return d ? JSON.parse(d) : [];
    } catch { return []; }
  }
  private save(data: T[]) {
    localStorage.setItem(this.key, JSON.stringify(data));
    this.listeners.forEach(fn => fn(data));
  }

  async getAll() { return this.load(); }
  async getById(id: string) { return this.load().find(x => x.id === id) || null; }
  async create(item: Partial<T>) {
    const data = this.load();
    const id = (item as { id?: string }).id || crypto.randomUUID();
    const full = { ...item, id } as T;
    data.push(full);
    this.save(data);
    return full;
  }
  async update(id: string, item: Partial<T>) {
    const data = this.load();
    const idx = data.findIndex(x => x.id === id);
    if (idx < 0) throw new Error("Not found");
    data[idx] = { ...data[idx], ...item };
    this.save(data);
    return data[idx];
  }
  async delete(id: string) {
    const data = this.load();
    const idx = data.findIndex(x => x.id === id);
    if (idx < 0) return false;
    data.splice(idx, 1);
    this.save(data);
    return true;
  }
  async query(filter: (item: T) => boolean) { return this.load().filter(filter); }
  onChange(fn: (items: T[]) => void) {
    this.listeners.add(fn);
    fn(this.load());
    return () => this.listeners.delete(fn);
  }
}
`;

export const IR_TYPES_SOURCE = `export interface IR {
  version: '1.0';
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
`;

export const IR_COMPILER_SOURCE = `import { Lexer } from '../compiler/lexer';
import { Parser } from '../compiler/parser';
import type {
  ManifestProgram, EntityNode, PropertyNode, ComputedPropertyNode, RelationshipNode,
  CommandNode, ParameterNode, PolicyNode, StoreNode, OutboxEventNode, ConstraintNode,
  ActionNode, ExpressionNode, TypeNode
} from '../compiler/types';
import type {
  IR, IRModule, IREntity, IRProperty, IRComputedProperty, IRRelationship, IRConstraint,
  IRStore, IREvent, IREventField, IRCommand, IRParameter, IRAction, IRPolicy, IRType,
  IRValue, IRExpression, IRDiagnostic, CompileToIRResult, PropertyModifier
} from './types';

class IRCompiler {
  private diagnostics: IRDiagnostic[] = [];

  compile(source: string): CompileToIRResult {
    this.diagnostics = [];
    const parser = new Parser();
    const { program, errors } = parser.parse(source);

    for (const err of errors) {
      this.diagnostics.push({
        severity: err.severity,
        message: err.message,
        line: err.position?.line,
        column: err.position?.column,
      });
    }

    if (errors.some(e => e.severity === 'error')) {
      return { ir: null, diagnostics: this.diagnostics };
    }

    return { ir: this.transform(program), diagnostics: this.diagnostics };
  }

  private transform(p: ManifestProgram): IR {
    const modules = p.modules.map(m => this.transformModule(m));
    const entities = [
      ...p.entities.map(e => this.transformEntity(e)),
      ...p.modules.flatMap(m => m.entities.map(e => this.transformEntity(e, m.name)))
    ];
    const stores = [
      ...p.stores.map(s => this.transformStore(s)),
      ...p.modules.flatMap(m => m.stores.map(s => this.transformStore(s)))
    ];
    const events = [
      ...p.events.map(e => this.transformEvent(e)),
      ...p.modules.flatMap(m => m.events.map(e => this.transformEvent(e)))
    ];
    const commands = [
      ...p.commands.map(c => this.transformCommand(c)),
      ...p.modules.flatMap(m => m.commands.map(c => this.transformCommand(c, m.name))),
      ...p.entities.flatMap(e => e.commands.map(c => this.transformCommand(c, undefined, e.name))),
      ...p.modules.flatMap(m => m.entities.flatMap(e => e.commands.map(c => this.transformCommand(c, m.name, e.name))))
    ];
    const policies = [
      ...p.policies.map(pl => this.transformPolicy(pl)),
      ...p.modules.flatMap(m => m.policies.map(pl => this.transformPolicy(pl, m.name)))
    ];

    return { version: '1.0', modules, entities, stores, events, commands, policies };
  }

  private transformModule(m: any): IRModule {
    return {
      name: m.name,
      entities: m.entities.map((e: EntityNode) => e.name),
      commands: m.commands.map((c: CommandNode) => c.name),
      stores: m.stores.map((s: StoreNode) => s.entity),
      events: m.events.map((e: OutboxEventNode) => e.name),
      policies: m.policies.map((p: PolicyNode) => p.name),
    };
  }

  private transformEntity(e: EntityNode, mod?: string): IREntity {
    return {
      name: e.name,
      module: mod,
      properties: e.properties.map(p => this.transformProperty(p)),
      computedProperties: e.computedProperties.map(c => this.transformComputed(c)),
      relationships: e.relationships.map(r => this.transformRelationship(r)),
      commands: e.commands.map(c => c.name),
      constraints: e.constraints.map(c => this.transformConstraint(c)),
      policies: e.policies.map(p => p.name),
    };
  }

  private transformProperty(p: PropertyNode): IRProperty {
    return {
      name: p.name,
      type: this.transformType(p.dataType),
      defaultValue: p.defaultValue ? this.exprToValue(p.defaultValue) : undefined,
      modifiers: p.modifiers as PropertyModifier[],
    };
  }

  private transformComputed(c: ComputedPropertyNode): IRComputedProperty {
    return {
      name: c.name,
      type: this.transformType(c.dataType),
      expression: this.transformExpr(c.expression),
      dependencies: c.dependencies,
    };
  }

  private transformRelationship(r: RelationshipNode): IRRelationship {
    return { name: r.name, kind: r.kind, target: r.target, foreignKey: r.foreignKey, through: r.through };
  }

  private transformConstraint(c: ConstraintNode): IRConstraint {
    return { name: c.name, expression: this.transformExpr(c.expression), message: c.message };
  }

  private transformStore(s: StoreNode): IRStore {
    const config: Record<string, IRValue> = {};
    if (s.config) {
      for (const [k, v] of Object.entries(s.config)) {
        const val = this.exprToValue(v);
        if (val) config[k] = val;
      }
    }
    return { entity: s.entity, target: s.target, config };
  }

  private transformEvent(e: OutboxEventNode): IREvent {
    if ('fields' in e.payload) {
      return {
        name: e.name,
        channel: e.channel,
        payload: (e.payload.fields as ParameterNode[]).map(f => ({
          name: f.name, type: this.transformType(f.dataType), required: f.required
        })),
      };
    }
    return { name: e.name, channel: e.channel, payload: this.transformType(e.payload as TypeNode) };
  }

  private transformCommand(c: CommandNode, mod?: string, entity?: string): IRCommand {
    return {
      name: c.name,
      module: mod,
      entity: entity,
      parameters: c.parameters.map(p => this.transformParam(p)),
      guards: (c.guards || []).map(g => this.transformExpr(g)),
      actions: c.actions.map(a => this.transformAction(a)),
      emits: c.emits || [],
      returns: c.returns ? this.transformType(c.returns) : undefined,
    };
  }

  private transformParam(p: ParameterNode): IRParameter {
    return {
      name: p.name,
      type: this.transformType(p.dataType),
      required: p.required,
      defaultValue: p.defaultValue ? this.exprToValue(p.defaultValue) : undefined,
    };
  }

  private transformAction(a: ActionNode): IRAction {
    return { kind: a.kind, target: a.target, expression: this.transformExpr(a.expression) };
  }

  private transformPolicy(p: PolicyNode, mod?: string, entity?: string): IRPolicy {
    return {
      name: p.name, module: mod, entity: entity, action: p.action,
      expression: this.transformExpr(p.expression), message: p.message,
    };
  }

  private transformType(t: TypeNode): IRType {
    return { name: t.name, generic: t.generic ? this.transformType(t.generic) : undefined, nullable: t.nullable };
  }

  private transformExpr(e: ExpressionNode): IRExpression {
    switch (e.type) {
      case 'Literal': {
        const l = e as any;
        return { kind: 'literal', value: this.litToValue(l.value, l.dataType) };
      }
      case 'Identifier': return { kind: 'identifier', name: (e as any).name };
      case 'MemberAccess': {
        const m = e as any;
        return { kind: 'member', object: this.transformExpr(m.object), property: m.property };
      }
      case 'BinaryOp': {
        const b = e as any;
        return { kind: 'binary', operator: b.operator, left: this.transformExpr(b.left), right: this.transformExpr(b.right) };
      }
      case 'UnaryOp': {
        const u = e as any;
        return { kind: 'unary', operator: u.operator, operand: this.transformExpr(u.operand) };
      }
      case 'Call': {
        const c = e as any;
        return { kind: 'call', callee: this.transformExpr(c.callee), args: c.arguments.map((a: ExpressionNode) => this.transformExpr(a)) };
      }
      case 'Conditional': {
        const cn = e as any;
        return { kind: 'conditional', condition: this.transformExpr(cn.condition), consequent: this.transformExpr(cn.consequent), alternate: this.transformExpr(cn.alternate) };
      }
      case 'Array': {
        const ar = e as any;
        return { kind: 'array', elements: ar.elements.map((el: ExpressionNode) => this.transformExpr(el)) };
      }
      case 'Object': {
        const ob = e as any;
        return { kind: 'object', properties: ob.properties.map((p: any) => ({ key: p.key, value: this.transformExpr(p.value) })) };
      }
      case 'Lambda': {
        const la = e as any;
        return { kind: 'lambda', params: la.parameters, body: this.transformExpr(la.body) };
      }
      default: return { kind: 'literal', value: { kind: 'null' } };
    }
  }

  private exprToValue(e: ExpressionNode): IRValue | undefined {
    if (e.type === 'Literal') {
      const l = e as any;
      return this.litToValue(l.value, l.dataType);
    }
    if (e.type === 'Array') {
      const ar = e as any;
      const els = ar.elements.map((el: ExpressionNode) => this.exprToValue(el)).filter((v: IRValue | undefined): v is IRValue => v !== undefined);
      return { kind: 'array', elements: els };
    }
    if (e.type === 'Object') {
      const ob = e as any;
      const props: Record<string, IRValue> = {};
      for (const p of ob.properties) {
        const v = this.exprToValue(p.value);
        if (v) props[p.key] = v;
      }
      return { kind: 'object', properties: props };
    }
    return undefined;
  }

  private litToValue(val: any, dtype: string): IRValue {
    if (dtype === 'string') return { kind: 'string', value: val };
    if (dtype === 'number') return { kind: 'number', value: val };
    if (dtype === 'boolean') return { kind: 'boolean', value: val };
    return { kind: 'null' };
  }
}

export function compileToIR(source: string): CompileToIRResult {
  return new IRCompiler().compile(source);
}
`;

export const RUNTIME_ENGINE_SOURCE = `import type { IR, IREntity, IRCommand, IRPolicy, IRExpression, IRValue, IRAction, IRType } from './types';

export interface RuntimeContext {
  user?: { id: string; role?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface EntityInstance {
  id: string;
  [key: string]: unknown;
}

export interface CommandResult {
  success: boolean;
  result?: unknown;
  error?: string;
  deniedBy?: string;
  guardFailure?: GuardFailure;
  emittedEvents: EmittedEvent[];
}

export interface GuardFailure {
  index: number;
  expression: IRExpression;
  formatted: string;
  resolved?: GuardResolvedValue[];
}

export interface GuardResolvedValue {
  expression: string;
  value: unknown;
}

export interface EmittedEvent {
  name: string;
  channel: string;
  payload: unknown;
  timestamp: number;
}

interface Store<T extends EntityInstance = EntityInstance> {
  getAll(): T[];
  getById(id: string): T | undefined;
  create(data: Partial<T>): T;
  update(id: string, data: Partial<T>): T | undefined;
  delete(id: string): boolean;
  clear(): void;
}

class MemoryStore<T extends EntityInstance> implements Store<T> {
  private items: Map<string, T> = new Map();
  getAll(): T[] { return Array.from(this.items.values()); }
  getById(id: string): T | undefined { return this.items.get(id); }
  create(data: Partial<T>): T {
    const id = data.id || crypto.randomUUID();
    const item = { ...data, id } as T;
    this.items.set(id, item);
    return item;
  }
  update(id: string, data: Partial<T>): T | undefined {
    const existing = this.items.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data, id };
    this.items.set(id, updated);
    return updated;
  }
  delete(id: string): boolean { return this.items.delete(id); }
  clear(): void { this.items.clear(); }
}

class LocalStorageStore<T extends EntityInstance> implements Store<T> {
  constructor(private key: string) {}
  private load(): T[] {
    try { const d = localStorage.getItem(this.key); return d ? JSON.parse(d) : []; }
    catch { return []; }
  }
  private save(items: T[]): void { localStorage.setItem(this.key, JSON.stringify(items)); }
  getAll(): T[] { return this.load(); }
  getById(id: string): T | undefined { return this.load().find(i => i.id === id); }
  create(data: Partial<T>): T {
    const items = this.load();
    const id = data.id || crypto.randomUUID();
    const item = { ...data, id } as T;
    items.push(item);
    this.save(items);
    return item;
  }
  update(id: string, data: Partial<T>): T | undefined {
    const items = this.load();
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) return undefined;
    items[idx] = { ...items[idx], ...data, id };
    this.save(items);
    return items[idx];
  }
  delete(id: string): boolean {
    const items = this.load();
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) return false;
    items.splice(idx, 1);
    this.save(items);
    return true;
  }
  clear(): void { localStorage.removeItem(this.key); }
}

type EventListener = (event: EmittedEvent) => void;

export class RuntimeEngine {
  private ir: IR;
  private context: RuntimeContext;
  private stores: Map<string, Store> = new Map();
  private eventListeners: EventListener[] = [];
  private eventLog: EmittedEvent[] = [];

  constructor(ir: IR, context: RuntimeContext = {}) {
    this.ir = ir;
    this.context = context;
    this.initStores();
  }

  private initStores(): void {
    for (const entity of this.ir.entities) {
      const cfg = this.ir.stores.find(s => s.entity === entity.name);
      let store: Store;
      if (cfg?.target === 'localStorage') {
        const key = cfg.config.key?.kind === 'string' ? cfg.config.key.value : \`\${entity.name.toLowerCase()}s\`;
        store = new LocalStorageStore(key);
      } else {
        store = new MemoryStore();
      }
      this.stores.set(entity.name, store);
    }
  }

  getIR(): IR { return this.ir; }
  getContext(): RuntimeContext { return this.context; }
  setContext(ctx: Partial<RuntimeContext>): void { this.context = { ...this.context, ...ctx }; }
  replaceContext(ctx: RuntimeContext): void { this.context = { ...ctx }; }
  getEntities(): IREntity[] { return this.ir.entities; }
  getEntity(name: string): IREntity | undefined { return this.ir.entities.find(e => e.name === name); }

  getCommands(): IRCommand[] {
    return this.ir.commands;
  }

  getCommand(name: string, entityName?: string): IRCommand | undefined {
    if (entityName) {
      const entity = this.getEntity(entityName);
      if (!entity || !entity.commands.includes(name)) return undefined;
      return this.ir.commands.find(c => c.name === name && c.entity === entityName);
    }
    return this.ir.commands.find(c => c.name === name);
  }

  getPolicies(): IRPolicy[] { return this.ir.policies; }
  getStore(entityName: string): Store | undefined { return this.stores.get(entityName); }
  getAllInstances(entityName: string): EntityInstance[] { return this.stores.get(entityName)?.getAll() || []; }
  getInstance(entityName: string, id: string): EntityInstance | undefined { return this.stores.get(entityName)?.getById(id); }

  createInstance(entityName: string, data: Partial<EntityInstance>): EntityInstance | undefined {
    const entity = this.getEntity(entityName);
    if (!entity) return undefined;
    const defaults: Record<string, unknown> = {};
    for (const prop of entity.properties) {
      defaults[prop.name] = prop.defaultValue ? this.valueToJs(prop.defaultValue) : this.defaultFor(prop.type);
    }
    return this.stores.get(entityName)?.create({ ...defaults, ...data });
  }

  updateInstance(entityName: string, id: string, data: Partial<EntityInstance>): EntityInstance | undefined {
    return this.stores.get(entityName)?.update(id, data);
  }

  deleteInstance(entityName: string, id: string): boolean {
    return this.stores.get(entityName)?.delete(id) ?? false;
  }

  async runCommand(
    commandName: string,
    input: Record<string, unknown>,
    options: { entityName?: string; instanceId?: string } = {}
  ): Promise<CommandResult> {
    const cmd = this.getCommand(commandName, options.entityName);
    if (!cmd) return { success: false, error: \`Command '\${commandName}' not found\`, emittedEvents: [] };

    const instance = options.instanceId && options.entityName
      ? this.getInstance(options.entityName, options.instanceId) : undefined;
    const ctx = this.buildCtx(input, instance);

    const policyResult = this.checkPolicies(cmd, ctx);
    if (!policyResult.ok) {
      return { success: false, error: policyResult.msg, deniedBy: policyResult.policy, emittedEvents: [] };
    }

    for (let i = 0; i < cmd.guards.length; i += 1) {
      const guard = cmd.guards[i];
      if (!this.evalExpr(guard, ctx)) {
        return {
          success: false,
          error: \`Guard failed for '\${commandName}'\`,
          guardFailure: {
            index: i + 1,
            expression: guard,
            formatted: this.formatExpr(guard),
            resolved: this.resolveExpressionValues(guard, ctx),
          },
          emittedEvents: [],
        };
      }
    }

    const emitted: EmittedEvent[] = [];
    let result: unknown;

    for (const action of cmd.actions) {
      result = this.execAction(action, ctx, options);
      if (action.kind === 'mutate' && options.instanceId && options.entityName) {
        const updated = this.getInstance(options.entityName, options.instanceId);
        ctx.self = updated;
        ctx.this = updated;
      }
    }

    for (const eventName of cmd.emits) {
      const eventDef = this.ir.events.find(e => e.name === eventName);
      const ev: EmittedEvent = {
        name: eventName,
        channel: eventDef?.channel || eventName,
        payload: { ...input, result },
        timestamp: Date.now(),
      };
      emitted.push(ev);
      this.eventLog.push(ev);
      this.notifyListeners(ev);
    }

    return { success: true, result, emittedEvents: emitted };
  }

  private buildCtx(input: Record<string, unknown>, instance?: EntityInstance): Record<string, unknown> {
    return { ...input, self: instance, this: instance, user: this.context.user, context: this.context };
  }

  private checkPolicies(cmd: IRCommand, ctx: Record<string, unknown>): { ok: boolean; policy?: string; msg?: string } {
    const relevant = this.ir.policies.filter(p => {
      if (p.entity && cmd.entity && p.entity !== cmd.entity) return false;
      if (p.action !== 'all' && p.action !== 'execute') return false;
      return true;
    });
    for (const p of relevant) {
      if (!this.evalExpr(p.expression, ctx)) {
        return { ok: false, policy: p.name, msg: p.message || \`Denied by '\${p.name}'\` };
      }
    }
    return { ok: true };
  }

  private execAction(action: IRAction, ctx: Record<string, unknown>, opts: { entityName?: string; instanceId?: string }): unknown {
    const val = this.evalExpr(action.expression, ctx);
    if (action.kind === 'mutate' && action.target && opts.instanceId && opts.entityName) {
      this.updateInstance(opts.entityName, opts.instanceId, { [action.target]: val });
    }
    if (action.kind === 'emit' || action.kind === 'publish') {
      const ev: EmittedEvent = { name: 'action_event', channel: 'default', payload: val, timestamp: Date.now() };
      this.eventLog.push(ev);
      this.notifyListeners(ev);
    }
    return val;
  }

  evalExpr(expr: IRExpression, ctx: Record<string, unknown>): unknown {
    switch (expr.kind) {
      case 'literal': return this.valueToJs(expr.value);
      case 'identifier': {
        if (expr.name in ctx) return ctx[expr.name];
        if (expr.name === 'true') return true;
        if (expr.name === 'false') return false;
        if (expr.name === 'null') return null;
        return undefined;
      }
      case 'member': {
        const obj = this.evalExpr(expr.object, ctx);
        return obj && typeof obj === 'object' ? (obj as any)[expr.property] : undefined;
      }
      case 'binary': {
        const l = this.evalExpr(expr.left, ctx);
        const r = this.evalExpr(expr.right, ctx);
        return this.binOp(expr.operator, l, r);
      }
      case 'unary': {
        const op = this.evalExpr(expr.operand, ctx);
        if (expr.operator === '!' || expr.operator === 'not') return !op;
        if (expr.operator === '-') return -(op as number);
        return op;
      }
      case 'call': {
        const fn = this.evalExpr(expr.callee, ctx);
        const args = expr.args.map(a => this.evalExpr(a, ctx));
        return typeof fn === 'function' ? fn(...args) : undefined;
      }
      case 'conditional': return this.evalExpr(expr.condition, ctx) ? this.evalExpr(expr.consequent, ctx) : this.evalExpr(expr.alternate, ctx);
      case 'array': return expr.elements.map(e => this.evalExpr(e, ctx));
      case 'object': {
        const res: Record<string, unknown> = {};
        for (const p of expr.properties) res[p.key] = this.evalExpr(p.value, ctx);
        return res;
      }
      case 'lambda': return (...args: unknown[]) => {
        const local = { ...ctx };
        expr.params.forEach((p, i) => { local[p] = args[i]; });
        return this.evalExpr(expr.body, local);
      };
      default: return undefined;
    }
  }

  private formatExpr(expr: IRExpression): string {
    switch (expr.kind) {
      case 'literal':
        return this.formatValue(expr.value);
      case 'identifier':
        return expr.name;
      case 'member':
        return this.formatExpr(expr.object) + '.' + expr.property;
      case 'binary':
        return this.formatExpr(expr.left) + ' ' + expr.operator + ' ' + this.formatExpr(expr.right);
      case 'unary':
        return expr.operator === 'not'
          ? 'not ' + this.formatExpr(expr.operand)
          : expr.operator + this.formatExpr(expr.operand);
      case 'call':
        return this.formatExpr(expr.callee) + '(' + expr.args.map(a => this.formatExpr(a)).join(', ') + ')';
      case 'conditional':
        return this.formatExpr(expr.condition) + ' ? ' + this.formatExpr(expr.consequent) + ' : ' + this.formatExpr(expr.alternate);
      case 'array':
        return '[' + expr.elements.map(el => this.formatExpr(el)).join(', ') + ']';
      case 'object':
        return '{ ' + expr.properties.map(p => p.key + ': ' + this.formatExpr(p.value)).join(', ') + ' }';
      case 'lambda':
        return '(' + expr.params.join(', ') + ') => ' + this.formatExpr(expr.body);
      default:
        return '<expr>';
    }
  }

  private formatValue(value: IRValue): string {
    switch (value.kind) {
      case 'string':
        return JSON.stringify(value.value);
      case 'number':
        return String(value.value);
      case 'boolean':
        return String(value.value);
      case 'null':
        return 'null';
      case 'array':
        return '[' + value.elements.map(el => this.formatValue(el)).join(', ') + ']';
      case 'object':
        return '{ ' + Object.entries(value.properties).map(([k, v]) => k + ': ' + this.formatValue(v)).join(', ') + ' }';
      default:
        return 'null';
    }
  }

  private resolveExpressionValues(expr: IRExpression, ctx: Record<string, unknown>): GuardResolvedValue[] {
    const entries: GuardResolvedValue[] = [];
    const seen = new Set<string>();

    const addEntry = (node: IRExpression) => {
      const formatted = this.formatExpr(node);
      if (seen.has(formatted)) return;
      seen.add(formatted);
      let value: unknown;
      try {
        value = this.evalExpr(node, ctx);
      } catch {
        value = undefined;
      }
      entries.push({ expression: formatted, value });
    };

    const walk = (node: IRExpression): void => {
      switch (node.kind) {
        case 'literal':
        case 'identifier':
        case 'member':
          addEntry(node);
          return;
        case 'binary':
          walk(node.left);
          walk(node.right);
          return;
        case 'unary':
          walk(node.operand);
          return;
        case 'call':
          node.args.forEach(walk);
          return;
        case 'conditional':
          walk(node.condition);
          walk(node.consequent);
          walk(node.alternate);
          return;
        case 'array':
          node.elements.forEach(walk);
          return;
        case 'object':
          node.properties.forEach(p => walk(p.value));
          return;
        case 'lambda':
          walk(node.body);
          return;
        default:
          return;
      }
    };

    walk(expr);
    return entries;
  }

  private binOp(op: string, l: unknown, r: unknown): unknown {
    switch (op) {
      case '+': return typeof l === 'string' || typeof r === 'string' ? String(l) + String(r) : (l as number) + (r as number);
      case '-': return (l as number) - (r as number);
      case '*': return (l as number) * (r as number);
      case '/': return (l as number) / (r as number);
      case '%': return (l as number) % (r as number);
      case '==': case 'is': return l === r;
      case '!=': return l !== r;
      case '<': return (l as number) < (r as number);
      case '>': return (l as number) > (r as number);
      case '<=': return (l as number) <= (r as number);
      case '>=': return (l as number) >= (r as number);
      case '&&': case 'and': return Boolean(l) && Boolean(r);
      case '||': case 'or': return Boolean(l) || Boolean(r);
      case 'in': return Array.isArray(r) ? r.includes(l) : typeof r === 'string' && (r as string).includes(String(l));
      case 'contains': return Array.isArray(l) ? l.includes(r) : typeof l === 'string' && l.includes(String(r));
      default: return undefined;
    }
  }

  private valueToJs(v: IRValue): unknown {
    switch (v.kind) {
      case 'string': return v.value;
      case 'number': return v.value;
      case 'boolean': return v.value;
      case 'null': return null;
      case 'array': return v.elements.map(e => this.valueToJs(e));
      case 'object': {
        const res: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(v.properties)) res[k] = this.valueToJs(val);
        return res;
      }
    }
  }

  private defaultFor(t: IRType): unknown {
    if (t.nullable) return null;
    switch (t.name) {
      case 'string': return '';
      case 'number': return 0;
      case 'boolean': return false;
      case 'list': return [];
      default: return null;
    }
  }

  onEvent(listener: EventListener): () => void {
    this.eventListeners.push(listener);
    return () => {
      const idx = this.eventListeners.indexOf(listener);
      if (idx !== -1) this.eventListeners.splice(idx, 1);
    };
  }

  private notifyListeners(event: EmittedEvent): void {
    for (const l of this.eventListeners) { try { l(event); } catch {} }
  }

  getEventLog(): EmittedEvent[] { return [...this.eventLog]; }
  clearEventLog(): void { this.eventLog = []; }

  serialize(): { ir: IR; context: RuntimeContext; stores: Record<string, EntityInstance[]> } {
    const storeData: Record<string, EntityInstance[]> = {};
    for (const [name, store] of this.stores) storeData[name] = store.getAll();
    return { ir: this.ir, context: this.context, stores: storeData };
  }

  restore(data: { stores: Record<string, EntityInstance[]> }): void {
    for (const [name, instances] of Object.entries(data.stores)) {
      const store = this.stores.get(name);
      if (store) {
        store.clear();
        for (const inst of instances) store.create(inst);
      }
    }
  }
}
`;
