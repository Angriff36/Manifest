import { Location, Range } from 'vscode-languageserver';
import type { Position as LspPosition } from 'vscode-languageserver';
import type { Token } from '@angriff36/manifest/types';
import type { SymbolEntry } from '../symbols/symbol-index.js';
import { toManifestPosition } from '../position-utils.js';
import { findTokenAtPosition } from './completion.js';

/**
 * Find the definition location for the token at the given position.
 */
export function getDefinition(
  tokens: Token[],
  symbols: SymbolEntry[],
  uri: string,
  position: LspPosition,
): Location | null {
  const mPos = toManifestPosition(position);
  const token = findTokenAtPosition(tokens, mPos);
  if (!token || token.type !== 'IDENTIFIER') return null;

  const name = token.value;

  // Try to find in symbol index
  const symbol = symbols.find((s) => s.name === name && s.position);
  if (!symbol?.position) return null;

  // Symbol positions come from the lexer which records END positions.
  // Compute the start position for the LSP range.
  const endCol0 = symbol.position.column - 1;
  const startCol0 = endCol0 - symbol.name.length;
  const line0 = symbol.position.line - 1;

  return Location.create(uri, Range.create(line0, startCol0, line0, endCol0));
}
