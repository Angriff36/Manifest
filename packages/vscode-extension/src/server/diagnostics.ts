import {
  Diagnostic,
  DiagnosticSeverity,
  Range,
  Position,
} from 'vscode-languageserver/node';
import type { CompilationError } from '@angriff36/manifest/compiler';

/**
 * Convert Manifest CompilationErrors to LSP Diagnostics.
 *
 * Manifest positions are 1-based (line=1, col=1).
 * LSP positions are 0-based (line=0, char=0).
 */
export function toDiagnostics(errors: CompilationError[]): Diagnostic[] {
  return errors.map((err) => {
    const line = err.position ? err.position.line - 1 : 0;
    const col = err.position ? err.position.column - 1 : 0;

    return Diagnostic.create(
      Range.create(Position.create(line, col), Position.create(line, col + 1)),
      err.message,
      err.severity === 'warning'
        ? DiagnosticSeverity.Warning
        : DiagnosticSeverity.Error,
      undefined,
      'manifest',
    );
  });
}
