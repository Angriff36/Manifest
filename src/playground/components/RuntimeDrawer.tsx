import { ChevronDown, ChevronUp } from 'lucide-react';
import { RuntimePanel } from '../../artifacts/RuntimePanel';

interface RuntimeDrawerProps {
  source: string;
  disabled: boolean;
  open: boolean;
  onToggle: () => void;
}

export function RuntimeDrawer({ source, disabled, open, onToggle }: RuntimeDrawerProps) {
  if (!open) return null;

  return (
    <div
      className="flex-shrink-0 border-t border-gray-800 bg-gray-900 flex flex-col"
      style={{ height: '45vh' }}
    >
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-gray-800 bg-gray-900/80">
        <span className="text-xs font-medium text-gray-400">Interactive Runtime</span>
        <button
          onClick={onToggle}
          className="p-1 hover:bg-gray-700 rounded transition-colors text-gray-500"
        >
          {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <RuntimePanel source={source} disabled={disabled} />
      </div>
    </div>
  );
}
