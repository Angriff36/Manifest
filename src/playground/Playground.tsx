import { useState, useCallback, useMemo, useEffect } from 'react';
import { examples } from '../manifest/examples';
import { SourceEditor } from './components/SourceEditor';
import { OutputTabs } from './components/OutputTabs';
import { DiagnosticsList } from './components/DiagnosticsList';
import { ShareBar } from './components/ShareBar';
import { RuntimeDrawer } from './components/RuntimeDrawer';
import { useDebouncedCompile } from './lib/useDebouncedCompile';
import { readSourceFromUrl, updateUrl } from './lib/urlState';

export function Playground() {
  // Initialize source from URL hash or default to first example
  const [source, setSource] = useState(() => {
    return readSourceFromUrl() || examples[0].code;
  });
  const [runtimeOpen, setRuntimeOpen] = useState(false);

  const compiled = useDebouncedCompile(source);

  // Update URL hash on source change (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (source.trim()) updateUrl(source);
    }, 500);
    return () => clearTimeout(timer);
  }, [source]);

  const hasErrors = compiled.errors.length > 0;

  const errorLines = useMemo(() => {
    const lines = new Set<number>();
    for (const err of compiled.errors) {
      if (err.position?.line) lines.add(err.position.line);
    }
    for (const d of compiled.diagnostics) {
      if (d.line) lines.add(d.line);
    }
    return lines;
  }, [compiled.errors, compiled.diagnostics]);

  const handleSelectExample = useCallback((code: string) => {
    setSource(code);
  }, []);

  const toggleRuntime = useCallback(() => {
    setRuntimeOpen(prev => !prev);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      <ShareBar
        source={source}
        onSelectExample={handleSelectExample}
        compileMs={compiled.compileMs}
        hasErrors={hasErrors}
        errorCount={compiled.errors.length}
        runtimeOpen={runtimeOpen}
        onToggleRuntime={toggleRuntime}
      />

      <main className="flex-1 flex overflow-hidden min-h-0">
        {/* Editor pane */}
        <div className="w-[55%] flex flex-col border-r border-gray-800">
          <div className="flex-shrink-0 px-3 py-1.5 border-b border-gray-800 bg-gray-900/50 flex items-center gap-2">
            <span className="text-xs font-medium text-gray-400">Source</span>
            <span className="text-[10px] text-gray-600 ml-auto">.manifest</span>
          </div>
          <div className="flex-1 overflow-hidden bg-gray-900">
            <SourceEditor
              value={source}
              onChange={setSource}
              lang="manifest"
              placeholder="Write Manifest code..."
              errorLines={errorLines}
            />
          </div>
          <DiagnosticsList
            diagnostics={compiled.diagnostics}
            errors={compiled.errors}
          />
        </div>

        {/* Output pane */}
        <div className="w-[45%] flex flex-col">
          <OutputTabs
            ir={compiled.ir}
            clientCode={compiled.clientCode}
            serverCode={compiled.serverCode}
            testCode={compiled.testCode}
            ast={compiled.ast}
            source={source}
            hasErrors={hasErrors}
          />
        </div>
      </main>

      <RuntimeDrawer
        source={source}
        disabled={hasErrors}
        open={runtimeOpen}
        onToggle={toggleRuntime}
      />
    </div>
  );
}
