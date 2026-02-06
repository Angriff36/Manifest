import { useState, useCallback, useEffect, useRef } from 'react';
import { Play, FileCode, BookOpen, AlertCircle, CheckCircle, Code2, TreeDeciduous, ChevronDown, ChevronRight, Sparkles, Zap, Cpu, Layers, Server, TestTube, Package } from 'lucide-react';
import { ManifestCompiler, ManifestProgram, CompilationError } from './manifest/compiler';
import { examples } from './manifest/examples';
import { ArtifactsPanel } from './artifacts';

const compiler = new ManifestCompiler();

const KEYWORDS = ['entity', 'property', 'behavior', 'constraint', 'flow', 'effect', 'expose', 'compose', 'command', 'module', 'policy', 'store', 'event', 'computed', 'derived', 'hasMany', 'hasOne', 'belongsTo', 'ref', 'through', 'on', 'when', 'then', 'emit', 'mutate', 'compute', 'guard', 'publish', 'persist', 'as', 'from', 'to', 'with', 'where', 'connect', 'returns', 'string', 'number', 'boolean', 'list', 'map', 'any', 'void', 'true', 'false', 'null', 'required', 'unique', 'indexed', 'private', 'readonly', 'optional', 'rest', 'graphql', 'websocket', 'function', 'server', 'http', 'storage', 'timer', 'custom', 'memory', 'postgres', 'supabase', 'localStorage', 'read', 'write', 'delete', 'execute', 'all', 'allow', 'deny', 'and', 'or', 'not', 'is', 'in', 'contains', 'user', 'self', 'context'];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlight(code: string, lang: 'manifest' | 'ts'): string {
  const escaped = escapeHtml(code);
  const tokens: { start: number; end: number; className: string }[] = [];

  const addTokens = (regex: RegExp, className: string) => {
    let match;
    while ((match = regex.exec(escaped)) !== null) {
      tokens.push({ start: match.index, end: match.index + match[0].length, className });
    }
  };

  addTokens(/(\/\/[^\n]*)/g, 'text-gray-500');
  addTokens(/(\/\*[\s\S]*?\*\/)/g, 'text-gray-500');
  addTokens(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, 'text-amber-400');
  addTokens(/\b(\d+\.?\d*)\b/g, 'text-cyan-400');

  if (lang === 'manifest') {
    const kwRegex = new RegExp(`\\b(${KEYWORDS.join('|')})\\b`, 'g');
    addTokens(kwRegex, 'text-sky-400 font-medium');
    addTokens(/\b([A-Z][a-zA-Z0-9]*)\b/g, 'text-emerald-400');
  } else {
    const tsKw = ['class', 'interface', 'type', 'function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while', 'new', 'this', 'extends', 'export', 'import', 'async', 'await', 'try', 'catch', 'throw', 'private', 'public', 'get', 'set', 'implements'];
    addTokens(new RegExp(`\\b(${tsKw.join('|')})\\b`, 'g'), 'text-sky-400 font-medium');
    addTokens(/\b(string|number|boolean|any|void|null|undefined|true|false|Promise)\b/g, 'text-orange-400');
  }

  tokens.sort((a, b) => a.start - b.start);

  const filtered: typeof tokens = [];
  for (const token of tokens) {
    const overlaps = filtered.some(t =>
      (token.start >= t.start && token.start < t.end) ||
      (token.end > t.start && token.end <= t.end)
    );
    if (!overlaps) {
      filtered.push(token);
    }
  }

  let result = '';
  let pos = 0;
  for (const token of filtered) {
    if (token.start > pos) {
      result += escaped.slice(pos, token.start);
    }
    result += `<span class="${token.className}">${escaped.slice(token.start, token.end)}</span>`;
    pos = token.end;
  }
  result += escaped.slice(pos);

  return result;
}

