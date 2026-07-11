/**
 * manifest audit-bypasses
 *
 * Validates a hand-curated approved-bypass registry against the schema at
 * docs/spec/registry/bypasses.schema.json, checks that referenced file
 * paths exist, and surfaces expired review dates.
 *
 * Schema and field semantics live in `docs/spec/registry/bypasses.schema.json`
 * and `docs/spec/registry/README.md`.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import Ajv, { type ErrorObject } from 'ajv';

export type BypassFindingSeverity = 'error' | 'warning';

export interface BypassFinding {
  severity: BypassFindingSeverity;
  code: string;
  message: string;
  index?: number;
  path?: string;
}

export interface AuditBypassesOptions {
  registry?: string;
  root?: string;
  strictExpiry?: boolean;
  format?: 'text' | 'json';
}

export interface AuditBypassesResult {
  findings: BypassFinding[];
  errorCount: number;
  warningCount: number;
}

interface BypassEntry {
  entity: string;
  path: string;
  reason: string;
  whyRuntimeNotRequired: string;
  tenantBoundary: string;
  owner: string;
  approvedAt: string;
  reviewBy: string;
  methods?: string[];
  note?: string;
}

interface BypassRegistry {
  version: string;
  bypasses: BypassEntry[];
}

async function locateBypassSchema(): Promise<object> {
  let dir: string;
  try {
    dir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    dir = process.cwd();
  }
  for (let prev = ''; dir !== prev; prev = dir, dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'docs', 'spec', 'registry', 'bypasses.schema.json');
    try {
      await fs.access(candidate);
      return JSON.parse(await fs.readFile(candidate, 'utf-8')) as object;
    } catch {
      // walk up
    }
  }
  throw new Error('Could not locate docs/spec/registry/bypasses.schema.json');
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): BypassFinding[] {
  if (!errors) return [];
  return errors.map((e) => ({
    severity: 'error' as const,
    code: 'BYPASS_SCHEMA_INVALID',
    message: `${e.instancePath || '<root>'} ${e.message ?? ''}`.trim(),
  }));
}

function isoDateInPast(value: string, today: Date = new Date()): boolean {
  // Accept YYYY-MM-DD. Anything else is delegated to the schema's format
  // check; here we only need the comparison.
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const t = new Date(today.toISOString().slice(0, 10) + 'T00:00:00Z');
  return parsed < t;
}

export async function auditBypassesCommand(
  options: AuditBypassesOptions = {},
): Promise<AuditBypassesResult> {
  const findings: BypassFinding[] = [];

  if (!options.registry) {
    findings.push({
      severity: 'error',
      code: 'BYPASS_REGISTRY_MISSING',
      message: '--registry <path> is required',
    });
    return finalize(findings, options);
  }

  const root = path.resolve(process.cwd(), options.root ?? '.');
  const registryPath = path.resolve(process.cwd(), options.registry);

  let raw: string;
  try {
    raw = await fs.readFile(registryPath, 'utf-8');
  } catch {
    findings.push({
      severity: 'error',
      code: 'BYPASS_REGISTRY_NOT_FOUND',
      message: `Cannot read bypass registry at ${registryPath}`,
    });
    return finalize(findings, options);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    findings.push({
      severity: 'error',
      code: 'BYPASS_REGISTRY_NOT_JSON',
      message: `Bypass registry is not valid JSON: ${(err as Error).message}`,
    });
    return finalize(findings, options);
  }

  const schema = await locateBypassSchema();
  // Ajv's `format` keyword is no-op without ajv-formats. We don't ship
  // ajv-formats; the past-date check below is the substantive date
  // validation. Ajv still enforces required fields, types, and enums.
  const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
  const validate = ajv.compile(schema);
  if (!validate(parsed)) {
    findings.push(...formatAjvErrors(validate.errors));
    return finalize(findings, options);
  }

  const registry = parsed as BypassRegistry;

  for (let i = 0; i < registry.bypasses.length; i++) {
    const entry = registry.bypasses[i];

    // Path existence check.
    const absPath = path.resolve(root, entry.path);
    try {
      await fs.access(absPath);
    } catch {
      findings.push({
        severity: 'error',
        code: 'BYPASS_PATH_MISSING',
        message: `Bypass entry references missing file: ${entry.path}`,
        index: i,
        path: entry.path,
      });
    }

    // Review date check.
    if (isoDateInPast(entry.reviewBy)) {
      findings.push({
        severity: options.strictExpiry ? 'error' : 'warning',
        code: 'BYPASS_REVIEW_OVERDUE',
        message: `reviewBy ${entry.reviewBy} is in the past (entity=${entry.entity}, owner=${entry.owner})`,
        index: i,
        path: entry.path,
      });
    }
  }

  return finalize(findings, options);
}

function finalize(findings: BypassFinding[], options: AuditBypassesOptions): AuditBypassesResult {
  const errorCount = findings.filter((f) => f.severity === 'error').length;
  const warningCount = findings.filter((f) => f.severity === 'warning').length;
  const result: AuditBypassesResult = { findings, errorCount, warningCount };

  if (options.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (findings.length === 0) {
      console.log(chalk.green('Bypass registry is conforming.'));
    } else {
      for (const f of findings) {
        const tag = f.severity === 'error' ? chalk.red('error') : chalk.yellow('warning');
        const loc = f.path ? ` [${f.path}]` : '';
        console.log(`${tag} ${f.code}: ${f.message}${loc}`);
      }
    }
    console.log(chalk.gray(`(${errorCount} errors, ${warningCount} warnings)`));
  }
  return result;
}
