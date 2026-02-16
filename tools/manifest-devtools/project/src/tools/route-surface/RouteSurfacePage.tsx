import { useState, useEffect, useMemo } from 'react';
import {
  Globe,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  ArrowUpRight,
  Shield,
  Users,
  FileText,
  Zap,
} from 'lucide-react';
import { compileAll, type CompileAllResult } from '../../lib/api';

// ============================================================================
// Route derivation (mirrors src/manifest/projections/routes/generator.ts)
// ============================================================================

interface RouteEntry {
  id: string;
  path: string;
  method: 'GET' | 'POST';
  params: Array<{ name: string; type: string; location: string }>;
  source: { kind: string; entity?: string; command?: string; id?: string };
  auth: boolean;
  tenant: boolean;
}

function toEntitySegment(value: string): string {
  return value.toLowerCase();
}

function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

function deriveRoutesFromIR(ir: CompileAllResult['results'][0]['ir']): RouteEntry[] {
  if (!ir) return [];
  const routes: RouteEntry[] = [];
  const basePath = '/api';

  // Entity read routes
  const entities = [...(ir.entities || [])].sort((a, b) => a.name.localeCompare(b.name));
  for (const entity of entities) {
    const seg = toEntitySegment(entity.name);
    routes.push({
      id: `${entity.name}.GET.list`,
      path: `${basePath}/${seg}/list`,
      method: 'GET',
      params: [],
      source: { kind: 'entity-read', entity: entity.name },
      auth: true,
      tenant: true,
    });
    routes.push({
      id: `${entity.name}.GET.detail`,
      path: `${basePath}/${seg}/:id`,
      method: 'GET',
      params: [{ name: 'id', type: 'string', location: 'path' }],
      source: { kind: 'entity-read', entity: entity.name },
      auth: true,
      tenant: true,
    });
  }

  // Command routes
  const commands = [...(ir.commands || [])].sort((a, b) => {
    const aKey = `${a.entity ?? ''}.${a.name}`;
    const bKey = `${b.entity ?? ''}.${b.name}`;
    return aKey.localeCompare(bKey);
  });
  for (const cmd of commands) {
    if (!cmd.entity) continue;
    const seg = toEntitySegment(cmd.entity);
    const cmdSeg = toKebabCase(cmd.name);
    routes.push({
      id: `${cmd.entity}.${cmd.name}`,
      path: `${basePath}/${seg}/${cmdSeg}`,
      method: 'POST',
      params: [], // simplified for display
      source: { kind: 'command', entity: cmd.entity, command: cmd.name },
      auth: true,
      tenant: true,
    });
  }

  return routes;
}

// Check if a command has policy coverage
function hasPolicyCoverage(
  entityName: string,
  policies: Array<{ entity?: string; action: string }> | undefined
): boolean {
  if (!policies) return false;
  return policies.some(
    p => (p.action === 'execute' || p.action === 'all') && (!p.entity || p.entity === entityName)
  );
}

// ============================================================================
// Component
// ============================================================================

