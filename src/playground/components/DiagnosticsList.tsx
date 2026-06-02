import { AlertCircle, AlertTriangle, Info } from 'lucide-react';

interface Diagnostic {
  message: string;
  severity: string;
  line?: number;
  column?: number;
}

interface DiagnosticsListProps {
  diagnostics: Diagnostic[];
  errors: Array<{ message: string; position?: { line: number; column: number } }>;
  onLineClick?: (line: number) => void;
}

export function DiagnosticsList({ diagnostics, errors, onLineClick }: DiagnosticsListProps) {
  // Merge compiler errors and IR diagnostics into a unified list
  const items: Array<{ message: string; severity: string; line?: number }> = [];

  for (const err of errors) {
    items.push({
      message: err.message,
      severity: 'error',
      line: err.position?.line,
    });
  }
  for (const d of diagnostics) {
    // Skip duplicates already covered by compiler errors
    if (items.some(i => i.message === d.message && i.line === d.line)) continue;
    items.push(d);
  }

  if (items.length === 0) return null;

  return (
    <div className="max-h-40 overflow-auto bg-gray-950/80 border-t border-gray-800">
      {items.map((item, i) => {
        const Icon = item.severity === 'error' ? AlertCircle
          : item.severity === 'warning' ? AlertTriangle
          : Info;
        const color = item.severity === 'error' ? 'text-rose-400'
          : item.severity === 'warning' ? 'text-amber-400'
          : 'text-blue-400';

        return (
          <button
            key={i}
            onClick={() => item.line && onLineClick?.(item.line)}
            className="w-full px-3 py-1.5 text-left text-sm flex items-start gap-2 hover:bg-white/5 transition-colors"
          >
            <Icon size={14} className={`flex-shrink-0 mt-0.5 ${color}`} />
            <span className="text-gray-300">
              {item.line != null && (
                <span className={`${color} mr-1`}>Ln {item.line}:</span>
              )}
              {item.message}
            </span>
          </button>
        );
      })}
    </div>
  );
}
