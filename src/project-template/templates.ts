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

input, textarea {
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: #1e293b;
  color: #e2e8f0;
  font-size: 14px;
}

input:focus, textarea:focus {
  outline: none;
  border-color: #0ea5e9;
}

textarea {
  resize: vertical;
  font-family: 'Monaco', 'Menlo', monospace;
}`;
}

export function generateAppTsx(): string {
  return `import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Parser } from './manifest/compiler/parser';
import { StandaloneGenerator } from './manifest/compiler/generator';
import type { ManifestProgram, EntityNode, CommandNode, StoreNode, OutboxEventNode, PolicyNode, ModuleNode } from './manifest/compiler/types';
import manifestSource from './manifest/source.manifest?raw';

const EXAMPLE_MANIFEST = \`// Example Manifest - Task Manager
entity Task {
  property required id: string
  property required title: string
  property description: string = ""
  property completed: boolean = false
  property priority: number = 1
  property createdAt: string

  computed isHighPriority: boolean = this.priority >= 3

  constraint validPriority: this.priority >= 1 and this.priority <= 5 "Priority must be 1-5"

  command complete() {
    mutate completed = true
    emit taskCompleted
  }

  command setPriority(level: number) {
    guard level >= 1 and level <= 5
    mutate priority = level
  }

  on create => mutate createdAt = Date.now().toString()
}

store Task in memory

entity User {
  property required id: string
  property required email: string
  property name: string = ""
  property role: string = "user"

  hasMany tasks: Task
}

store User in localStorage {
  key: "users"
}

event TaskCompleted: "task.completed" {
  taskId: string
  completedAt: string
}

expose Task as rest {
  list, get, create, update, delete
}
\`;

interface CompileResult {
  success: boolean;
  program: ManifestProgram | null;
  errors: Array<{ message: string; position?: { line: number; column: number }; severity: string }>;
  compileTime: number;
  generatedCode: string;
}

type TreeNodeType = 'module' | 'entity' | 'command' | 'store' | 'event' | 'policy' | 'property' | 'computed' | 'relationship' | 'behavior' | 'constraint';

interface TreeNode {
  id: string;
  name: string;
  type: TreeNodeType;
  children?: TreeNode[];
  data?: unknown;
}

function RuntimeStatus({ result, manifestPath, onRecompile, isCompiling }: {
  result: CompileResult | null;
  manifestPath: string;
  onRecompile: () => void;
  isCompiling: boolean;
}) {
  const program = result?.program;

  return (
    <div className="runtime-status">
      <div className="status-header">
        <div className="status-indicator">
          <span className={\`dot \${result?.success ? 'success' : result ? 'error' : 'pending'}\`} />
          <span className="status-text">
            {result?.success ? 'Compiled' : result ? 'Errors' : 'Not compiled'}
          </span>
        </div>
        <button
          className="recompile-btn"
          onClick={onRecompile}
          disabled={isCompiling}
        >
          {isCompiling ? 'Compiling...' : 'Recompile'}
        </button>
      </div>

      <div className="status-details">
        <div className="detail-row">
          <span className="label">Manifest:</span>
          <span className="value mono">{manifestPath}</span>
        </div>
        {result && (
          <>
            <div className="detail-row">
              <span className="label">Compile time:</span>
              <span className="value">{result.compileTime}ms</span>
            </div>
            {program && (
              <div className="counts">
                <div className="count-item">
                  <span className="count-num">{program.modules.length}</span>
                  <span className="count-label">Modules</span>
                </div>
                <div className="count-item">
                  <span className="count-num">{program.entities.length}</span>
                  <span className="count-label">Entities</span>
                </div>
                <div className="count-item">
                  <span className="count-num">{program.commands.length}</span>
                  <span className="count-label">Commands</span>
                </div>
                <div className="count-item">
                  <span className="count-num">{program.events.length}</span>
                  <span className="count-label">Events</span>
                </div>
                <div className="count-item">
                  <span className="count-num">{program.stores.length}</span>
                  <span className="count-label">Stores</span>
                </div>
                <div className="count-item">
                  <span className="count-num">{program.policies.length}</span>
                  <span className="count-label">Policies</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {result && !result.success && result.errors.length > 0 && (
        <div className="errors-panel">
          <div className="errors-title">Compilation Errors</div>
          {result.errors.map((err, i) => (
            <div key={i} className="error-item">
              <span className="error-icon">!</span>
              <span className="error-msg">{err.message}</span>
              {err.position && (
                <span className="error-pos">Line {err.position.line}:{err.position.column}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ModelExplorer({ program, selectedNode, onSelectNode }: {
  program: ManifestProgram | null;
  selectedNode: TreeNode | null;
  onSelectNode: (node: TreeNode | null) => void;
}) {
  const tree = useMemo(() => {
    if (!program) return [];
    const nodes: TreeNode[] = [];

    if (program.modules.length > 0) {
      nodes.push({
        id: 'modules',
        name: 'Modules',
        type: 'module',
        children: program.modules.map(m => ({
          id: \`module-\${m.name}\`,
          name: m.name,
          type: 'module' as TreeNodeType,
          data: m,
          children: buildEntityChildren(m.entities)
        }))
      });
    }

    if (program.entities.length > 0) {
      nodes.push({
        id: 'entities',
        name: 'Entities',
        type: 'entity',
        children: buildEntityChildren(program.entities)
      });
    }

    if (program.commands.length > 0) {
      nodes.push({
        id: 'commands',
        name: 'Commands',
        type: 'command',
        children: program.commands.map(c => ({
          id: \`cmd-\${c.name}\`,
          name: c.name,
          type: 'command' as TreeNodeType,
          data: c
        }))
      });
    }

    if (program.events.length > 0) {
      nodes.push({
        id: 'events',
        name: 'Events',
        type: 'event',
        children: program.events.map(e => ({
          id: \`event-\${e.name}\`,
          name: e.name,
          type: 'event' as TreeNodeType,
          data: e
        }))
      });
    }

    if (program.stores.length > 0) {
      nodes.push({
        id: 'stores',
        name: 'Stores',
        type: 'store',
        children: program.stores.map(s => ({
          id: \`store-\${s.entity}\`,
          name: \`\${s.entity} -> \${s.target}\`,
          type: 'store' as TreeNodeType,
          data: s
        }))
      });
    }

    if (program.policies.length > 0) {
      nodes.push({
        id: 'policies',
        name: 'Policies',
        type: 'policy',
        children: program.policies.map(p => ({
          id: \`policy-\${p.name}\`,
          name: p.name,
          type: 'policy' as TreeNodeType,
          data: p
        }))
      });
    }

    return nodes;
  }, [program]);

  function buildEntityChildren(entities: EntityNode[]): TreeNode[] {
    return entities.map(e => ({
      id: \`entity-\${e.name}\`,
      name: e.name,
      type: 'entity' as TreeNodeType,
      data: e,
      children: [
        ...(e.properties.length > 0 ? [{
          id: \`\${e.name}-props\`,
          name: 'Properties',
          type: 'property' as TreeNodeType,
          children: e.properties.map(p => ({
            id: \`\${e.name}-prop-\${p.name}\`,
            name: \`\${p.name}: \${p.dataType.name}\`,
            type: 'property' as TreeNodeType,
            data: p
          }))
        }] : []),
        ...(e.computedProperties.length > 0 ? [{
          id: \`\${e.name}-computed\`,
          name: 'Computed',
          type: 'computed' as TreeNodeType,
          children: e.computedProperties.map(c => ({
            id: \`\${e.name}-computed-\${c.name}\`,
            name: \`\${c.name}: \${c.dataType.name}\`,
            type: 'computed' as TreeNodeType,
            data: c
          }))
        }] : []),
        ...(e.relationships.length > 0 ? [{
          id: \`\${e.name}-rels\`,
          name: 'Relationships',
          type: 'relationship' as TreeNodeType,
          children: e.relationships.map(r => ({
            id: \`\${e.name}-rel-\${r.name}\`,
            name: \`\${r.kind} \${r.name}: \${r.target}\`,
            type: 'relationship' as TreeNodeType,
            data: r
          }))
        }] : []),
        ...(e.commands.length > 0 ? [{
          id: \`\${e.name}-cmds\`,
          name: 'Commands',
          type: 'command' as TreeNodeType,
          children: e.commands.map(c => ({
            id: \`\${e.name}-cmd-\${c.name}\`,
            name: c.name,
            type: 'command' as TreeNodeType,
            data: c
          }))
        }] : []),
        ...(e.behaviors.length > 0 ? [{
          id: \`\${e.name}-behaviors\`,
          name: 'Behaviors',
          type: 'behavior' as TreeNodeType,
          children: e.behaviors.map(b => ({
            id: \`\${e.name}-behavior-\${b.trigger.event}\`,
            name: \`on \${b.trigger.event}\`,
            type: 'behavior' as TreeNodeType,
            data: b
          }))
        }] : []),
        ...(e.constraints.length > 0 ? [{
          id: \`\${e.name}-constraints\`,
          name: 'Constraints',
          type: 'constraint' as TreeNodeType,
          children: e.constraints.map(c => ({
            id: \`\${e.name}-constraint-\${c.name}\`,
            name: c.name,
            type: 'constraint' as TreeNodeType,
            data: c
          }))
        }] : [])
      ].filter(c => c.children && c.children.length > 0)
    }));
  }

  const [expanded, setExpanded] = useState<Set<string>>(new Set(['entities', 'stores']));

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expanded.has(node.id);
    const isSelected = selectedNode?.id === node.id;

    return (
      <div key={node.id}>
        <div
          className={\`tree-node \${isSelected ? 'selected' : ''}\`}
          style={{ paddingLeft: \`\${depth * 16 + 8}px\` }}
          onClick={() => {
            if (hasChildren) toggleExpand(node.id);
            if (node.data) onSelectNode(node);
          }}
        >
          {hasChildren && (
            <span className={\`expand-icon \${isExpanded ? 'expanded' : ''}\`}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              </svg>
            </span>
          )}
          {!hasChildren && <span className="expand-icon-placeholder" />}
          <span className={\`node-icon \${node.type}\`}>{getNodeIcon(node.type)}</span>
          <span className="node-name">{node.name}</span>
        </div>
        {hasChildren && isExpanded && (
          <div className="tree-children">
            {node.children!.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="model-explorer">
      <div className="explorer-tree">
        <div className="tree-header">Model Structure</div>
        {tree.length === 0 ? (
          <div className="tree-empty">No model loaded</div>
        ) : (
          tree.map(node => renderNode(node))
        )}
      </div>
      <div className="explorer-detail">
        <div className="detail-header">
          {selectedNode ? selectedNode.name : 'Select a node'}
        </div>
        <div className="detail-content">
          {selectedNode?.data ? (
            <pre>{JSON.stringify(selectedNode.data, null, 2)}</pre>
          ) : (
            <div className="detail-empty">Select a node from the tree to view its details</div>
          )}
        </div>
      </div>
    </div>
  );
}

function getNodeIcon(type: TreeNodeType): string {
  const icons: Record<TreeNodeType, string> = {
    module: 'M',
    entity: 'E',
    command: 'C',
    store: 'S',
    event: 'V',
    policy: 'P',
    property: 'p',
    computed: 'c',
    relationship: 'r',
    behavior: 'b',
    constraint: 'x'
  };
  return icons[type] || '?';
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
      <p>
        Your manifest file has no entity declarations. Entities are the core building blocks
        of a Manifest application - they define your data models with properties, behaviors,
        commands, and constraints.
      </p>
      <button className="insert-example-btn" onClick={onInsertExample}>
        Insert Example Manifest
      </button>
      <p className="hint">
        This will replace your current manifest with a sample Task Manager spec.
      </p>
    </div>
  );
}

function EntityPanel({ entity, store }: { entity: EntityNode; store: StoreNode | undefined }) {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [formData, setFormData] = useState<string>('{}');

  const loadItems = useCallback(async () => {
    const key = store?.target === 'localStorage'
      ? (store.config?.key as any)?.value || entity.name.toLowerCase() + 's'
      : null;
    if (key) {
      try {
        const data = localStorage.getItem(key);
        if (data) setItems(JSON.parse(data));
      } catch {}
    }
  }, [entity.name, store]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleCreate = () => {
    try {
      const newItem = JSON.parse(formData);
      newItem.id = newItem.id || crypto.randomUUID();
      const newItems = [...items, newItem];
      setItems(newItems);
      if (store?.target === 'localStorage') {
        const key = (store.config?.key as any)?.value || entity.name.toLowerCase() + 's';
        localStorage.setItem(key, JSON.stringify(newItems));
      }
      setFormData('{}');
    } catch (err: any) {
      alert('Invalid JSON: ' + err.message);
    }
  };

  const handleDelete = (id: string) => {
    const newItems = items.filter(i => i.id !== id);
    setItems(newItems);
    if (store?.target === 'localStorage') {
      const key = (store.config?.key as any)?.value || entity.name.toLowerCase() + 's';
      localStorage.setItem(key, JSON.stringify(newItems));
    }
  };

  return (
    <div className="entity-panel">
      <h2>{entity.name}</h2>
      <div className="entity-meta">
        {entity.properties.length} properties
        {entity.commands.length > 0 && \` | \${entity.commands.length} commands\`}
        {store && \` | stored in \${store.target}\`}
      </div>
      <div className="create-form">
        <textarea
          value={formData}
          onChange={e => setFormData(e.target.value)}
          placeholder='{"title": "My task", "completed": false}'
          rows={3}
        />
        <button className="btn-primary" onClick={handleCreate}>Create</button>
      </div>
      <div className="items-list">
        {items.length === 0 ? (
          <div className="items-empty">No {entity.name.toLowerCase()}s yet. Create one above.</div>
        ) : (
          items.map((item, i) => (
            <div key={(item.id as string) || i} className="item-card">
              <pre>{JSON.stringify(item, null, 2)}</pre>
              <button className="btn-danger" onClick={() => handleDelete(item.id as string)}>
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [source, setSource] = useState<string>(manifestSource);
  const [result, setResult] = useState<CompileResult | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [activeTab, setActiveTab] = useState<'status' | 'explorer' | 'entities'>('status');
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);

  const compile = useCallback((src: string) => {
    setIsCompiling(true);
    const start = performance.now();

    setTimeout(() => {
      try {
        const parser = new Parser();
        const { program, errors } = parser.parse(src);

        let generatedCode = '';
        if (errors.length === 0) {
          const generator = new StandaloneGenerator();
          generatedCode = generator.generate(program);
        }

        const compileTime = Math.round(performance.now() - start);

        setResult({
          success: errors.length === 0,
          program,
          errors,
          compileTime,
          generatedCode
        });

        if (errors.length === 0 && program.entities.length > 0) {
          setSelectedEntity(program.entities[0].name);
        }
      } catch (err: any) {
        setResult({
          success: false,
          program: null,
          errors: [{ message: err.message, severity: 'error' }],
          compileTime: Math.round(performance.now() - start),
          generatedCode: ''
        });
      }
      setIsCompiling(false);
    }, 50);
  }, []);

  useEffect(() => {
    compile(source);
  }, []);

  const handleRecompile = () => {
    compile(source);
  };

  const handleInsertExample = () => {
    setSource(EXAMPLE_MANIFEST);
    compile(EXAMPLE_MANIFEST);
    setActiveTab('entities');
  };

  const program = result?.program;
  const entities = program?.entities || [];
  const stores = program?.stores || [];
  const hasEntities = entities.length > 0;

  const getStoreForEntity = (entityName: string): StoreNode | undefined => {
    return stores.find(s => s.entity === entityName);
  };

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
          <button
            className={\`nav-btn \${activeTab === 'status' ? 'active' : ''}\`}
            onClick={() => setActiveTab('status')}
          >
            Status
          </button>
          <button
            className={\`nav-btn \${activeTab === 'explorer' ? 'active' : ''}\`}
            onClick={() => setActiveTab('explorer')}
          >
            Explorer
          </button>
          <button
            className={\`nav-btn \${activeTab === 'entities' ? 'active' : ''}\`}
            onClick={() => setActiveTab('entities')}
          >
            Entities
          </button>
        </nav>
      </header>

      <div className="content">
        <aside className="sidebar">
          <RuntimeStatus
            result={result}
            manifestPath="manifest/source.manifest"
            onRecompile={handleRecompile}
            isCompiling={isCompiling}
          />
        </aside>

        <main className="main">
          {activeTab === 'status' && (
            <div className="tab-content">
              <h2>Compilation Result</h2>
              {result?.success ? (
                <div className="code-preview">
                  <div className="code-header">Generated TypeScript</div>
                  <pre className="code-block">{result.generatedCode || '// No code generated'}</pre>
                </div>
              ) : (
                <div className="status-message">
                  {result ? 'Fix errors to see generated code' : 'Compiling...'}
                </div>
              )}
            </div>
          )}

          {activeTab === 'explorer' && (
            <ModelExplorer
              program={program || null}
              selectedNode={selectedNode}
              onSelectNode={setSelectedNode}
            />
          )}

          {activeTab === 'entities' && (
            <div className="tab-content">
              {!hasEntities ? (
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
                      store={getStoreForEntity(selectedEntity)}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </main>
      </div>

      <style>{\`
        .app {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 24px;
          background: #1e293b;
          border-bottom: 1px solid #334155;
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 18px;
          font-weight: 600;
        }

        .nav {
          display: flex;
          gap: 4px;
        }

        .nav-btn {
          background: transparent;
          color: #94a3b8;
          padding: 8px 16px;
          border-radius: 6px;
        }

        .nav-btn:hover {
          background: #334155;
        }

        .nav-btn.active {
          background: #0ea5e9;
          color: white;
        }

        .content {
          flex: 1;
          display: flex;
          overflow: hidden;
        }

        .sidebar {
          width: 320px;
          flex-shrink: 0;
          border-right: 1px solid #334155;
          overflow-y: auto;
          background: #0f172a;
        }

        .main {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
        }

        /* Runtime Status */
        .runtime-status {
          padding: 16px;
        }

        .status-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .status-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #475569;
        }

        .dot.success {
          background: #10b981;
          box-shadow: 0 0 8px #10b98166;
        }

        .dot.error {
          background: #ef4444;
          box-shadow: 0 0 8px #ef444466;
        }

        .dot.pending {
          background: #f59e0b;
        }

        .status-text {
          font-weight: 500;
        }

        .recompile-btn {
          background: #334155;
          color: #e2e8f0;
          padding: 6px 12px;
          font-size: 13px;
        }

        .recompile-btn:hover:not(:disabled) {
          background: #475569;
        }

        .status-details {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
        }

        .label {
          color: #64748b;
        }

        .value {
          color: #e2e8f0;
        }

        .mono {
          font-family: 'Monaco', 'Menlo', monospace;
          font-size: 12px;
        }

        .counts {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid #334155;
        }

        .count-item {
          text-align: center;
          padding: 8px;
          background: #1e293b;
          border-radius: 6px;
        }

        .count-num {
          display: block;
          font-size: 20px;
          font-weight: 600;
          color: #0ea5e9;
        }

        .count-label {
          font-size: 11px;
          color: #64748b;
          text-transform: uppercase;
        }

        .errors-panel {
          margin-top: 16px;
          padding: 12px;
          background: #7f1d1d33;
          border: 1px solid #ef444433;
          border-radius: 8px;
        }

        .errors-title {
          font-weight: 500;
          color: #fca5a5;
          margin-bottom: 8px;
          font-size: 13px;
        }

        .error-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 13px;
          padding: 4px 0;
        }

        .error-icon {
          width: 18px;
          height: 18px;
          background: #ef4444;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: bold;
          flex-shrink: 0;
        }

        .error-msg {
          color: #fca5a5;
          flex: 1;
        }

        .error-pos {
          color: #94a3b8;
          font-family: monospace;
          font-size: 11px;
        }

        /* Model Explorer */
        .model-explorer {
          display: flex;
          height: calc(100vh - 140px);
          background: #1e293b;
          border-radius: 8px;
          overflow: hidden;
        }

        .explorer-tree {
          width: 280px;
          border-right: 1px solid #334155;
          overflow-y: auto;
        }

        .tree-header {
          padding: 12px 16px;
          font-weight: 500;
          border-bottom: 1px solid #334155;
          background: #0f172a;
        }

        .tree-empty {
          padding: 24px;
          text-align: center;
          color: #64748b;
        }

        .tree-node {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px 8px;
          cursor: pointer;
          font-size: 13px;
        }

        .tree-node:hover {
          background: #334155;
        }

        .tree-node.selected {
          background: #0ea5e933;
        }

        .expand-icon {
          width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #64748b;
          transition: transform 0.15s;
        }

        .expand-icon.expanded {
          transform: rotate(90deg);
        }

        .expand-icon-placeholder {
          width: 16px;
        }

        .node-icon {
          width: 18px;
          height: 18px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: bold;
          flex-shrink: 0;
        }

        .node-icon.entity { background: #0ea5e9; color: white; }
        .node-icon.module { background: #8b5cf6; color: white; }
        .node-icon.command { background: #10b981; color: white; }
        .node-icon.store { background: #f59e0b; color: white; }
        .node-icon.event { background: #ec4899; color: white; }
        .node-icon.policy { background: #ef4444; color: white; }
        .node-icon.property { background: #475569; color: white; }
        .node-icon.computed { background: #06b6d4; color: white; }
        .node-icon.relationship { background: #a855f7; color: white; }
        .node-icon.behavior { background: #84cc16; color: white; }
        .node-icon.constraint { background: #f97316; color: white; }

        .node-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .explorer-detail {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .detail-header {
          padding: 12px 16px;
          font-weight: 500;
          border-bottom: 1px solid #334155;
          background: #0f172a;
        }

        .detail-content {
          flex: 1;
          padding: 16px;
          overflow: auto;
        }

        .detail-content pre {
          font-size: 12px;
          line-height: 1.5;
          color: #94a3b8;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .detail-empty {
          color: #64748b;
          text-align: center;
          padding: 24px;
        }

        /* Empty State */
        .empty-state-panel {
          text-align: center;
          padding: 60px 40px;
          max-width: 500px;
          margin: 0 auto;
        }

        .empty-icon {
          margin-bottom: 24px;
        }

        .empty-state-panel h2 {
          font-size: 24px;
          margin-bottom: 16px;
          color: #f1f5f9;
        }

        .empty-state-panel p {
          color: #94a3b8;
          line-height: 1.6;
          margin-bottom: 24px;
        }

        .insert-example-btn {
          background: linear-gradient(135deg, #0ea5e9, #06b6d4);
          color: white;
          padding: 12px 24px;
          font-size: 15px;
          font-weight: 500;
        }

        .insert-example-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px #0ea5e933;
        }

        .hint {
          font-size: 13px;
          color: #64748b;
          margin-top: 12px;
        }

        /* Entity Panel */
        .tab-content h2 {
          font-size: 20px;
          margin-bottom: 20px;
          color: #f1f5f9;
        }

        .entity-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }

        .entity-tab {
          background: #334155;
          color: #94a3b8;
        }

        .entity-tab.active {
          background: #0ea5e9;
          color: white;
        }

        .entity-panel h2 {
          font-size: 20px;
          margin-bottom: 4px;
        }

        .entity-meta {
          font-size: 13px;
          color: #64748b;
          margin-bottom: 20px;
        }

        .create-form {
          display: flex;
          gap: 12px;
          margin-bottom: 24px;
          align-items: flex-start;
        }

        .create-form textarea {
          flex: 1;
          min-height: 80px;
        }

        .btn-primary {
          background: #0ea5e9;
          color: white;
          height: 40px;
        }

        .btn-danger {
          background: #ef4444;
          color: white;
          padding: 4px 8px;
          font-size: 12px;
        }

        .items-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .items-empty {
          text-align: center;
          padding: 40px;
          color: #64748b;
          background: #1e293b;
          border-radius: 8px;
        }

        .item-card {
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 8px;
          padding: 16px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }

        .item-card pre {
          font-size: 13px;
          color: #94a3b8;
          margin: 0;
          white-space: pre-wrap;
          flex: 1;
        }

        /* Code Preview */
        .code-preview {
          background: #1e293b;
          border-radius: 8px;
          overflow: hidden;
        }

        .code-header {
          padding: 10px 16px;
          background: #0f172a;
          font-size: 13px;
          font-weight: 500;
          border-bottom: 1px solid #334155;
        }

        .code-block {
          padding: 16px;
          font-size: 12px;
          line-height: 1.5;
          color: #94a3b8;
          max-height: 500px;
          overflow: auto;
          margin: 0;
        }

        .status-message {
          text-align: center;
          padding: 40px;
          color: #64748b;
        }
      \`}</style>
    </div>
  );
}`;
}

