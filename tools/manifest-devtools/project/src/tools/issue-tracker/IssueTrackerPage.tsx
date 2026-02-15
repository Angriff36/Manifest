import { useState, useEffect } from 'react';
import { AlertCircle, AlertTriangle, Info, Search, Filter, CheckCircle, X, Folder, RefreshCw } from 'lucide-react';
import { scanFile, scanAll, listFiles, checkHealth, type ManifestFile } from '../../lib/api';

type IssueSeverity = 'error' | 'warning' | 'info';

interface Issue {
  id: string;
  severity: IssueSeverity;
  type: 'policy' | 'store' | 'property' | 'route' | 'constraint' | 'other';
  message: string;
  file: string;
  line?: number;
  entity?: string;
  command?: string;
  suggestion: string;
}

export default function IssueTrackerPage() {
  const [files, setFiles] = useState<ManifestFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [filter, setFilter] = useState<IssueSeverity | 'all'>('all');
  const [isScanning, setIsScanning] = useState(false);
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [serverStatus, setServerStatus] = useState<{connected: boolean; root: string} | null>(null);
  const [error, setError] = useState<string>('');

  // Check server health on mount
  useEffect(() => {
    checkHealth()
      .then(status => {
        setServerStatus({ connected: true, root: status.manifestRoot });
        loadFiles();
      })
      .catch(() => {
        setServerStatus({ connected: false, root: '' });
        setError('API server not available. Run: npm run server');
      });
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
      const result = await scanFile(selectedFile);
      
      // Convert scan result to issues format
      const newIssues: Issue[] = [
        ...result.errors.map((e, i) => ({
          id: `error-${i}`,
          severity: 'error' as const,
          type: 'policy' as const,
          message: e.message,
          file: e.file,
          line: e.line,
          entity: e.entityName,
          command: e.commandName,
          suggestion: e.suggestion,
        })),
        ...result.warnings.map((w, i) => ({
          id: `warning-${i}`,
          severity: 'warning' as const,
          type: (w.message.includes('property') ? 'property' : 
               w.message.includes('route') ? 'route' : 'store') as Issue['type'],
          message: w.message,
          file: w.file,
          line: w.line,
          suggestion: w.suggestion || '',
        })),
      ];
      
      setIssues(newIssues);
      setResolved(new Set());
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
      const result = await scanAll();
      
      const newIssues: Issue[] = [
        ...result.errors.map((e, i) => ({
          id: `error-${i}`,
          severity: 'error' as const,
          type: 'policy' as const,
          message: e.message,
          file: e.file,
          line: e.line,
          entity: e.entityName,
          command: e.commandName,
          suggestion: e.suggestion,
        })),
        ...result.warnings.map((w, i) => ({
          id: `warning-${i}`,
          severity: 'warning' as const,
          type: (w.message.includes('property') ? 'property' : 
               w.message.includes('route') ? 'route' : 'store') as Issue['type'],
          message: w.message,
          file: w.file,
          line: w.line,
          suggestion: w.suggestion || '',
        })),
      ];
      
      setIssues(newIssues);
      setResolved(new Set());
    } catch (err) {
      setError(`Scan failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsScanning(false);
    }
  };

  const filteredIssues = issues.filter(issue =>
    filter === 'all' || issue.severity === filter
  );

  const unresolvedCount = filteredIssues.filter(i => !resolved.has(i.id)).length;

  const getSeverityIcon = (severity: IssueSeverity) => {
    switch (severity) {
      case 'error':
        return <AlertCircle size={16} className="text-rose-400" />;
      case 'warning':
        return <AlertTriangle size={16} className="text-amber-400" />;
      case 'info':
        return <Info size={16} className="text-cyan-400" />;
    }
  };

  const getSeverityStyles = (severity: IssueSeverity) => {
    switch (severity) {
      case 'error':
        return 'bg-rose-500/10 border-rose-500/20';
      case 'warning':
        return 'bg-amber-500/10 border-amber-500/20';
      case 'info':
        return 'bg-cyan-500/10 border-cyan-500/20';
    }
  };

  const toggleResolved = (id: string) => {
    setResolved(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;

  return (
    <div className="max-w-6xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100 mb-2 flex items-center gap-3">
          <AlertCircle size={24} className="text-accent" />
          Issue Tracker
        </h1>
        <p className="text-slate-400">
          Real-time manifest scan output from your project files.
        </p>
        {serverStatus && (
          <div className={`mt-2 flex items-center gap-2 text-sm ${serverStatus.connected ? 'text-emerald-400' : 'text-rose-400'}`}>
            <div className={`w-2 h-2 rounded-full ${serverStatus.connected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            {serverStatus.connected ? `Connected to: ${serverStatus.root}` : 'Server disconnected'}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-4 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400">
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
            <button
              onClick={loadFiles}
              className="p-1 text-slate-400 hover:text-slate-200"
              title="Refresh file list"
            >
              <RefreshCw size={14} />
            </button>
          </div>
          
          <div className="bg-surface-lighter border border-surface-border rounded-lg max-h-96 overflow-y-auto">
            {files.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-sm">
                No .manifest files found
              </div>
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

        {/* Issues List */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Filter size={16} />
              Issues
            </label>
            <div className="flex items-center gap-2">
              {/* Filter Buttons */}
              <div className="flex gap-1">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-2 py-1 text-xs rounded ${
                    filter === 'all'
                      ? 'bg-accent text-slate-900'
                      : 'bg-surface-lighter text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All ({issues.length})
                </button>
                <button
                  onClick={() => setFilter('error')}
                  className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${
                    filter === 'error'
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : 'bg-surface-lighter text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <AlertCircle size={10} />
                  {errorCount}
                </button>
                <button
                  onClick={() => setFilter('warning')}
                  className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${
                    filter === 'warning'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-surface-lighter text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <AlertTriangle size={10} />
                  {warningCount}
                </button>
                <button
                  onClick={() => setFilter('info')}
                  className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${
                    filter === 'info'
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'bg-surface-lighter text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Info size={10} />
                  {infoCount}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-surface-lighter border border-surface-border rounded-lg p-4 min-h-[400px] max-h-[600px] overflow-y-auto">
            {issues.length === 0 && (
              <div className="h-full flex items-center justify-center text-slate-500">
                <div className="text-center">
                  <Search size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Select a file and click "Scan" to find issues</p>
                </div>
              </div>
            )}

            {issues.length > 0 && filteredIssues.length === 0 && (
              <div className="h-full flex items-center justify-center text-slate-500">
                <div className="text-center">
                  <CheckCircle size={32} className="mx-auto mb-2 text-emerald-400" />
                  <p className="text-sm">No {filter} issues</p>
                </div>
              </div>
            )}

            {filteredIssues.length > 0 && (
              <div className="space-y-3">
                {filteredIssues.map((issue) => (
                  <div
                    key={issue.id}
                    className={`border rounded-lg p-4 ${getSeverityStyles(issue.severity)} ${
                      resolved.has(issue.id) ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getSeverityIcon(issue.severity)}
                        <span className={`text-sm font-medium ${
                          issue.severity === 'error' ? 'text-rose-400' :
                          issue.severity === 'warning' ? 'text-amber-400' :
                          'text-cyan-400'
                        }`}>
                          {issue.severity.toUpperCase()}
                        </span>
                        <span className="text-xs text-slate-500 uppercase">
                          {issue.type}
                        </span>
                      </div>
                      <button
                        onClick={() => toggleResolved(issue.id)}
                        className={`p-1 rounded transition-colors ${
                          resolved.has(issue.id)
                            ? 'text-emerald-400 hover:text-emerald-300'
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                        title={resolved.has(issue.id) ? 'Mark as unresolved' : 'Mark as resolved'}
                      >
                        {resolved.has(issue.id) ? <CheckCircle size={16} /> : <X size={16} />}
                      </button>
                    </div>

                    <p className="text-sm text-slate-200 mb-1">{issue.message}</p>

                    <p className="text-xs text-slate-500 mb-2">
                      {issue.file}
                      {issue.line && `:${issue.line}`}
                      {issue.entity && ` • Entity: ${issue.entity}`}
                      {issue.command && ` • Command: ${issue.command}`}
                    </p>

                    <div className="bg-surface rounded p-2 mt-2">
                      <p className="text-xs text-slate-400 font-medium mb-1">Suggestion:</p>
                      <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono">
                        {issue.suggestion}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Summary */}
          {issues.length > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">
                Showing {filteredIssues.length} of {issues.length} issues
              </span>
              <span className="text-slate-400">
                {unresolvedCount} unresolved
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
