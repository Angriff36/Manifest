import { useState, useCallback, useEffect, useRef } from 'react';
import { Play, FileCode, BookOpen, AlertCircle, CheckCircle, Code2, TreeDeciduous, ChevronDown, ChevronRight, Sparkles, Zap, Cpu, Layers } from 'lucide-react';
import { ManifestCompiler, ManifestProgram, CompilationError } from './manifest/compiler';
import { examples } from './manifest/examples';

const compiler = new ManifestCompiler();

const KEYWORDS = ['entity', 'property', 'behavior', 'constraint', 'flow', 'effect', 'expose', 'compose', 'on', 'when', 'then', 'emit', 'mutate', 'compute', 'guard', 'as', 'from', 'to', 'with', 'where', 'connect', 'string', 'number', 'boolean', 'list', 'map', 'any', 'void', 'true', 'false', 'null', 'required', 'unique', 'indexed', 'private', 'readonly', 'rest', 'graphql', 'websocket', 'function', 'http', 'storage', 'timer', 'event', 'custom', 'and', 'or', 'not', 'is', 'in', 'contains'];

function highlight(code: string, lang: 'manifest' | 'ts'): string {
  let r = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  r = r.replace(/(\/\/[^\n]*)/g, '<span class="text-gray-500">$1</span>');
  r = r.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="text-gray-500">$1</span>');
  r = r.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, '<span class="text-amber-400">$1</span>');
  r = r.replace(/\b(\d+\.?\d*)\b/g, '<span class="text-cyan-400">$1</span>');
  if (lang === 'manifest') {
    const kw = new RegExp(`\\b(${KEYWORDS.join('|')})\\b`, 'g');
    r = r.replace(kw, '<span class="text-sky-400 font-medium">$1</span>');
    r = r.replace(/\b([A-Z][a-zA-Z0-9]*)\b/g, '<span class="text-emerald-400">$1</span>');
  } else {
    const tsKw = ['class', 'interface', 'type', 'function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while', 'new', 'this', 'extends', 'export', 'import', 'async', 'await', 'try', 'catch', 'throw', 'private', 'public', 'get', 'set'];
    r = r.replace(new RegExp(`\\b(${tsKw.join('|')})\\b`, 'g'), '<span class="text-sky-400 font-medium">$1</span>');
    r = r.replace(/\b(string|number|boolean|any|void|null|undefined|true|false)\b/g, '<span class="text-orange-400">$1</span>');
  }
  return r;
}

function Editor({ value, onChange, lang, readOnly, placeholder }: { value: string; onChange: (v: string) => void; lang: 'manifest' | 'ts'; readOnly?: boolean; placeholder?: string }) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const hlRef = useRef<HTMLDivElement>(null);
  const sync = useCallback(() => { if (textRef.current && hlRef.current) { hlRef.current.scrollTop = textRef.current.scrollTop; hlRef.current.scrollLeft = textRef.current.scrollLeft; } }, []);
  useEffect(sync, [value, sync]);

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = e.currentTarget.selectionStart, end = e.currentTarget.selectionEnd;
      onChange(value.substring(0, s) + '  ' + value.substring(end));
      setTimeout(() => { if (textRef.current) textRef.current.selectionStart = textRef.current.selectionEnd = s + 2; }, 0);
    }
  };

  return (
    <div className="relative h-full font-mono text-sm">
      <div ref={hlRef} className="absolute inset-0 p-4 overflow-auto whitespace-pre-wrap break-words pointer-events-none" style={{ color: '#e2e8f0' }} dangerouslySetInnerHTML={{ __html: highlight(value, lang) || `<span class="text-gray-600">${placeholder || ''}</span>` }} />
      <textarea ref={textRef} value={value} onChange={e => onChange(e.target.value)} onScroll={sync} onKeyDown={onKey} readOnly={readOnly} placeholder={placeholder} spellCheck={false} className="absolute inset-0 w-full h-full p-4 bg-transparent text-transparent caret-white resize-none outline-none selection:bg-sky-500/30" style={{ caretColor: 'white' }} />
    </div>
  );
}