export function generateReadme(projectName: string): string {
  return `# ${projectName}

Generated by Manifest Compiler v2.0

## Quick Start

\`\`\`bash
npm install
npm run dev
\`\`\`

Then open http://localhost:5173 in your browser.

## Project Structure

- \`src/manifest/source.manifest\` - Original Manifest source
- \`src/manifest/generated.ts\` - Compiled TypeScript code
- \`src/manifest/runtime.ts\` - Manifest runtime library
- \`src/manifest/compiler/\` - Manifest compiler (lexer, parser, generator)
- \`src/App.tsx\` - React application UI with Runtime Status and Model Explorer
- \`src/main.tsx\` - Application entry point

## Features

### Runtime Status Panel
Always visible sidebar showing:
- Compilation status (success/error)
- Manifest file path
- Compile time
- Model counts (modules, entities, commands, events, stores, policies)
- Compilation errors with line numbers

### Model Explorer
Interactive tree view of your manifest model:
- Browse modules, entities, commands, events, stores, and policies
- View properties, computed fields, relationships, behaviors, and constraints
- See raw JSON structure for any selected node

### Entity Management
Create, view, and delete entity instances:
- Auto-generated forms based on entity definitions
- LocalStorage persistence when using \`store Entity in localStorage\`
- Real-time updates

### Recompilation
Click the "Recompile" button to reload and recompile the manifest source. If compilation
fails, the previous working model remains active.

## How It Works

This project includes the full Manifest compiler. On startup, the application:
1. Loads \`src/manifest/source.manifest\`
2. Parses and compiles it using the bundled compiler
3. Generates TypeScript code and displays the model structure
4. Renders interactive UI for entity management

## Build for Production

\`\`\`bash
npm run build
\`\`\`

Output will be in the \`dist/\` directory.
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
