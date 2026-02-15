import { useState, useEffect } from 'react';
import { Shield, CheckCircle, XCircle, AlertTriangle, Users, Lock, Folder, RefreshCw, Search } from 'lucide-react';
import { compileFile, compileAll, listFiles, getManifestRoot, type ManifestFile, type CompileResult } from '../../lib/api';

interface PolicyCoverage {
  entity: string;
  file: string;
  commands: {
    name: string;
    hasPolicy: boolean;
    policyName?: string;
    guardCount: number;
    guardExpressions: string[];
  }[];
}

interface CoverageResult {
  entities: PolicyCoverage[];
  totalCommands: number;
  coveredCommands: number;
  uncoveredCommands: number;
  coveragePercent: number;
  filesAnalyzed: number;
}

function buildCoverageResult(
  ir: CompileResult['ir'],
  fileName: string
): { entities: PolicyCoverage[]; totalCommands: number; coveredCommands: number; uncoveredCommands: number } {
  const entities: PolicyCoverage[] = [];
  let totalCommands = 0;
  let coveredCommands = 0;
  let uncoveredCommands = 0;

  if (!ir) return { entities, totalCommands, coveredCommands, uncoveredCommands };

  // Build policy lookup per entity
  const policyByEntity = new Map<string, { name: string; action: string; expression?: string }[]>();
  const globalPolicies: { name: string; action: string; expression?: string }[] = [];

  for (const policy of ir.policies || []) {
    if (policy.entity) {
      if (!policyByEntity.has(policy.entity)) {
        policyByEntity.set(policy.entity, []);
      }
      policyByEntity.get(policy.entity)!.push(policy);
    } else {
      globalPolicies.push(policy);
    }
  }

  // Build command lookup per entity
  const commandsByEntity = new Map<string, typeof ir.commands>();
  for (const cmd of ir.commands || []) {
    if (!commandsByEntity.has(cmd.entity)) {
      commandsByEntity.set(cmd.entity, []);
    }
    commandsByEntity.get(cmd.entity)!.push(cmd);
  }

  for (const entity of ir.entities || []) {
    const entityCommands = commandsByEntity.get(entity.name) || [];
    const entityPolicies = policyByEntity.get(entity.name) || [];
    const allPolicies = [...entityPolicies, ...globalPolicies];

    const commands: PolicyCoverage['commands'] = entityCommands.map(cmd => {
      totalCommands++;

      // Find matching policy
      const matchingPolicy = allPolicies.find(p =>
        p.action === 'execute' || p.action === 'all'
      );

      const hasPolicy = !!matchingPolicy;
      if (hasPolicy) {
        coveredCommands++;
      } else {
        uncoveredCommands++;
      }

      return {
        name: cmd.name,
        hasPolicy,
        policyName: matchingPolicy?.name,
        guardCount: cmd.guards?.length || 0,
        guardExpressions: (cmd.guards || []).map(g => g.expression),
      };
    });

    entities.push({
      entity: entity.name,
      file: fileName,
      commands,
    });
  }

  return { entities, totalCommands, coveredCommands, uncoveredCommands };
}

