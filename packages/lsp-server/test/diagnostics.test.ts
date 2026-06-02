import { describe, it, expect } from 'vitest';
import { DiagnosticSeverity } from 'vscode-languageserver';
import { toDiagnostics } from '../src/features/diagnostics.js';
import type { CompilationError } from '@angriff36/manifest/types';
import type { IRDiagnostic } from '@angriff36/manifest/ir';

describe('diagnostics', () => {
  it('converts parse errors to LSP diagnostics', () => {
    const parseErrors: CompilationError[] = [
      { message: 'Unexpected token', position: { line: 3, column: 5 }, severity: 'error' },
      { message: 'Missing semicolon', position: { line: 7, column: 1 }, severity: 'warning' },
    ];

    const diagnostics = toDiagnostics(parseErrors, []);

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Error);
    expect(diagnostics[0].message).toBe('Unexpected token');
    expect(diagnostics[0].range.start.line).toBe(2); // 0-based
    expect(diagnostics[0].range.start.character).toBe(4); // 0-based
    expect(diagnostics[0].source).toBe('manifest');

    expect(diagnostics[1].severity).toBe(DiagnosticSeverity.Warning);
  });

  it('converts IR diagnostics to LSP diagnostics', () => {
    const irDiagnostics: IRDiagnostic[] = [
      { severity: 'error', message: 'Unresolved entity', line: 10, column: 3 },
      { severity: 'info', message: 'Redundant constraint' },
    ];

    const diagnostics = toDiagnostics([], irDiagnostics);

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Error);
    expect(diagnostics[0].source).toBe('manifest-ir');
    expect(diagnostics[0].range.start.line).toBe(9); // 0-based

    expect(diagnostics[1].severity).toBe(DiagnosticSeverity.Information);
    // No position → defaults to 0,0
    expect(diagnostics[1].range.start.line).toBe(0);
  });

  it('merges both error sources', () => {
    const parseErrors: CompilationError[] = [
      { message: 'Parse error', position: { line: 1, column: 1 }, severity: 'error' },
    ];
    const irDiagnostics: IRDiagnostic[] = [
      { severity: 'warning', message: 'IR warning', line: 5, column: 10 },
    ];

    const diagnostics = toDiagnostics(parseErrors, irDiagnostics);

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0].source).toBe('manifest');
    expect(diagnostics[1].source).toBe('manifest-ir');
  });

  it('handles errors without positions', () => {
    const parseErrors: CompilationError[] = [
      { message: 'Global error', severity: 'error' },
    ];

    const diagnostics = toDiagnostics(parseErrors, []);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].range.start.line).toBe(0);
    expect(diagnostics[0].range.start.character).toBe(0);
  });
});
