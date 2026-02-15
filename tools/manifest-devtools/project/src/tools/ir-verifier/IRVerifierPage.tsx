import { useState, useCallback } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  FileJson,
  Loader2,
} from 'lucide-react';
import { validateIR, type IRValidationResult, type IRValidationFileResult } from '../../lib/api';

export default function IRVerifierPage() {
  const [result, setResult] = useState<IRValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runValidation = useCallback(async () => {
    setValidating(true);
    setError(null);
    try {
      const data = await validateIR();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Validation failed');
    } finally {
      setValidating(false);
    }
  }, []);

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-100 mb-1">IR Schema Validator</h1>
        <p className="text-sm text-slate-400">
          Compile each .manifest file to IR and validate against the official IR v1 JSON Schema.
        </p>
      </div>

      <button onClick={runValidation} disabled={validating} className="btn-primary w-full justify-center mb-4">
        {validating ? (
          <span className="flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Validating...
          </span>
        ) : (
          <>
            <ShieldCheck size={14} /> Validate All Files
          </>
        )}
      </button>

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
          <ShieldCheck size={32} className="mb-3 text-slate-600" />
          <p className="text-sm">Click "Validate All Files" to check IR against the schema</p>
        </div>
      )}

      {result && (
        <div className="space-y-4 animate-fade-in">
          {/* Summary bar */}
          <div className="grid grid-cols-3 gap-4">
            <SummaryCard label="Total Files" value={result.total} icon={<FileJson size={16} />} color="text-slate-300" />
            <SummaryCard label="Passed" value={result.passed} icon={<CheckCircle2 size={16} />} color="text-emerald-400" />
            <SummaryCard label="Failed" value={result.failed} icon={<ShieldX size={16} />} color="text-rose-400" />
          </div>

          {/* Per-file results */}
          <div className="space-y-2">
            {result.results.map((file, i) => (
              <FileResultRow key={i} file={file} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="tool-panel p-4">
      <div className={`flex items-center gap-2 mb-1 ${color}`}>
        {icon}
        <span className="text-2xl font-bold">{value}</span>
      </div>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function FileResultRow({ file }: { file: IRValidationFileResult }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = file.errors.length > 0 || file.compileError;

  return (
    <div className={`tool-panel overflow-hidden border-l-4 ${file.valid ? 'border-l-emerald-500' : 'border-l-rose-500'}`}>
      <button
        onClick={() => hasDetails && setExpanded(!expanded)}
        className="flex items-center gap-3 w-full text-left px-4 py-3"
        disabled={!hasDetails}
      >
        {file.valid ? (
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
        ) : file.compileError ? (
          <ShieldAlert size={16} className="text-amber-400 shrink-0" />
        ) : (
          <ShieldX size={16} className="text-rose-400 shrink-0" />
        )}

        <span className="text-sm text-slate-200 font-medium">{file.name}</span>

        {file.valid && file.entityCount !== undefined && (
          <span className="text-[10px] text-slate-500 ml-2">
            {file.entityCount} entities, {file.commandCount} commands
          </span>
        )}

        {!file.valid && file.compileError && (
          <span className="badge-warning text-[10px] ml-2">Compile Error</span>
        )}

        {!file.valid && file.errors.length > 0 && (
          <span className="badge-error text-[10px] ml-2">{file.errors.length} schema error{file.errors.length !== 1 ? 's' : ''}</span>
        )}

        {hasDetails && (
          <span className="ml-auto text-slate-600">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        )}
      </button>

      {expanded && hasDetails && (
        <div className="px-4 pb-3 border-t border-surface-border pt-3 animate-fade-in">
          {file.compileError && (
            <div className="text-xs text-amber-400 mb-2">
              <span className="font-medium">Compile error:</span> {file.compileError}
            </div>
          )}
          {file.errors.length > 0 && (
            <div className="space-y-1.5">
              {file.errors.map((err, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <AlertCircle size={12} className="text-rose-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="code-font text-slate-400">{err.path}</span>
                    <span className="text-slate-500 mx-1.5">&mdash;</span>
                    <span className="text-slate-300">{err.message}</span>
                    <span className="text-slate-600 ml-1.5">[{err.keyword}]</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
