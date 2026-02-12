import { useState, useMemo } from 'react';
import {
  ArrowRight,
  Play,
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronRight,
  FileCode2,
} from 'lucide-react';
import CodeEditor from '../../components/CodeEditor';
import { applyMigration, computeDiff, type DiffLine, type AppliedRule } from './rewriteEngine';
import { VERSIONS, getRulesForVersions, getBreakingChanges, type BreakingChange } from './versionRules';

const SAMPLE_SOURCE = `// Order validation module
fn validate_order(order) {
  guard order.total > 0
  guard order.items.length > 0
  guard order.status == "pending"

  let tax = calculate_tax(order.total)
  let shipping = estimate_shipping(order.address)

  match order.priority {
    "rush" -> apply_rush_fee(order)
    "standard" -> noop()
  }

  return {
    subtotal: order.total,
    tax: tax,
    shipping: shipping,
    total: order.total + tax + shipping
  }
}

fn calculate_tax(amount) {
  guard amount > 0
  let rate = lookup_tax_rate()
  return amount * rate
}`;

export default function MigrationPage() {
  const [fromVersion, setFromVersion] = useState('0.1.0');
  const [toVersion, setToVersion] = useState('1.0.0');
  const [source, setSource] = useState(SAMPLE_SOURCE);
  const [hasMigrated, setHasMigrated] = useState(false);

  const migration = useMemo(() => {
    if (!hasMigrated) return null;
    const rules = getRulesForVersions(fromVersion, toVersion);
    return applyMigration(source, rules);
  }, [source, fromVersion, toVersion, hasMigrated]);

  const diff = useMemo(() => {
    if (!migration) return [];
    return computeDiff(source, migration.output);
  }, [source, migration]);

  const breakingChanges = useMemo(() => {
    return getBreakingChanges(fromVersion, toVersion);
  }, [fromVersion, toVersion]);

  const runMigration = () => setHasMigrated(true);

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-100 mb-1">Migration Assistant</h1>
        <p className="text-sm text-slate-400">
          Automatically migrate Manifest source between syntax versions. Review changes with a side-by-side diff.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">From:</label>
          <select
            value={fromVersion}
            onChange={(e) => { setFromVersion(e.target.value); setHasMigrated(false); }}
            className="tool-input"
          >
            {VERSIONS.slice(0, -1).map((v) => (
              <option key={v.version} value={v.version}>{v.label}</option>
            ))}
          </select>
        </div>

        <ArrowRight size={16} className="text-slate-500" />

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">To:</label>
          <select
            value={toVersion}
            onChange={(e) => { setToVersion(e.target.value); setHasMigrated(false); }}
            className="tool-input"
          >
            {VERSIONS.filter((v) => v.version > fromVersion).map((v) => (
              <option key={v.version} value={v.version}>{v.label}</option>
            ))}
          </select>
        </div>

        <button onClick={runMigration} className="btn-primary ml-auto">
          <Play size={14} /> Migrate
        </button>
      </div>

      {breakingChanges.length > 0 && (
        <BreakingChangesPanel changes={breakingChanges} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="tool-panel p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileCode2 size={14} className="text-slate-400" />
            <h3 className="text-sm font-medium text-slate-300">
              Original ({VERSIONS.find((v) => v.version === fromVersion)?.label})
            </h3>
          </div>
          <CodeEditor value={source} onChange={(v) => { setSource(v); setHasMigrated(false); }} height="280px" />
        </div>

        <div className="tool-panel p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileCode2 size={14} className="text-accent" />
            <h3 className="text-sm font-medium text-slate-300">
              Migrated ({VERSIONS.find((v) => v.version === toVersion)?.label})
            </h3>
            {migration && (
              <span className="badge-info text-[10px] ml-auto">
                {migration.appliedRules.length} changes
              </span>
            )}
          </div>
          <CodeEditor
            value={migration?.output || source}
            onChange={() => {}}
            readOnly
            height="280px"
          />
        </div>
      </div>

      {migration && diff.length > 0 && (
        <div className="space-y-4">
          <DiffPanel diff={diff} />
          <AppliedRulesPanel rules={migration.appliedRules} />
        </div>
      )}

      {!migration && (
        <div className="tool-panel flex flex-col items-center justify-center py-12 text-slate-500">
          <ArrowRight size={32} className="mb-3 text-slate-600" />
          <p className="text-sm">Select versions and click "Migrate" to see the diff</p>
        </div>
      )}
    </div>
  );
}

function BreakingChangesPanel({ changes }: { changes: BreakingChange[] }) {
  const [expanded, setExpanded] = useState(false);
  const breaking = changes.filter((c) => c.severity === 'breaking');
  const warnings = changes.filter((c) => c.severity === 'warning');

  return (
    <div className="tool-panel p-4 mb-4 border-l-4 border-l-amber-500 animate-slide-in">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left"
      >
        <AlertTriangle size={14} className="text-amber-400" />
        <span className="text-sm font-medium text-slate-200">
          {breaking.length} breaking change{breaking.length !== 1 ? 's' : ''}, {warnings.length} warning{warnings.length !== 1 ? 's' : ''}
        </span>
        {expanded ? <ChevronDown size={14} className="ml-auto text-slate-500" /> : <ChevronRight size={14} className="ml-auto text-slate-500" />}
      </button>
      {expanded && (
        <div className="mt-3 space-y-2 animate-fade-in">
          {changes.map((change, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              {change.severity === 'breaking' ? (
                <AlertCircle size={12} className="text-rose-400 mt-0.5 shrink-0" />
              ) : change.severity === 'warning' ? (
                <AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" />
              ) : (
                <Info size={12} className="text-cyan-400 mt-0.5 shrink-0" />
              )}
              <div>
                <p className="text-slate-300">{change.title}</p>
                <p className="text-slate-500">{change.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DiffPanel({ diff }: { diff: DiffLine[] }) {
  return (
    <div className="tool-panel overflow-hidden">
      <div className="px-4 py-2 border-b border-surface-border bg-surface-light/50">
        <h4 className="text-sm font-medium text-slate-300">Diff View</h4>
      </div>
      <div className="overflow-x-auto max-h-72 overflow-y-auto">
        <pre className="text-xs code-font">
          {diff.map((line, i) => (
            <div
              key={i}
              className={`px-4 py-0.5 ${
                line.type === 'added'
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : line.type === 'removed'
                  ? 'bg-rose-500/10 text-rose-400'
                  : 'text-slate-400'
              }`}
            >
              <span className="select-none text-slate-600 w-8 inline-block text-right mr-4">
                {line.lineNumber}
              </span>
              <span className="select-none mr-2">
                {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
              </span>
              {line.content}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

function AppliedRulesPanel({ rules }: { rules: AppliedRule[] }) {
  if (rules.length === 0) return null;

  return (
    <div className="tool-panel p-4 animate-slide-in">
      <h4 className="text-sm font-medium text-slate-300 mb-3">Applied Rules ({rules.length})</h4>
      <div className="space-y-2">
        {rules.map((applied, i) => (
          <div key={i} className="bg-surface rounded-md border border-surface-border p-3">
            <div className="flex items-center gap-2 mb-2">
              {applied.rule.severity === 'breaking' ? (
                <span className="badge-error text-[10px]">Breaking</span>
              ) : applied.rule.severity === 'warning' ? (
                <span className="badge-warning text-[10px]">Warning</span>
              ) : (
                <span className="badge-info text-[10px]">Info</span>
              )}
              <span className="text-xs text-slate-300">{applied.rule.description}</span>
              <span className="text-[10px] text-slate-600 ml-auto">Line {applied.lineNumber}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs code-font">
              <div className="bg-rose-500/5 rounded px-2 py-1 text-rose-400">{applied.before}</div>
              <div className="bg-emerald-500/5 rounded px-2 py-1 text-emerald-400">{applied.after}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
