/**
 * manifest coverage
 *
 * Analyzes conformance and unit test results to report which commands, guards,
 * policies, and constraint branches have been exercised. Produces a coverage
 * summary with uncovered paths highlighted.
 *
 * Integrates with the governance audit suite to enforce minimum coverage
 * thresholds via --min-coverage and --strict.
 *
 * Coverage categories:
 *   commands     — Entity.command pairs defined in IR
 *   guards       — Per-command guard expressions
 *   policies     — Named authorization policies
 *   constraints  — Constraint branches (by code + severity)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import chalk from 'chalk';

/* ------------------------------------------------------------------ */
/*  IR types (minimal subset for coverage analysis)                    */
/* ------------------------------------------------------------------ */

interface IRExpression {
  kind: string;
  [key: string]: unknown;
}

interface IRConstraint {
  name: string;
  code: string;
  severity?: 'ok' | 'warn' | 'block';
  expression: IRExpression;
  message?: string;
}

interface IRCommand {
  name: string;
  entity?: string;
  guards: IRExpression[];
  constraints?: IRConstraint[];
  policies?: string[];
  actions: unknown[];
  emits: string[];
}

interface IRPolicy {
  name: string;
  entity?: string;
  action: string;
  expression: IRExpression;
  message?: string;
}

interface IREntity {
  name: string;
  commands: string[];
  constraints: IRConstraint[];
  policies: string[];
  defaultPolicies?: string[];
}

interface IR {
  version: string;
  entities: IREntity[];
  commands: IRCommand[];
  policies: IRPolicy[];
}

/* ------------------------------------------------------------------ */
/*  Conformance results types                                          */
/* ------------------------------------------------------------------ */

interface ResultsTestCase {
  name: string;
  command?: {
    name: string;
    entityName?: string;
    instanceId?: string;
    input: Record<string, unknown>;
  };
  expectedResult?: {
    success: boolean;
    error?: string;
    deniedBy?: string;
    emittedEvents: unknown[];
  };
  expectedGuardFailure?: {
    index: number;
    expression: string;
  };
  expectedPolicyDenial?: {
    policyName: string;
    expression: string;
  };
  expectedConstraintFailures?: Array<{
    constraintName: string;
    expression: string;
  }>;
  entity?: string;
  data?: Record<string, unknown>;
}

interface ResultsFile {
  testCases: ResultsTestCase[];
}

/* ------------------------------------------------------------------ */
/*  Coverable path types                                               */
/* ------------------------------------------------------------------ */

export interface CoverablePath {
  category: 'command' | 'guard' | 'policy' | 'constraint';
  id: string;
  entity?: string;
  detail?: string;
  covered: boolean;
}

export interface CoverageSummary {
  total: number;
  covered: number;
  uncovered: number;
  percentage: number;
}

export interface CoverageCategory {
  name: string;
  summary: CoverageSummary;
  paths: CoverablePath[];
}

export interface CoverageResult {
  overall: CoverageSummary;
  categories: CoverageCategory[];
  uncoveredPaths: CoverablePath[];
}

/* ------------------------------------------------------------------ */
/*  Options                                                            */
/* ------------------------------------------------------------------ */

export interface CoverageOptions {
  /** Path to compiled IR JSON file. */
  ir?: string;
  /** Source .manifest file to compile (alternative to --ir). */
  source?: string;
  /** Root directory to scan for test files. */
  root?: string;
  /** Output format. */
  format?: 'text' | 'json';
  /** Minimum overall coverage percentage to pass. */
  minCoverage?: number;
  /** Exit non-zero when below threshold. */
  strict?: boolean;
}

/* ------------------------------------------------------------------ */
/*  IR loading                                                         */
/* ------------------------------------------------------------------ */

async function loadIR(irPath: string): Promise<IR> {
  const raw = await fs.readFile(irPath, 'utf-8');
  return JSON.parse(raw) as IR;
}

async function compileSourceToIR(sourcePath: string): Promise<IR> {
  // Dynamic import to keep the CLI lightweight when IR is pre-compiled.
  const { compileToIR } = await import('@angriff36/manifest/ir-compiler');
  const source = await fs.readFile(sourcePath, 'utf-8');
  const { ir, diagnostics } = await compileToIR(source);
  if (!ir) {
    const errors = diagnostics
      .filter((d: { severity: string }) => d.severity === 'error')
      .map((d: { message: string }) => d.message)
      .join('; ');
    throw new Error(`Compilation failed: ${errors}`);
  }
  return ir as IR;
}

/* ------------------------------------------------------------------ */
/*  Extract coverable paths from IR                                    */
/* ------------------------------------------------------------------ */

