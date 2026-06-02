import { ManifestCompiler } from '@angriff36/manifest/compiler';
import type { CompilationError, ManifestProgram } from '@angriff36/manifest/compiler';

const compiler = new ManifestCompiler();

export interface AnalysisResult {
  program: ManifestProgram;
  errors: CompilationError[];
}

const cache = new Map<string, AnalysisResult>();

export function analyze(uri: string, source: string): AnalysisResult {
  const { program, errors: parseErrors } = compiler.parse(source);

  // Also run compile to get richer diagnostics (generator errors)
  const compileResult = compiler.compile(source);
  const allErrors: CompilationError[] = [
    ...(parseErrors as CompilationError[]),
  ];

  // Add any compilation errors not already captured by parse
  if (compileResult.errors) {
    for (const err of compileResult.errors) {
      const isDupe = allErrors.some(
        (e) =>
          e.message === err.message &&
          e.position?.line === err.position?.line &&
          e.position?.column === err.position?.column,
      );
      if (!isDupe) {
        allErrors.push(err);
      }
    }
  }

  const result: AnalysisResult = { program, errors: allErrors };
  cache.set(uri, result);
  return result;
}

export function getCached(uri: string): AnalysisResult | undefined {
  return cache.get(uri);
}

export function clearCache(uri: string): void {
  cache.delete(uri);
}
