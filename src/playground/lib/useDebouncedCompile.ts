import { useState, useCallback, useEffect, useRef } from 'react';
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
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const doCompile = useCallback(async (src: string) => {
    if (!src.trim()) {
      setResult(EMPTY);
      return;
    }
    const t0 = performance.now();
    const syncResult = compiler.compile(src);
    let ir: IR | null = null;
    let diagnostics: CompileResult['diagnostics'] = [];
    try {
      const irResult = await compileToIR(src);
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

    // Only update if source hasn't changed during async compilation
    if (sourceRef.current === src) {
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
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => doCompile(source), debounceMs);
    return () => clearTimeout(timer);
  }, [source, debounceMs, doCompile]);

  // Compile immediately on first render
  useEffect(() => {
    doCompile(source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return result;
}
