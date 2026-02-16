/**
 * manifest lint-routes command
 *
 * Scans configured client directories for hardcoded route strings.
 * Fails CI when violations are found.
 *
 * This is the enforcement layer for the Canonical Routes invariant.
 * Documentation does not stop AI. Failing CI does.
 *
 * See docs/spec/manifest-vnext.md § "Canonical Routes (Normative)".
 */

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import chalk from 'chalk';
import ora from 'ora';

// ============================================================================
// Types
// ============================================================================

export interface LintRoutesConfig {
  /** Directories to scan for hardcoded route strings */
  dirs: string[];
  /** Route prefixes to match (e.g. ["/api/", "/v1/"]) */
  prefixes: string[];
  /** Exact paths to allowlist (won't trigger violations) */
  allowlist: string[];
  /** File glob patterns to exclude from scanning */
  exclude: string[];
}

export interface LintViolation {
  file: string;
  line: number;
  column: number;
  match: string;
  suggestion?: string;
}

export interface LintResult {
  violations: LintViolation[];
  filesScanned: number;
  config: LintRoutesConfig;
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_CONFIG: LintRoutesConfig = {
  dirs: ['src', 'app', 'pages', 'components', 'lib'],
  prefixes: ['/api/'],
  allowlist: [],
  exclude: [
    '**/node_modules/**',
    '**/.next/**',
    '**/dist/**',
    '**/build/**',
    '**/routes.ts',
    '**/routes.manifest.json',
    '**/*.test.*',
    '**/*.spec.*',
    '**/*.d.ts',
  ],
};

// ============================================================================
// Config Loading
// ============================================================================

/**
 * Load lint-routes config from manifest.config.yaml or use defaults.
 */
export async function loadLintRoutesConfig(cwd: string): Promise<LintRoutesConfig> {
  // Try to load from manifest.config.yaml
  const configPaths = [
    'manifest.config.yaml',
    'manifest.config.yml',
  ];

  for (const configFile of configPaths) {
    const configPath = path.resolve(cwd, configFile);
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      // Simple YAML parsing for the lintRoutes section
      const yaml = await import('js-yaml');
      const parsed = yaml.load(content) as Record<string, unknown>;

      if (parsed?.lintRoutes && typeof parsed.lintRoutes === 'object') {
        const lintConfig = parsed.lintRoutes as Partial<LintRoutesConfig>;
        return {
          dirs: lintConfig.dirs ?? DEFAULT_CONFIG.dirs,
          prefixes: lintConfig.prefixes ?? DEFAULT_CONFIG.prefixes,
          allowlist: lintConfig.allowlist ?? DEFAULT_CONFIG.allowlist,
          exclude: lintConfig.exclude ?? DEFAULT_CONFIG.exclude,
        };
      }
    } catch {
      continue;
    }
  }

  return DEFAULT_CONFIG;
}

// ============================================================================
// Scanner
// ============================================================================

/**
 * Build a regex that matches hardcoded route strings for given prefixes.
 *
 * Matches:
 *   - String literals: "/api/foo", '/api/foo'
 *   - Template literals: `/api/foo`
 *   - fetch("/api/foo"), fetch('/api/foo'), fetch(`/api/foo`)
 *
 * Does NOT match:
 *   - Import paths
 *   - Comments (handled separately)
 */
function buildRoutePattern(prefixes: string[]): RegExp {
  // Escape regex special chars in prefixes
  const escaped = prefixes.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // Match quoted strings or template literal strings containing any prefix
  // Wrap alternation in non-capturing group so [^...] applies to all alternatives
  const pattern = `(?:["'\`])\\s*((?:${escaped.join('|')})[^"'\`\\s]*)\\s*(?:["'\`])`;
  return new RegExp(pattern, 'g');
}

/**
 * Check if a line is a comment or inside a generated file header.
 */
function isCommentOrGenerated(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*/') ||
    trimmed.includes('DO NOT EDIT') ||
    trimmed.includes('Auto-generated')
  );
}

/**
 * Check if a match is in the allowlist.
 */
function isAllowlisted(match: string, allowlist: string[]): boolean {
  return allowlist.some(allowed => match === allowed || match.startsWith(allowed));
}