function TreeNode({ label, value, depth = 0 }: { label: string; value: any; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);
  if (value === null || value === undefined) return <div className="flex gap-2 py-0.5" style={{ paddingLeft: depth * 16 }}><span className="text-gray-400">{label}:</span><span className="text-gray-500">null</span></div>;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return <div className="flex gap-2 py-0.5" style={{ paddingLeft: depth * 16 }}><span className="text-gray-400">{label}:</span><span className={typeof value === 'string' ? 'text-amber-400' : typeof value === 'number' ? 'text-cyan-400' : 'text-orange-400'}>{typeof value === 'string' ? `"${value}"` : String(value)}</span></div>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <div className="flex gap-2 py-0.5" style={{ paddingLeft: depth * 16 }}><span className="text-gray-400">{label}:</span><span className="text-gray-500">[]</span></div>;
    return <div><button onClick={() => setOpen(!open)} className="flex items-center gap-1 py-0.5 hover:bg-white/5 w-full text-left" style={{ paddingLeft: depth * 16 }}>{open ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}<span className="text-gray-400">{label}</span><span className="text-gray-600 text-xs">Array({value.length})</span></button>{open && value.map((item, i) => <TreeNode key={i} label={`[${i}]`} value={item} depth={depth + 1} />)}</div>;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([k]) => k !== 'position');
    return <div><button onClick={() => setOpen(!open)} className="flex items-center gap-1 py-0.5 hover:bg-white/5 w-full text-left" style={{ paddingLeft: depth * 16 }}>{open ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}<span className="text-gray-400">{label}</span>{value.type && <span className="text-emerald-400 text-xs ml-1">{value.type}</span>}</button>{open && entries.map(([k, v]) => <TreeNode key={k} label={k} value={v} depth={depth + 1} />)}</div>;
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
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3"><Sparkles className="text-sky-400" />What is Manifest?</h2>
          <p className="text-gray-300 leading-relaxed">Manifest is a declarative language designed for AI systems to describe software at a high level of abstraction. Instead of writing implementation code, you describe <em>what</em> should exist and <em>how it should behave</em>. The compiler generates working code.</p>
          <div className="mt-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700"><p className="text-sm text-gray-400"><strong className="text-sky-400">Philosophy:</strong> The source of truth is the specification, not the generated code. AI describes intent; machines generate implementation.</p></div>
        </section>
        <section>
          <h3 className="text-xl font-semibold text-white mb-3">Core Constructs</h3>
          <div className="space-y-4">
            {[
              { kw: 'entity', desc: 'Data structure with properties, behaviors, and constraints', ex: `entity User {\n  property required email: string\n  property active: boolean = true\n  behavior on activate { mutate active = true }\n  constraint validEmail: email contains "@"\n}` },
              { kw: 'property', desc: 'Data field with modifiers: required, unique, readonly, indexed', ex: `property required id: string\nproperty count: number = 0\nproperty tags: list<string> = []` },
              { kw: 'behavior', desc: 'Event handler with guards and actions', ex: `behavior on increment when count < 100 {\n  mutate count = count + 1\n  emit countChanged\n}` },
              { kw: 'constraint', desc: 'Invariant that must always hold', ex: `constraint positive: value >= 0 "Must be positive"` },
              { kw: 'flow', desc: 'Data transformation pipeline', ex: `flow process(Input) -> Output {\n  validate: (x) => x.value > 0\n  map: (x) => x.value * 2\n}` },
              { kw: 'effect', desc: 'Side effect declaration (http, storage, timer)', ex: `effect api: http {\n  url: "https://api.example.com"\n  method: "GET"\n}` },
              { kw: 'expose', desc: 'Generate API (rest, graphql, websocket, function)', ex: `expose User as rest "/api/users" {\n  list, get, create, update, delete\n}` },
              { kw: 'compose', desc: 'Wire entities together', ex: `compose System {\n  Cart as cart\n  Payment as payment\n  connect cart.checkout -> payment.process\n}` }
            ].map(({ kw, desc, ex }) => (
              <div key={kw} className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                <h4 className="font-mono text-sky-400 mb-2">{kw}</h4>
                <p className="text-sm text-gray-300 mb-2">{desc}</p>
                <pre className="p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto">{ex}</pre>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3 className="text-xl font-semibold text-white mb-3">Types</h3>
          <div className="grid grid-cols-2 gap-3">
            {[{ t: 'string', d: 'Text' }, { t: 'number', d: 'Numeric' }, { t: 'boolean', d: 'true/false' }, { t: 'list<T>', d: 'Array' }, { t: 'map<T>', d: 'Key-value' }, { t: 'any', d: 'Any type' }, { t: 'Type?', d: 'Nullable' }, { t: 'void', d: 'No return' }].map(({ t, d }) => (
              <div key={t} className="p-3 bg-gray-800/50 rounded border border-gray-700"><code className="text-sky-400 text-sm">{t}</code><p className="text-xs text-gray-400 mt-1">{d}</p></div>
            ))}
          </div>
        </section>
        <section className="pb-8">
          <h3 className="text-xl font-semibold text-white mb-3">Why Manifest?</h3>
          <div className="space-y-3">
            <div className="p-4 bg-gradient-to-r from-sky-900/30 to-cyan-900/30 rounded-lg border border-sky-800/50"><h4 className="font-medium text-sky-300">Intent over Implementation</h4><p className="text-sm text-gray-400 mt-1">Describe what you want, not how to build it.</p></div>
            <div className="p-4 bg-gradient-to-r from-emerald-900/30 to-teal-900/30 rounded-lg border border-emerald-800/50"><h4 className="font-medium text-emerald-300">Built-in Correctness</h4><p className="text-sm text-gray-400 mt-1">Constraints ensure your system behaves correctly by construction.</p></div>
            <div className="p-4 bg-gradient-to-r from-amber-900/30 to-orange-900/30 rounded-lg border border-amber-800/50"><h4 className="font-medium text-amber-300">Target Agnostic</h4><p className="text-sm text-gray-400 mt-1">One spec generates code for any platform.</p></div>
          </div>
        </section>
      </div>
    </div>
  );
}

type Tab = 'output' | 'ast' | 'docs';

export default function App() {
  const [source, setSource] = useState(examples[0].code);
  const [output, setOutput] = useState('');
  const [ast, setAst] = useState<ManifestProgram | null>(null);
  const [errors, setErrors] = useState<CompilationError[]>([]);
  const [tab, setTab] = useState<Tab>('output');
  const [exOpen, setExOpen] = useState(false);
  const [time, setTime] = useState<number | null>(null);

  const compile = useCallback(() => {
    const t0 = performance.now();
    const result = compiler.compile(source);
    setTime(Math.round((performance.now() - t0) * 100) / 100);
    if (result.success && result.code) { setOutput(result.code); setAst(result.ast || null); setErrors([]); }
    else { setErrors(result.errors || []); setAst(result.ast || null); }
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
            <div><h1 className="text-xl font-bold text-white tracking-tight">Manifest</h1><p className="text-xs text-gray-500">A language for AI, by AI</p></div>
          </div>
          <div className="flex items-center gap-4">
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
        <div className="w-1/2 border-r border-gray-800 flex flex-col">
          <div className="flex-shrink-0 px-4 py-2 border-b border-gray-800 bg-gray-900/50 flex items-center gap-2"><FileCode size={14} className="text-sky-400" /><span className="text-sm font-medium text-gray-300">Source</span><span className="text-xs text-gray-600 ml-auto">.manifest</span></div>
          <div className="flex-1 overflow-hidden bg-gray-900"><Editor value={source} onChange={setSource} lang="manifest" placeholder="Write Manifest code..." /></div>
          {errors.length > 0 && (
            <div className="flex-shrink-0 max-h-32 overflow-auto bg-rose-950/30 border-t border-rose-900/50">
              {errors.map((err, i) => <div key={i} className="px-4 py-2 text-sm text-rose-300 flex items-start gap-2"><AlertCircle size={14} className="flex-shrink-0 mt-0.5" /><span>{err.position && <span className="text-rose-500">Line {err.position.line}: </span>}{err.message}</span></div>)}
            </div>
          )}
        </div>
        <div className="w-1/2 flex flex-col">
          <div className="flex-shrink-0 border-b border-gray-800 bg-gray-900/50 flex">
            {[{ id: 'output' as Tab, icon: Code2, label: 'Output' }, { id: 'ast' as Tab, icon: TreeDeciduous, label: 'AST' }, { id: 'docs' as Tab, icon: Layers, label: 'Guide' }].map(({ id, icon: Icon, label }) => (
              <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${tab === id ? 'text-sky-400 bg-gray-800/50 border-b-2 border-sky-400' : 'text-gray-400 hover:text-gray-300'}`}><Icon size={14} />{label}</button>
            ))}
          </div>
          <div className="flex-1 overflow-hidden bg-gray-900">
            {tab === 'output' && <Editor value={output} onChange={() => {}} lang="ts" readOnly placeholder="Compiled output..." />}
            {tab === 'ast' && <ASTViewer ast={ast} />}
            {tab === 'docs' && <Docs />}
          </div>
        </div>
      </main>
    </div>
  );
}
