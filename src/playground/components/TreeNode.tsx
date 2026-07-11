import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export function TreeNode({
  label,
  value,
  depth = 0,
}: {
  label: string;
  value: unknown;
  depth?: number;
}) {
  const [open, setOpen] = useState(depth < 2);

  if (value === null || value === undefined) {
    return (
      <div className="flex gap-2 py-0.5" style={{ paddingLeft: depth * 16 }}>
        <span className="text-gray-400">{label}:</span>
        <span className="text-gray-500">null</span>
      </div>
    );
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const colorClass =
      typeof value === 'string'
        ? 'text-amber-400'
        : typeof value === 'number'
          ? 'text-cyan-400'
          : 'text-orange-400';
    return (
      <div className="flex gap-2 py-0.5" style={{ paddingLeft: depth * 16 }}>
        <span className="text-gray-400">{label}:</span>
        <span className={colorClass}>
          {typeof value === 'string' ? `"${value}"` : String(value)}
        </span>
      </div>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <div className="flex gap-2 py-0.5" style={{ paddingLeft: depth * 16 }}>
          <span className="text-gray-400">{label}:</span>
          <span className="text-gray-500">[]</span>
        </div>
      );
    }
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 py-0.5 hover:bg-white/5 w-full text-left"
          style={{ paddingLeft: depth * 16 }}
        >
          {open ? (
            <ChevronDown size={14} className="text-gray-500" />
          ) : (
            <ChevronRight size={14} className="text-gray-500" />
          )}
          <span className="text-gray-400">{label}</span>
          <span className="text-gray-600 text-xs">Array({value.length})</span>
        </button>
        {open &&
          value.map((item, i) => (
            <TreeNode key={i} label={`[${i}]`} value={item} depth={depth + 1} />
          ))}
      </div>
    );
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([k]) => k !== 'position');
    const typeLabel = 'type' in value && typeof value.type === 'string' ? value.type : undefined;
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 py-0.5 hover:bg-white/5 w-full text-left"
          style={{ paddingLeft: depth * 16 }}
        >
          {open ? (
            <ChevronDown size={14} className="text-gray-500" />
          ) : (
            <ChevronRight size={14} className="text-gray-500" />
          )}
          <span className="text-gray-400">{label}</span>
          {typeLabel && <span className="text-emerald-400 text-xs ml-1">{typeLabel}</span>}
        </button>
        {open &&
          entries.map(([k, v]) => <TreeNode key={k} label={k} value={v} depth={depth + 1} />)}
      </div>
    );
  }

  return null;
}