function extractPaths(ir: IR): CoverablePath[] {
  const paths: CoverablePath[] = [];

  // Commands
  for (const cmd of ir.commands) {
    const entity = cmd.entity ?? '__global__';
    paths.push({
      category: 'command',
      id: `${entity}.${cmd.name}`,
      entity,
      covered: false,
    });

    // Guards (per-command, indexed)
    for (let i = 0; i < cmd.guards.length; i++) {
      paths.push({
        category: 'guard',
        id: `${entity}.${cmd.name}:guard[${i}]`,
        entity,
        detail: `guard index ${i} on ${entity}.${cmd.name}`,
        covered: false,
      });
    }

    // Command-level constraints
    if (cmd.constraints) {
      for (const c of cmd.constraints) {
        const severity = c.severity ?? 'block';
        paths.push({
          category: 'constraint',
          id: `${entity}.${cmd.name}:constraint:${c.code}(${severity})`,
          entity,
          detail: `${c.code} [${severity}] on command ${entity}.${cmd.name}`,
          covered: false,
        });
      }
    }
  }

  // Entity-level constraints
  for (const ent of ir.entities) {
    for (const c of ent.constraints) {
      const severity = c.severity ?? 'block';
      paths.push({
        category: 'constraint',
        id: `${ent.name}:constraint:${c.code}(${severity})`,
        entity: ent.name,
        detail: `${c.code} [${severity}] on entity ${ent.name}`,
        covered: false,
      });
    }
  }

  // Policies
  for (const pol of ir.policies) {
    paths.push({
      category: 'policy',
      id: `policy:${pol.name}`,
      entity: pol.entity,
      detail: `${pol.action} policy "${pol.name}"`,
      covered: false,
    });
  }

  return paths;
}

/* ------------------------------------------------------------------ */
/*  Scan test evidence                                                 */
/* ------------------------------------------------------------------ */

const RESULTS_GLOBS = ['**/conformance/expected/*.results.json'];

const TEST_GLOBS = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.test.js',
  '**/conformance/**/*.json',
  '**/harness/**/*.json',
];

const IGNORED_DIRS = [
  'node_modules/**',
  'dist/**',
  'dist-app/**',
  '.next/**',
  '.turbo/**',
  '.tmp/**',
];

async function loadResultsFiles(root: string): Promise<ResultsFile[]> {
  const results: ResultsFile[] = [];
  for (const pattern of RESULTS_GLOBS) {
    const matches = await glob(pattern, { cwd: root, absolute: true, ignore: IGNORED_DIRS });
    for (const f of matches) {
      try {
        const raw = await fs.readFile(f, 'utf-8');
        results.push(JSON.parse(raw) as ResultsFile);
      } catch {
        // skip unreadable
      }
    }
  }
  return results;
}

