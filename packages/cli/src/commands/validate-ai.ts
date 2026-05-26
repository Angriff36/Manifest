/**
 * manifest validate-ai command
 *
 * Runs structured validation against LLM-generated .manifest source or IR JSON,
 * producing scored diagnostic reports with correction suggestions.
 *
 * Designed for AI agent self-correction loops: machine-readable JSON output
 * with categories, scores, and actionable suggestions.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';
import chalk from 'chalk';
import ora from 'ora';
import Ajv, { type AnySchema, type ErrorObject } from 'ajv';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationDiagnostic {
  /** Unique diagnostic code for programmatic matching */
  code: string;
  /** Human-readable message */
  message: string;
  /** Severity level */
  severity: 'error' | 'warning' | 'info';
  /** Category for grouping */
  category: 'schema' | 'compile' | 'semantic' | 'structural';
  /** JSON pointer to the failing location (if applicable) */
  path?: string;
  /** Line number in source (for .manifest files) */
  line?: number;
  /** Column number in source (for .manifest files) */
  column?: number;
  /** Actionable correction suggestion */
  suggestion?: string;
}

export interface ValidationReport {
  /** File that was validated */
  file: string;
  /** Input type */
  inputType: 'manifest-source' | 'ir-json';
  /** Overall validity */
  valid: boolean;
  /** Score from 0 to 100 */
  score: number;
  /** Per-file diagnostics */
  diagnostics: ValidationDiagnostic[];
  /** Summary counts */
  summary: {
    errors: number;
    warnings: number;
    info: number;
    totalChecks: number;
  };
}

export interface ValidateAIOptions {
  /** Output format */
  format?: 'text' | 'json';
  /** Custom schema path */
  schema?: string;
  /** Minimum score to pass (default: 100) */
  minScore?: number;
  /** Include info-level diagnostics */
  verbose?: boolean;
}

// ---------------------------------------------------------------------------
// Schema loading (shared pattern with validate.ts)
// ---------------------------------------------------------------------------

function bundledSchemaPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, '..', '..', '..', '..', 'docs', 'spec', 'ir', 'ir-v1.schema.json');
}

async function loadSchema(schemaPath?: string): Promise<AnySchema> {
  const target = schemaPath ?? bundledSchemaPath();
  const content = await fs.readFile(path.resolve(process.cwd(), target), 'utf-8');
  return JSON.parse(content) as AnySchema;
}

// ---------------------------------------------------------------------------
// Compiler dynamic import (matches compile.ts pattern)
// ---------------------------------------------------------------------------

async function loadCompiler() {
  const module = await import('@angriff36/manifest/ir-compiler');
  return {
    compileToIR: module.compileToIR,
    validateCommandIntentRegistry: module.validateCommandIntentRegistry,
  };
}

// ---------------------------------------------------------------------------
// AJV error formatting (enhanced for AI feedback)
// ---------------------------------------------------------------------------

