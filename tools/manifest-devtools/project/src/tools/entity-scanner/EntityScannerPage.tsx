import { useState } from 'react';
import { Search, Play, CheckCircle, AlertCircle, AlertTriangle, FileText, Database, Shield, X } from 'lucide-react';

interface EntityStatus {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  commands: CommandStatus[];
  properties: number;
  store?: string;
}

interface CommandStatus {
  name: string;
  hasPolicy: boolean;
  status: 'pass' | 'warn' | 'fail';
}

interface ScanResult {
  entities: EntityStatus[];
  errors: string[];
  warnings: string[];
  commandsChecked: number;
  propertiesScanned: number;
}

// Mock the scanner logic for client-side (since we can't import Node.js modules directly)
function scanManifest(source: string): ScanResult {
  const result: ScanResult = {
    entities: [],
    errors: [],
    warnings: [],
    commandsChecked: 0,
    propertiesScanned: 0,
  };

  if (!source.trim()) {
    result.errors.push('No manifest source provided');
    return result;
  }

  // Simple parsing - look for entity blocks
  const entityRegex = /entity\s+(\w+)\s*\{/g;
  const commandRegex = /command\s+(\w+)\s*\(/g;
  const policyRegex = /policy\s+(\w+)\s+(\w+):/g;
  const propertyRegex = /property\s+(\w+)/g;
  const storeRegex = /store\s+(\w+)\s+in\s+(\w+)/g;

  // Find all entities
  const entities: Map<string, { commands: string[]; properties: number; store?: string }> = new Map();
  let match;

  // Track entity positions to parse each entity separately
  const entityMatches: Array<{ name: string; start: number; end: number }> = [];
  while ((match = entityRegex.exec(source)) !== null) {
    const name = match[1];
    const start = match.index;
    // Find the closing brace by counting braces
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

  // Process each entity
  for (const em of entityMatches) {
    const entitySource = source.slice(em.start, em.end);

    // Find commands in this entity
    const commands: string[] = [];
    while ((match = commandRegex.exec(entitySource)) !== null) {
      commands.push(match[1]);
    }

    // Find properties in this entity
    const properties: string[] = [];
    while ((match = propertyRegex.exec(entitySource)) !== null) {
      properties.push(match[1]);
    }

    // Find store for this entity
    let store: string | undefined;
    while ((match = storeRegex.exec(entitySource)) !== null) {
      if (match[1] === em.name) {
        store = match[2];
      }
    }

    entities.set(em.name, { commands, properties: properties.length, store });
    result.propertiesScanned += properties.length;
  }

  // Find all policies
  const policies = new Set<string>();
  while ((match = policyRegex.exec(source)) !== null) {
    policies.add(match[1]);
  }

  // Build entity statuses
  for (const [entityName, data] of entities) {
    const commands: CommandStatus[] = [];
    let hasErrors = false;
    let hasWarnings = false;

    for (const cmd of data.commands) {
      // Check if any policy matches this entity+command
      // A policy covers a command if it has execute or all action and matches entity
      const hasPolicy = Array.from(policies).some(p => {
        // Simple check: policy name contains entity name or is generic
        return p.toLowerCase().includes(entityName.toLowerCase()) ||
               p.toLowerCase().includes(cmd.toLowerCase());
      });

      commands.push({ name: cmd, hasPolicy, status: hasPolicy ? 'pass' : 'fail' });

      if (!hasPolicy) {
        hasErrors = true;
      }
      result.commandsChecked++;
    }

    // Check store target
    if (data.store && !['memory', 'localStorage', 'postgres', 'supabase'].includes(data.store)) {
      hasWarnings = true;
      result.warnings.push(`Entity '${entityName}' uses custom store target '${data.store}'`);
    }

    result.entities.push({
      name: entityName,
      status: hasErrors ? 'fail' : hasWarnings ? 'warn' : 'pass',
      commands,
      properties: data.properties,
      store: data.store,
    });
  }

  return result;
}

export default function EntityScannerPage() {
  const [source, setSource] = useState<string>(`entity User {
  property id: string
  property name: string
  property email: string
  property role: string

  store User in memory

  policy userRead execute: user.authenticated
  policy userWrite execute: user.role == "admin"

  command create(params: { name: string, email: string }) {
    guards: user.authenticated
    emit UserCreated({ userId: self.id })
  }

  command update(params: { name: string }) {
    guards: user.id == self.id || user.role == "admin"
  }

  command delete() {
    guards: user.role == "admin"
  }
}`);

  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const handleScan = async () => {
    setIsScanning(true);
    setError(null);

    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      const scanResult = scanManifest(source);
      setResult(scanResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setIsScanning(false);
    }
  };

  const getStatusIcon = (status: 'pass' | 'warn' | 'fail') => {
    switch (status) {
      case 'pass':
        return <CheckCircle size={16} className="text-emerald-400" />;
      case 'warn':
        return <AlertTriangle size={16} className="text-amber-400" />;
      case 'fail':
        return <AlertCircle size={16} className="text-rose-400" />;
    }
  };

  const getStatusColor = (status: 'pass' | 'warn' | 'fail') => {
    switch (status) {
      case 'pass':
        return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
      case 'warn':
        return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
      case 'fail':
        return 'bg-rose-500/10 border-rose-500/20 text-rose-400';
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
          Scan manifest code for entity status, policy coverage, and configuration issues.
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
              onClick={handleScan}
              disabled={isScanning || !source.trim()}
              className="px-4 py-1.5 bg-accent text-slate-900 text-sm font-medium rounded-md hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              <Play size={14} />
              {isScanning ? 'Scanning...' : 'Scan'}
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

        {/* Results */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Database size={16} />
              Scan Results
            </label>
            {result && (
              <button
                onClick={() => { setResult(null); setError(null); }}
                className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1"
              >
                <X size={12} />
                Clear
              </button>
            )}
          </div>

          <div className="bg-surface-lighter border border-surface-border rounded-lg p-4 min-h-[200px]">
            {error && (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-4">
                <div className="flex items-center gap-2 text-rose-400 font-medium mb-2">
                  <AlertCircle size={16} />
                  Error
                </div>
                <p className="text-sm text-rose-300">{error}</p>
              </div>
            )}

            {!result && !error && (
              <div className="h-full flex items-center justify-center text-slate-500">
                <div className="text-center">
                  <Search size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Click "Scan" to analyze your manifest</p>
                </div>
              </div>
            )}

            {result && (
              <div className="space-y-4">
                {/* Summary */}
                <div className="flex gap-4 text-sm">
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

                {/* Entity Cards */}
                <div className="space-y-3">
                  {result.entities.map((entity) => (
                    <div
                      key={entity.name}
                      className={`border rounded-lg p-4 ${getStatusColor(entity.status)}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(entity.status)}
                          <span className="font-semibold">{entity.name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-slate-500">{entity.properties} properties</span>
                          {entity.store && (
                            <span className="px-2 py-0.5 bg-surface-lighter rounded">
                              {entity.store}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Commands */}
                      <div className="space-y-1">
                        {entity.commands.map((cmd) => (
                          <div key={cmd.name} className="flex items-center justify-between text-sm">
                            <span className="text-slate-400">.{cmd.name}()</span>
                            <div className="flex items-center gap-1">
                              {cmd.hasPolicy ? (
                                <span className="text-emerald-400 flex items-center gap-1">
                                  <CheckCircle size={12} />
                                  Policy
                                </span>
                              ) : (
                                <span className="text-rose-400 flex items-center gap-1">
                                  <AlertCircle size={12} />
                                  No policy
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Warnings */}
                {result.warnings.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-amber-400 font-medium mb-2">
                      <AlertTriangle size={16} />
                      Warnings ({result.warnings.length})
                    </div>
                    <ul className="space-y-1">
                      {result.warnings.map((w, i) => (
                        <li key={i} className="text-sm text-amber-300">{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
