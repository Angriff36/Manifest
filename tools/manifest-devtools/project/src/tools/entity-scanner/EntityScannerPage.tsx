import { useState, useEffect } from 'react';
import { Search, CheckCircle, AlertCircle, AlertTriangle, FileText, Database, Shield, X, Folder, RefreshCw } from 'lucide-react';
import { compileFile, compileAll, listFiles, getManifestRoot, type ManifestFile, type CompileResult } from '../../lib/api';

interface EntityStatus {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  commands: CommandStatus[];
  properties: number;
  propertyNames: string[];
  store?: string;
  file: string;
}

interface CommandStatus {
  name: string;
  hasPolicy: boolean;
  guardCount: number;
  status: 'pass' | 'warn' | 'fail';
}

interface ScanResult {
  entities: EntityStatus[];
  commandsChecked: number;
  propertiesScanned: number;
  filesCompiled: number;
}

function buildScanResult(
  ir: CompileResult['ir'],
  fileName: string
): { entities: EntityStatus[]; commandsChecked: number; propertiesScanned: number } {
  const entities: EntityStatus[] = [];
  let commandsChecked = 0;
  let propertiesScanned = 0;

  if (!ir) return { entities, commandsChecked, propertiesScanned };

  // Build policy lookup: which entities have execute/all policies
  const policyCoverage = new Set<string>();
  for (const policy of ir.policies || []) {
    if (policy.action === 'execute' || policy.action === 'all') {
      if (policy.entity) {
        policyCoverage.add(policy.entity);
      } else {
        // Global policy — covers all entities
        for (const entity of ir.entities || []) {
          policyCoverage.add(entity.name);
        }
      }
    }
  }

  // Build store lookup
  const storeMap = new Map<string, string>();
  for (const store of ir.stores || []) {
    storeMap.set(store.entity, store.target);
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
    const hasPolicyCoverage = policyCoverage.has(entity.name);
    const props = entity.properties || [];
    propertiesScanned += props.length;

    const commands: CommandStatus[] = entityCommands.map(cmd => {
      commandsChecked++;
      const hasPolicy = hasPolicyCoverage;
      const guardCount = cmd.guards?.length || 0;
      return {
        name: cmd.name,
        hasPolicy,
        guardCount,
        status: hasPolicy ? 'pass' as const : 'fail' as const,
      };
    });

    const hasErrors = commands.some(c => c.status === 'fail');
    const store = storeMap.get(entity.name);
    const knownStores = ['memory', 'localStorage', 'postgres', 'supabase'];
    const hasStoreWarning = store && !knownStores.includes(store);

    entities.push({
      name: entity.name,
      status: hasErrors ? 'fail' : hasStoreWarning ? 'warn' : 'pass',
      commands,
      properties: props.length,
      propertyNames: props.map((p: { name: string }) => p.name),
      store,
      file: fileName,
    });
  }

  return { entities, commandsChecked, propertiesScanned };
}