function formatAjvDiagnostic(error: ErrorObject): ValidationDiagnostic {
  const field = error.instancePath
    ? error.instancePath.replace(/^\//, '').replace(/\//g, '.')
    : 'root';
  const params = (error.params ?? {}) as Record<string, unknown>;

  switch (error.keyword) {
    case 'required': {
      const missing = (params.missingProperty as string | undefined) ?? '';
      const prefix = error.instancePath ? `${field}.` : '';
      return {
        code: 'SCHEMA_REQUIRED',
        message: `Missing required field: ${prefix}${missing}`,
        severity: 'error',
        category: 'schema',
        path: error.instancePath || '/',
        suggestion: `Add the "${missing}" field at "${field}". Check docs/spec/ir/ir-v1.schema.json for the expected shape.`,
      };
    }
    case 'additionalProperties': {
      const extra = (params.additionalProperty as string | undefined) ?? '';
      return {
        code: 'SCHEMA_ADDITIONAL_PROPERTY',
        message: `Unknown field: ${field}.${extra}`,
        severity: 'error',
        category: 'schema',
        path: `${error.instancePath || '/'}/${extra}`,
        suggestion: `Remove the "${extra}" field. The IR schema has additionalProperties: false — only defined fields are allowed.`,
      };
    }
    case 'type':
      return {
        code: 'SCHEMA_TYPE',
        message: `${field} must be of type ${params.type as string}`,
        severity: 'error',
        category: 'schema',
        path: error.instancePath || '/',
        suggestion: `Change the value at "${field}" to type "${params.type as string}".`,
      };
    case 'const':
      return {
        code: 'SCHEMA_CONST',
        message: `${field} must be ${JSON.stringify(params.allowedValue)}`,
        severity: 'error',
        category: 'schema',
        path: error.instancePath || '/',
        suggestion: `Set "${field}" to the exact value ${JSON.stringify(params.allowedValue)}.`,
      };
    case 'enum': {
      const allowed = ((params.allowedValues as unknown[]) ?? []).map(v => JSON.stringify(v)).join(', ');
      return {
        code: 'SCHEMA_ENUM',
        message: `${field} must be one of: ${allowed}`,
        severity: 'error',
        category: 'schema',
        path: error.instancePath || '/',
        suggestion: `Change "${field}" to one of: ${allowed}.`,
      };
    }
    case 'oneOf':
      return {
        code: 'SCHEMA_ONE_OF',
        message: `${field} must match exactly one of the allowed shapes`,
        severity: 'error',
        category: 'schema',
        path: error.instancePath || '/',
        suggestion: `Check the union type definition at "${field}" in docs/spec/ir/ir-v1.schema.json. The value must match exactly one variant.`,
      };
    default:
      return {
        code: 'SCHEMA_UNKNOWN',
        message: `${field}: ${error.message ?? 'validation error'}`,
        severity: 'error',
        category: 'schema',
        path: error.instancePath || '/',
      };
  }
}

// ---------------------------------------------------------------------------
// File resolution
// ---------------------------------------------------------------------------

interface ResolvedInput {
  filePath: string;
  type: 'manifest-source' | 'ir-json';
}

async function resolveInputs(source: string | undefined): Promise<ResolvedInput[]> {
  const inputs: ResolvedInput[] = [];

  if (source) {
    const resolved = path.resolve(process.cwd(), source);
    const stat = await fs.stat(resolved).catch(() => null);

    if (stat && stat.isFile()) {
      const ext = path.extname(resolved);
      inputs.push({
        filePath: resolved,
        type: ext === '.json' ? 'ir-json' : 'manifest-source',
      });
      return inputs;
    }

    if (stat && stat.isDirectory()) {
      const manifestFiles = await glob('**/*.manifest', { cwd: resolved, ignore: ['node_modules/**'] });
      const irFiles = await glob('**/*.ir.json', { cwd: resolved, ignore: ['node_modules/**'] });

      for (const f of manifestFiles) {
        inputs.push({ filePath: path.join(resolved, f), type: 'manifest-source' });
      }
      for (const f of irFiles) {
        inputs.push({ filePath: path.join(resolved, f), type: 'ir-json' });
      }
      return inputs;
    }

    // Might be a glob pattern
    const files = await glob(source, { cwd: process.cwd(), ignore: ['node_modules/**'] });
    for (const f of files) {
      const ext = path.extname(f);
      inputs.push({
        filePath: path.resolve(process.cwd(), f),
        type: ext === '.json' ? 'ir-json' : 'manifest-source',
      });
    }

    // If glob found nothing, treat the source as a literal file path so
    // the validator can emit a FILE_NOT_FOUND diagnostic.
    if (inputs.length === 0) {
      const ext = path.extname(resolved);
      inputs.push({
        filePath: resolved,
        type: ext === '.json' ? 'ir-json' : 'manifest-source',
      });
    }

    return inputs;
  }

  // No source provided: search cwd for manifest and IR files
  const manifestFiles = await glob('**/*.manifest', {
    cwd: process.cwd(),
    ignore: ['node_modules/**', 'dist/**', '.next/**'],
  });
  const irFiles = await glob('**/*.ir.json', {
    cwd: process.cwd(),
    ignore: ['node_modules/**', 'dist/**', '.next/**'],
  });

  for (const f of manifestFiles) {
    inputs.push({ filePath: path.resolve(process.cwd(), f), type: 'manifest-source' });
  }
  for (const f of irFiles) {
    inputs.push({ filePath: path.resolve(process.cwd(), f), type: 'ir-json' });
  }

  return inputs;
}

// ---------------------------------------------------------------------------
// Validation: IR JSON
// ---------------------------------------------------------------------------

async function validateIRFile(
  filePath: string,
  schema: AnySchema
): Promise<ValidationReport> {
  const diagnostics: ValidationDiagnostic[] = [];

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    let ir: unknown;
    try {
      ir = JSON.parse(content);
    } catch (e) {
      return {
        file: filePath,
        inputType: 'ir-json',
        valid: false,
        score: 0,
        diagnostics: [{
          code: 'PARSE_ERROR',
          message: `Invalid JSON: ${(e as SyntaxError).message}`,
          severity: 'error',
          category: 'schema',
          suggestion: 'Fix the JSON syntax. Common issues: trailing commas, unquoted keys, missing closing braces.',
        }],
        summary: { errors: 1, warnings: 0, info: 0, totalChecks: 1 },
      };
    }

    // AJV schema validation
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(schema);
    const valid = validate(ir) as boolean;

    if (!valid && validate.errors) {
      for (const err of validate.errors) {
        diagnostics.push(formatAjvDiagnostic(err));
      }
    }

    // Semantic checks on valid-enough IR
    if (valid || diagnostics.filter(d => d.severity === 'error').length <= 5) {
      diagnostics.push(...runSemanticChecks(ir));
    }

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isNotFound = e instanceof Error && 'code' in e && (e as NodeJS.ErrnoException).code === 'ENOENT';
    diagnostics.push({
      code: isNotFound ? 'FILE_NOT_FOUND' : 'IO_ERROR',
      message: isNotFound ? `File not found: ${filePath}` : `Read error: ${msg}`,
      severity: 'error',
      category: 'structural',
      suggestion: isNotFound
        ? 'Ensure the file path is correct and the file exists.'
        : 'Check file permissions and content.',
    });
  }

  return buildReport(filePath, 'ir-json', diagnostics);
}

