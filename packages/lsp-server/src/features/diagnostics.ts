import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import type { CompilationError } from '@angriff36/manifest/types';
import type { IRDiagnostic } from '@angriff36/manifest/ir';
import { toLspRange } from '../position-utils.js';

/**
 * Convert Manifest parse errors and IR diagnostics into LSP Diagnostics.
 */
export function toDiagnostics(
  parseErrors: CompilationError[],
  irDiagnostics: IRDiagnostic[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const err of parseErrors) {
    const range = err.position
      ? toLspRange(err.position, undefined, err.message.length > 0 ? undefined : 1)
      : { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } };

    diagnostics.push({
      range,
      severity: err.severity === 'error' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
      source: 'manifest',
      message: err.message,
    });
  }

  for (const diag of irDiagnostics) {
    const range =
      diag.line != null && diag.column != null
        ? toLspRange({ line: diag.line, column: diag.column })
        : { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } };

    diagnostics.push({
      range,
      severity: mapIRSeverity(diag.severity),
      source: 'manifest-ir',
      message: diag.message,
    });
  }

  return diagnostics;
}

function mapIRSeverity(severity: IRDiagnostic['severity']): DiagnosticSeverity {
  switch (severity) {
    case 'error':
      return DiagnosticSeverity.Error;
    case 'warning':
      return DiagnosticSeverity.Warning;
    case 'info':
      return DiagnosticSeverity.Information;
    default:
      return DiagnosticSeverity.Information;
  }
}
