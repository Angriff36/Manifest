import { Position as LspPosition, Range } from 'vscode-languageserver';
import type { Position as ManifestPosition } from '@angriff36/manifest/types';
import type { Token } from '@angriff36/manifest/types';

/**
 * Convert a Manifest Position (1-based line, 1-based column) to an LSP Position (0-based).
 */
export function toLspPosition(pos: ManifestPosition): LspPosition {
  return LspPosition.create(pos.line - 1, pos.column - 1);
}

/**
 * Convert an LSP Position (0-based) to a Manifest Position (1-based line, 1-based column).
 */
export function toManifestPosition(pos: LspPosition): ManifestPosition {
  return { line: pos.line + 1, column: pos.character + 1 };
}

/**
 * Create an LSP Range from a Manifest Position.
 * If no end is provided, the range spans a single word-length token at that position.
 */
export function toLspRange(start: ManifestPosition, end?: ManifestPosition, length?: number): Range {
  const lspStart = toLspPosition(start);
  if (end) {
    return Range.create(lspStart, toLspPosition(end));
  }
  // Default: span the length of the token or a single character
  return Range.create(lspStart, LspPosition.create(lspStart.line, lspStart.character + (length ?? 1)));
}

/**
 * Create an LSP Range from a Token.
 *
 * The Manifest lexer records token.position as the **end** of the token
 * (one column past the last character). This function computes the correct
 * start position and returns a range spanning the token value.
 */
export function tokenToLspRange(token: Token): Range {
  const endCol0 = token.position.column - 1; // 0-based end column
  const startCol0 = endCol0 - token.value.length; // 0-based start column
  const line0 = token.position.line - 1; // 0-based line
  return Range.create(line0, startCol0, line0, endCol0);
}
