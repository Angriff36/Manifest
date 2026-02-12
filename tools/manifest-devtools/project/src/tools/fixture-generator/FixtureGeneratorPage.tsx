import { useState, useMemo, useCallback } from 'react';
import { Download, Copy, Check, FileCode2, Braces, TestTube2, Eye, BookTemplate } from 'lucide-react';
import CodeEditor from '../../components/CodeEditor';

type TabId = 'source' | 'ir' | 'results' | 'preview';

const TEMPLATES = [
  {
    name: 'Guard Validation',
    source: `fn validate_order(order) {\n  guard order.total > 0\n  guard order.items.length > 0\n  guard order.status == "pending"\n\n  let tax = calculate_tax(order.total)\n  return {\n    subtotal: order.total,\n    tax: tax,\n    total: order.total + tax\n  }\n}`,
    ir: {
      version: '0.3.0',
      module: 'validate-order',
      functions: [
        {
          name: 'validate_order',
          params: ['order'],
          guards: [
            { expr: 'order.total > 0' },
            { expr: 'order.items.length > 0' },
            { expr: 'order.status == "pending"' },
          ],
          body: { type: 'block', statements: ['binding', 'return'] },
        },
      ],
    },
    results: {
      test_cases: [
        {
          name: 'valid order passes all guards',
          input: { order: { total: 100, items: ['widget'], status: 'pending' } },
          expected: { subtotal: 100, tax: 8.5, total: 108.5 },
          should_pass: true,
        },
        {
          name: 'empty order fails first guard',
          input: { order: { total: 0, items: [], status: 'pending' } },
          expected: null,
          should_pass: false,
          expected_error: 'guard_failure: order.total > 0',
        },
      ],
    },
  },
  {
    name: 'Pattern Match',
    source: `fn classify(input) {\n  match input.type {\n    "text" => process_text(input.data)\n    "number" => process_number(input.data)\n    _ => error("unknown type")\n  }\n}`,
    ir: {
      version: '0.3.0',
      module: 'classify',
      functions: [
        {
          name: 'classify',
          params: ['input'],
          guards: [],
          body: { type: 'match', discriminant: 'input.type', arms: ['text', 'number', '_'] },
        },
      ],
    },
    results: {
      test_cases: [
        {
          name: 'text input',
          input: { input: { type: 'text', data: 'hello' } },
          expected: { processed: true },
          should_pass: true,
        },
      ],
    },
  },
  {
    name: 'Empty Fixture',
    source: '',
    ir: { version: '0.3.0', module: '', functions: [] },
    results: { test_cases: [] },
  },
];