export default function RouteSurfacePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compileResults, setCompileResults] = useState<CompileAllResult | null>(null);
  const [filter, setFilter] = useState<'all' | 'read' | 'write' | 'manual'>('all');

  const scan = async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await compileAll();
      setCompileResults(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    scan();
  }, []);

  // Derive routes from all compiled IRs
  const { routes, policyCoverage, stats } = useMemo(() => {
    if (!compileResults) return { routes: [], policyCoverage: new Set<string>(), stats: { total: 0, reads: 0, writes: 0, manual: 0, covered: 0, uncovered: 0 } };

    const allRoutes: RouteEntry[] = [];
    const coverage = new Set<string>();

    for (const result of compileResults.results) {
      if (!result.ir) continue;
      allRoutes.push(...deriveRoutesFromIR(result.ir));

      // Build policy coverage
      for (const entity of result.ir.entities || []) {
        if (hasPolicyCoverage(entity.name, result.ir.policies)) {
          coverage.add(entity.name);
        }
      }
    }

    const reads = allRoutes.filter(r => r.source.kind === 'entity-read').length;
    const writes = allRoutes.filter(r => r.source.kind === 'command').length;
    const manual = allRoutes.filter(r => r.source.kind === 'manual').length;

    const commandRoutes = allRoutes.filter(r => r.source.kind === 'command');
    const covered = commandRoutes.filter(r => r.source.entity && coverage.has(r.source.entity)).length;
    const uncovered = commandRoutes.length - covered;

    return {
      routes: allRoutes,
      policyCoverage: coverage,
      stats: { total: allRoutes.length, reads, writes, manual, covered, uncovered },
    };
  }, [compileResults]);

  const filteredRoutes = useMemo(() => {
    if (filter === 'all') return routes;
    if (filter === 'read') return routes.filter(r => r.source.kind === 'entity-read');
    if (filter === 'write') return routes.filter(r => r.source.kind === 'command');
    if (filter === 'manual') return routes.filter(r => r.source.kind === 'manual');
    return routes;
  }, [routes, filter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Globe size={20} className="text-accent" />
            Route Surface
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Canonical route manifest derived from IR. No filesystem scanning.
          </p>
        </div>
        <button
          onClick={scan}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-xs bg-accent/10 text-accent border border-accent/20 rounded-md hover:bg-accent/20 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Scanning...' : 'Refresh'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard label="Total Routes" value={stats.total} icon={<Globe size={14} />} />
        <StatCard label="Read (GET)" value={stats.reads} icon={<FileText size={14} />} color="blue" />
        <StatCard label="Write (POST)" value={stats.writes} icon={<Zap size={14} />} color="amber" />
        <StatCard label="Manual" value={stats.manual} icon={<ArrowUpRight size={14} />} color="slate" />
        <StatCard label="Policy Covered" value={stats.covered} icon={<Shield size={14} />} color="emerald" />
        <StatCard label="No Policy" value={stats.uncovered} icon={<AlertTriangle size={14} />} color={stats.uncovered > 0 ? 'red' : 'emerald'} />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-surface-border pb-px">
        {(['all', 'read', 'write', 'manual'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs rounded-t-md transition-colors ${
              filter === f
                ? 'bg-surface-lighter text-accent border-b-2 border-accent'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {f === 'all' ? 'All' : f === 'read' ? 'Reads' : f === 'write' ? 'Writes' : 'Manual'}
            <span className="ml-1.5 text-[10px] opacity-60">
              {f === 'all' ? stats.total : f === 'read' ? stats.reads : f === 'write' ? stats.writes : stats.manual}
            </span>
          </button>
        ))}
      </div>

      {/* Route table */}
      <div className="bg-surface-light border border-surface-border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-surface-border bg-surface-lighter/50">
              <th className="text-left px-4 py-2.5 text-slate-500 font-medium">Method</th>
              <th className="text-left px-4 py-2.5 text-slate-500 font-medium">Path</th>
              <th className="text-left px-4 py-2.5 text-slate-500 font-medium">Source</th>
              <th className="text-left px-4 py-2.5 text-slate-500 font-medium">Params</th>
              <th className="text-center px-4 py-2.5 text-slate-500 font-medium">Auth</th>
              <th className="text-center px-4 py-2.5 text-slate-500 font-medium">Tenant</th>
              <th className="text-center px-4 py-2.5 text-slate-500 font-medium">Policy</th>
            </tr>
          </thead>
          <tbody>
            {filteredRoutes.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-600">
                  {loading ? 'Compiling...' : 'No routes found. Compile .manifest files first.'}
                </td>
              </tr>
            ) : (
              filteredRoutes.map((route, i) => {
                const entityName = route.source.entity;
                const hasCoverage = entityName ? policyCoverage.has(entityName) : false;
                const isWrite = route.source.kind === 'command';

                return (
                  <tr
                    key={route.id + '-' + i}
                    className="border-b border-surface-border/50 hover:bg-surface-hover/30 transition-colors"
                  >
                    <td className="px-4 py-2">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                          route.method === 'GET'
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}
                      >
                        {route.method}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-slate-300">{route.path}</td>
                    <td className="px-4 py-2">
                      <SourceBadge source={route.source} />
                    </td>
                    <td className="px-4 py-2 text-slate-500">
                      {route.params.length > 0
                        ? route.params.map(p => p.name).join(', ')
                        : '—'}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {route.auth ? (
                        <Shield size={14} className="inline text-emerald-400" />
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {route.tenant ? (
                        <Users size={14} className="inline text-blue-400" />
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {isWrite ? (
                        hasCoverage ? (
                          <CheckCircle size={14} className="inline text-emerald-400" />
                        ) : (
                          <AlertCircle size={14} className="inline text-red-400" />
                        )
                      ) : (
                        <span className="text-slate-600 text-[10px]">read</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Determinism note */}
      <p className="text-[10px] text-slate-600 text-center">
        Route surface is deterministic. Identical IR + config = identical manifest.
        See docs/spec/manifest-vnext.md § "Canonical Routes".
      </p>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function StatCard({
  label,
  value,
  icon,
  color = 'accent',
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color?: string;
}) {
  const colorMap: Record<string, string> = {
    accent: 'text-accent',
    blue: 'text-blue-400',
    amber: 'text-amber-400',
    emerald: 'text-emerald-400',
    red: 'text-red-400',
    slate: 'text-slate-400',
  };

  return (
    <div className="bg-surface-light border border-surface-border rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={colorMap[color] || 'text-accent'}>{icon}</span>
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-xl font-semibold ${colorMap[color] || 'text-accent'}`}>{value}</p>
    </div>
  );
}

function SourceBadge({ source }: { source: RouteEntry['source'] }) {
  if (source.kind === 'entity-read') {
    return (
      <span className="inline-flex items-center gap-1 text-blue-400">
        <FileText size={12} />
        <span>{source.entity}</span>
      </span>
    );
  }
  if (source.kind === 'command') {
    return (
      <span className="inline-flex items-center gap-1 text-amber-400">
        <Zap size={12} />
        <span>
          {source.entity}.{source.command}
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-slate-400">
      <ArrowUpRight size={12} />
      <span>{source.id}</span>
    </span>
  );
}
