import { useState } from 'react';
import { Play, Clock, FileCode2, Layers, AlertTriangle, Zap } from 'lucide-react';
import { profileCompile, type CompileProfileResult, type CompileProfileFileResult } from '../../lib/api';

export default function CompileProfileTab() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CompileProfileResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await profileCompile();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="tool-panel p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-slate-300">Compile-Time Profiling</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Measures real wall-clock time to compile each .manifest file through the IR compiler.
            </p>
          </div>
          <button onClick={run} disabled={loading} className="btn-primary text-xs">
            <Play size={12} />
            {loading ? 'Profiling...' : 'Profile All Files'}
          </button>
        </div>
      </div>

      {error && (
        <div className="tool-panel p-4 border-red-500/30">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {data && (
        <>
          <SummaryBar data={data} />
          <FileTimingChart results={data.results} totalMs={data.totalCompileMs} />
          <FileDetailTable results={data.results} />
        </>
      )}

      {!data && !loading && (
        <div className="tool-panel flex flex-col items-center justify-center py-16 text-slate-500">
          <Zap size={32} className="mb-3 text-slate-600" />
          <p className="text-sm">Click &quot;Profile All Files&quot; to measure real compilation times</p>
        </div>
      )}
    </div>
  );
}

function SummaryBar({ data }: { data: CompileProfileResult }) {
  const totalEntities = data.results.reduce((s, r) => s + (r.metrics?.entities || 0), 0);
  const totalCommands = data.results.reduce((s, r) => s + (r.metrics?.commands || 0), 0);
  const totalGuards = data.results.reduce((s, r) => s + (r.metrics?.guards || 0), 0);
  const totalLines = data.results.reduce((s, r) => s + r.sourceLines, 0);
  const failCount = data.results.filter(r => !r.success).length;

  const items = [
    { label: 'Total Time', value: `${data.totalCompileMs.toFixed(1)}ms`, icon: <Clock size={14} />, color: 'text-accent' },
    { label: 'Files', value: `${data.filesCompiled}`, icon: <FileCode2 size={14} />, color: 'text-emerald-400' },
    { label: 'Source Lines', value: String(totalLines), icon: <Layers size={14} />, color: 'text-cyan-400' },
    { label: 'Entities', value: String(totalEntities), icon: <Layers size={14} />, color: 'text-amber-400' },
    { label: 'Commands', value: String(totalCommands), icon: <Zap size={14} />, color: 'text-violet-400' },
    { label: 'Guards', value: String(totalGuards), icon: <AlertTriangle size={14} />, color: 'text-rose-400' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 animate-slide-in">
      {items.map((item) => (
        <div key={item.label} className="tool-panel px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <span className={item.color}>{item.icon}</span>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">{item.label}</span>
          </div>
          <p className={`text-lg font-semibold code-font ${item.color}`}>{item.value}</p>
        </div>
      ))}
      {failCount > 0 && (
        <div className="tool-panel px-4 py-3 border-red-500/20">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-red-400"><AlertTriangle size={14} /></span>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Failed</span>
          </div>
          <p className="text-lg font-semibold code-font text-red-400">{failCount}</p>
        </div>
      )}
    </div>
  );
}

function FileTimingChart({ results, totalMs }: { results: CompileProfileFileResult[]; totalMs: number }) {
  const maxMs = Math.max(...results.map(r => r.compileTimeMs), 1);

  return (
    <div className="tool-panel p-4 animate-slide-in">
      <h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
        <Clock size={14} className="text-accent" /> Per-File Compile Time
        <span className="text-[10px] text-slate-500 ml-auto">sorted by time (slowest first)</span>
      </h4>
      <div className="space-y-2">
        {results.map((r, i) => {
          const pct = (r.compileTimeMs / maxMs) * 100;
          const barColor = r.success
            ? r.compileTimeMs > totalMs * 0.4
              ? 'bg-rose-500/40 border-rose-500/50'
              : r.compileTimeMs > totalMs * 0.2
                ? 'bg-amber-500/30 border-amber-500/40'
                : 'bg-accent/20 border-accent/30'
            : 'bg-red-500/30 border-red-500/40';

          return (
            <div key={i} className="flex items-center gap-3">
              <span className="code-font text-xs text-slate-400 w-40 truncate" title={r.name}>
                {r.name}
              </span>
              <div className="flex-1 h-5 bg-surface rounded-sm overflow-hidden relative">
                <div
                  className={`h-full rounded-sm border ${barColor} transition-all duration-500`}
                  style={{ width: `${Math.max(pct, 1)}%` }}
                />
              </div>
              <span className="code-font text-xs text-slate-300 w-20 text-right">
                {r.compileTimeMs.toFixed(1)}ms
              </span>
              <span className="text-[10px] text-slate-500 w-16 text-right">
                {r.sourceLines} lines
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FileDetailTable({ results }: { results: CompileProfileFileResult[] }) {
  return (
    <div className="tool-panel p-4 animate-slide-in">
      <h4 className="text-sm font-medium text-slate-300 mb-3">IR Metrics per File</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 border-b border-surface-border">
              <th className="text-left py-2 pr-4">File</th>
              <th className="text-right py-2 px-2">Time</th>
              <th className="text-right py-2 px-2">Entities</th>
              <th className="text-right py-2 px-2">Commands</th>
              <th className="text-right py-2 px-2">Guards</th>
              <th className="text-right py-2 px-2">Policies</th>
              <th className="text-right py-2 px-2">Actions</th>
              <th className="text-right py-2 px-2">Props</th>
              <th className="text-right py-2 px-2">Rels</th>
              <th className="text-right py-2 px-2">Bytes</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={i} className="border-b border-surface-border/50 hover:bg-surface-hover/30">
                <td className="py-2 pr-4 code-font text-slate-300 truncate max-w-[200px]" title={r.name}>
                  {r.name}
                </td>
                <td className="py-2 px-2 text-right code-font text-accent">{r.compileTimeMs.toFixed(1)}ms</td>
                <td className="py-2 px-2 text-right code-font text-slate-400">{r.metrics?.entities ?? '-'}</td>
                <td className="py-2 px-2 text-right code-font text-slate-400">{r.metrics?.commands ?? '-'}</td>
                <td className="py-2 px-2 text-right code-font text-slate-400">{r.metrics?.guards ?? '-'}</td>
                <td className="py-2 px-2 text-right code-font text-slate-400">{r.metrics?.policies ?? '-'}</td>
                <td className="py-2 px-2 text-right code-font text-slate-400">{r.metrics?.actions ?? '-'}</td>
                <td className="py-2 px-2 text-right code-font text-slate-400">{r.metrics?.properties ?? '-'}</td>
                <td className="py-2 px-2 text-right code-font text-slate-400">{r.metrics?.relationships ?? '-'}</td>
                <td className="py-2 px-2 text-right code-font text-slate-500">{r.sourceBytes.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
