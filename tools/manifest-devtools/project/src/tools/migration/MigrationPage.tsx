import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeftRight,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Plus,
  Minus,
  RefreshCw,
  Loader2,
  FileJson,
} from 'lucide-react';
import { diffIR, listFiles, type IRDiffResult, type IRDiffChange, type ManifestFile } from '../../lib/api';

export default function MigrationPage() {
  const [files, setFiles] = useState<ManifestFile[]>([]);
  const [fileA, setFileA] = useState('');
  const [fileB, setFileB] = useState('');
  const [result, setResult] = useState<IRDiffResult | null>(null);
  const [diffing, setDiffing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listFiles().then(({ files: f }) => {
      setFiles(f);
      if (f.length >= 2) {
        setFileA(f[0].path);
        setFileB(f[1].path);
      } else if (f.length === 1) {
        setFileA(f[0].path);
        setFileB(f[0].path);
      }
    }).catch(() => {});
  }, []);

  const runDiff = useCallback(async () => {
    if (!fileA || !fileB) return;
    setDiffing(true);
    setError(null);
    setResult(null);
    try {
      const data = await diffIR(fileA, fileB);
      if (!data.success) {
        setError(data.error || 'Diff failed');
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Diff failed');
    } finally {
      setDiffing(false);
    }
  }, [fileA, fileB]);

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-100 mb-1">IR Diff Analyzer</h1>
        <p className="text-sm text-slate-400">
          Compare the compiled IR of two .manifest files. Identifies added, removed, and changed paths with risk assessment.
        </p>
      </div>

      {/* File selectors */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-slate-500 mb-1 block">File A (Before)</label>
          <select
            value={fileA}
            onChange={(e) => { setFileA(e.target.value); setResult(null); }}
            className="tool-input w-full"
          >
            <option value="">Select file...</option>
            {files.map((f) => (
              <option key={f.path} value={f.path}>{f.name}</option>
            ))}
          </select>
        </div>

        <ArrowLeftRight size={16} className="text-slate-500 mb-2" />

        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-slate-500 mb-1 block">File B (After)</label>
          <select
            value={fileB}
            onChange={(e) => { setFileB(e.target.value); setResult(null); }}
            className="tool-input w-full"
          >
            <option value="">Select file...</option>
            {files.map((f) => (
              <option key={f.path} value={f.path}>{f.name}</option>
            ))}
          </select>
        </div>

        <button onClick={runDiff} disabled={diffing || !fileA || !fileB} className="btn-primary mb-0">
          {diffing ? (
            <span className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Diffing...
            </span>
          ) : (
            <>
              <RefreshCw size={14} /> Compare IR
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="tool-panel p-4 border-l-4 border-l-rose-500 mb-4 animate-slide-in">
          <div className="flex items-center gap-2 text-rose-400">
            <AlertCircle size={16} />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      {!result && !error && (
        <div className="tool-panel flex flex-col items-center justify-center py-24 text-slate-500">
          <ArrowLeftRight size={32} className="mb-3 text-slate-600" />
          <p className="text-sm">Select two files and click "Compare IR" to see the diff</p>
        </div>
      )}

      {result && result.diff && (
        <div className="space-y-4 animate-fade-in">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Total Changes" value={result.diff.totalChanges} color="text-slate-300" />
            <StatCard label="Added" value={result.diff.added} color="text-emerald-400" icon={<Plus size={14} />} />
            <StatCard label="Removed" value={result.diff.removed} color="text-rose-400" icon={<Minus size={14} />} />
            <StatCard label="Changed" value={result.diff.changed} color="text-amber-400" icon={<RefreshCw size={14} />} />
            <StatCard label="High Risk" value={result.diff.highRiskCount} color="text-red-400" icon={<AlertTriangle size={14} />} />
          </div>

          {/* File labels */}
          <div className="tool-panel p-3 flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <FileJson size={12} className="text-slate-400" />
              <span className="text-slate-500">A:</span>
              <span className="text-slate-300 code-font">{result.fileA?.name}</span>
            </div>
            <ArrowLeftRight size={12} className="text-slate-600" />
            <div className="flex items-center gap-2">
              <FileJson size={12} className="text-accent" />
              <span className="text-slate-500">B:</span>
              <span className="text-slate-300 code-font">{result.fileB?.name}</span>
            </div>
          </div>

          {/* Changes list */}
          {result.diff.totalChanges === 0 ? (
            <div className="tool-panel p-8 text-center">
              <p className="text-sm text-emerald-400">No differences found — IR is identical.</p>
            </div>
          ) : (
            <ChangesList changes={result.diff.changes} />
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon?: React.ReactNode }) {
  return (
    <div className="tool-panel p-3">
      <div className={`flex items-center gap-1.5 mb-0.5 ${color}`}>
        {icon}
        <span className="text-xl font-bold">{value}</span>
      </div>
      <p className="text-[10px] text-slate-500">{label}</p>
    </div>
  );
}

function ChangesList({ changes }: { changes: IRDiffChange[] }) {
  const [filter, setFilter] = useState<'all' | 'added' | 'removed' | 'changed' | 'high'>('all');
  const [expanded, setExpanded] = useState(false);

  const filtered = changes.filter((c) => {
    if (filter === 'all') return true;
    if (filter === 'high') return c.risk === 'high';
    return c.changeType === filter;
  });

  const shown = expanded ? filtered : filtered.slice(0, 30);

  return (
    <div className="tool-panel overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-surface-border bg-surface-light/50">
        <h4 className="text-sm font-medium text-slate-300">Changes ({filtered.length})</h4>
        <div className="flex gap-1 ml-auto">
          {(['all', 'added', 'removed', 'changed', 'high'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-[10px] px-2 py-0.5 rounded ${filter === f ? 'bg-accent/20 text-accent' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {f === 'high' ? 'High Risk' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {shown.map((change, i) => (
          <ChangeRow key={i} change={change} />
        ))}
      </div>

      {filtered.length > 30 && (
        <div className="px-4 py-2 border-t border-surface-border">
          <button onClick={() => setExpanded(!expanded)} className="btn-ghost text-xs">
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {expanded ? 'Show less' : `Show all ${filtered.length}`}
          </button>
        </div>
      )}
    </div>
  );
}

function ChangeRow({ change }: { change: IRDiffChange }) {
  const typeColor = change.changeType === 'added'
    ? 'text-emerald-400 bg-emerald-500/10'
    : change.changeType === 'removed'
    ? 'text-rose-400 bg-rose-500/10'
    : 'text-amber-400 bg-amber-500/10';

  const typeIcon = change.changeType === 'added'
    ? <Plus size={10} />
    : change.changeType === 'removed'
    ? <Minus size={10} />
    : <RefreshCw size={10} />;

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 border-b border-surface-border/50 hover:bg-surface-light/30 text-xs">
      <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${typeColor}`}>
        {typeIcon}
        {change.changeType}
      </span>

      <span className="code-font text-slate-300 flex-1 truncate" title={change.path}>
        {change.path}
      </span>

      {change.label && (
        <span className="text-[10px] text-slate-500">{change.label}</span>
      )}

      {change.risk === 'high' && (
        <span className="flex items-center gap-0.5 text-[10px] text-red-400">
          <AlertTriangle size={10} /> high risk
        </span>
      )}
    </div>
  );
}