// ---------------------------------------------------------------------------
// Validation: Manifest source
// ---------------------------------------------------------------------------

async function validateManifestSource(
  filePath: string,
  schema: AnySchema
): Promise<ValidationReport> {
  const diagnostics: ValidationDiagnostic[] = [];

  try {
    const source = await fs.readFile(filePath, 'utf-8');
    const { compileToIR } = await loadCompiler();

    // Compile source to IR
    const result = await compileToIR(source, { sourcePath: filePath });

    // Compilation diagnostics
    if (result.diagnostics && result.diagnostics.length > 0) {
      for (const d of result.diagnostics) {
        diagnostics.push({
          code: d.severity === 'error' ? 'COMPILE_ERROR' : 'COMPILE_WARNING',
          message: d.message,
          severity: d.severity === 'warning' ? 'warning' : d.severity === 'info' ? 'info' : 'error',
          category: 'compile',
          line: d.line,
          column: d.column,
          suggestion: d.severity === 'error'
            ? `Fix the syntax error at line ${d.line ?? '?'}. Refer to the Manifest language reference for correct syntax.`
            : undefined,
        });
      }
    }

    // If compilation succeeded, also validate the generated IR against schema
    if (result.ir) {
      const ajv = new Ajv({ allErrors: true });
      const validate = ajv.compile(schema);
      const valid = validate(result.ir) as boolean;

      if (!valid && validate.errors) {
        for (const err of validate.errors) {
          const diag = formatAjvDiagnostic(err);
          // Downgrade schema errors on compiled IR to warnings since the
          // compiler should have produced valid IR — if it didn't, it's a
          // compiler bug, not a source bug. But still surface them.
          diag.severity = 'warning';
          diag.code = `COMPILED_IR_${diag.code}`;
          diag.suggestion = `The compiler produced IR that doesn't match the schema. This may indicate a compiler bug. ${diag.suggestion ?? ''}`;
          diagnostics.push(diag);
        }
      }

      // Semantic checks on compiled IR
      diagnostics.push(...runSemanticChecks(result.ir));
    }

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isNotFound = e instanceof Error && 'code' in e && (e as NodeJS.ErrnoException).code === 'ENOENT';
    diagnostics.push({
      code: isNotFound ? 'FILE_NOT_FOUND' : 'COMPILE_FATAL',
      message: isNotFound ? `File not found: ${filePath}` : `Compilation failed: ${msg}`,
      severity: 'error',
      category: isNotFound ? 'structural' : 'compile',
      suggestion: isNotFound
        ? 'Ensure the file path is correct and the file exists.'
        : 'Check the .manifest source for syntax errors.',
    });
  }

  return buildReport(filePath, 'manifest-source', diagnostics);
}