export default function FixtureGeneratorPage() {
  const [activeTab, setActiveTab] = useState<TabId>('source');
  const [fixtureName, setFixtureName] = useState('my-fixture');
  const [source, setSource] = useState(TEMPLATES[0].source);
  const [irJson, setIrJson] = useState(JSON.stringify(TEMPLATES[0].ir, null, 2));
  const [resultsJson, setResultsJson] = useState(JSON.stringify(TEMPLATES[0].results, null, 2));
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  const irValid = useMemo(() => {
    try { JSON.parse(irJson); return true; } catch { return false; }
  }, [irJson]);

  const resultsValid = useMemo(() => {
    try { JSON.parse(resultsJson); return true; } catch { return false; }
  }, [resultsJson]);

  const loadTemplate = (idx: number) => {
    const t = TEMPLATES[idx];
    setSource(t.source);
    setIrJson(JSON.stringify(t.ir, null, 2));
    setResultsJson(JSON.stringify(t.results, null, 2));
  };

  const copyToClipboard = useCallback(async (content: string, label: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedFile(label);
    setTimeout(() => setCopiedFile(null), 2000);
  }, []);

  const downloadFile = useCallback((content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'source', label: 'Source', icon: <FileCode2 size={14} /> },
    { id: 'ir', label: 'IR', icon: <Braces size={14} /> },
    { id: 'results', label: 'Results', icon: <TestTube2 size={14} /> },
    { id: 'preview', label: 'Preview', icon: <Eye size={14} /> },
  ];

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-100 mb-1">Conformance Fixture Generator</h1>
        <p className="text-sm text-slate-400">
          Create .manifest, .ir.json, and .results.json fixture bundles for conformance testing.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Name:</label>
          <input
            type="text"
            value={fixtureName}
            onChange={(e) => setFixtureName(e.target.value)}
            className="tool-input w-48"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <BookTemplate size={12} /> Templates:
          </span>
          {TEMPLATES.map((t, i) => (
            <button key={i} onClick={() => loadTemplate(i)} className="btn-ghost text-xs">
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <div className="tool-panel">
        <div className="flex border-b border-surface-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm transition-colors ${
                activeTab === tab.id ? 'tab-active' : 'tab-inactive'
              }`}
            >
              {tab.icon} {tab.label}
              {tab.id === 'ir' && !irValid && <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />}
              {tab.id === 'results' && !resultsValid && <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />}
            </button>
          ))}
        </div>

        <div className="p-4">
          {activeTab === 'source' && (
            <div className="space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">{fixtureName}.manifest</p>
                <div className="flex gap-2">
                  <button onClick={() => copyToClipboard(source, 'source')} className="btn-ghost text-xs">
                    {copiedFile === 'source' ? <Check size={12} /> : <Copy size={12} />} Copy
                  </button>
                  <button onClick={() => downloadFile(source, `${fixtureName}.manifest`)} className="btn-ghost text-xs">
                    <Download size={12} /> Download
                  </button>
                </div>
              </div>
              <CodeEditor value={source} onChange={setSource} placeholder="Write manifest source..." height="320px" />
            </div>
          )}

          {activeTab === 'ir' && (
            <div className="space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-xs text-slate-500">{fixtureName}.ir.json</p>
                  {irValid ? (
                    <span className="badge-success text-[10px]">Valid JSON</span>
                  ) : (
                    <span className="badge-error text-[10px]">Invalid JSON</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => copyToClipboard(irJson, 'ir')} className="btn-ghost text-xs">
                    {copiedFile === 'ir' ? <Check size={12} /> : <Copy size={12} />} Copy
                  </button>
                  <button onClick={() => downloadFile(irJson, `${fixtureName}.ir.json`)} className="btn-ghost text-xs">
                    <Download size={12} /> Download
                  </button>
                </div>
              </div>
              <CodeEditor value={irJson} onChange={setIrJson} placeholder="Define IR JSON..." height="320px" />
            </div>
          )}

          {activeTab === 'results' && (
            <div className="space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-xs text-slate-500">{fixtureName}.results.json</p>
                  {resultsValid ? (
                    <span className="badge-success text-[10px]">Valid JSON</span>
                  ) : (
                    <span className="badge-error text-[10px]">Invalid JSON</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => copyToClipboard(resultsJson, 'results')} className="btn-ghost text-xs">
                    {copiedFile === 'results' ? <Check size={12} /> : <Copy size={12} />} Copy
                  </button>
                  <button onClick={() => downloadFile(resultsJson, `${fixtureName}.results.json`)} className="btn-ghost text-xs">
                    <Download size={12} /> Download
                  </button>
                </div>
              </div>
              <CodeEditor value={resultsJson} onChange={setResultsJson} placeholder="Define expected results..." height="320px" />
            </div>
          )}

          {activeTab === 'preview' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in">
              <PreviewCard
                title={`${fixtureName}.manifest`}
                content={source}
                valid={true}
                size={new Blob([source]).size}
              />
              <PreviewCard
                title={`${fixtureName}.ir.json`}
                content={irJson}
                valid={irValid}
                size={new Blob([irJson]).size}
              />
              <PreviewCard
                title={`${fixtureName}.results.json`}
                content={resultsJson}
                valid={resultsValid}
                size={new Blob([resultsJson]).size}
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <button
          onClick={() => {
            downloadFile(source, `${fixtureName}.manifest`);
            downloadFile(irJson, `${fixtureName}.ir.json`);
            downloadFile(resultsJson, `${fixtureName}.results.json`);
          }}
          className="btn-primary"
        >
          <Download size={14} /> Download All Files
        </button>
      </div>
    </div>
  );
}

function PreviewCard({ title, content, valid, size }: { title: string; content: string; valid: boolean; size: number }) {
  return (
    <div className="bg-surface rounded-md border border-surface-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-border bg-surface-light/50">
        <span className="text-xs text-slate-300 code-font">{title}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500">{formatBytes(size)}</span>
          {valid ? (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
          )}
        </div>
      </div>
      <pre className="p-3 text-xs code-font text-slate-400 max-h-48 overflow-auto whitespace-pre-wrap">
        {content || '(empty)'}
      </pre>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