function Editor({ value, onChange, lang, readOnly, placeholder }: { value: string; onChange: (v: string) => void; lang: 'manifest' | 'ts'; readOnly?: boolean; placeholder?: string }) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const hlRef = useRef<HTMLDivElement>(null);
  const sync = useCallback(() => {
    if (textRef.current && hlRef.current) {
      hlRef.current.scrollTop = textRef.current.scrollTop;
      hlRef.current.scrollLeft = textRef.current.scrollLeft;
    }
  }, []);
  useEffect(sync, [value, sync]);

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = e.currentTarget.selectionStart, end = e.currentTarget.selectionEnd;
      const newValue = value.substring(0, s) + '  ' + value.substring(end);
      onChange(newValue);
      setTimeout(() => { if (textRef.current) textRef.current.selectionStart = textRef.current.selectionEnd = s + 2; }, 0);
    }
  };

  const displayHtml = value ? highlight(value, lang) : `<span class="text-gray-600">${placeholder || ''}</span>`;

  return (
    <div className="relative h-full font-mono text-sm">
      <div
        ref={hlRef}
        className="absolute inset-0 p-4 overflow-auto whitespace-pre-wrap break-words pointer-events-none"
        style={{ color: '#e2e8f0' }}
        dangerouslySetInnerHTML={{ __html: displayHtml }}
      />
      <textarea
        ref={textRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onScroll={sync}
        onKeyDown={onKey}
        readOnly={readOnly}
        placeholder={placeholder}
        spellCheck={false}
        className="absolute inset-0 w-full h-full p-4 bg-transparent text-transparent caret-white resize-none outline-none selection:bg-sky-500/30"
        style={{ caretColor: 'white' }}
      />
    </div>
  );
}

function TreeNode({ label, value, depth = 0 }: { label: string; value: unknown; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);
  if (value === null || value === undefined) return <div className="flex gap-2 py-0.5" style={{ paddingLeft: depth * 16 }}><span className="text-gray-400">{label}:</span><span className="text-gray-500">null</span></div>;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return <div className="flex gap-2 py-0.5" style={{ paddingLeft: depth * 16 }}><span className="text-gray-400">{label}:</span><span className={typeof value === 'string' ? 'text-amber-400' : typeof value === 'number' ? 'text-cyan-400' : 'text-orange-400'}>{typeof value === 'string' ? `"${value}"` : String(value)}</span></div>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <div className="flex gap-2 py-0.5" style={{ paddingLeft: depth * 16 }}><span className="text-gray-400">{label}:</span><span className="text-gray-500">[]</span></div>;
    return <div><button onClick={() => setOpen(!open)} className="flex items-center gap-1 py-0.5 hover:bg-white/5 w-full text-left" style={{ paddingLeft: depth * 16 }}>{open ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}<span className="text-gray-400">{label}</span><span className="text-gray-600 text-xs">Array({value.length})</span></button>{open && value.map((item, i) => <TreeNode key={i} label={`[${i}]`} value={item} depth={depth + 1} />)}</div>;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([k]) => k !== 'position');
    return <div><button onClick={() => setOpen(!open)} className="flex items-center gap-1 py-0.5 hover:bg-white/5 w-full text-left" style={{ paddingLeft: depth * 16 }}>{open ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}<span className="text-gray-400">{label}</span>{/* eslint-disable @typescript-eslint/no-explicit-any */}
{(value as any).type && <span className="text-emerald-400 text-xs ml-1">{(value as any).type}</span>}</button>{open && entries.map(([k, v]) => <TreeNode key={k} label={k} value={v} depth={depth + 1} />)}</div>;
  }
  return null;
}

function ASTViewer({ ast }: { ast: ManifestProgram | null }) {
  if (!ast) return <div className="h-full flex items-center justify-center text-gray-500">No AST</div>;
  return <div className="h-full overflow-auto p-4 font-mono text-sm"><TreeNode label="program" value={ast} /></div>;
}