/**
 * Scan a single file for hardcoded route strings.
 */
export function scanFileForRoutes(
  content: string,
  filePath: string,
  config: LintRoutesConfig
): LintViolation[] {
  const violations: LintViolation[] = [];
  const pattern = buildRoutePattern(config.prefixes);
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip comments and generated file headers
    if (isCommentOrGenerated(line)) continue;

    // Reset regex state for each line
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(line)) !== null) {
      const matchedPath = match[1];

      // Skip allowlisted paths
      if (isAllowlisted(matchedPath, config.allowlist)) continue;

      // Skip if this looks like an import path (from "..." or require("..."))
      if (/(?:from|require)\s*\(?\s*$/.test(line.slice(0, match.index))) continue;

      violations.push({
        file: filePath,
        line: i + 1,
        column: match.index + 1,
        match: matchedPath,
        suggestion: `Use a generated route helper from routes.ts instead of hardcoded "${matchedPath}"`,
      });
    }
  }

  return violations;
}

/**
 * Scan all configured directories for hardcoded route strings.
 */
export async function scanDirectories(
  cwd: string,
  config: LintRoutesConfig
): Promise<LintResult> {
  const violations: LintViolation[] = [];
  let filesScanned = 0;

  // Collect all files from configured directories
  const filePatterns = config.dirs.map(dir => `${dir}/**/*.{ts,tsx,js,jsx,mjs,cjs}`);

  for (const pattern of filePatterns) {
    const files = await glob(pattern, {
      cwd,
      ignore: config.exclude,
      absolute: false,
    });

    for (const file of files) {
      const fullPath = path.resolve(cwd, file);
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        filesScanned++;

        const fileViolations = scanFileForRoutes(content, file, config);
        violations.push(...fileViolations);
      } catch {
        // Skip files that can't be read
      }
    }
  }

  return { violations, filesScanned, config };
}

// ============================================================================
// CLI Command
// ============================================================================

interface LintRoutesOptions {
  config?: string;
  format?: 'text' | 'json';
  fix?: boolean;
}

/**
 * lint-routes command handler
 */
export async function lintRoutesCommand(options: LintRoutesOptions = {}): Promise<void> {
  const spinner = ora('Scanning for hardcoded route strings').start();

  try {
    const cwd = process.cwd();

    // Load config
    const config = await loadLintRoutesConfig(cwd);

    spinner.text = `Scanning ${config.dirs.join(', ')} for hardcoded routes...`;

    // Scan
    const result = await scanDirectories(cwd, config);

    // Output
    if (options.format === 'json') {
      spinner.stop();
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.violations.length === 0) {
        spinner.succeed(`Scanned ${result.filesScanned} file(s) — no hardcoded routes found`);
        console.log(chalk.green('\n  Route surface is clean. All transport paths use generated helpers.'));
      } else {
        spinner.fail(`Found ${result.violations.length} hardcoded route(s) in ${result.filesScanned} file(s)`);
        console.log('');

        for (const v of result.violations) {
          console.log(chalk.red(`  ${v.file}:${v.line}:${v.column}`));
          console.log(`    Hardcoded route: ${chalk.yellow(v.match)}`);
          if (v.suggestion) {
            console.log(chalk.gray(`    → ${v.suggestion}`));
          }
          console.log('');
        }

        console.log(chalk.bold('SUMMARY:'));
        console.log(`  Files scanned: ${result.filesScanned}`);
        console.log(`  Violations: ${chalk.red(String(result.violations.length))}`);
        console.log(`  Prefixes checked: ${config.prefixes.join(', ')}`);
        console.log('');
        console.log(chalk.gray('  Configure in manifest.config.yaml under lintRoutes:'));
        console.log(chalk.gray('    lintRoutes:'));
        console.log(chalk.gray('      dirs: [src, app]'));
        console.log(chalk.gray('      prefixes: ["/api/"]'));
        console.log(chalk.gray('      allowlist: ["/api/health"]'));

        process.exit(1);
      }
    }
  } catch (error: any) {
    spinner.fail(`Route linting failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}
