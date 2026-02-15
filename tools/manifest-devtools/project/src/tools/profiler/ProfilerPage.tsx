import { useState } from 'react';
import { Zap, Cpu, Layers } from 'lucide-react';
import CompileProfileTab from './CompileProfileTab';
import RuntimeProfileTab from './RuntimeProfileTab';
import StaticAnalysisTab from './StaticAnalysisTab';

type ProfilerTab = 'compile' | 'runtime' | 'static';

const TABS: Array<{ id: ProfilerTab; label: string; icon: React.ReactNode; description: string }> = [
  { id: 'compile', label: 'Compile Time', icon: <Zap size={14} />, description: 'Real compilation timing per file' },
  { id: 'runtime', label: 'Runtime', icon: <Cpu size={14} />, description: 'Execute commands with real timing' },
  { id: 'static', label: 'Static Analysis', icon: <Layers size={14} />, description: 'IR complexity scores' },
];

export default function ProfilerPage() {
  const [activeTab, setActiveTab] = useState<ProfilerTab>('compile');

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-100 mb-1">Runtime Performance Profiler</h1>
        <p className="text-sm text-slate-400">
          Real profiling data from the Manifest compiler and runtime engine. No simulated data.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-4 bg-surface-lighter rounded-lg p-1 border border-surface-border">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-md text-xs transition-all duration-150
                ${isActive
                  ? 'bg-accent/10 text-accent border border-accent/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-surface-hover border border-transparent'
                }
              `}
            >
              <span className={isActive ? 'text-accent' : 'text-slate-500'}>{tab.icon}</span>
              <span className="font-medium">{tab.label}</span>
              <span className="hidden sm:inline text-[10px] text-slate-500 ml-1">{tab.description}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'compile' && <CompileProfileTab />}
      {activeTab === 'runtime' && <RuntimeProfileTab />}
      {activeTab === 'static' && <StaticAnalysisTab />}
    </div>
  );
}
