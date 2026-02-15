import { useState } from 'react';
import { Shield, Play, CheckCircle, XCircle, AlertCircle, FileText, Users, Lock } from 'lucide-react';

interface PolicyCoverage {
  entity: string;
  commands: {
    name: string;
    hasPolicy: boolean;
    policyName?: string;
    guards: string[];
  }[];
}

interface CoverageResult {
  entities: PolicyCoverage[];
  totalCommands: number;
  coveredCommands: number;
  uncoveredCommands: number;
  coveragePercent: number;
}

// Parse manifest source for policy coverage
function analyzeCoverage(source: string): CoverageResult {
  const result: CoverageResult = {
    entities: [],
    totalCommands: 0,
    coveredCommands: 0,
    uncoveredCommands: 0,
    coveragePercent: 0,
  };

  if (!source.trim()) {
    return result;
  }

  // Track entity positions
  const entityRegex = /entity\s+(\w+)\s*\{/g;
  const entityMatches: Array<{ name: string; start: number; end: number }> = [];

  let match;
  while ((match = entityRegex.exec(source)) !== null) {
    const name = match[1];
    const start = match.index;
    let braceCount = 0;
    let end = start;
    for (let i = start; i < source.length; i++) {
      if (source[i] === '{') braceCount++;
      if (source[i] === '}') braceCount--;
      if (braceCount === 0) {
        end = i + 1;
        break;
      }
    }
    entityMatches.push({ name, start, end });
  }

  // Extract policies
  const policies: Map<string, string[]> = new Map();
  const policyRegex = /policy\s+(\w+)\s+(\w+):\s*(.*?)(?=\n\s*\n|\n\s*(?:command|property|event|guard|policy|store)|$)/g;
  while ((match = policyRegex.exec(source)) !== null) {
    const policyName = match[1];
    const action = match[2];
    if (!policies.has(policyName)) {
      policies.set(policyName, []);
    }
    policies.get(policyName)!.push(action);
  }

  // Process each entity
  for (const em of entityMatches) {
    const entitySource = source.slice(em.start, em.end);
    const commands: PolicyCoverage['commands'] = [];

    // Find commands
    const commandRegex = /command\s+(\w+)\s*\([^)]*\)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;
    while ((match = commandRegex.exec(entitySource)) !== null) {
      const cmdName = match[1];
      const cmdBody = match[2];

      // Find guards in command
      const guardMatches = cmdBody.match(/guards:\s*(.*?)(?:\n|$)/g) || [];
      const guards = guardMatches.map(g => g.replace(/guards:\s*/, '').trim()).filter(Boolean);

      // Find policies that might cover this command
      // Check if any policy matches entity+command
      let hasPolicy = false;
      let policyName: string | undefined;

      for (const [pName, actions] of policies) {
        // Check if policy has execute or all action
        if (actions.includes('execute') || actions.includes('all')) {
          // Check if policy name contains entity or command name (simple heuristic)
          if (pName.toLowerCase().includes(em.name.toLowerCase()) ||
              pName.toLowerCase().includes(cmdName.toLowerCase())) {
            hasPolicy = true;
            policyName = pName;
            break;
          }
        }
      }

      commands.push({
        name: cmdName,
        hasPolicy,
        policyName,
        guards,
      });

      result.totalCommands++;
      if (hasPolicy) {
        result.coveredCommands++;
      } else {
        result.uncoveredCommands++;
      }
    }

    result.entities.push({
      entity: em.name,
      commands,
    });
  }

  result.coveragePercent = result.totalCommands > 0
    ? Math.round((result.coveredCommands / result.totalCommands) * 100)
    : 0;

  return result;
}

