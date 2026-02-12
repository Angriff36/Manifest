import {
  ShieldCheck,
  FileCode2,
  Gauge,
  Fingerprint,
  ArrowRightLeft,
  ArrowRight,
  Terminal,
  Star,
} from 'lucide-react';
import type { ToolId } from '../components/Layout';

interface DashboardProps {
  onNavigate: (id: ToolId) => void;
}

const TOOLS: Array<{
  id: ToolId;
  name: string;
  description: string;
  icon: React.ReactNode;
  impact: number;
  phase: string;
  status: string;
  color: string;
}> = [
  {
    id: 'guard-debugger',
    name: 'Guard Expression Debugger',
    description: 'Test guard expressions interactively against sample data with step-by-step evaluation traces.',
    icon: <ShieldCheck size={24} />,
    impact: 4,
    phase: 'Phase 2',
    status: 'Ready',
    color: 'from-cyan-500/10 to-transparent border-cyan-500/20',
  },
  {
    id: 'fixture-generator',
    name: 'Conformance Fixture Generator',
    description: 'Generate .manifest, .ir.json, and .results.json fixture bundles for conformance testing.',
    icon: <FileCode2 size={24} />,
    impact: 3,
    phase: 'Phase 2',
    status: 'Ready',
    color: 'from-emerald-500/10 to-transparent border-emerald-500/20',
  },
  {
    id: 'profiler',
    name: 'Runtime Performance Profiler',
    description: 'Analyze execution performance with flame charts, timing breakdowns, and bottleneck detection.',
    icon: <Gauge size={24} />,
    impact: 2,
    phase: 'Phase 3',
    status: 'Ready',
    color: 'from-amber-500/10 to-transparent border-amber-500/20',
  },
  {
    id: 'ir-verifier',
    name: 'IR Provenance Verifier',
    description: 'Verify IR integrity with SHA-256 hashing, provenance chain tracking, and tamper detection.',
    icon: <Fingerprint size={24} />,
    impact: 2,
    phase: 'Phase 3',
    status: 'Ready',
    color: 'from-rose-500/10 to-transparent border-rose-500/20',
  },
  {
    id: 'migration',
    name: 'Migration Assistant',
    description: 'Migrate between Manifest syntax versions with automated rewrites and side-by-side diffs.',
    icon: <ArrowRightLeft size={24} />,
    impact: 1,
    phase: 'Phase 3',
    status: 'Ready',
    color: 'from-sky-500/10 to-transparent border-sky-500/20',
  },
];

export default function Dashboard({ onNavigate }: DashboardProps) {
  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            <Terminal size={24} className="text-accent" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-slate-100 mb-2">Manifest DevTools</h1>
        <p className="text-slate-400 max-w-lg mx-auto">
          A comprehensive suite of developer tools for the Manifest language.
          Debug guards, generate test fixtures, profile performance, verify IR integrity, and migrate between versions.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            onClick={() => onNavigate(tool.id)}
            className={`group text-left tool-panel p-5 bg-gradient-to-br ${tool.color}
              hover:border-accent/30 transition-all duration-200 hover:translate-y-[-1px] hover:shadow-lg hover:shadow-accent/5`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="text-slate-400 group-hover:text-accent transition-colors">
                {tool.icon}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-600 uppercase tracking-wider">{tool.phase}</span>
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star
                      key={i}
                      size={10}
                      className={i < tool.impact ? 'text-amber-400 fill-amber-400' : 'text-slate-700'}
                    />
                  ))}
                </div>
              </div>
            </div>
            <h3 className="text-sm font-semibold text-slate-200 mb-1.5 group-hover:text-white transition-colors">
              {tool.name}
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-3">{tool.description}</p>
            <div className="flex items-center gap-1 text-xs text-accent opacity-0 group-hover:opacity-100 transition-opacity">
              Open tool <ArrowRight size={12} />
            </div>
          </button>
        ))}
      </div>

      <div className="mt-8 text-center">
        <p className="text-xs text-slate-600">
          Built for Manifest language developers. Select a tool to get started.
        </p>
      </div>
    </div>
  );
}
