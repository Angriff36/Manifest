import { useState, useCallback, useEffect } from 'react';
import {
  Play,
  FileCode,
  BookOpen,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  Sparkles,
  Zap,
  Cpu,
  Package,
} from 'lucide-react';
import { ManifestCompiler, ManifestProgram, CompilationError } from './manifest/compiler';
import { examples } from './manifest/examples';
import { ArtifactsPanel } from './artifacts';
import { Editor } from './app-panels';
import { APP_TABS, renderCenterPanel, type Tab } from './app-tabs';

const compiler = new ManifestCompiler();

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

  useEffect(() => {
    const t = setTimeout(compile, 300);
    return () => clearTimeout(t);
  }, [source, compile]);

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      <header className="flex-shrink-0 border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-br from-sky-500 to-cyan-400 rounded-xl flex items-center justify-center shadow-lg shadow-sky-500/20">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                <Zap className="w-2.5 h-2.5 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                Manifest <span className="text-sky-400 text-sm font-normal">v2.0</span>
              </h1>
              <p className="text-xs text-gray-500">
                Commands / Computed / Relations / Policies / Stores
              </p>
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
              <button
                onClick={() => setExOpen(!exOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors"
              >
                <BookOpen size={16} />
                Examples
                <ChevronDown
                  size={14}
                  className={`transition-transform ${exOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {exOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-gray-800 rounded-xl shadow-xl border border-gray-700 overflow-hidden z-50">
                  {examples.map((ex, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setSource(ex.code);
                        setExOpen(false);
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors border-b border-gray-700 last:border-0"
                    >
                      <div className="font-medium text-white">{ex.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{ex.desc}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={compile}
              className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 rounded-lg text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition-all"
            >
              <Play size={16} />
              Compile
            </button>
          </div>
        </div>
        {(errors.length > 0 || time !== null) && (
          <div className="px-6 pb-3 flex items-center gap-4">
            {errors.length > 0 ? (
              <div className="flex items-center gap-2 text-rose-400 text-sm">
                <AlertCircle size={14} />
                {errors.length} error{errors.length > 1 ? 's' : ''}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-emerald-400 text-sm">
                <CheckCircle size={14} />
                Compiled successfully
              </div>
            )}
            {time !== null && (
              <div className="flex items-center gap-2 text-gray-500 text-xs">
                <Cpu size={12} />
                {time}ms
              </div>
            )}
          </div>
        )}
      </header>
      <main className="flex-1 flex overflow-hidden">
        <div
          className={`${showArtifacts ? 'w-1/3' : 'w-1/2'} border-r border-gray-800 flex flex-col transition-all`}
        >
          <div className="flex-shrink-0 px-4 py-2 border-b border-gray-800 bg-gray-900/50 flex items-center gap-2">
            <FileCode size={14} className="text-sky-400" />
            <span className="text-sm font-medium text-gray-300">Source</span>
            <span className="text-xs text-gray-600 ml-auto">.manifest</span>
          </div>
          <div className="flex-1 overflow-hidden bg-gray-900">
            <Editor
              value={source}
              onChange={setSource}
              lang="manifest"
              placeholder="Write Manifest code..."
            />
          </div>
          {errors.length > 0 && (
            <div className="flex-shrink-0 max-h-32 overflow-auto bg-rose-950/30 border-t border-rose-900/50">
              {errors.map((err, i) => (
                <div key={i} className="px-4 py-2 text-sm text-rose-300 flex items-start gap-2">
                  <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>
                    {err.position && (
                      <span className="text-rose-500">Line {err.position.line}: </span>
                    )}
                    {err.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div
          className={`${showArtifacts ? 'w-1/3' : 'w-1/2'} flex flex-col border-r border-gray-800 transition-all`}
        >
          <div className="flex-shrink-0 border-b border-gray-800 bg-gray-900/50 flex">
            {APP_TABS.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${tab === id ? 'text-sky-400 bg-gray-800/50 border-b-2 border-sky-400' : 'text-gray-400 hover:text-gray-300'}`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-hidden bg-gray-900">
            {renderCenterPanel(tab, {
              output,
              serverCode,
              testCode,
              ast,
              source,
              hasErrors: errors.length > 0,
              onSourceChange: setSource,
            })}
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