// ---------------------------------------------------------------------------
// Semantic checks (run on any valid-enough IR object)
// ---------------------------------------------------------------------------

function runSemanticChecks(ir: unknown): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  if (!ir || typeof ir !== 'object') return diagnostics;

  const record = ir as Record<string, unknown>;
  const entities = Array.isArray(record.entities) ? record.entities as Array<Record<string, unknown>> : [];
  const commands = Array.isArray(record.commands) ? record.commands as Array<Record<string, unknown>> : [];
  const policies = Array.isArray(record.policies) ? record.policies as Array<Record<string, unknown>> : [];
  const stores = Array.isArray(record.stores) ? record.stores as Array<Record<string, unknown>> : [];
  const events = Array.isArray(record.events) ? record.events as Array<Record<string, unknown>> : [];

  // Check: Policy coverage — every command should be covered by a policy
  const entityCommandPairs: Array<{ entity: string; command: string }> = [];
  for (const cmd of commands) {
    if (cmd.entity && cmd.name) {
      entityCommandPairs.push({ entity: String(cmd.entity), command: String(cmd.name) });
    }
  }

  if (entityCommandPairs.length > 0) {
    const executePolicies = policies.filter(p =>
      p.action === 'execute' || p.action === 'all'
    );
    const coveredEntities = new Set(
      executePolicies
        .filter(p => p.entity)
        .map(p => String(p.entity))
    );
    const hasGlobal = executePolicies.some(p => !p.entity);

    for (const pair of entityCommandPairs) {
      if (!hasGlobal && !coveredEntities.has(pair.entity)) {
        diagnostics.push({
          code: 'SEMANTIC_NO_POLICY',
          message: `Command '${pair.entity}.${pair.command}' has no policy covering it.`,
          severity: 'warning',
          category: 'semantic',
          path: `commands[?(@.name=="${pair.command}")]`,
          suggestion: `Add a policy for entity '${pair.entity}' with action 'execute' or 'all'. Example:\n    policy ${pair.entity}Execute execute: user.role in ["admin"]`,
        });
      }
    }
  }

  // Check: Duplicate constraint codes within entities
  for (const entity of entities) {
    const constraints = Array.isArray(entity.constraints) ? entity.constraints as Array<Record<string, unknown>> : [];
    const codesSeen = new Map<string, number>();
    for (const c of constraints) {
      const code = c.code ? String(c.code) : (c.name ? String(c.name) : '');
      if (code) {
        const count = (codesSeen.get(code) ?? 0) + 1;
        codesSeen.set(code, count);
        if (count > 1) {
          diagnostics.push({
            code: 'SEMANTIC_DUPLICATE_CONSTRAINT',
            message: `Entity '${String(entity.name)}' has duplicate constraint code '${code}'.`,
            severity: 'error',
            category: 'semantic',
            path: `entities[?(@.name=="${entity.name}")].constraints`,
            suggestion: `Constraint codes must be unique within an entity. Rename or remove the duplicate.`,
          });
        }
      }
    }
  }

  // Check: Orphaned event references in commands
  const eventNames = new Set(events.map(e => String(e.name)));
  for (const cmd of commands) {
    const emits = Array.isArray(cmd.emits) ? cmd.emits as string[] : [];
    for (const eventName of emits) {
      if (!eventNames.has(eventName)) {
        diagnostics.push({
          code: 'SEMANTIC_ORPHAN_EVENT',
          message: `Command '${String(cmd.name)}' emits event '${eventName}' which is not defined in the events array.`,
          severity: 'warning',
          category: 'semantic',
          path: `commands[?(@.name=="${cmd.name}")].emits`,
          suggestion: `Define the event '${eventName}' in the events section, or remove it from the command's emits.`,
        });
      }
    }
  }

  // Check: Store references valid entities
  const entityNames = new Set(entities.map(e => String(e.name)));
  for (const store of stores) {
    if (store.entity && !entityNames.has(String(store.entity))) {
      diagnostics.push({
        code: 'SEMANTIC_STORE_ORPHAN_ENTITY',
        message: `Store references entity '${String(store.entity)}' which is not defined.`,
        severity: 'error',
        category: 'semantic',
        path: `stores[?(@.entity=="${store.entity}")]`,
        suggestion: `Define entity '${String(store.entity)}' or update the store to reference an existing entity.`,
      });
    }
  }

  // Check: Command entity references exist
  for (const cmd of commands) {
    if (cmd.entity && !entityNames.has(String(cmd.entity))) {
      diagnostics.push({
        code: 'SEMANTIC_COMMAND_ORPHAN_ENTITY',
        message: `Command '${String(cmd.name)}' references entity '${String(cmd.entity)}' which is not defined.`,
        severity: 'error',
        category: 'semantic',
        path: `commands[?(@.name=="${cmd.name}")]`,
        suggestion: `Define entity '${String(cmd.entity)}' or remove the entity reference from the command.`,
      });
    }
  }

  // Check: Relationship targets exist
  for (const entity of entities) {
    const relationships = Array.isArray(entity.relationships) ? entity.relationships as Array<Record<string, unknown>> : [];
    for (const rel of relationships) {
      if (rel.target && !entityNames.has(String(rel.target))) {
        diagnostics.push({
          code: 'SEMANTIC_RELATIONSHIP_ORPHAN_TARGET',
          message: `Entity '${String(entity.name)}' relationship '${String(rel.name)}' targets '${String(rel.target)}' which is not defined.`,
          severity: 'warning',
          category: 'semantic',
          path: `entities[?(@.name=="${entity.name}")].relationships`,
          suggestion: `Define entity '${String(rel.target)}' or update the relationship target.`,
        });
      }
    }
  }

  // Info: Structural summary
  diagnostics.push({
    code: 'STRUCTURAL_SUMMARY',
    message: `IR contains ${entities.length} entities, ${commands.length} commands, ${policies.length} policies, ${stores.length} stores, ${events.length} events.`,
    severity: 'info',
    category: 'structural',
  });

  return diagnostics;
}

