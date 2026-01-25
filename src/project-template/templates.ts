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
      noUnusedLocals: true,
      noUnusedParameters: true,
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

button:hover {
  opacity: 0.9;
}

input {
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: #1e293b;
  color: #e2e8f0;
  font-size: 14px;
}

input:focus {
  outline: none;
  border-color: #0ea5e9;
}`;
}

export function generateAppTsx(entityNames: string[], hasStores: boolean): string {
  const imports = entityNames.length > 0
    ? `import { ${entityNames.join(', ')}${hasStores ? ', ' + entityNames.map(e => `${e}Store`).join(', ') : ''} } from './manifest/generated';`
    : '';

  const entityComponents = entityNames.map(name => `
function ${name}Panel() {
  const [items, setItems] = React.useState<any[]>([]);
  const [newItem, setNewItem] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    ${hasStores ? `const unsub = ${name}Store.onChange(setItems);
    setLoading(false);
    return unsub;` : `setLoading(false);`}
  }, []);

  const handleCreate = async () => {
    try {
      ${hasStores
        ? `await ${name}Store.create(newItem);`
        : `const instance = new ${name}(newItem);
      setItems(prev => [...prev, instance.toJSON()]);`}
      setNewItem({});
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    ${hasStores
      ? `await ${name}Store.delete(id);`
      : `setItems(prev => prev.filter(item => item.id !== id));`}
  };

  if (loading) return <div className="panel-loading">Loading...</div>;

  return (
    <div className="entity-panel">
      <h2>${name}</h2>
      <div className="create-form">
        <input
          placeholder="Enter JSON data..."
          value={JSON.stringify(newItem)}
          onChange={e => {
            try { setNewItem(JSON.parse(e.target.value)); } catch {}
          }}
        />
        <button onClick={handleCreate} className="btn-primary">Create</button>
      </div>
      <div className="items-list">
        {items.length === 0 ? (
          <div className="empty-state">No ${name.toLowerCase()}s yet</div>
        ) : (
          items.map((item, i) => (
            <div key={item.id || i} className="item-card">
              <pre>{JSON.stringify(item, null, 2)}</pre>
              <button onClick={() => handleDelete(item.id)} className="btn-danger">Delete</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}`).join('\n');

  return `import React from 'react';
${imports}

${entityComponents || `function WelcomePanel() {
  return (
    <div className="welcome-panel">
      <h2>Welcome to Manifest</h2>
      <p>Your compiled application is ready. Edit the source.manifest file and recompile to see your entities here.</p>
    </div>
  );
}`}

export default function App() {
  const [activeEntity, setActiveEntity] = React.useState<string | null>(${entityNames.length > 0 ? `'${entityNames[0]}'` : 'null'});

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
          <span>Manifest App</span>
        </div>
        <nav className="nav">
          ${entityNames.map(name => `<button
            className={\`nav-btn \${activeEntity === '${name}' ? 'active' : ''}\`}
            onClick={() => setActiveEntity('${name}')}
          >
            ${name}
          </button>`).join('\n          ') || '<span>No entities</span>'}
        </nav>
      </header>
      <main className="main">
        ${entityNames.map(name => `{activeEntity === '${name}' && <${name}Panel />}`).join('\n        ') || '<WelcomePanel />'}
      </main>
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
          padding: 16px 24px;
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
          gap: 8px;
        }
        .nav-btn {
          background: #334155;
          color: #94a3b8;
        }
        .nav-btn.active {
          background: #0ea5e9;
          color: white;
        }
        .main {
          flex: 1;
          padding: 24px;
        }
        .entity-panel h2 {
          font-size: 24px;
          margin-bottom: 20px;
          color: #f1f5f9;
        }
        .create-form {
          display: flex;
          gap: 12px;
          margin-bottom: 24px;
        }
        .create-form input {
          flex: 1;
          font-family: monospace;
        }
        .btn-primary {
          background: #0ea5e9;
          color: white;
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
        .item-card {
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 8px;
          padding: 16px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .item-card pre {
          font-size: 13px;
          color: #94a3b8;
          margin: 0;
          white-space: pre-wrap;
        }
        .empty-state {
          text-align: center;
          padding: 40px;
          color: #64748b;
        }
        .welcome-panel {
          text-align: center;
          padding: 60px 20px;
        }
        .welcome-panel h2 {
          font-size: 28px;
          margin-bottom: 12px;
        }
        .welcome-panel p {
          color: #94a3b8;
          max-width: 400px;
          margin: 0 auto;
        }
        .panel-loading {
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
- \`src/App.tsx\` - React application UI
- \`src/main.tsx\` - Application entry point

## How It Works

This project includes the full Manifest compiler. On startup, the application loads the
\`source.manifest\` file, compiles it using the bundled compiler, and renders a UI based
on the compiled entities.

To modify the application:
1. Edit \`src/manifest/source.manifest\`
2. The app will recompile and update automatically

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
