import { useState } from 'react';
import { Play, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { runSmokeTests } from './smokeTestRunner';
import { SmokeTestReport } from './types';

interface SmokeTestPanelProps {
  clientCode: string;
  ast: object | null;
  disabled: boolean;
}

export function SmokeTestPanel({ clientCode, ast, disabled }: SmokeTestPanelProps) {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<SmokeTestReport | null>(null);

  const handleRun = async () => {
    setRunning(true);
    setReport(null);

    try {
      const result = await runSmokeTests(clientCode, ast);
      setReport(result);
    } catch (err: unknown) {
      setReport({
        total: 1,
        passed: 0,
        failed: 1,
        results: [{
          name: 'Test Runner',
          passed: false,
          error: (err as Error).message || String(err),
          duration: 0
        }],
        duration: 0
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="border-t border-gray-800">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-900/50">
        <span className="text-sm font-medium text-gray-300">Smoke Tests</span>
        <button
          onClick={handleRun}
          disabled={disabled || running}
          className={`flex items-center gap-2 px-3 py-1 text-xs rounded transition-colors ${
            disabled || running
              ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
          }`}
        >
          <Play size={12} />
          {running ? 'Running...' : 'Run Tests'}
        </button>
      </div>

      {report && (
        <div className="p-3 space-y-3">
          <div className="flex items-center gap-4 text-sm">
            <div className={`flex items-center gap-1 ${report.failed === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {report.failed === 0 ? <CheckCircle size={14} /> : <XCircle size={14} />}
              <span>{report.passed}/{report.total} passed</span>
            </div>
            <div className="flex items-center gap-1 text-gray-500">
              <Clock size={14} />
              <span>{report.duration}ms</span>
            </div>
          </div>

          <div className="space-y-1">
            {report.results.map((result, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 p-2 rounded text-sm ${
                  result.passed ? 'bg-emerald-900/20' : 'bg-rose-900/20'
                }`}
              >
                {result.passed ? (
                  <CheckCircle size={14} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle size={14} className="text-rose-400 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className={result.passed ? 'text-emerald-300' : 'text-rose-300'}>
                    {result.name}
                  </div>
                  {result.error && (
                    <div className="mt-1 text-xs text-rose-400 font-mono whitespace-pre-wrap break-all">
                      {result.error}
                    </div>
                  )}
                </div>
                <span className="text-xs text-gray-500">{result.duration}ms</span>
              </div>
            ))}
          </div>

          {report.total === 0 && (
            <div className="flex items-center gap-2 p-3 bg-amber-900/20 rounded text-amber-300 text-sm">
              <AlertTriangle size={14} />
              <span>No tests generated. Add entities or commands to your Manifest source.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
