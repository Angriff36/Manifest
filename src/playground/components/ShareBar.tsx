import { useState, useRef, useEffect } from 'react';
import { Link, BookOpen, ChevronDown, CheckCircle, AlertCircle, Cpu, Terminal } from 'lucide-react';
import { examples } from '../../manifest/examples';
import { encodeSource } from '../lib/urlState';

interface ShareBarProps {
  source: string;
  onSelectExample: (code: string) => void;
  compileMs: number | null;
  hasErrors: boolean;
  errorCount: number;
  runtimeOpen: boolean;
  onToggleRuntime: () => void;
}

export function ShareBar({ source, onSelectExample, compileMs, hasErrors, errorCount, runtimeOpen, onToggleRuntime }: ShareBarProps) {
  const [copied, setCopied] = useState(false);
  const [exOpen, setExOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setExOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const copyLink = async () => {
    const hash = encodeSource(source);
    const url = window.location.origin + window.location.pathname + hash;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="flex-shrink-0 border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-2.5">
        {/* Left: branding */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-gradient-to-br from-sky-500 to-cyan-400 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xs">M</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">
              Manifest <span className="text-sky-400 text-xs font-normal">Playground</span>
            </h1>
          </div>
        </div>

        {/* Center: status */}
        <div className="flex items-center gap-3">
          {hasErrors ? (
            <div className="flex items-center gap-1.5 text-rose-400 text-xs">
              <AlertCircle size={13} />
              {errorCount} error{errorCount > 1 ? 's' : ''}
            </div>
          ) : compileMs !== null ? (
            <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
              <CheckCircle size={13} />
              OK
            </div>
          ) : null}
          {compileMs !== null && (
            <div className="flex items-center gap-1 text-gray-500 text-xs">
              <Cpu size={11} />
              {compileMs}ms
            </div>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleRuntime}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
              runtimeOpen
                ? 'bg-sky-600 text-white'
                : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
            }`}
          >
            <Terminal size={13} />
            Runtime
          </button>
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setExOpen(!exOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-xs font-medium text-gray-300 transition-colors"
            >
              <BookOpen size={13} />
              Examples
              <ChevronDown size={12} className={`transition-transform ${exOpen ? 'rotate-180' : ''}`} />
            </button>
            {exOpen && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-gray-800 rounded-lg shadow-xl border border-gray-700 overflow-hidden z-50">
                {examples.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => { onSelectExample(ex.code); setExOpen(false); }}
                    className="w-full px-3 py-2.5 text-left hover:bg-gray-700 transition-colors border-b border-gray-700 last:border-0"
                  >
                    <div className="font-medium text-white text-xs">{ex.name}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">{ex.desc}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-xs font-medium text-gray-300 transition-colors"
          >
            <Link size={13} />
            {copied ? 'Copied!' : 'Share'}
          </button>
        </div>
      </div>
    </header>
  );
}