function Docs() {
  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-3xl mx-auto space-y-8">
        <section>
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3"><Sparkles className="text-sky-400" />Manifest v2.0</h2>
          <p className="text-gray-300 leading-relaxed">A declarative language for AI to describe software systems. Now with commands, computed properties, relationships, policies, stores, modules, and realtime events.</p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              { label: 'Commands', desc: 'Explicit business operations' },
              { label: 'Computed', desc: 'Auto-updating derived fields' },
              { label: 'Relations', desc: 'hasMany, belongsTo, ref' },
              { label: 'Policies', desc: 'Auth/permission rules' },
              { label: 'Stores', desc: 'Persistence targets' },
              { label: 'Events', desc: 'Realtime pub/sub' },
            ].map(({ label, desc }) => (
              <div key={label} className="p-3 bg-gray-800/50 rounded border border-gray-700">
                <div className="text-sky-400 font-medium text-sm">{label}</div>
                <div className="text-gray-500 text-xs mt-1">{desc}</div>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3 className="text-xl font-semibold text-white mb-3">New in v2</h3>
          <div className="space-y-4">
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <h4 className="font-mono text-sky-400 mb-2">command</h4>
              <p className="text-sm text-gray-300 mb-2">Explicit business operations with guards, actions, and emits.</p>
              <pre className="p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto">{`command claimTask(taskId: string, employeeId: string) {
  guard user.role == "manager" or task.assignedTo == null
  mutate assignedTo = employeeId
  mutate status = "in_progress"
  emit taskClaimed
}`}</pre>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <h4 className="font-mono text-sky-400 mb-2">computed / derived</h4>
              <p className="text-sm text-gray-300 mb-2">Auto-recalculating properties like a spreadsheet.</p>
              <pre className="p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto">{`computed total: number = subtotal + tax
computed isOverdue: boolean = dueDate < now()
computed fullName: string = firstName + " " + lastName`}</pre>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <h4 className="font-mono text-sky-400 mb-2">relationships</h4>
              <p className="text-sm text-gray-300 mb-2">Model connections between entities.</p>
              <pre className="p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto">{`hasMany orders: Order
hasOne profile: Profile
belongsTo team: Team
ref product: Product`}</pre>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <h4 className="font-mono text-sky-400 mb-2">policy</h4>
              <p className="text-sm text-gray-300 mb-2">Auth rules - like RLS but in your spec.</p>
              <pre className="p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto">{`policy canEdit write: user.id == ownerId or user.role == "admin"
policy canView read: user.teamId == self.teamId
policy canDelete delete: user.role == "admin"`}</pre>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <h4 className="font-mono text-sky-400 mb-2">store</h4>
              <p className="text-sm text-gray-300 mb-2">Where data lives - memory, localStorage, Supabase.</p>
              <pre className="p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto">{`store User in supabase { table: "users" }
store Cart in memory
store Settings in localStorage { key: "app_settings" }`}</pre>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <h4 className="font-mono text-sky-400 mb-2">event (outbox)</h4>
              <p className="text-sm text-gray-300 mb-2">Realtime events for pub/sub.</p>
              <pre className="p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto">{`event TaskClaimed: "kitchen.task.claimed" {
  taskId: string
  employeeId: string
  timestamp: string
}`}</pre>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <h4 className="font-mono text-sky-400 mb-2">expose ... server</h4>
              <p className="text-sm text-gray-300 mb-2">Generate server routes, not just client stubs.</p>
              <pre className="p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto">{`expose User as rest server "/api/users" {
  list, get, create, update, delete
}`}</pre>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <h4 className="font-mono text-sky-400 mb-2">module</h4>
              <p className="text-sm text-gray-300 mb-2">Group related entities and commands.</p>
              <pre className="p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto">{`module kitchen {
  entity PrepTask { ... }
  entity Station { ... }
  command claimTask(...) { ... }
}`}</pre>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

type Tab = 'output' | 'server' | 'tests' | 'ast' | 'docs';

export default function App() {
  const [source, setSource] = useState(examples[0].code);
  const [output, setOutput] = useState('');
  const [serverCode, setServerCode] = useState('');
  const [testCode, setTestCode] = useState('');
  const [ast, setAst] = useState<ManifestProgram | null>(null);
  const [errors, setErrors] = useState<CompilationError[]>([]);
  const [tab, setTab] = useState<Tab>('output');
  const [exOpen, setExOpen] = useState(false);
  const [time, setTime] = useState<number | null>(null);
  const [showArtifacts, setShowArtifacts] = useState(true);

  const compile = useCallback(() => {
    const t0 = performance.now();
    const result = compiler.compile(source);
    setTime(Math.round((performance.now() - t0) * 100) / 100);
    if (result.success && result.code) {
      setOutput(result.code);
      setServerCode(result.serverCode || '');
      setTestCode(result.testCode || '');
      setAst(result.ast || null);
      setErrors([]);
    } else {
      setErrors(result.errors || []);
      setAst(result.ast || null);
    }
  }, [source]);

  useEffect(() => { const t = setTimeout(compile, 300); return () => clearTimeout(t); }, [source, compile]);

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      <header className="flex-shrink-0 border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-br from-sky-500 to-cyan-400 rounded-xl flex items-center justify-center shadow-lg shadow-sky-500/20"><Sparkles className="w-5 h-5 text-white" /></div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center"><Zap className="w-2.5 h-2.5 text-white" /></div>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Manifest <span className="text-sky-400 text-sm font-normal">v2.0</span></h1>
              <p className="text-xs text-gray-500">Commands / Computed / Relations / Policies / Stores</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowArtifacts(!showArtifacts)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${showArtifacts ? 'bg-sky-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}
            >
              <Package size={16} />
              Artifacts
            </button>
            <div className="relative">
              <button onClick={() => setExOpen(!exOpen)} className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors"><BookOpen size={16} />Examples<ChevronDown size={14} className={`transition-transform ${exOpen ? 'rotate-180' : ''}`} /></button>
              {exOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-gray-800 rounded-xl shadow-xl border border-gray-700 overflow-hidden z-50">
                  {examples.map((ex, i) => (
                    <button key={i} onClick={() => { setSource(ex.code); setExOpen(false); }} className="w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors border-b border-gray-700 last:border-0">
                      <div className="font-medium text-white">{ex.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{ex.desc}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={compile} className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 rounded-lg text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition-all"><Play size={16} />Compile</button>
          </div>
        </div>
        {(errors.length > 0 || time !== null) && (
          <div className="px-6 pb-3 flex items-center gap-4">
            {errors.length > 0 ? <div className="flex items-center gap-2 text-rose-400 text-sm"><AlertCircle size={14} />{errors.length} error{errors.length > 1 ? 's' : ''}</div> : <div className="flex items-center gap-2 text-emerald-400 text-sm"><CheckCircle size={14} />Compiled successfully</div>}
            {time !== null && <div className="flex items-center gap-2 text-gray-500 text-xs"><Cpu size={12} />{time}ms</div>}
          </div>
        )}
      </header>
      <main className="flex-1 flex overflow-hidden">
        <div className={`${showArtifacts ? 'w-1/3' : 'w-1/2'} border-r border-gray-800 flex flex-col transition-all`}>
          <div className="flex-shrink-0 px-4 py-2 border-b border-gray-800 bg-gray-900/50 flex items-center gap-2"><FileCode size={14} className="text-sky-400" /><span className="text-sm font-medium text-gray-300">Source</span><span className="text-xs text-gray-600 ml-auto">.manifest</span></div>
          <div className="flex-1 overflow-hidden bg-gray-900"><Editor value={source} onChange={setSource} lang="manifest" placeholder="Write Manifest code..." /></div>
          {errors.length > 0 && (
            <div className="flex-shrink-0 max-h-32 overflow-auto bg-rose-950/30 border-t border-rose-900/50">
              {errors.map((err, i) => <div key={i} className="px-4 py-2 text-sm text-rose-300 flex items-start gap-2"><AlertCircle size={14} className="flex-shrink-0 mt-0.5" /><span>{err.position && <span className="text-rose-500">Line {err.position.line}: </span>}{err.message}</span></div>)}
            </div>
          )}
        </div>
        <div className={`${showArtifacts ? 'w-1/3' : 'w-1/2'} flex flex-col border-r border-gray-800 transition-all`}>
          <div className="flex-shrink-0 border-b border-gray-800 bg-gray-900/50 flex">
            {[
              { id: 'output' as Tab, icon: Code2, label: 'Client' },
              { id: 'server' as Tab, icon: Server, label: 'Server' },
              { id: 'tests' as Tab, icon: TestTube, label: 'Tests' },
              { id: 'ast' as Tab, icon: TreeDeciduous, label: 'AST' },
              { id: 'docs' as Tab, icon: Layers, label: 'Docs' }
            ].map(({ id, icon: Icon, label }) => (
              <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${tab === id ? 'text-sky-400 bg-gray-800/50 border-b-2 border-sky-400' : 'text-gray-400 hover:text-gray-300'}`}><Icon size={14} />{label}</button>
            ))}
          </div>
          <div className="flex-1 overflow-hidden bg-gray-900">
            {tab === 'output' && <Editor value={output} onChange={() => {}} lang="ts" readOnly placeholder="Generated client code..." />}
            {tab === 'server' && <Editor value={serverCode} onChange={() => {}} lang="ts" readOnly placeholder="Generated server routes (add 'server' keyword to expose)..." />}
            {tab === 'tests' && <Editor value={testCode} onChange={() => {}} lang="ts" readOnly placeholder="Generated tests from constraints..." />}
            {tab === 'ast' && <ASTViewer ast={ast} />}
            {tab === 'docs' && <Docs />}
          </div>
        </div>
        {showArtifacts && (
          <div className="w-1/3 flex flex-col transition-all">
            <ArtifactsPanel
              source={source}
              clientCode={output}
              serverCode={serverCode}
              testCode={testCode}
              ast={ast}
              hasErrors={errors.length > 0}
            />
          </div>
        )}
      </main>
    </div>
  );
}
