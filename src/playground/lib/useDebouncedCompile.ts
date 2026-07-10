import { useState, useEffect, useRef } from 'react';
import { ManifestCompiler } from '../../manifest/compiler';
import type { ManifestProgram, CompilationError } from '../../manifest/types';
import { compileToIR } from '../../manifest/ir-compiler';
import type { IR } from '../../manifest/ir';

const compiler = new ManifestCompiler();

export interface CompileResult {
  ir: IR | null;
  diagnostics: Array<{ message: string; severity: string; line?: number; column?: number }>;
  clientCode: string;
  serverCode: string;
  testCode: string;
  ast: ManifestProgram | null;
  errors: CompilationError[];
  compileMs: number | null;
}

const EMPTY: CompileResult = {
  ir: null,
  diagnostics: [],
  clientCode: '',
  serverCode: '',
  testCode: '',
  ast: null,
  errors: [],
  compileMs: null,
};

export function useDebouncedCompile(source: string, debounceMs = 300): CompileResult {
  const [result, setResult] = useState<CompileResult>(EMPTY);
  const firstRunRef = useRef(true);

  useEffect(() => {
    let cancelled = false;

    const compile = async () => {
      if (!source.trim()) {
        if (!cancelled) setResult(EMPTY);
        return;
      }
      const t0 = performance.now();
      const syncResult = compiler.compile(source);
      let ir: IR | null = null;
      let diagnostics: CompileResult['diagnostics'] = [];
      try {
        const irResult = await compileToIR(source);
        ir = irResult.ir;
        diagnostics = (irResult.diagnostics || []).map(d => ({
          message: d.message,
          severity: d.severity || 'error',
          line: d.line,
          column: d.column,
        }));
      } catch {
        // IR compilation failed — use sync errors
      }
      const compileMs = Math.round((performance.now() - t0) * 100) / 100;

      // A newer source superseded this run — drop the stale result.
      if (cancelled) return;
      setResult({
        ir,
        diagnostics,
        clientCode: syncResult.success && syncResult.code ? syncResult.code : '',
        serverCode: syncResult.serverCode || '',
        testCode: syncResult.testCode || '',
        ast: syncResult.ast || null,
        errors: syncResult.errors || [],
        compileMs,
      });
    };

    // Compile immediately on first render; debounce subsequent edits.
    const delay = firstRunRef.current ? 0 : debounceMs;
    firstRunRef.current = false;
    const timer = setTimeout(compile, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [source, debounceMs]);

  return result;
}
