import { Lexer, KEYWORDS } from '@angriff36/manifest/lexer';
import { Parser } from '@angriff36/manifest/parser';
import { compileToIR } from '@angriff36/manifest/ir-compiler';
import type { Token, ManifestProgram, CompilationError } from '@angriff36/manifest/types';
import type { IR, IRDiagnostic } from '@angriff36/manifest/ir';

export { KEYWORDS };

export interface CompiledDocument {
  /** All tokens from the lexer */
  tokens: Token[];
  /** The parsed AST */
  program: ManifestProgram;
  /** Parse-level errors */
  parseErrors: CompilationError[];
  /** The compiled IR (null if compilation failed) */
  ir: IR | null;
  /** IR-level diagnostics */
  irDiagnostics: IRDiagnostic[];
}

/**
 * Compile a manifest source string through the full pipeline:
 * Lexer → Parser → IR Compiler.
 *
 * Returns all intermediate artifacts for use by LSP features.
 */
export async function compileDocument(source: string): Promise<CompiledDocument> {
  // Tokenize
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();

  // Parse
  const parser = new Parser();
  const { program, errors: parseErrors } = parser.parse(source);

  // Compile to IR
  let ir: IR | null = null;
  let irDiagnostics: IRDiagnostic[] = [];
  try {
    const result = await compileToIR(source, { useCache: false });
    ir = result.ir;
    irDiagnostics = result.diagnostics;
  } catch {
    // IR compilation can throw on severely malformed input.
    // Parse errors already cover these cases.
  }

  return { tokens, program, parseErrors, ir, irDiagnostics };
}
