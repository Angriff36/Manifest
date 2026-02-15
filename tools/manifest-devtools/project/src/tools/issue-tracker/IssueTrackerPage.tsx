import { useState } from 'react';
import { AlertCircle, AlertTriangle, Info, Play, FileText, Search, Filter, CheckCircle, X } from 'lucide-react';

type IssueSeverity = 'error' | 'warning' | 'info';

interface Issue {
  id: string;
  severity: IssueSeverity;
  type: 'policy' | 'store' | 'property' | 'route' | 'constraint' | 'other';
  message: string;
  location?: {
    entity?: string;
    command?: string;
    line?: number;
  };
  suggestion: string;
}

// Parse source for issues - simplified version of scanner logic
function parseSourceForIssues(source: string): Issue[] {
  const issues: Issue[] = [];
  let issueId = 1;

  if (!source.trim()) {
    return issues;
  }

  // Find entities
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

  // Find policies
  const policies = new Set<string>();
  const policyRegex = /policy\s+(\w+)\s+/g;
  while ((match = policyRegex.exec(source)) !== null) {
    policies.add(match[1]);
  }

  // Check each entity for issues
  for (const em of entityMatches) {
    const entitySource = source.slice(em.start, em.end);

    // Find commands in entity
    const commandRegex = /command\s+(\w+)\s*\(/g;
    const commandNames: string[] = [];
    while ((match = commandRegex.exec(entitySource)) !== null) {
      commandNames.push(match[1]);
    }

    // Check each command for policy coverage
    for (const cmdName of commandNames) {
      const hasPolicy = Array.from(policies).some(p =>
        p.toLowerCase().includes(em.name.toLowerCase()) ||
        p.toLowerCase().includes(cmdName.toLowerCase())
      );

      if (!hasPolicy) {
        issues.push({
          id: `issue-${issueId++}`,
          severity: 'error',
          type: 'policy',
          message: `Command '${em.name}.${cmdName}' has no policy`,
          location: { entity: em.name, command: cmdName },
          suggestion: `Add a policy:\n  policy ${em.name}Can${cmdName.charAt(0).toUpperCase() + cmdName.slice(1)} execute: user.role in ["admin"]\n\nOr set entity defaults:\n  default policy execute: user.authenticated`,
        });
      }
    }

    // Check store targets
    const storeRegex = /store\s+(\w+)\s+in\s+(\w+)/g;
    while ((match = storeRegex.exec(entitySource)) !== null) {
      const [, entityName, target] = match;
      if (entityName === em.name) {
        const validTargets = ['memory', 'localStorage', 'postgres', 'supabase'];
        if (!validTargets.includes(target)) {
          issues.push({
            id: `issue-${issueId++}`,
            severity: 'warning',
            type: 'store',
            message: `Store target '${target}' is not a built-in target`,
            location: { entity: em.name },
            suggestion: `Valid built-in targets: ${validTargets.join(', ')}\n\nFor custom stores, bind in manifest.config.ts`,
          });
        }
      }
    }

    // Check for constraints
    const constraintRegex = /constraint\s+(\w+)\s+/g;
    const constraints: string[] = [];
    while ((match = constraintRegex.exec(entitySource)) !== null) {
      constraints.push(match[1]);
    }

    // Check for duplicate constraint codes (within entity)
    if (constraints.length > 1) {
      // Simplified check - just warn if multiple constraints exist
      issues.push({
        id: `issue-${issueId++}`,
        severity: 'info',
        type: 'constraint',
        message: `Entity '${em.name}' has ${constraints.length} constraints`,
        location: { entity: em.name },
        suggestion: 'Ensure constraint codes are unique within the entity',
      });
    }
  }

  // Check for missing entities with potential relationships
  const hasRelationships = /hasMany|hasOne|belongsTo|ref=/.test(source);
  if (entityMatches.length > 1 && hasRelationships) {
    // Check if all relationships reference existing entities
    const entityNames = new Set(entityMatches.map(e => e.name));
    const relationshipRegex = /(hasMany|hasOne|belongsTo|ref)\s*:\s*(\w+)/g;

    while ((match = relationshipRegex.exec(source)) !== null) {
      const targetEntity = match[2];
      if (!entityNames.has(targetEntity)) {
        issues.push({
          id: `issue-${issueId++}`,
          severity: 'error',
          type: 'other',
          message: `Relationship references non-existent entity '${targetEntity}'`,
          suggestion: `Ensure entity '${targetEntity}' is defined`,
        });
      }
    }
  }

  return issues;
}

export default function IssueTrackerPage() {
  const [source, setSource] = useState<string>(`entity User {
  property id: string
  property name: string
  property email: string
  property role: string

  store User in memory

  // No policies defined - commands will be flagged!
  command create(params: { name: string, email: string }) {
    guards: user.authenticated
    emit UserCreated({ userId: self.id })
  }

  command update(params: { name: string }) {
    guards: user.id == self.id
  }

  // No policy - will be flagged as error
  command delete()
}

entity Post {
  property id: string
  property title: string
  property authorId: string
  property status: string

  store Post in postgres

  // This policy covers read operations
  policy postRead execute: user.authenticated
  policy postWrite execute: user.role == "author" || user.role == "admin"

  command create(params: { title: string }) {
    guards: user.authenticated
  }

  // Custom store - will be flagged as warning
  store CustomCache in redis
}`);

  const [issues, setIssues] = useState<Issue[]>([]);
  const [filter, setFilter] = useState<IssueSeverity | 'all'>('all');
  const [isScanning, setIsScanning] = useState(false);
  const [resolved, setResolved] = useState<Set<string>>(new Set());

  const handleScan = async () => {
    setIsScanning(true);
    await new Promise(resolve => setTimeout(resolve, 300));
    try {
      const foundIssues = parseSourceForIssues(source);
      setIssues(foundIssues);
      setResolved(new Set());
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
          Mirror of manifest scan output - track and resolve configuration issues.
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
              <Search size={14} />
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

        {/* Issues List */}
        <div className="space-y-3">
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

          <div className="bg-surface-lighter border border-surface-border rounded-lg p-4 min-h-[200px] max-h-[500px] overflow-y-auto">
            {issues.length === 0 && (
              <div className="h-full flex items-center justify-center text-slate-500">
                <div className="text-center">
                  <Search size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Click "Scan" to find issues</p>
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

                    {issue.location && (
                      <p className="text-xs text-slate-500 mb-2">
                        {issue.location.entity && `Entity: ${issue.location.entity}`}
                        {issue.location.command && `, Command: ${issue.location.command}`}
                        {issue.location.line && `, Line: ${issue.location.line}`}
                      </p>
                    )}

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
