export interface RewriteRule {
  id: string;
  pattern: RegExp;
  replacement: string;
  description: string;
  severity: 'breaking' | 'warning' | 'info';
  category: string;
}

export interface AppliedRule {
  rule: RewriteRule;
  lineNumber: number;
  before: string;
  after: string;
}

export interface MigrationResult {
  output: string;
  appliedRules: AppliedRule[];
  breakingCount: number;
  warningCount: number;
  infoCount: number;
}

export function applyMigration(source: string, rules: RewriteRule[]): MigrationResult {
  const lines = source.split('\n');
  const appliedRules: AppliedRule[] = [];
  const outputLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const originalLine = line;

    for (const rule of rules) {
      if (rule.pattern.test(line)) {
        const before = line;
        line = line.replace(rule.pattern, rule.replacement);
        if (before !== line) {
          appliedRules.push({
            rule,
            lineNumber: i + 1,
            before: before.trim(),
            after: line.trim(),
          });
        }
      }
    }

    outputLines.push(line);
  }

  return {
    output: outputLines.join('\n'),
    appliedRules,
    breakingCount: appliedRules.filter((r) => r.rule.severity === 'breaking').length,
    warningCount: appliedRules.filter((r) => r.rule.severity === 'warning').length,
    infoCount: appliedRules.filter((r) => r.rule.severity === 'info').length,
  };
}

export interface DiffLine {
  type: 'same' | 'added' | 'removed';
  content: string;
  lineNumber: number;
}

export function computeDiff(original: string, modified: string): DiffLine[] {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');
  const result: DiffLine[] = [];
  let oi = 0;
  let mi = 0;

  while (oi < origLines.length || mi < modLines.length) {
    if (oi < origLines.length && mi < modLines.length && origLines[oi] === modLines[mi]) {
      result.push({ type: 'same', content: origLines[oi], lineNumber: mi + 1 });
      oi++;
      mi++;
    } else if (oi < origLines.length && mi < modLines.length) {
      result.push({ type: 'removed', content: origLines[oi], lineNumber: oi + 1 });
      result.push({ type: 'added', content: modLines[mi], lineNumber: mi + 1 });
      oi++;
      mi++;
    } else if (oi < origLines.length) {
      result.push({ type: 'removed', content: origLines[oi], lineNumber: oi + 1 });
      oi++;
    } else {
      result.push({ type: 'added', content: modLines[mi], lineNumber: mi + 1 });
      mi++;
    }
  }

  return result;
}