export default function PolicyCoveragePage() {
  const [files, setFiles] = useState<ManifestFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [result, setResult] = useState<CoverageResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string>('');
  const [serverStatus, setServerStatus] = useState<{ connected: boolean; root: string } | null>(null);

  useEffect(() => {
    const root = getManifestRoot();
    if (root) {
      setServerStatus({ connected: true, root });
      loadFiles();
    } else {
      setServerStatus({ connected: false, root: '' });
      setError('No manifest directory set. Enter a path in the toolbar above.');
    }
  }, []);

  const loadFiles = async () => {
    try {
      const result = await listFiles();
      setFiles(result.files);
      if (result.files.length > 0 && !selectedFile) {
        setSelectedFile(result.files[0].path);
      }
      setError('');
    } catch (err) {
      setError(`Failed to load files: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile) {
      setError('Please select a file');
      return;
    }

    setIsAnalyzing(true);
    setError('');
    try {
      const compiled = await compileFile(selectedFile);

      if (compiled.diagnostics.some(d => d.severity === 'error')) {
        setError(`Compilation errors:\n${compiled.diagnostics.filter(d => d.severity === 'error').map(d => d.message).join('\n')}`);
        setResult(null);
        return;
      }

      const data = buildCoverageResult(compiled.ir, compiled.file);
      const coveragePercent = data.totalCommands > 0
        ? Math.round((data.coveredCommands / data.totalCommands) * 100)
        : 100;

      setResult({ ...data, coveragePercent, filesAnalyzed: 1 });
    } catch (err) {
      setError(`Analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzeAll = async () => {
    setIsAnalyzing(true);
    setError('');
    try {
      const compiled = await compileAll();

      const allEntities: PolicyCoverage[] = [];
      let totalCommands = 0;
      let coveredCommands = 0;
      let uncoveredCommands = 0;

      for (const fileResult of compiled.results) {
        if (fileResult.diagnostics.some(d => d.severity === 'error')) continue;
        const data = buildCoverageResult(fileResult.ir, fileResult.file);
        allEntities.push(...data.entities);
        totalCommands += data.totalCommands;
        coveredCommands += data.coveredCommands;
        uncoveredCommands += data.uncoveredCommands;
      }

      const coveragePercent = totalCommands > 0
        ? Math.round((coveredCommands / totalCommands) * 100)
        : 100;

      setResult({
        entities: allEntities,
        totalCommands,
        coveredCommands,
        uncoveredCommands,
        coveragePercent,
        filesAnalyzed: compiled.filesCompiled,
      });
    } catch (err) {
      setError(`Analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
        {serverStatus && (
          <div className={`mt-2 flex items-center gap-2 text-sm ${serverStatus.connected ? 'text-emerald-400' : 'text-rose-400'}`}>
            <div className={`w-2 h-2 rounded-full ${serverStatus.connected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            {serverStatus.connected ? `Connected to: ${serverStatus.root}` : 'Server disconnected'}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-4 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 whitespace-pre-wrap text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* File Selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Folder size={16} />
              Manifest Files
            </label>
            <button onClick={loadFiles} className="p-1 text-slate-400 hover:text-slate-200" title="Refresh file list">
              <RefreshCw size={14} />
            </button>
          </div>

          <div className="bg-surface-lighter border border-surface-border rounded-lg max-h-96 overflow-y-auto">
            {files.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-sm">No .manifest files found</div>
            ) : (
              files.map(file => (
                <button
                  key={file.path}
                  onClick={() => setSelectedFile(file.path)}
                  className={`w-full text-left px-4 py-2 text-sm border-b border-surface-border last:border-0 ${
                    selectedFile === file.path
                      ? 'bg-accent/10 text-accent'
                      : 'text-slate-300 hover:bg-surface'
                  }`}
                >
                  <div className="font-medium">{file.name}</div>
                  <div className="text-xs text-slate-500 truncate">{file.relative}</div>
                </button>
              ))
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing || !selectedFile}
              className="flex-1 px-4 py-2 bg-accent text-slate-900 text-sm font-medium rounded-md hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              <Search size={14} />
              {isAnalyzing ? 'Analyzing...' : 'Analyze Selected'}
            </button>
            <button
              onClick={handleAnalyzeAll}
              disabled={isAnalyzing}
              className="px-4 py-2 bg-surface-lighter text-slate-200 text-sm font-medium rounded-md hover:bg-surface-lighter/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Analyze All
            </button>
          </div>
        </div>

        {/* Coverage Matrix */}
        <div className="lg:col-span-2 space-y-3">
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

          <div className="bg-surface-lighter border border-surface-border rounded-lg p-4 min-h-[400px] max-h-[600px] overflow-y-auto">
            {!result && (
              <div className="h-full flex items-center justify-center text-slate-500">
                <div className="text-center">
                  <Shield size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Select a file and click "Analyze" to see policy coverage</p>
                </div>
              </div>
            )}

            {result && (
              <div className="space-y-4">
                {/* Summary Bar */}
                <div className="bg-surface rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-slate-400">
                      Overall Coverage ({result.filesAnalyzed} file{result.filesAnalyzed !== 1 ? 's' : ''})
                    </span>
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

                {result.entities.length === 0 && (
                  <div className="text-center text-slate-500 py-8">
                    <Shield size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No entities found in selected file(s)</p>
                  </div>
                )}

                {/* Entity Matrix */}
                <div className="space-y-4">
                  {result.entities.map((entity) => {
                    const covered = entity.commands.filter(c => c.hasPolicy).length;
                    const total = entity.commands.length;
                    const entityPercent = total > 0 ? Math.round((covered / total) * 100) : 100;

                    return (
                      <div key={`${entity.file}-${entity.entity}`} className="border border-surface-border rounded-lg overflow-hidden">
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
                            <div key={cmd.name} className="px-4 py-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-slate-400">.{cmd.name}()</span>
                                  {cmd.guardCount > 0 && (
                                    <span className="text-xs text-slate-600">
                                      ({cmd.guardCount} guard{cmd.guardCount > 1 ? 's' : ''})
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
                              {/* Guard expressions */}
                              {cmd.guardExpressions.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {cmd.guardExpressions.map((expr, i) => (
                                    <span key={i} className="text-xs px-2 py-0.5 bg-surface rounded text-slate-500 font-mono">
                                      {expr}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                          {entity.commands.length === 0 && (
                            <div className="px-4 py-2 text-sm text-slate-500 italic">
                              No commands defined
                            </div>
                          )}
                        </div>

                        {/* File source */}
                        <div className="px-4 py-1 bg-surface text-xs text-slate-600 truncate">
                          {entity.file}
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
                  <div className="flex items-center gap-1">
                    <AlertTriangle size={12} className="text-amber-400" />
                    <span>Partial</span>
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
