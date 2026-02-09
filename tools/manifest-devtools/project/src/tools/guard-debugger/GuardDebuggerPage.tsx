import { useState, useCallback } from 'react';
import { Play, RotateCcw, CheckCircle2, XCircle, ChevronRight, Lightbulb } from 'lucide-react';
import CodeEditor from '../../components/CodeEditor';
import { parseGuardExpression } from './guardParser';
import { evaluateGuard, type EvaluationStep, type EvaluationResult } from './guardEvaluator';

const EXAMPLES = [
  {
    label: 'Simple comparison',
    guard: 'when amount > 100 and status == "active"',
    data: '{\n  "amount": 150,\n  "status": "active"\n}',
  },
  {
    label: 'Nested property',
    guard: 'when user.role == "admin" or user.permissions.level >= 5',
    data: '{\n  "user": {\n    "role": "editor",\n    "permissions": { "level": 7 }\n  }\n}',
  },
  {
    label: 'Function calls',
    guard: 'when not isEmpty(items) and contains(name, "test")',
    data: '{\n  "items": [1, 2, 3],\n  "name": "test-fixture"\n}',
  },
  {
    label: 'Complex logic',
    guard: 'when (age >= 18 and country == "US") or (age >= 16 and country == "UK")',
    data: '{\n  "age": 17,\n  "country": "UK"\n}',
  },
];

export default function GuardDebuggerPage() {
  const [guardExpr, setGuardExpr] = useState(EXAMPLES[0].guard);
  const [testData, setTestData] = useState(EXAMPLES[0].data);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  const evaluate = useCallback(() => {
    setParseError(null);
    setDataError(null);

    let context: Record<string, unknown>;
    try {
      context = JSON.parse(testData);
    } catch (e) {
      setDataError(e instanceof Error ? e.message : 'Invalid JSON');
      setResult(null);
      return;
    }

    const { ast, error } = parseGuardExpression(guardExpr);
    if (error || !ast) {
      setParseError(error || 'Failed to parse expression');
      setResult(null);
      return;
    }

    const evalResult = evaluateGuard(ast, context);
    setResult(evalResult);
  }, [guardExpr, testData]);

  const loadExample = (idx: number) => {
    setGuardExpr(EXAMPLES[idx].guard);
    setTestData(EXAMPLES[idx].data);
    setResult(null);
    setParseError(null);
    setDataError(null);
  };

  const reset = () => {
    setGuardExpr('');
    setTestData('{\n  \n}');
    setResult(null);
    setParseError(null);
    setDataError(null);
  };

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-100 mb-1">Guard Expression Debugger</h1>
        <p className="text-sm text-slate-400">
          Test guard expressions interactively against sample data. See step-by-step evaluation traces.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <span className="text-xs text-slate-500 flex items-center gap-1 mr-1">
          <Lightbulb size={12} /> Examples:
        </span>
        {EXAMPLES.map((ex, i) => (
          <button key={i} onClick={() => loadExample(i)} className="btn-ghost text-xs">
            {ex.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div className="tool-panel p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-slate-300">Guard Expression</h3>
              {parseError && <span className="badge-error text-[10px]">Parse Error</span>}
            </div>
            <CodeEditor
              value={guardExpr}
              onChange={setGuardExpr}
              placeholder="when amount > 100 and status == &quot;active&quot;"
              height="100px"
              showLineNumbers={false}
            />
            {parseError && <p className="text-xs text-rose-400 mt-2">{parseError}</p>}
          </div>

          <div className="tool-panel p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-slate-300">Test Data (JSON)</h3>
              {dataError && <span className="badge-error text-[10px]">Invalid JSON</span>}
            </div>
            <CodeEditor
              value={testData}
              onChange={setTestData}
              placeholder='{ "key": "value" }'
              height="180px"
            />
            {dataError && <p className="text-xs text-rose-400 mt-2">{dataError}</p>}
          </div>

          <div className="flex gap-2">
            <button onClick={evaluate} className="btn-primary flex-1">
              <Play size={14} /> Evaluate
            </button>
            <button onClick={reset} className="btn-secondary">
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        </div>

        <div className="tool-panel p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Evaluation Trace</h3>

          {!result && (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500">
              <ShieldCheck size={32} className="mb-3 text-slate-600" />
              <p className="text-sm">Click "Evaluate" to see the step-by-step trace</p>
            </div>
          )}

          {result && (
            <div className="space-y-3 animate-slide-in">
              <div
                className={`flex items-center gap-3 p-3 rounded-md border ${
                  result.passed
                    ? 'bg-emerald-500/5 border-emerald-500/20'
                    : 'bg-rose-500/5 border-rose-500/20'
                }`}
              >
                {result.passed ? (
                  <CheckCircle2 size={20} className="text-emerald-400 shrink-0" />
                ) : (
                  <XCircle size={20} className="text-rose-400 shrink-0" />
                )}
                <div>
                  <p className={`text-sm font-medium ${result.passed ? 'text-emerald-400' : 'text-rose-400'}`}>
                    Guard {result.passed ? 'PASSED' : 'FAILED'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Result: {JSON.stringify(result.value)} | {result.steps.length} steps evaluated
                  </p>
                </div>
              </div>

              {result.error && (
                <div className="p-3 bg-rose-500/5 border border-rose-500/20 rounded-md">
                  <p className="text-xs text-rose-400">{result.error}</p>
                </div>
              )}

              <div className="space-y-1 max-h-96 overflow-y-auto">
                {result.steps.map((step, i) => (
                  <StepRow key={i} step={step} index={i} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StepRow({ step, index }: { step: EvaluationStep; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const indent = step.depth * 16;

  return (
    <div
      className={`rounded-md border transition-colors ${
        step.passed ? 'border-emerald-500/10 hover:border-emerald-500/20' : 'border-rose-500/10 hover:border-rose-500/20'
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        style={{ paddingLeft: indent + 12 }}
      >
        <ChevronRight
          size={12}
          className={`text-slate-500 transition-transform shrink-0 ${expanded ? 'rotate-90' : ''}`}
        />
        <span className="text-xs text-slate-500 w-5 shrink-0">#{index + 1}</span>
        <span className="code-font text-xs text-slate-300 truncate flex-1">{step.expression}</span>
        {step.passed ? (
          <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
        ) : (
          <XCircle size={12} className="text-rose-400 shrink-0" />
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-2 animate-fade-in" style={{ paddingLeft: indent + 36 }}>
          <div className="text-xs space-y-1">
            <div className="flex gap-2">
              <span className="text-slate-500">Type:</span>
              <span className="text-slate-300">{step.nodeType}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-slate-500">Result:</span>
              <span className={`code-font ${step.passed ? 'text-emerald-400' : 'text-rose-400'}`}>
                {JSON.stringify(step.result)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ShieldCheck2({ size, className }: { size: number; className?: string }) {
  return <ShieldCheck size={size} className={className} />;
}
