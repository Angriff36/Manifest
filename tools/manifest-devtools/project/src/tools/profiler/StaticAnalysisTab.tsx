import { useState } from 'react';
import { Play, Layers, AlertTriangle, Shield, Zap, ChevronRight } from 'lucide-react';
import {
  profileStatic,
  type StaticAnalysisResult,
  type StaticEntityAnalysis,
  type StaticCommandAnalysis,
} from '../../lib/api';

function complexityColor(score: number): string {
  if (score <= 10) return 'text-emerald-400';
  if (score <= 30) return 'text-amber-400';
  return 'text-rose-400';
}

function complexityBg(score: number): string {
  if (score <= 10) return 'bg-emerald-500/20 border-emerald-500/30';
  if (score <= 30) return 'bg-amber-500/20 border-amber-500/30';
  return 'bg-rose-500/20 border-rose-500/30';
}

function complexityLabel(score: number): string {
  if (score <= 10) return 'Low';
  if (score <= 30) return 'Medium';
  return 'High';
}

export default function StaticAnalysisTab() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StaticAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await profileStatic();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Collect all commands across all files for hotspots
  const allCommands: Array<StaticCommandAnalysis & { entity: string; file: string }> = [];
  if (data) {
    for (const file of data.results) {
      if (!file.analysis) continue;
      for (const entity of file.analysis.entities) {
        for (const cmd of entity.commands) {
          allCommands.push({ ...cmd, entity: entity.name, file: file.name });
        }
      }
    }
    allCommands.sort((a, b) => b.complexityScore - a.complexityScore);
  }

  return (
    <div className="space-y-4">
      <div className="tool-panel p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-slate-300">Static IR Complexity Analysis</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Walks the compiled IR tree computing complexity scores without execution.
              Identifies hotspots that will be expensive at runtime.
            </p>
          </div>
          <button onClick={run} disabled={loading} className="btn-primary text-xs">
            <Play size={12} />
            {loading ? 'Analyzing...' : 'Analyze All Files'}
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
          {/* Hotspots */}
          {allCommands.length > 0 && (
            <div className="tool-panel p-4 animate-slide-in">
              <h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
                <AlertTriangle size={14} className="text-rose-400" /> Complexity Hotspots
                <span className="text-[10px] text-slate-500 ml-auto">top 8 most complex commands</span>
              </h4>
              <div className="space-y-2">
                {allCommands.slice(0, 8).map((cmd, i) => {
                  const maxScore = allCommands[0]?.complexityScore || 1;
                  const pct = (cmd.complexityScore / maxScore) * 100;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className={`code-font text-xs w-6 text-right font-bold ${complexityColor(cmd.complexityScore)}`}>
                        {cmd.complexityScore}
                      </span>
                      <div className="flex-1 h-5 bg-surface rounded-sm overflow-hidden">
                        <div
                          className={`h-full rounded-sm border ${complexityBg(cmd.complexityScore)} transition-all duration-500`}
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                      <span className="code-font text-xs text-slate-300 w-48 truncate">
                        {cmd.entity}.{cmd.name}
                      </span>
                      <span className="text-[10px] text-slate-500 w-24 truncate">{cmd.file}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Per-file results */}
          {data.results.map((file, fi) => (
            <FileAnalysisCard key={fi} file={file} />
          ))}
        </>
      )}

      {!data && !loading && (
        <div className="tool-panel flex flex-col items-center justify-center py-16 text-slate-500">
          <Layers size={32} className="mb-3 text-slate-600" />
          <p className="text-sm">Click &quot;Analyze All Files&quot; to compute IR complexity scores</p>
        </div>
      )}
    </div>
  );
}

function FileAnalysisCard({ file }: { file: StaticAnalysisResult['results'][0] }) {
  const [expanded, setExpanded] = useState(false);

  if (file.error || !file.analysis) {
    return (
      <div className="tool-panel p-4 border-red-500/20 animate-slide-in">
        <p className="text-sm text-slate-300 code-font">{file.name}</p>
        <p className="text-xs text-red-400 mt-1">{file.error || 'No analysis available'}</p>
      </div>
    );
  }

  const { summary, entities, policies } = file.analysis;

  return (
    <div className="tool-panel animate-slide-in">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center gap-3 hover:bg-surface-hover/30 transition-colors"
      >
        <ChevronRight
          size={14}
          className={`text-slate-500 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        <span className="code-font text-sm text-slate-200">{file.name}</span>
        <div className="flex gap-3 ml-auto text-[10px] text-slate-500">
          <span>{summary.entityCount} entities</span>
          <span>{summary.commandCount} commands</span>
          <span>{summary.policyCount} policies</span>
          <span>{summary.totalGuards} guards</span>
        </div>
        <span className={`code-font text-sm font-bold ${complexityColor(summary.totalComplexity)}`}>
          {summary.totalComplexity}
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${complexityBg(summary.totalComplexity)}`}>
          {complexityLabel(summary.totalComplexity)}
        </span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-surface-border">
          {/* Summary stats */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3">
            {[
              { label: 'Entities', value: summary.entityCount, icon: <Layers size={12} /> },
              { label: 'Commands', value: summary.commandCount, icon: <Zap size={12} /> },
              { label: 'Policies', value: summary.policyCount, icon: <Shield size={12} /> },
              { label: 'Max Guard Depth', value: summary.maxGuardDepth, icon: <AlertTriangle size={12} /> },
              { label: 'Expr Nodes', value: summary.totalExprNodes, icon: <Layers size={12} /> },
            ].map((s) => (
              <div key={s.label} className="bg-surface rounded-md px-3 py-2">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-0.5">
                  {s.icon} {s.label}
                </div>
                <p className="code-font text-sm text-slate-300">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Per-entity breakdown */}
          {entities.map((entity, ei) => (
            <EntityBreakdown key={ei} entity={entity} />
          ))}

          {/* Policies */}
          {policies.length > 0 && (
            <div>
              <h5 className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Policies</h5>
              <div className="space-y-1">
                {policies.map((p, pi) => (
                  <div key={pi} className="flex items-center gap-3 text-xs">
                    <span className="code-font text-slate-300 w-40 truncate">{p.name}</span>
                    <span className="text-slate-500 w-16">{p.action}</span>
                    <span className="text-slate-500 w-24 truncate">{p.entity}</span>
                    <span className="code-font text-slate-400">depth: {p.expressionDepth}</span>
                    <span className="code-font text-slate-500">nodes: {p.expressionNodes}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EntityBreakdown({ entity }: { entity: StaticEntityAnalysis }) {
  return (
    <div className="bg-surface/50 rounded-md p-3">
      <div className="flex items-center gap-3 mb-2">
        <span className="code-font text-sm text-slate-200">{entity.name}</span>
        <span className={`code-font text-xs font-bold ${complexityColor(entity.complexityScore)}`}>
          score: {entity.complexityScore}
        </span>
        <div className="flex gap-2 ml-auto text-[10px] text-slate-500">
          <span>{entity.propertyCount} props</span>
          <span>{entity.relationshipCount} rels</span>
          <span>{entity.constraintCount} constraints</span>
          <span>{entity.computedPropertyCount} computed</span>
        </div>
      </div>

      {/* Commands table */}
      {entity.commands.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-slate-500 border-b border-surface-border/50">
                <th className="text-left py-1.5 pr-3">Command</th>
                <th className="text-right py-1.5 px-2">Guards</th>
                <th className="text-right py-1.5 px-2">Max Depth</th>
                <th className="text-right py-1.5 px-2">Actions</th>
                <th className="text-right py-1.5 px-2">Policies</th>
                <th className="text-right py-1.5 px-2">Constraints</th>
                <th className="text-right py-1.5 px-2">Score</th>
              </tr>
            </thead>
            <tbody>
              {entity.commands.map((cmd, ci) => (
                <tr key={ci} className="border-b border-surface-border/30">
                  <td className="py-1.5 pr-3 code-font text-slate-300">{cmd.name}</td>
                  <td className="py-1.5 px-2 text-right code-font text-slate-400">{cmd.guardCount}</td>
                  <td className="py-1.5 px-2 text-right code-font text-slate-400">{cmd.maxGuardDepth}</td>
                  <td className="py-1.5 px-2 text-right code-font text-slate-400">{cmd.actionCount}</td>
                  <td className="py-1.5 px-2 text-right code-font text-slate-400">{cmd.policyRefs}</td>
                  <td className="py-1.5 px-2 text-right code-font text-slate-400">{cmd.constraintCount}</td>
                  <td className={`py-1.5 px-2 text-right code-font font-bold ${complexityColor(cmd.complexityScore)}`}>
                    {cmd.complexityScore}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Constraints */}
      {entity.constraints.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] text-slate-500 mb-1">Constraints:</p>
          <div className="flex flex-wrap gap-1.5">
            {entity.constraints.map((c, ci) => (
              <span
                key={ci}
                className={`text-[10px] px-1.5 py-0.5 rounded border code-font ${
                  c.severity === 'block'
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                    : c.severity === 'warn'
                      ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                      : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                }`}
              >
                {c.name} (d:{c.depth} n:{c.nodes})
                {c.overrideable && ' ⚡'}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