export default function EntityScannerPage() {
  const [files, setFiles] = useState<ManifestFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
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

  const handleScan = async () => {
    if (!selectedFile) {
      setError('Please select a file to scan');
      return;
    }

    setIsScanning(true);
    setError('');
    try {
      const compiled = await compileFile(selectedFile);

      if (compiled.diagnostics.some(d => d.severity === 'error')) {
        setError(`Compilation errors:\n${compiled.diagnostics.filter(d => d.severity === 'error').map(d => d.message).join('\n')}`);
        setResult(null);
        return;
      }

      const scanData = buildScanResult(compiled.ir, compiled.file);
      setResult({ ...scanData, filesCompiled: 1 });
    } catch (err) {
      setError(`Scan failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsScanning(false);
    }
  };

  const handleScanAll = async () => {
    setIsScanning(true);
    setError('');
    try {
      const compiled = await compileAll();

      const allEntities: EntityStatus[] = [];
      let totalCommands = 0;
      let totalProperties = 0;

      for (const fileResult of compiled.results) {
        if (fileResult.diagnostics.some(d => d.severity === 'error')) continue;
        const scanData = buildScanResult(fileResult.ir, fileResult.file);
        allEntities.push(...scanData.entities);
        totalCommands += scanData.commandsChecked;
        totalProperties += scanData.propertiesScanned;
      }

      setResult({
        entities: allEntities,
        commandsChecked: totalCommands,
        propertiesScanned: totalProperties,
        filesCompiled: compiled.filesCompiled,
      });
    } catch (err) {
      setError(`Scan failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsScanning(false);
    }
  };

  const getStatusIcon = (status: 'pass' | 'warn' | 'fail') => {
    switch (status) {
      case 'pass': return <CheckCircle size={16} className="text-emerald-400" />;
      case 'warn': return <AlertTriangle size={16} className="text-amber-400" />;
      case 'fail': return <AlertCircle size={16} className="text-rose-400" />;
    }
  };

  const getStatusColor = (status: 'pass' | 'warn' | 'fail') => {
    switch (status) {
      case 'pass': return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
      case 'warn': return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
      case 'fail': return 'bg-rose-500/10 border-rose-500/20 text-rose-400';
    }
  };

  return (
    <div className="max-w-6xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100 mb-2 flex items-center gap-3">
          <Search size={24} className="text-accent" />
          Entity Scanner
        </h1>
        <p className="text-slate-400">
          Scan manifest files for entity status, policy coverage, and configuration issues.
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
              onClick={handleScan}
              disabled={isScanning || !selectedFile}
              className="flex-1 px-4 py-2 bg-accent text-slate-900 text-sm font-medium rounded-md hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              <Search size={14} />
              {isScanning ? 'Scanning...' : 'Scan Selected'}
            </button>
            <button
              onClick={handleScanAll}
              disabled={isScanning}
              className="px-4 py-2 bg-surface-lighter text-slate-200 text-sm font-medium rounded-md hover:bg-surface-lighter/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Scan All
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Database size={16} />
              Scan Results
            </label>
            {result && (
              <button
                onClick={() => setResult(null)}
                className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1"
              >
                <X size={12} /> Clear
              </button>
            )}
          </div>

          <div className="bg-surface-lighter border border-surface-border rounded-lg p-4 min-h-[400px] max-h-[600px] overflow-y-auto">
            {!result && (
              <div className="h-full flex items-center justify-center text-slate-500">
                <div className="text-center">
                  <Search size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Select a file and click "Scan" to analyze entities</p>
                </div>
              </div>
            )}

            {result && (
              <div className="space-y-4">
                {/* Summary */}
                <div className="flex gap-4 text-sm flex-wrap">
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-purple-400" />
                    <span className="text-slate-400">Files:</span>
                    <span className="text-slate-200 font-medium">{result.filesCompiled}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-emerald-400" />
                    <span className="text-slate-400">Entities:</span>
                    <span className="text-slate-200 font-medium">{result.entities.length}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Shield size={14} className="text-cyan-400" />
                    <span className="text-slate-400">Commands:</span>
                    <span className="text-slate-200 font-medium">{result.commandsChecked}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-purple-400" />
                    <span className="text-slate-400">Properties:</span>
                    <span className="text-slate-200 font-medium">{result.propertiesScanned}</span>
                  </div>
                </div>

                {result.entities.length === 0 && (
                  <div className="text-center text-slate-500 py-8">
                    <Database size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No entities found in selected file(s)</p>
                  </div>
                )}

                {/* Entity Cards */}
                <div className="space-y-3">
                  {result.entities.map((entity) => (
                    <div key={`${entity.file}-${entity.name}`} className={`border rounded-lg p-4 ${getStatusColor(entity.status)}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(entity.status)}
                          <span className="font-semibold">{entity.name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-slate-500">{entity.properties} properties</span>
                          {entity.store && (
                            <span className="px-2 py-0.5 bg-surface-lighter rounded">{entity.store}</span>
                          )}
                        </div>
                      </div>

                      {/* Properties */}
                      {entity.propertyNames.length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-1">
                          {entity.propertyNames.map(p => (
                            <span key={p} className="text-xs px-2 py-0.5 bg-surface rounded text-slate-400">{p}</span>
                          ))}
                        </div>
                      )}

                      {/* Commands */}
                      {entity.commands.length > 0 ? (
                        <div className="space-y-1">
                          {entity.commands.map((cmd) => (
                            <div key={cmd.name} className="flex items-center justify-between text-sm">
                              <span className="text-slate-400">.{cmd.name}()</span>
                              <div className="flex items-center gap-2">
                                {cmd.guardCount > 0 && (
                                  <span className="text-xs text-slate-600">{cmd.guardCount} guard{cmd.guardCount > 1 ? 's' : ''}</span>
                                )}
                                {cmd.hasPolicy ? (
                                  <span className="text-emerald-400 flex items-center gap-1">
                                    <CheckCircle size={12} /> Policy
                                  </span>
                                ) : (
                                  <span className="text-rose-400 flex items-center gap-1">
                                    <AlertCircle size={12} /> No policy
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 italic">No commands defined</div>
                      )}

                      {/* File source */}
                      <div className="mt-2 text-xs text-slate-600 truncate">
                        {entity.file}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