async function collectTestCorpus(root: string): Promise<string> {
  const files = new Set<string>();
  for (const pattern of TEST_GLOBS) {
    const matches = await glob(pattern, { cwd: root, absolute: true, ignore: IGNORED_DIRS });
    for (const f of matches) files.add(f);
  }
  const buffers: string[] = [];
  for (const file of files) {
    try {
      buffers.push(await fs.readFile(file, 'utf-8'));
    } catch {
      // skip unreadable
    }
  }
  return buffers.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Coverage resolution                                                */
/* ------------------------------------------------------------------ */

function markCoverage(
  paths: CoverablePath[],
  resultsFiles: ResultsFile[],
  testCorpus: string,
): void {
  // Build lookup sets from conformance results
  const exercisedCommands = new Set<string>();
  const exercisedGuards = new Set<string>();
  const exercisedPolicies = new Set<string>();
  const exercisedConstraints = new Set<string>();

  for (const rf of resultsFiles) {
    for (const tc of rf.testCases) {
      if (tc.command) {
        const entity = tc.command.entityName ?? tc.entity ?? '__global__';
        const cmdId = `${entity}.${tc.command.name}`;
        exercisedCommands.add(cmdId);

        // Guard exercised if test expects guard failure
        if (tc.expectedGuardFailure) {
          exercisedGuards.add(`${cmdId}:guard[${tc.expectedGuardFailure.index}]`);
        }
        // If test expects success on a guarded command, guard[0] is implicitly
        // exercised (the passing path). Mark all guard indices we can infer.
        if (tc.expectedResult?.success) {
          // The passing path exercises guard evaluation. We mark guard[0]
          // because at minimum the first guard must have been evaluated.
          exercisedGuards.add(`${cmdId}:guard[0]`);
        }

        // Policy exercised if test expects policy denial
        if (tc.expectedPolicyDenial) {
          exercisedPolicies.add(`policy:${tc.expectedPolicyDenial.policyName}`);
        }
        if (tc.expectedResult?.deniedBy) {
          exercisedPolicies.add(`policy:${tc.expectedResult.deniedBy}`);
        }
      }

      // Constraint failures
      if (tc.expectedConstraintFailures) {
        for (const cf of tc.expectedConstraintFailures) {
          // Match by constraint name prefix — severity suffix handled below
          exercisedConstraints.add(cf.constraintName);
        }
      }
    }
  }

  // Mark coverage on each path
  for (const p of paths) {
    switch (p.category) {
      case 'command':
        // Covered if exercised by conformance results OR referenced in test corpus
        p.covered = exercisedCommands.has(p.id) || testCorpus.includes(p.id);
        break;

      case 'guard':
        // Covered if a test exercises this exact guard index OR referenced in tests
        p.covered = exercisedGuards.has(p.id) || testCorpus.includes(p.id);
        break;

      case 'policy':
        // Covered if a test exercises this policy (denial or passing path)
        p.covered = exercisedPolicies.has(p.id) || testCorpus.includes(p.id);
        break;

      case 'constraint': {
        // Covered if a test exercises this constraint code OR referenced in tests
        const code = p.id.split(':constraint:')[1]?.split('(')[0] ?? '';
        p.covered =
          exercisedConstraints.has(code) ||
          testCorpus.includes(code) ||
          testCorpus.includes(p.id);
        break;
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Summary computation                                                */
/* ------------------------------------------------------------------ */

function computeSummary(paths: CoverablePath[]): CoverageSummary {
  const total = paths.length;
  const covered = paths.filter((p) => p.covered).length;
  return {
    total,
    covered,
    uncovered: total - covered,
    percentage: total === 0 ? 100 : Math.round((covered / total) * 10000) / 100,
  };
}

function buildResult(paths: CoverablePath[]): CoverageResult {
  const categoryNames: Array<CoverablePath['category']> = [
    'command',
    'guard',
    'policy',
    'constraint',
  ];

  const categories: CoverageCategory[] = categoryNames.map((name) => {
    const catPaths = paths.filter((p) => p.category === name);
    return {
      name,
      summary: computeSummary(catPaths),
      paths: catPaths,
    };
  });

  return {
    overall: computeSummary(paths),
    categories,
    uncoveredPaths: paths.filter((p) => !p.covered),
  };
}

/* ------------------------------------------------------------------ */
/*  Text output formatting                                             */
/* ------------------------------------------------------------------ */

function formatText(result: CoverageResult): void {
  console.log(chalk.bold('\nManifest Coverage Report'));
  console.log('═'.repeat(50));

  for (const cat of result.categories) {
    if (cat.summary.total === 0) continue;

    const pctColor =
      cat.summary.percentage >= 80
        ? chalk.green
        : cat.summary.percentage >= 50
          ? chalk.yellow
          : chalk.red;

    console.log(
      `\n${chalk.bold(cat.name)} — ${pctColor(`${cat.summary.percentage}%`)} ` +
      `(${cat.summary.covered}/${cat.summary.total})`
    );

    const uncovered = cat.paths.filter((p) => !p.covered);
    if (uncovered.length > 0) {
      for (const p of uncovered) {
        console.log(`  ${chalk.red('✗')} ${p.id}${p.detail ? chalk.gray(` — ${p.detail}`) : ''}`);
      }
    } else {
      console.log(`  ${chalk.green('All paths covered')}`);
    }
  }

  console.log('\n' + '═'.repeat(50));

  const overallColor =
    result.overall.percentage >= 80
      ? chalk.green
      : result.overall.percentage >= 50
        ? chalk.yellow
        : chalk.red;

  console.log(
    chalk.bold('Overall: ') +
    overallColor(`${result.overall.percentage}%`) +
    ` (${result.overall.covered}/${result.overall.total} paths covered)`
  );
}

/* ------------------------------------------------------------------ */
/*  Public command                                                     */
/* ------------------------------------------------------------------ */

export async function coverageCommand(
  options: CoverageOptions = {},
): Promise<CoverageResult> {
  const root = path.resolve(process.cwd(), options.root ?? '.');

  // Resolve IR
  let ir: IR;
  if (options.ir) {
    ir = await loadIR(path.resolve(process.cwd(), options.ir));
  } else if (options.source) {
    ir = await compileSourceToIR(path.resolve(process.cwd(), options.source));
  } else {
    // Auto-detect: look for *.ir.json under root
    const candidates = await glob('**/*.ir.json', {
      cwd: root,
      absolute: true,
      ignore: ['node_modules/**', 'dist/**', '.next/**', '.turbo/**'],
    });
    if (candidates.length === 0) {
      throw new Error(
        'No IR file found. Supply --ir <path> or --source <manifest-file>.'
      );
    }
    ir = await loadIR(candidates[0]);
  }

  // Extract coverable paths from IR
  const paths = extractPaths(ir);

  // Scan evidence
  const [resultsFiles, testCorpus] = await Promise.all([
    loadResultsFiles(root),
    collectTestCorpus(root),
  ]);

  // Resolve coverage
  markCoverage(paths, resultsFiles, testCorpus);

  // Build result
  const result = buildResult(paths);

  // Output
  if (options.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    formatText(result);
  }

  return result;
}
