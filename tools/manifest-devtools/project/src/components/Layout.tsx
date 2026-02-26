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
  FolderOpen,
  Globe,
  Settings,
} from 'lucide-react';

export type ToolId = 'dashboard' | 'guard-debugger' | 'fixture-generator' | 'profiler' | 'ir-verifier' | 'migration' | 'entity-scanner' | 'policy-coverage' | 'issue-tracker' | 'route-surface';

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
  { id: 'route-surface', label: 'Route Surface', icon: <Globe size={18} />, phase: 'P5' },
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
  manifestRoot: string;
  rootInput: string;
  onRootInputChange: (value: string) => void;
  onRootSubmit: () => void;
  onBrowse: () => void;
  onOpenSettings: () => void;
}

export default function Layout({
  activeTool,
  onNavigate,
  children,
  manifestRoot,
  rootInput,
  onRootInputChange,
  onRootSubmit,
  onBrowse,
  onOpenSettings,
}: LayoutProps) {
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

        <div className="px-4 py-3 border-t border-surface-border space-y-2">
          <button
            onClick={onOpenSettings}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-surface-hover rounded-md transition-colors"
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>
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

          {/* Manifest root path bar */}
          <div className="ml-auto flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                manifestRoot ? 'bg-emerald-400' : 'bg-red-400'
              }`}
              title={manifestRoot ? `Root: ${manifestRoot}` : 'No manifest root set'}
            />
            <input
              type="text"
              value={rootInput}
              onChange={(e) => onRootInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onRootSubmit();
              }}
              placeholder="Enter manifest directory path..."
              className="w-[400px] h-8 px-3 text-xs bg-surface-lighter border border-surface-border rounded-md text-slate-300 placeholder-slate-600 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
            />
            <button
              onClick={onBrowse}
              className="h-8 px-2.5 flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 bg-surface-lighter border border-surface-border rounded-md hover:bg-surface-hover transition-colors"
              title="Browse for directory"
            >
              <FolderOpen size={14} />
              <span>Browse</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