// ---------------------------------------------------------------------------
// Report builder
// ---------------------------------------------------------------------------

function buildReport(
  file: string,
  inputType: 'manifest-source' | 'ir-json',
  diagnostics: ValidationDiagnostic[]
): ValidationReport {
  const errors = diagnostics.filter(d => d.severity === 'error').length;
  const warnings = diagnostics.filter(d => d.severity === 'warning').length;
  const info = diagnostics.filter(d => d.severity === 'info').length;

  // Scoring: start at 100, deduct for issues
  let score = 100;
  score -= errors * 25;       // Each error costs 25 points
  score -= warnings * 5;      // Each warning costs 5 points
  score = Math.max(0, Math.min(100, score));

  return {
    file,
    inputType,
    valid: errors === 0,
    score,
    diagnostics,
    summary: {
      errors,
      warnings,
      info,
      totalChecks: diagnostics.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function formatReportText(report: ValidationReport, verbose: boolean): string {
  const lines: string[] = [];

  const relPath = path.relative(process.cwd(), report.file) || report.file;
  const scoreColor = report.score >= 80 ? chalk.green : report.score >= 50 ? chalk.yellow : chalk.red;

  lines.push('');
  lines.push(chalk.bold(`File: ${relPath}`));
  lines.push(`  Type:   ${report.inputType}`);
  lines.push(`  Score:  ${scoreColor(`${report.score}/100`)}`);
  lines.push(`  Valid:  ${report.valid ? chalk.green('YES') : chalk.red('NO')}`);
  lines.push(`  Errors: ${report.summary.errors}  Warnings: ${report.summary.warnings}  Info: ${report.summary.info}`);
  lines.push('');

  if (report.diagnostics.length === 0) {
    lines.push(chalk.green('  No issues found.'));
    lines.push('');
    return lines.join('\n');
  }

  // Group by category
  const byCategory = new Map<string, ValidationDiagnostic[]>();
  for (const d of report.diagnostics) {
    if (d.severity === 'info' && !verbose) continue;
    const list = byCategory.get(d.category) ?? [];
    list.push(d);
    byCategory.set(d.category, list);
  }

  for (const [category, items] of byCategory) {
    lines.push(chalk.bold(`  [${category.toUpperCase()}]`));
    for (const d of items) {
      const icon = d.severity === 'error' ? chalk.red('ERROR') : d.severity === 'warning' ? chalk.yellow('WARN') : chalk.gray('INFO');
      const location = d.line ? `:${d.line}${d.column ? `:${d.column}` : ''}` : '';
      lines.push(`    ${icon} [${d.code}] ${d.message}${location}`);
      if (d.path) {
        lines.push(chalk.gray(`      path: ${d.path}`));
      }
      if (d.suggestion) {
        lines.push(chalk.blue(`      fix: ${d.suggestion}`));
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

export async function validateAICommand(
  source: string | undefined,
  options: ValidateAIOptions = {}
): Promise<{ reports: ValidationReport[]; passed: boolean }> {
  const format = options.format ?? 'text';
  const minScore = options.minScore ?? 100;
  const verbose = options.verbose ?? false;

  const spinner = format === 'text' ? ora('Loading schema').start() : null;

  try {
    // Load schema
    const schema = await loadSchema(options.schema);
    if (spinner) spinner.text = 'Resolving input files...';

    // Resolve input files
    const inputs = await resolveInputs(source);

    if (inputs.length === 0) {
      if (spinner) spinner.warn('No .manifest or .ir.json files found');
      if (format === 'json') {
        console.log(JSON.stringify({ reports: [], passed: false, message: 'No input files found' }, null, 2));
      } else {
        console.log('  Provide a .manifest file or .ir.json file, or run from a directory containing them.');
      }
      return { reports: [], passed: false };
    }

    if (spinner) spinner.info(`Validating ${inputs.length} file(s)`);

    const reports: ValidationReport[] = [];

    for (const input of inputs) {
      if (spinner) {
        spinner.text = `Validating ${path.relative(process.cwd(), input.filePath)}`;
      }

      const report = input.type === 'ir-json'
        ? await validateIRFile(input.filePath, schema)
        : await validateManifestSource(input.filePath, schema);

      reports.push(report);

      if (spinner) {
        const relPath = path.relative(process.cwd(), input.filePath);
        if (report.valid) {
          spinner.succeed(chalk.green(`${relPath} — score: ${report.score}/100`));
        } else {
          spinner.fail(chalk.red(`${relPath} — score: ${report.score}/100 (${report.summary.errors} errors)`));
        }
        spinner.start(); // Keep spinner going for next file
      }
    }

    if (spinner) spinner.stop();

    // Output
    if (format === 'json') {
      // Machine-readable JSON for AI agents
      const overallScore = reports.length > 0
        ? Math.round(reports.reduce((sum, r) => sum + r.score, 0) / reports.length)
        : 0;
      const passed = reports.every(r => r.score >= minScore);

      const output = {
        version: '1.0',
        overallScore,
        passed,
        minScore,
        reportCount: reports.length,
        reports,
      };
      console.log(JSON.stringify(output, null, 2));

      if (!passed) {
        process.exit(1);
      }

      return { reports, passed };
    }

    // Text output
    for (const report of reports) {
      console.log(formatReportText(report, verbose));
    }

    // Summary
    const overallScore = reports.length > 0
      ? Math.round(reports.reduce((sum, r) => sum + r.score, 0) / reports.length)
      : 0;
    const passed = reports.every(r => r.score >= minScore);

    console.log(chalk.bold('SUMMARY:'));
    console.log(`  Files validated: ${reports.length}`);
    console.log(`  Overall score:   ${overallScore}/100`);
    console.log(`  Minimum score:   ${minScore}/100`);
    console.log(`  Result:          ${passed ? chalk.green('PASS') : chalk.red('FAIL')}`);

    if (!passed) {
      process.exit(1);
    }

    return { reports, passed };

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (spinner) spinner.fail(`Validation failed: ${msg}`);
    if (format === 'json') {
      console.log(JSON.stringify({ reports: [], passed: false, error: msg }, null, 2));
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}