export default function PolicyCoveragePage() {
  const [source, setSource] = useState<string>(`entity User {
  property id: string
  property name: string
  property email: string
  property role: string

  // Entity-level policies
  policy userRead execute: user.authenticated
  policy userWrite execute: user.role == "admin"
  policy userDelete execute: user.role == "admin"

  command create(params: { name: string, email: string }) {
    guards: user.authenticated
  }

  command update(params: { name: string }) {
    guards: user.id == self.id || user.role == "admin"
  }

  command delete() {
    guards: user.role == "admin"
  }

  command list() {
    guards: user.authenticated
  }
}

entity Post {
  property id: string
  property title: string
  property authorId: string
  property published: boolean

  command create(params: { title: string }) {
    guards: user.authenticated
  }

  command publish() {
    guards: user.role == "admin"
  }
}`);

  const [result, setResult] = useState<CoverageResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    await new Promise(resolve => setTimeout(resolve, 300));
    try {
      const coverage = analyzeCoverage(source);
      setResult(coverage);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getCoverageColor = (percent: number) => {
    if (percent >= 80) return 'text-emerald-400';
    if (percent >= 50) return 'text-amber-400';
    return 'text-rose-400';
  };

  const getCoverageBg = (percent: number) => {
    if (percent >= 80) return 'bg-emerald-500';
    if (percent >= 50) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="max-w-6xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100 mb-2 flex items-center gap-3">
          <Shield size={24} className="text-accent" />
          Policy Coverage Matrix
        </h1>
        <p className="text-slate-400">
          Visual grid showing which commands have policy coverage and which are unprotected.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source Input */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <FileText size={16} />
              Manifest Source
            </label>
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing || !source.trim()}
              className="px-4 py-1.5 bg-accent text-slate-900 text-sm font-medium rounded-md hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              <Play size={14} />
              {isAnalyzing ? 'Analyzing...' : 'Analyze'}
            </button>
          </div>
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full h-96 bg-surface-lighter border border-surface-border rounded-lg p-4 text-sm font-mono text-slate-300 resize-none focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
            placeholder="Paste your manifest code here..."
            spellCheck={false}
          />
        </div>

        {/* Coverage Matrix */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Lock size={16} />
              Coverage Matrix
            </label>
            {result && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-400">Coverage:</span>
                <span className={`text-lg font-bold ${getCoverageColor(result.coveragePercent)}`}>
                  {result.coveragePercent}%
                </span>
              </div>
            )}
          </div>

          <div className="bg-surface-lighter border border-surface-border rounded-lg p-4 min-h-[200px]">
            {!result && (
              <div className="h-full flex items-center justify-center text-slate-500">
                <div className="text-center">
                  <Shield size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Click "Analyze" to see policy coverage</p>
                </div>
              </div>
            )}

            {result && (
              <div className="space-y-4">
                {/* Summary Bar */}
                <div className="bg-surface rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-slate-400">Overall Coverage</span>
                    <span className={`text-sm font-bold ${getCoverageColor(result.coveragePercent)}`}>
                      {result.coveredCommands} / {result.totalCommands} commands
                    </span>
                  </div>
                  <div className="h-2 bg-surface-lighter rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getCoverageBg(result.coveragePercent)} transition-all duration-500`}
                      style={{ width: `${result.coveragePercent}%` }}
                    />
                  </div>
                </div>

                {/* Entity Matrix */}
                <div className="space-y-4">
                  {result.entities.map((entity) => {
                    const covered = entity.commands.filter(c => c.hasPolicy).length;
                    const total = entity.commands.length;
                    const entityPercent = total > 0 ? Math.round((covered / total) * 100) : 0;

                    return (
                      <div key={entity.entity} className="border border-surface-border rounded-lg overflow-hidden">
                        {/* Entity Header */}
                        <div className="bg-surface px-4 py-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Users size={14} className="text-slate-500" />
                            <span className="font-medium text-slate-200">{entity.entity}</span>
                          </div>
                          <span className={`text-xs ${getCoverageColor(entityPercent)}`}>
                            {covered}/{total} covered
                          </span>
                        </div>

                        {/* Commands Grid */}
                        <div className="divide-y divide-surface-border">
                          {entity.commands.map((cmd) => (
                            <div key={cmd.name} className="px-4 py-2 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-slate-400">.{cmd.name}()</span>
                                {cmd.guards.length > 0 && (
                                  <span className="text-xs text-slate-600">
                                    ({cmd.guards.length} guard{cmd.guards.length > 1 ? 's' : ''})
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {cmd.hasPolicy ? (
                                  <>
                                    <CheckCircle size={14} className="text-emerald-400" />
                                    <span className="text-xs text-emerald-400">{cmd.policyName}</span>
                                  </>
                                ) : (
                                  <>
                                    <XCircle size={14} className="text-rose-400" />
                                    <span className="text-xs text-rose-400">No policy</span>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                          {entity.commands.length === 0 && (
                            <div className="px-4 py-2 text-sm text-slate-500 italic">
                              No commands defined
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex gap-4 text-xs text-slate-500 pt-2">
                  <div className="flex items-center gap-1">
                    <CheckCircle size={12} className="text-emerald-400" />
                    <span>Covered</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <XCircle size={12} className="text-rose-400" />
                    <span>Unprotected</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
