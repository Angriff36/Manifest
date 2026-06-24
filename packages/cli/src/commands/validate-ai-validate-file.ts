import fs from 'node:fs/promises';
import Ajv, { type AnySchema } from 'ajv';
import { formatAjvDiagnostic } from './validate-ai-ajv.js';
import { buildReport } from './validate-ai-report.js';
import { runSemanticChecks } from './validate-ai-semantic-checks.js';
import type { ValidationDiagnostic, ValidationReport } from './validate-ai-types.js';
import { loadCompiler } from './validate-ai-compiler.js';

function ioDiagnostic(filePath: string, error: unknown): ValidationDiagnostic {
  const msg = error instanceof Error ? error.message : String(error);
  const isNotFound = error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT';
  return {
    code: isNotFound ? 'FILE_NOT_FOUND' : 'IO_ERROR',
    message: isNotFound ? `File not found: ${filePath}` : `Read error: ${msg}`,
    severity: 'error',
    category: 'structural',
    suggestion: isNotFound
      ? 'Ensure the file path is correct and the file exists.'
      : 'Check file permissions and content.',
  };
}

function compileFatalDiagnostic(filePath: string, error: unknown): ValidationDiagnostic {
  const msg = error instanceof Error ? error.message : String(error);
  const isNotFound = error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT';
  return {
    code: isNotFound ? 'FILE_NOT_FOUND' : 'COMPILE_FATAL',
    message: isNotFound ? `File not found: ${filePath}` : `Compilation failed: ${msg}`,
    severity: 'error',
    category: isNotFound ? 'structural' : 'compile',
    suggestion: isNotFound
      ? 'Ensure the file path is correct and the file exists.'
      : 'Check the .manifest source for syntax errors.',
  };
}

function parseErrorReport(filePath: string, error: SyntaxError): ValidationReport {
  return {
    file: filePath,
    inputType: 'ir-json',
    valid: false,
    score: 0,
    diagnostics: [{
      code: 'PARSE_ERROR',
      message: `Invalid JSON: ${error.message}`,
      severity: 'error',
      category: 'schema',
      suggestion: 'Fix the JSON syntax. Common issues: trailing commas, unquoted keys, missing closing braces.',
    }],
    summary: { errors: 1, warnings: 0, info: 0, totalChecks: 1 },
  };
}

function validateAgainstSchema(ir: unknown, schema: AnySchema): ValidationDiagnostic[] {
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(schema);
  if (validate(ir)) return [];
  return (validate.errors ?? []).map(formatAjvDiagnostic);
}

function shouldRunSemanticChecks(schemaErrors: ValidationDiagnostic[]): boolean {
  return schemaErrors.filter(d => d.severity === 'error').length <= 5;
}

export async function validateIRFile(filePath: string, schema: AnySchema): Promise<ValidationReport> {
  const diagnostics: ValidationDiagnostic[] = [];

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    let ir: unknown;
    try {
      ir = JSON.parse(content);
    } catch (e) {
      return parseErrorReport(filePath, e as SyntaxError);
    }

    const schemaErrors = validateAgainstSchema(ir, schema);
    diagnostics.push(...schemaErrors);

    if (schemaErrors.length === 0 || shouldRunSemanticChecks(schemaErrors)) {
      diagnostics.push(...runSemanticChecks(ir));
    }
  } catch (e) {
    diagnostics.push(ioDiagnostic(filePath, e));
  }

  return buildReport(filePath, 'ir-json', diagnostics);
}

function mapCompileDiagnostic(d: { severity: string; message: string; line?: number; column?: number }): ValidationDiagnostic {
  const isError = d.severity !== 'warning' && d.severity !== 'info';
  return {
    code: isError ? 'COMPILE_ERROR' : 'COMPILE_WARNING',
    message: d.message,
    severity: d.severity === 'warning' ? 'warning' : d.severity === 'info' ? 'info' : 'error',
    category: 'compile',
    line: d.line,
    column: d.column,
    suggestion: isError
      ? `Fix the syntax error at line ${d.line ?? '?'}. Refer to the Manifest language reference for correct syntax.`
      : undefined,
  };
}

function compiledIrSchemaWarnings(ir: unknown, schema: AnySchema): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  for (const diag of validateAgainstSchema(ir, schema)) {
    diagnostics.push({
      ...diag,
      severity: 'warning',
      code: `COMPILED_IR_${diag.code}`,
      suggestion: `The compiler produced IR that doesn't match the schema. This may indicate a compiler bug. ${diag.suggestion ?? ''}`,
    });
  }
  return diagnostics;
}

export async function validateManifestSource(filePath: string, schema: AnySchema): Promise<ValidationReport> {
  const diagnostics: ValidationDiagnostic[] = [];

  try {
    const source = await fs.readFile(filePath, 'utf-8');
    const { compileToIR } = await loadCompiler();
    const result = await compileToIR(source, { sourcePath: filePath });

    if (result.diagnostics?.length) {
      diagnostics.push(...result.diagnostics.map(mapCompileDiagnostic));
    }

    if (result.ir) {
      diagnostics.push(...compiledIrSchemaWarnings(result.ir, schema));
      diagnostics.push(...runSemanticChecks(result.ir));
    }
  } catch (e) {
    diagnostics.push(compileFatalDiagnostic(filePath, e));
  }

  return buildReport(filePath, 'manifest-source', diagnostics);
}
