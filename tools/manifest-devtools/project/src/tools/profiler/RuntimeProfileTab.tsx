import { useState, useEffect } from 'react';
import { Play, Clock, Cpu, CheckCircle, XCircle, ChevronDown } from 'lucide-react';
import {
  listFiles,
  profileRuntime,
  type ManifestFile,
  type RuntimeProfileCommand,
  type RuntimeProfileResult,
} from '../../lib/api';

export default function RuntimeProfileTab() {
  const [files, setFiles] = useState<ManifestFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [commands, setCommands] = useState<RuntimeProfileCommand[]>([]);
  const [selectedCommand, setSelectedCommand] = useState<string>('');
  const [contextJson, setContextJson] = useState('{\n  "user": { "id": "1", "role": "admin" }\n}');
  const [inputJson, setInputJson] = useState('{}');
  const [loading, setLoading] = useState(false);
  const [loadingCommands, setLoadingCommands] = useState(false);
  const [result, setResult] = useState<RuntimeProfileResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load file list on mount
  useEffect(() => {
    listFiles()
      .then(({ files: f }) => setFiles(f))
      .catch(() => {});
  }, []);

  // When file changes, fetch available commands
  useEffect(() => {
    if (!selectedFile) {
      setCommands([]);
      setSelectedCommand('');
      return;
    }
    setLoadingCommands(true);
    setCommands([]);
    setSelectedCommand('');
    profileRuntime({ filePath: selectedFile })
      .then((res) => {
        if (res.availableCommands) {
          setCommands(res.availableCommands);
          if (res.availableCommands.length > 0) {
            setSelectedCommand(res.availableCommands[0].name);
          }
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoadingCommands(false));
  }, [selectedFile]);

  const run = async () => {
    if (!selectedFile || !selectedCommand) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      let ctx: Record<string, unknown> = {};
      let inp: Record<string, unknown> = {};
      try { ctx = JSON.parse(contextJson); } catch { setError('Invalid context JSON'); setLoading(false); return; }
      try { inp = JSON.parse(inputJson); } catch { setError('Invalid input JSON'); setLoading(false); return; }

      const res = await profileRuntime({
        filePath: selectedFile,
        commandName: selectedCommand,
        input: inp,
        context: ctx,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const selectedCmd = commands.find(c => c.name === selectedCommand);

  return (
    <div className="space-y-4">
      {/* Configuration panel */}
      <div className="tool-panel p-4">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Runtime Command Profiling</h3>
        <p className="text-xs text-slate-500 mb-4">
          Compile a file, instantiate the RuntimeEngine, and execute a command with real timing.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: File + Command selection */}
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Manifest File</label>
              <div className="relative">
                <select
                  value={selectedFile}
                  onChange={(e) => setSelectedFile(e.target.value)}
                  className="w-full h-8 px-3 pr-8 text-xs bg-surface-lighter border border-surface-border rounded-md text-slate-300 focus:outline-none focus:border-accent/40 appearance-none"
                >
                  <option value="">Select a file...</option>
                  {files.map((f) => (
                    <option key={f.path} value={f.path}>{f.name}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-2.5 text-slate-500 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Command</label>
              <div className="relative">
                <select
                  value={selectedCommand}
                  onChange={(e) => setSelectedCommand(e.target.value)}
                  disabled={commands.length === 0}
                  className="w-full h-8 px-3 pr-8 text-xs bg-surface-lighter border border-surface-border rounded-md text-slate-300 focus:outline-none focus:border-accent/40 appearance-none disabled:opacity-50"
                >
                  {loadingCommands && <option>Loading commands...</option>}
                  {!loadingCommands && commands.length === 0 && <option>Select a file first</option>}
                  {commands.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} {c.entity ? `(${c.entity})` : ''} — {c.guardCount}g {c.actionCount}a {c.policyCount}p
                    </option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-2.5 text-slate-500 pointer-events-none" />
              </div>
            </div>

            {selectedCmd && (
              <div className="flex gap-3 text-[10px] text-slate-500">
                <span>{selectedCmd.paramCount} params</span>
                <span>{selectedCmd.guardCount} guards</span>
                <span>{selectedCmd.actionCount} actions</span>
                <span>{selectedCmd.policyCount} policies</span>
              </div>
            )}

            <button
              onClick={run}
              disabled={loading || !selectedFile || !selectedCommand}
              className="btn-primary text-xs w-full"
            >
              <Play size={12} />
              {loading ? 'Executing...' : 'Execute & Profile'}
            </button>
          </div>

          {/* Right: Context + Input JSON editors */}
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                Runtime Context (JSON)
              </label>
              <textarea
                value={contextJson}
                onChange={(e) => setContextJson(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-xs code-font bg-surface-lighter border border-surface-border rounded-md text-slate-300 focus:outline-none focus:border-accent/40 resize-none"
                spellCheck={false}
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                Command Input (JSON)
              </label>
              <textarea
                value={inputJson}
                onChange={(e) => setInputJson(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-xs code-font bg-surface-lighter border border-surface-border rounded-md text-slate-300 focus:outline-none focus:border-accent/40 resize-none"
                spellCheck={false}
              />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="tool-panel p-4 border-red-500/30">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {result && <RuntimeResult result={result} />}

      {!result && !loading && !error && (
        <div className="tool-panel flex flex-col items-center justify-center py-16 text-slate-500">
          <Cpu size={32} className="mb-3 text-slate-600" />
          <p className="text-sm">Select a file and command, then click &quot;Execute &amp; Profile&quot;</p>
        </div>
      )}
    </div>
  );
}

function RuntimeResult({ result }: { result: RuntimeProfileResult }) {
  const phases = result.phases;
  const total = phases.total || (phases.compile + (phases.init || 0) + (phases.execute || 0));
  const phaseEntries = [
    { name: 'Compile', ms: phases.compile, color: 'bg-cyan-500/60' },
    { name: 'Init Engine', ms: phases.init || 0, color: 'bg-amber-500/60' },
    { name: 'Execute', ms: phases.execute || 0, color: 'bg-emerald-500/60' },
  ].filter(p => p.ms > 0);

  return (
    <div className="space-y-4 animate-slide-in">
      {/* Phase timing bar */}
      <div className="tool-panel p-4">
        <h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
          <Clock size={14} className="text-accent" /> Phase Timing
          <span className="ml-auto code-font text-accent text-sm">{total.toFixed(1)}ms total</span>
        </h4>

        {/* Stacked bar */}
        <div className="h-8 bg-surface rounded-md overflow-hidden flex mb-3">
          {phaseEntries.map((p) => (
            <div
              key={p.name}
              className={`${p.color} flex items-center justify-center text-[10px] code-font text-white/80 transition-all duration-500`}
              style={{ width: `${Math.max((p.ms / total) * 100, 5)}%` }}
              title={`${p.name}: ${p.ms.toFixed(2)}ms`}
            >
              {(p.ms / total) * 100 > 15 ? `${p.name} ${p.ms.toFixed(1)}ms` : ''}
            </div>
          ))}
        </div>

        {/* Phase breakdown */}
        <div className="grid grid-cols-3 gap-3">
          {phaseEntries.map((p) => (
            <div key={p.name} className="text-center">
              <div className={`w-3 h-3 rounded-sm ${p.color} inline-block mr-1.5 align-middle`} />
              <span className="text-xs text-slate-400">{p.name}</span>
              <p className="code-font text-sm text-slate-200 mt-0.5">{p.ms.toFixed(2)}ms</p>
              <p className="text-[10px] text-slate-500">{((p.ms / total) * 100).toFixed(0)}%</p>
            </div>
          ))}
        </div>
      </div>

      {/* Command result */}
      <div className="tool-panel p-4">
        <h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
          {result.commandResult?.success
            ? <><CheckCircle size={14} className="text-emerald-400" /> Command Succeeded</>
            : <><XCircle size={14} className="text-red-400" /> Command Failed</>
          }
        </h4>

        {result.commandResult?.error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-md p-3 mb-3">
            <p className="text-xs text-red-300 code-font">{result.commandResult.error}</p>
          </div>
        )}

        {result.commandResult?.guardFailure != null && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-md p-3 mb-3">
            <p className="text-xs text-amber-300 code-font mb-1">Guard Failure:</p>
            <pre className="text-[10px] text-slate-400 code-font overflow-x-auto">
              {String(JSON.stringify(result.commandResult.guardFailure, null, 2))}
            </pre>
          </div>
        )}

        {result.commandResult?.policyDenial != null && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-md p-3 mb-3">
            <p className="text-xs text-rose-300 code-font mb-1">Policy Denial:</p>
            <pre className="text-[10px] text-slate-400 code-font overflow-x-auto">
              {String(JSON.stringify(result.commandResult.policyDenial, null, 2))}
            </pre>
          </div>
        )}

        {result.commandResult?.result !== undefined && (
          <div className="mb-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Result</p>
            <pre className="text-xs text-slate-300 code-font bg-surface rounded-md p-3 overflow-x-auto max-h-48">
              {String(JSON.stringify(result.commandResult.result, null, 2))}
            </pre>
          </div>
        )}

        {result.commandResult?.emittedEvents && result.commandResult.emittedEvents.length > 0 && (
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
              Emitted Events ({result.commandResult.emittedEvents.length})
            </p>
            <pre className="text-xs text-slate-300 code-font bg-surface rounded-md p-3 overflow-x-auto max-h-48">
              {String(JSON.stringify(result.commandResult.emittedEvents, null, 2))}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
