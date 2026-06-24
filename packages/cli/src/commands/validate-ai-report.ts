import path from 'node:path';
import chalk from 'chalk';
import type { ValidationDiagnostic, ValidationReport } from './validate-ai-types.js';

function scoreColor(score: number): (text: string) => string {
  if (score >= 80) return chalk.green;
  if (score >= 50) return chalk.yellow;
  return chalk.red;
}

function severityIcon(severity: ValidationDiagnostic['severity']): string {
  if (severity === 'error') return chalk.red('ERROR');
  if (severity === 'warning') return chalk.yellow('WARN');
  return chalk.gray('INFO');
}

function formatLocation(d: ValidationDiagnostic): string {
  if (!d.line) return '';
  const column = d.column ? `:${d.column}` : '';
  return `:${d.line}${column}`;
}

export function buildReport(
  file: string,
  inputType: 'manifest-source' | 'ir-json',
  diagnostics: ValidationDiagnostic[],
): ValidationReport {
  const errors = diagnostics.filter(d => d.severity === 'error').length;
  const warnings = diagnostics.filter(d => d.severity === 'warning').length;
  const info = diagnostics.filter(d => d.severity === 'info').length;

  let score = 100;
  score -= errors * 25;
  score -= warnings * 5;
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

export function formatReportText(report: ValidationReport, verbose: boolean): string {
  const lines: string[] = [];
  const relPath = path.relative(process.cwd(), report.file) || report.file;
  const color = scoreColor(report.score);

  lines.push(
    '',
    chalk.bold(`File: ${relPath}`),
    `  Type:   ${report.inputType}`,
    `  Score:  ${color(`${report.score}/100`)}`,
    `  Valid:  ${report.valid ? chalk.green('YES') : chalk.red('NO')}`,
    `  Errors: ${report.summary.errors}  Warnings: ${report.summary.warnings}  Info: ${report.summary.info}`,
    '',
  );

  if (report.diagnostics.length === 0) {
    lines.push(chalk.green('  No issues found.'), '');
    return lines.join('\n');
  }

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
      lines.push(`    ${severityIcon(d.severity)} [${d.code}] ${d.message}${formatLocation(d)}`);
      if (d.path) lines.push(chalk.gray(`      path: ${d.path}`));
      if (d.suggestion) lines.push(chalk.blue(`      fix: ${d.suggestion}`));
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function averageScore(reports: ValidationReport[]): number {
  if (reports.length === 0) return 0;
  return Math.round(reports.reduce((sum, r) => sum + r.score, 0) / reports.length);
}
