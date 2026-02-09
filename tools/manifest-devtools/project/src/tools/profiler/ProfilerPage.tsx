import { useState, useMemo } from 'react';
import { Play, Clock, Cpu, Layers, Flame, AlertTriangle } from 'lucide-react';
import CodeEditor from '../../components/CodeEditor';
import FlameChart from './FlameChart';
import { buildTrace, type ProfileStats } from './traceBuilder';

const SAMPLE_CODE = `fn validate_order(order) {
  guard order.total > 0
  guard order.items.length > 0
  guard order.status == "pending"

  let tax = calculate_tax(order.total)
  let shipping = estimate_shipping(order.address)

  match order.priority {
    "rush" => apply_rush_fee(order)
    "standard" => noop()
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
}

fn estimate_shipping(address) {
  guard not isEmpty(address)
  let distance = calculate_distance(address)
  return distance * 0.05
}`;

export default function ProfilerPage() {
  const [code, setCode] = useState(SAMPLE_CODE);
  const [hasProfiled, setHasProfiled] = useState(false);

  const profile = useMemo(() => {
    if (!hasProfiled) return null;
    return buildTrace(code);
  }, [code, hasProfiled]);

  const runProfile = () => setHasProfiled(true);

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-100 mb-1">Runtime Performance Profiler</h1>
        <p className="text-sm text-slate-400">
          Analyze execution performance of Manifest programs. Identify bottlenecks with flame charts.
        </p>
      </div>

      <div className="space-y-4">
        <div className="tool-panel p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-slate-300">Manifest Source</h3>
            <button onClick={runProfile} className="btn-primary text-xs">
              <Play size={12} /> Profile
            </button>
          </div>
          <CodeEditor value={code} onChange={(v) => { setCode(v); setHasProfiled(false); }} height="200px" />
        </div>

        {profile && (
          <>
            <StatsBar stats={profile.stats} />

            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                <Flame size={14} className="text-accent" /> Flame Chart
              </h3>
              <FlameChart root={profile.root} height={260} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <HotPathPanel hotPath={profile.stats.hotPath} totalTime={profile.stats.totalTime} />
              <TimingBreakdown root={profile.root} />
            </div>
          </>
        )}

        {!profile && (
          <div className="tool-panel flex flex-col items-center justify-center py-16 text-slate-500">
            <Flame size={32} className="mb-3 text-slate-600" />
            <p className="text-sm">Click "Profile" to generate execution analysis</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatsBar({ stats }: { stats: ProfileStats }) {
  const items = [
    { label: 'Total Time', value: `${stats.totalTime}ms`, icon: <Clock size={14} />, color: 'text-accent' },
    { label: 'Peak Memory', value: `${stats.peakMemoryKB} KB`, icon: <Cpu size={14} />, color: 'text-amber-400' },
    { label: 'Functions', value: String(stats.functionCount), icon: <Layers size={14} />, color: 'text-emerald-400' },
    { label: 'Guards', value: String(stats.guardCount), icon: <AlertTriangle size={14} />, color: 'text-cyan-400' },
    { label: 'Max Depth', value: String(stats.deepestStack), icon: <Flame size={14} />, color: 'text-rose-400' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 animate-slide-in">
      {items.map((item) => (
        <div key={item.label} className="tool-panel px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <span className={item.color}>{item.icon}</span>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">{item.label}</span>
          </div>
          <p className={`text-lg font-semibold code-font ${item.color}`}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function HotPathPanel({ hotPath, totalTime }: { hotPath: string[]; totalTime: number }) {
  return (
    <div className="tool-panel p-4 animate-slide-in">
      <h4 className="text-sm font-medium text-slate-300 mb-3">Hot Path</h4>
      <div className="space-y-2">
        {hotPath.map((segment, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className="h-3 rounded-sm bg-accent/20 border border-accent/30"
              style={{ width: `${Math.max(100 - i * 20, 20)}%` }}
            />
            <span className="code-font text-xs text-slate-300 whitespace-nowrap">{segment}</span>
          </div>
        ))}
        <p className="text-[10px] text-slate-500 mt-2">
          Total hot path: {totalTime.toFixed(1)}ms
        </p>
      </div>
    </div>
  );
}

function TimingBreakdown({ root }: { root: import('./traceBuilder').FlameNode }) {
  const allNodes = useMemo(() => {
    const nodes: Array<{ name: string; duration: number; selfTime: number; category: string }> = [];
    function walk(node: import('./traceBuilder').FlameNode) {
      nodes.push({ name: node.name, duration: node.duration, selfTime: node.selfTime, category: node.category });
      node.children.forEach(walk);
    }
    walk(root);
    return nodes.sort((a, b) => b.duration - a.duration).slice(0, 8);
  }, [root]);

  return (
    <div className="tool-panel p-4 animate-slide-in">
      <h4 className="text-sm font-medium text-slate-300 mb-3">Timing Breakdown</h4>
      <div className="space-y-1.5">
        {allNodes.map((node, i) => (
          <div key={i} className="flex items-center gap-3 text-xs">
            <span className="code-font text-slate-300 w-36 truncate">{node.name}</span>
            <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
              <div
                className="h-full bg-accent/40 rounded-full"
                style={{ width: `${(node.duration / root.duration) * 100}%` }}
              />
            </div>
            <span className="code-font text-slate-400 w-16 text-right">{node.duration.toFixed(1)}ms</span>
          </div>
        ))}
      </div>
    </div>
  );
}
