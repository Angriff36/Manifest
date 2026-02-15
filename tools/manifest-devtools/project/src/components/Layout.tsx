import { useState } from 'react';
import {
  ShieldCheck,
  FileCode2,
  Gauge,
  Fingerprint,
  ArrowRightLeft,
  LayoutDashboard,
  Menu,
  X,
  Terminal,
  Search,
  Shield,
  AlertCircle,
} from 'lucide-react';

export type ToolId = 'dashboard' | 'guard-debugger' | 'fixture-generator' | 'profiler' | 'ir-verifier' | 'migration' | 'entity-scanner' | 'policy-coverage' | 'issue-tracker';

interface NavItem {
  id: ToolId;
  label: string;
  icon: React.ReactNode;
  phase: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Overview', icon: <LayoutDashboard size={18} />, phase: '' },
  { id: 'entity-scanner', label: 'Entity Scanner', icon: <Search size={18} />, phase: 'P4-A' },
  { id: 'policy-coverage', label: 'Policy Coverage', icon: <Shield size={18} />, phase: 'P4-A' },
  { id: 'issue-tracker', label: 'Issue Tracker', icon: <AlertCircle size={18} />, phase: 'P4-A' },
  { id: 'guard-debugger', label: 'Guard Debugger', icon: <ShieldCheck size={18} />, phase: 'Phase 2' },
  { id: 'fixture-generator', label: 'Fixture Generator', icon: <FileCode2 size={18} />, phase: 'Phase 2' },
  { id: 'profiler', label: 'Profiler', icon: <Gauge size={18} />, phase: 'Phase 3' },
  { id: 'ir-verifier', label: 'IR Verifier', icon: <Fingerprint size={18} />, phase: 'Phase 3' },
  { id: 'migration', label: 'Migration', icon: <ArrowRightLeft size={18} />, phase: 'Phase 3' },
];

interface LayoutProps {
  activeTool: ToolId;
  onNavigate: (id: ToolId) => void;
  children: React.ReactNode;
}

export default function Layout({ activeTool, onNavigate, children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 h-full w-64 bg-surface-light border-r border-surface-border
          flex flex-col z-50 transition-transform duration-200
          lg:translate-x-0 lg:static lg:z-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex items-center gap-3 px-5 h-16 border-b border-surface-border shrink-0">
          <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
            <Terminal size={16} className="text-accent" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-100">Manifest</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">DevTools</p>
          </div>
        </div>

        <nav className="flex-1 py-3 px-3 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTool === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  setSidebarOpen(false);
                }}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm mb-0.5
                  transition-all duration-150 group
                  ${
                    isActive
                      ? 'bg-accent/10 text-accent border border-accent/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-surface-hover border border-transparent'
                  }
                `}
              >
                <span className={isActive ? 'text-accent' : 'text-slate-500 group-hover:text-slate-300'}>
                  {item.icon}
                </span>
                <span className="flex-1 text-left">{item.label}</span>
                {item.phase && (
                  <span className="text-[9px] text-slate-600 uppercase tracking-wider">{item.phase}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="px-4 py-3 border-t border-surface-border">
          <p className="text-[10px] text-slate-600 text-center">Manifest DevTools v0.1.0</p>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-surface-border flex items-center px-4 gap-3 shrink-0 bg-surface-light/50 backdrop-blur-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 text-slate-400 hover:text-slate-200 rounded-md hover:bg-surface-lighter"
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">
              {NAV_ITEMS.find((n) => n.id === activeTool)?.icon}
            </span>
            <h2 className="text-sm font-medium text-slate-200">
              {NAV_ITEMS.find((n) => n.id === activeTool)?.label}
            </h2>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
