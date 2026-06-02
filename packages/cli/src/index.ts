#!/usr/bin/env node

/**
 * Manifest CLI
 *
 * Command-line interface for the Manifest language.
 * Provides commands for compiling, generating code, and managing Manifest projects.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { compileCommand } from './commands/compile.js';
import { generateCommand } from './commands/generate.js';
import { buildCommand } from './commands/build.js';
import { watchCommand } from './commands/watch.js';
import { validateCommand } from './commands/validate.js';
import { validateAICommand } from './commands/validate-ai.js';
import { docsCommand } from './commands/docs.js';
import { diagramCommand } from './commands/diagram.js';
import { preflightCommand } from './commands/preflight.js';
import { checkCommand } from './commands/check.js';
import { initCommand } from './commands/init.js';
import { initCiCommand } from './commands/init-ci.js';
import { scanCommand } from './commands/scan.js';
import { harnessCommand } from './commands/harness.js';
import { lintRoutesCommand } from './commands/lint-routes.js';
import { routesCommand } from './commands/routes.js';
import { auditRoutesCommand } from './commands/audit-routes.js';
import { emitRegistriesCommand } from './commands/emit-registries.js';
import { auditBypassesCommand } from './commands/audit-bypasses.js';
import { auditGovernanceCommand } from './commands/audit-governance.js';
import { enforceSurfaceCommand } from './commands/enforce-surface.js';
import { coverageCommand } from './commands/coverage.js';
import { integrationCheckCommand } from './commands/integration-check.js';
import {
  configValidateCommand,
  configPrintDefaultsCommand,
  configInspectCommand,
} from './commands/config.js';
import {
  cacheStatusCommand,
  doctorCommand,
  duplicatesCommand,
  inspectEntityCommand,
  runtimeCheckCommand,
  diffSourceVsIRCommand,
} from './commands/doctor.js';
import { diffIRCommand } from './commands/ir-diff.js';
import { breakingChangeCommand } from './commands/breaking-change.js';
import { migrateCommand } from './commands/migrate.js';
import { fmtCommand } from './commands/fmt.js';
import { changelogCommand } from './commands/changelog.js';
import { installHooksCommand } from './commands/install-hooks.js';
import {
  versionsListCommand,
  versionsShowCommand,
  versionsSaveCommand,
  versionsDiffCommand,
  versionsChangelogCommand,
  versionsTagCommand,
  versionsRollbackCommand,
  versionsVerifyCommand,
} from './commands/versions.js';
import { getConfig, resolveNextJsProjectionOptions } from './utils/config.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, normalize, dirname, join } from 'node:path';
import { realpath, readFile } from 'node:fs/promises';

/**
 * Read version from the root package.json at runtime so the CLI always
 * reports the same version as the published package — no manual sync needed.
 */
async function getPackageVersion(): Promise<string> {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // Traverse up from dist/ (or src/ in dev) to find the root package.json
    for (let dir = here, prev = ''; dir !== prev; prev = dir, dir = dirname(dir)) {
      try {
        const pkgPath = join(dir, 'package.json');
        const raw = await readFile(pkgPath, 'utf-8');
        const pkg = JSON.parse(raw) as { name?: string; version?: string };
        if (pkg.name === '@angriff36/manifest' && pkg.version) {
          return pkg.version;
        }
      } catch {
        // not found at this level, keep walking up
      }
    }
  } catch {
    // fall through
  }
  // Deliberate sentinel: returned only when the walk-up cannot locate
  // package.json (e.g. the CLI is loaded outside the package layout).
  // This is the "version is unknown" marker, not a real version string —
  // hence the lint-rule exemption on the literal below.
  // eslint-disable-next-line manifest/no-hardcoded-versions
  return '0.0.0';
}

const program = new Command();

const packageVersion = await getPackageVersion();

program
  .name('manifest')
  .description('Manifest language CLI - Compile, generate, and validate Manifest code')
  .version(packageVersion);

/**
 * manifest init
 *
 * Initialize Manifest configuration for your project.
 */
program
  .command('init')
  .description('Initialize Manifest configuration (interactive) or generate CI workflows')
  .option('-f, --force', 'Overwrite existing config or workflow file')
  .option('--ci <provider>', 'Generate CI workflow for provider (github)')
  .option('--node-versions <versions>', 'Comma-separated Node.js versions for CI matrix (default: 18,20,22)')
  .action(async (options: { force?: boolean; ci?: string; nodeVersions?: string }) => {
    if (options.ci) {
      await initCiCommand(options.ci, {
        force: options.force,
        nodeVersions: options.nodeVersions,
      });
      return;
    }
    await initCommand(options);
  });

/**
 * manifest compile [source]
 *
 * Compile .manifest source files to IR (Intermediate Representation).
 */
program
  .command('compile')
  .description('Compile .manifest source to IR')
  .argument('[source]', 'Source .manifest file or glob pattern')
  .option('-o, --output <path>', 'Output directory or file path')
  .option('-g, --glob <pattern>', 'Glob pattern for multiple files (use with output directory)')
  .option('-d, --diagnostics', 'Include diagnostics in output', false)
  .option('--pretty', 'Pretty-print JSON output', true)
  .option('--merge', 'Merge multiple files into single IR (resolves use declarations)', false)
  .option('--entry <files...>', 'Entry file(s) for merge compilation (auto-detected if omitted)')
  .action(async (source, options = {}) => {
    const config = (await getConfig()) ?? {};
    if (!options.output && config?.output) {
      options.output = config.output;
    }
    await compileCommand(source, options);
  });

/**
 * manifest generate <ir>
 *
 * Generate code from IR using a projection.
 */
program
  .command('generate')
  .description('Generate code from IR using a projection')
  .argument('<ir>', 'IR file or directory')
  .option('-p, --projection <name>', 'Projection name (nextjs, ts.types, ts.client)', 'nextjs')
  .option('-s, --surface <name>', 'Projection surface (route, command, types, client, all)', 'all')
  .option('-o, --output <path>', 'Output directory')
  .option('--auth <provider>', 'Auth provider or import path')
  .option('--database <path>', 'Database import path')
  .option('--runtime <path>', 'Runtime import path')
  .option('--response <path>', 'Response helpers import path')
  .action(async (ir, options = {}) => {
    // resolveNextJsProjectionOptions returns the user's raw nextjs options
    // (incl. dispatcher.*, concreteCommandRoutes.*) — no defaults baked in.
    // CLI flag overrides are layered on inside generateCommand.
    const projectionOptionsFromConfig = await resolveNextJsProjectionOptions();

    await generateCommand(ir, {
      ...options,
      projectionOptionsFromConfig,
    });
  });

/**
 * manifest build [source]
 *
 * Compile .manifest to IR and generate code in one step.
 */
program
  .command('build')
  .description('Compile and generate in one step')
  .argument('[source]', 'Source .manifest file or glob pattern')
  .option('-p, --projection <name>', 'Projection name (nextjs, ts.types, ts.client)', 'nextjs')
  .option('-s, --surface <name>', 'Projection surface (route, command, types, client, all)', 'all')
  .option('--ir-output <path>', 'IR output directory')
  .option('--code-output <path>', 'Generated code output directory')
  .option('-g, --glob <pattern>', 'Glob pattern for multiple files')
  .option('--auth <provider>', 'Auth provider or import path')
  .option('--database <path>', 'Database import path')
  .option('--runtime <path>', 'Runtime import path')
  .option('--response <path>', 'Response helpers import path')
  .action(async (source, options = {}) => {
    const config = (await getConfig()) ?? {};
    const projectionOptionsFromConfig = await resolveNextJsProjectionOptions();

    const finalOptions = {
      ...options,
      irOutput:
        options.irOutput || config?.output || 'ir/',
      codeOutput:
        options.codeOutput ||
        config?.projections?.nextjs?.output ||
        config?.projections?.['nextjs']?.output ||
        'generated/',
      projectionOptionsFromConfig,
    };

    await buildCommand(source, finalOptions);
  });

/**
 * manifest watch [source]
 *
 * Watch .manifest files for changes and rebuild incrementally.
 */
program
  .command('watch')
  .description('Watch .manifest files and rebuild on change')
  .argument('[source]', 'Source .manifest file, directory, or glob pattern')
  .option('-p, --projection <name>', 'Projection name (nextjs, ts.types, ts.client)', 'nextjs')
  .option('-s, --surface <name>', 'Projection surface (route, command, types, client, all)', 'all')
  .option('--ir-output <path>', 'IR output directory')
  .option('--code-output <path>', 'Generated code output directory')
  .option('-g, --glob <pattern>', 'Glob pattern for multiple files')
  .option('--auth <provider>', 'Auth provider or import path')
  .option('--database <path>', 'Database import path')
  .option('--runtime <path>', 'Runtime import path')
  .option('--response <path>', 'Response helpers import path')
  .option('--debounce <ms>', 'Debounce delay in milliseconds', '300')
  .option('--events', 'Emit structured JSON change events to stdout', false)
  .option('--clear', 'Clear terminal on each rebuild', false)
  .action(async (source, options = {}) => {
    const config = (await getConfig()) ?? {};
    const projectionOptionsFromConfig = await resolveNextJsProjectionOptions();

    const finalOptions = {
      ...options,
      irOutput:
        options.irOutput || config?.output || 'ir/',
      codeOutput:
        options.codeOutput ||
        config?.projections?.nextjs?.output ||
        config?.projections?.['nextjs']?.output ||
        'generated/',
      debounce: parseInt(options.debounce, 10) || 300,
      projectionOptionsFromConfig,
    };

    await watchCommand(source, finalOptions);
  });

/**
 * manifest validate [ir]
 *
 * Validate IR against schema.
 */
program
  .command('validate')
  .description('Validate IR against schema')
  .argument('[ir]', 'IR file or glob pattern')
  .option('--schema <path>', 'Schema path (default: docs/spec/ir/ir-v1.schema.json)')
  .option('--strict', 'Fail on warnings', false)
  .action(validateCommand);

/**
 * manifest fmt [source]
 *
 * Format .manifest source files deterministically.
 */
program
  .command('fmt')
  .description('Format .manifest source files (deterministic whitespace normalization)')
  .argument('[source]', 'Source .manifest file, directory, or glob pattern')
  .option('--check', 'Fail if any file would change', false)
  .option('--write', 'Write formatted output to files', false)
  .option('-g, --glob <pattern>', 'Glob pattern when source is a directory')
  .action(async (source, options = {}) => {
    await fmtCommand(source, {
      check: options.check,
      write: !options.check,
      glob: options.glob,
    });
  });

/**
 * manifest install-hooks
 *
 * Install pre-commit hooks for fmt --check and validate.
 */
program
  .command('install-hooks')
  .description('Install pre-commit hooks (Husky or simple-git-hooks)')
  .option('-f, --force', 'Overwrite existing hook configuration')
  .option('--provider <provider>', 'Hook provider: husky | simple-git-hooks', 'husky')
  .action(async (options: { force?: boolean; provider?: string }) => {
    const provider = options.provider === 'simple-git-hooks' ? 'simple-git-hooks' : 'husky';
    await installHooksCommand({
      force: options.force,
      provider,
    });
  });

/**
 * manifest validate-ai [source]
 *
 * Structured validation for LLM-generated .manifest or IR JSON with scored reports.
 */
program
  .command('validate-ai')
  .description('Validate manifest/IR with scored diagnostics for AI agents')
  .argument('[source]', 'Source .manifest, .ir.json, directory, or glob')
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .option('--schema <path>', 'Schema path (default: docs/spec/ir/ir-v1.schema.json)')
  .option('--min-score <n>', 'Minimum score to pass (default: 100)', (v) => parseInt(v, 10), 100)
  .option('--verbose', 'Include info-level diagnostics', false)
  .action(async (source, options = {}) => {
    await validateAICommand(source, {
      format: options.format,
      schema: options.schema,
      minScore: options.minScore,
      verbose: options.verbose,
    });
  });

/**
 * manifest docs [source]
 *
 * Generate static documentation site from IR.
 */
program
  .command('docs')
  .description('Generate static documentation site from Manifest IR')
  .argument('[source]', 'Source .manifest, .ir.json, directory, or glob')
  .option('-o, --output <path>', 'Output directory', 'docs-site')
  .option('-f, --format <format>', 'Output format (html, markdown)', 'html')
  .option('-t, --title <title>', 'Site title', 'Manifest API Reference')
  .action(async (source, options = {}) => {
    await docsCommand(source, {
      output: options.output,
      format: options.format,
      title: options.title,
    });
  });

/**
 * manifest diagram [source]
 *
 * Generate Mermaid diagrams from IR (ER, state machine, sequence).
 */
program
  .command('diagram')
  .description('Generate Mermaid diagrams from Manifest IR (ER, state, sequence)')
  .argument('[source]', 'Source .manifest, .ir.json, directory, or glob')
  .option('-o, --output <path>', 'Output directory', 'diagrams')
  .option('-t, --type <type>', 'Diagram type (er, state, sequence, all)', 'all')
  .option('-e, --entity <name>', 'Filter to a specific entity')
  .option('--markdown', 'Wrap output in markdown fenced code blocks', false)
  .action(async (source, options = {}) => {
    await diagramCommand(source, {
      output: options.output,
      type: options.type,
      entity: options.entity,
      markdown: options.markdown,
    });
  });

/**
 * manifest preflight
 *
 * Validate environment variables against manifest.config env mapping.
 */
program
  .command('preflight')
  .description('Validate environment variables and generate .env.example')
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .option('--generate-example', 'Generate .env.example instead of checking')
  .option('-o, --output <path>', 'Output path for .env.example', '.env.example')
  .action(async (options = {}) => {
    await preflightCommand({
      format: options.format,
      generateExample: options.generateExample,
      output: options.output,
    });
  });

/**
 * manifest check [source]
 *
 * Compile .manifest source and validate generated IR in one step.
 */
program
  .command('check')
  .description('Compile and validate in one step')
  .argument('[source]', 'Source .manifest file or glob pattern')
  .option('-o, --output <path>', 'IR output directory or file path')
  .option('-g, --glob <pattern>', 'Glob pattern for multiple files (use with output directory)')
  .option('-d, --diagnostics', 'Include diagnostics in compile output', false)
  .option('--pretty', 'Pretty-print JSON output', true)
  .option('--schema <path>', 'Schema path (default: docs/spec/ir/ir-v1.schema.json)')
  .option('--strict', 'Fail on warnings', false)
  .action(async (source, options = {}) => {
    const config = (await getConfig()) ?? {};
    if (!options.output && config?.output) {
      options.output = config.output;
    }
    await checkCommand(source, options);
  });

/**
 * manifest scan [source]
 *
 * Scan .manifest files for configuration issues before runtime.
 * Primary goal: "If scan passes, the code works."
 *
 * Checks:
 * - Policy coverage: Every command has a policy
 * - Store consistency: Store targets are recognized
 */
program
  .command('scan')
  .description('Scan manifest files for configuration issues')
  .argument('[source]', 'Source .manifest file or directory')
  .option('-g, --glob <pattern>', 'Glob pattern for manifest files', '**/*.manifest')
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .option('--strict', 'Fail on warnings', false)
  .action(async (source, options = {}) => {
    await scanCommand(source, options);
  });

/**
 * manifest harness <manifest>
 *
 * Run a fixture-generator style test script against compiled IR and report
 * step/assertion pass-fail counts.
 */
program
  .command('harness')
  .description('Run IR harness script and report failed steps/assertions')
  .argument('<manifest>', 'Path to a .manifest file')
  .requiredOption('-s, --script <path>', 'Path to harness script JSON')
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .action(async (manifest, options = {}) => {
    await harnessCommand(manifest, options);
  });

/**
 * manifest routes
 *
 * Compile all .manifest files and output the canonical route manifest.
 * Agent-accessible equivalent of the DevTools Route Surface tab.
 *
 * See docs/spec/manifest-vnext.md § "Canonical Routes (Normative)".
 */
program
  .command('routes')
  .description('Generate canonical route manifest from compiled IR')
  .option('-s, --src <pattern>', 'Source glob pattern for .manifest files')
  .option('-f, --format <format>', 'Output format (json, summary)', 'json')
  .option('-b, --base-path <path>', 'Base path prefix for routes', '/api')
  .action(async (options = {}) => {
    await routesCommand(options);
  });

/**
 * manifest lint-routes
 *
 * Scan client directories for hardcoded route strings.
 * Fails when violations are found — the enforcement layer for canonical routes.
 *
 * See docs/spec/manifest-vnext.md § "Canonical Routes (Normative)".
 */
program
  .command('lint-routes')
  .description('Scan for hardcoded route strings (canonical routes enforcement)')
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .option('-c, --config <path>', 'Config file path')
  .action(async (options = {}) => {
    await lintRoutesCommand(options);
  });

/**
 * manifest audit-routes
 *
 * Audit generated/handwritten routes for Manifest boundary compliance:
 * - Writes should execute via runtime.runCommand
 * - Direct reads should include expected tenant/location/soft-delete filters
 */
program
  .command('audit-routes')
  .description('Audit route boundary compliance (runtime writes + scoped reads + ownership)')
  .option('-r, --root <path>', 'Root directory to audit', '.')
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .option('--strict', 'Fail on warnings and enforce ownership rules as errors', false)
  .option('--tenant-field <name>', 'Tenant scope field name', 'tenantId')
  .option('--deleted-field <name>', 'Soft-delete field name', 'deletedAt')
  .option('--location-field <name>', 'Location scope field name', 'locationId')
  .option('--commands-manifest <path>', 'Path to commands manifest JSON (enables ownership rules)')
  .option('--exemptions <path>', 'Path to exemptions registry JSON')
  .action(async (options = {}) => {
    await auditRoutesCommand(options);
  });

/**
 * manifest emit registries
 *
 * Emit machine-readable command and governed-entity registries from a
 * compiled IR JSON or a manifest source file. Validates against the schemas
 * in docs/spec/registry/. See docs/spec/registry/README.md.
 */
const emitProgram = program
  .command('emit')
  .description('Emit IR-derived artifacts');

/**
 * manifest audit-bypasses
 *
 * Validates an approved-bypass registry against
 * docs/spec/registry/bypasses.schema.json. Reports missing-file references
 * as errors and expired review dates as warnings (or errors under
 * --strict-expiry).
 */
/**
 * manifest audit-governance
 *
 * Umbrella that runs every governance detector and aggregates findings.
 * Under --strict, any error finding causes a non-zero exit. Detectors:
 *   direct-writes, event-fabrication, route-drift, missing-tests,
 *   bypass-violations.
 *
 * `audit-constitution` is retained as a deprecated alias.
 */
program
  .command('audit-governance')
  .alias('audit-constitution')
  .description('Run the full governance audit suite (umbrella). `audit-constitution` is a deprecated alias.')
  .option('-r, --root <path>', 'Root directory to audit', '.')
  .option('--only <list>', 'Comma-separated detector names to run (default: all)')
  .option('--commands-registry <path>', 'Path to commands.json (enables missing-tests detector)')
  .option('--bypass-registry <path>', 'Path to bypasses.json (enables bypass-violations detector)')
  .option('--strict', 'Exit non-zero on any error finding', false)
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .action(async (options = {}, cmd) => {
    // Surface a deprecation hint when callers invoke the legacy alias.
    const invokedAs = cmd?.args?.[0] ?? cmd?.name?.();
    const calledByAlias = process.argv.includes('audit-constitution');
    if (calledByAlias) {
      console.warn(
        chalk.yellow(
          '[deprecation] `manifest audit-constitution` is renamed to `manifest audit-governance`. ' +
          'The alias still works but will be removed in a future release.'
        )
      );
    }
    const result = await auditGovernanceCommand(options);
    if (options.strict && result.errorCount > 0) {
      process.exitCode = 1;
    } else if (!options.strict && result.errorCount > 0) {
      // Non-strict still surfaces failures; the exit code is left to the
      // caller's CI integration. Mirror audit-routes behavior.
      process.exitCode = 1;
    }
    // Suppress unused-var noise from optional invokedAs lookup.
    void invokedAs;
  });

/**
 * `enforce-surface` — the strictest registry-vs-app check.
 *
 * Composes the governance detectors with three registry-aware detectors to
 * stop agents and contributors from inventing duplicate or bypass write
 * paths when a registered Manifest command already exists.
 */
program
  .command('enforce-surface')
  .description(
    'Enforce that application code only writes through registered Manifest commands'
  )
  .requiredOption('--root <path>', 'Repository or application root to scan')
  .requiredOption('--commands-registry <path>', 'Path to commands.json emitted from Manifest IR')
  .option('--entities-registry <path>', 'Path to entities.json emitted from Manifest IR')
  .option('--bypass-registry <path>', 'Path to bypasses.json (approved exceptions)')
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .option('--strict', 'Exit non-zero on any error finding', false)
  .option('--include <glob...>', 'Additional include globs')
  .option('--exclude <glob...>', 'Exclude globs (generated files, build output, fixtures, etc.)')
  .action(async (options = {}) => {
    await enforceSurfaceCommand({
      root: options.root,
      commandsRegistry: options.commandsRegistry,
      entitiesRegistry: options.entitiesRegistry,
      bypassRegistry: options.bypassRegistry,
      format: options.format,
      strict: !!options.strict,
      include: options.include,
      exclude: options.exclude,
    });
  });

program
  .command('audit-bypasses')
  .description('Validate the approved-bypass registry against the schema')
  .option('--registry <path>', 'Path to bypass registry JSON file')
  .option('-r, --root <path>', 'Root directory used to resolve bypass paths', '.')
  .option('--strict-expiry', 'Treat expired reviewBy dates as errors', false)
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .action(async (options = {}) => {
    const result = await auditBypassesCommand(options);
    if (result.errorCount > 0) {
      process.exitCode = 1;
    }
  });

/**
 * manifest coverage
 *
 * Analyze conformance and unit test results to report which commands, guards,
 * policies, and constraint branches have been exercised. Produces a coverage
 * summary with uncovered paths highlighted.
 */
program
  .command('coverage')
  .description('Report command/guard/policy/constraint coverage from conformance and unit tests')
  .option('--ir <path>', 'Path to compiled IR JSON file')
  .option('-s, --source <path>', 'Path to .manifest source file (compiles on the fly)')
  .option('-r, --root <path>', 'Root directory to scan for test evidence', '.')
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .option('--min-coverage <n>', 'Minimum overall coverage percentage to pass', (v) => parseFloat(v))
  .option('--strict', 'Exit non-zero when below --min-coverage', false)
  .action(async (options = {}) => {
    const result = await coverageCommand(options);
    if (options.strict && typeof options.minCoverage === 'number') {
      if (result.overall.percentage < options.minCoverage) {
        console.error(
          chalk.red(
            `Coverage ${result.overall.percentage}% is below threshold ${options.minCoverage}%`
          )
        );
        process.exitCode = 1;
      }
    }
  });

emitProgram
  .command('registries')
  .description('Emit commands.json and entities.json registries from IR')
  .option('--ir <path>', 'Path to a compiled IR JSON file')
  .option('--source <path>', 'Path to a .manifest source file to compile and emit from')
  .option('--out <dir>', 'Output directory', 'manifest-registry')
  .option('--no-validate', 'Skip JSON-schema validation of the emitted output')
  .option('--no-pretty', 'Emit compact JSON (no indentation)')
  .action(async (options = {}) => {
    await emitRegistriesCommand(options);
  });

/**
 * manifest inspect entity <EntityName>
 *
 * Inspect source manifests and precompiled IR for a single entity.
 */
const inspectProgram = program
  .command('inspect')
  .description('Inspect manifest source and compiled IR surfaces');

inspectProgram
  .command('entity')
  .description('Inspect a single entity across source manifests and precompiled IR')
  .argument('<entityName>', 'Entity name')
  .option('--json', 'JSON output', false)
  .option('--src <pattern>', 'Source manifest glob pattern')
  .option('--ir-root <path...>', 'Compiled IR root directory/directories')
  .action(async (entityName, options = {}) => {
    await inspectEntityCommand(entityName, options);
  });

/**
 * manifest diff source-vs-ir <EntityName>
 */
const diffProgram = program
  .command('diff')
  .description('Diff manifest source surfaces against precompiled IR');

diffProgram
  .command('source-vs-ir')
  .description('Compare source manifest parse output vs precompiled IR for an entity')
  .argument('<entityName>', 'Entity name')
  .option('--json', 'JSON output', false)
  .option('--src <pattern>', 'Source manifest glob pattern')
  .option('--ir-root <path...>', 'Compiled IR root directory/directories')
  .action(async (entityName, options = {}) => {
    await diffSourceVsIRCommand(entityName, options);
  });

/**
 * manifest diff ir-vs-ir <oldIR> <newIR>
 */
diffProgram
  .command('ir-vs-ir')
  .description('Compare two IR JSON files and produce a diff report')
  .argument('<oldIR>', 'Path to old IR JSON file')
  .argument('<newIR>', 'Path to new IR JSON file')
  .option('--json', 'JSON output', false)
  .option('--sql', 'Include SQL migration in output', false)
  .option('--prisma', 'Include Prisma migration in output', false)
  .option('-o, --output <path>', 'Write output to file')
  .action(async (oldIR, newIR, options = {}) => {
    await diffIRCommand(oldIR, newIR, options);
  });

/**
 * manifest diff breaking <oldIR> <newIR>
 */
diffProgram
  .command('breaking')
  .description('Classify IR diff changes as compatible/deprecated/breaking with consumer impact')
  .argument('<oldIR>', 'Path to old IR JSON file')
  .argument('<newIR>', 'Path to new IR JSON file')
  .option('--json', 'JSON output', false)
  .option('--ack <path>', 'Path to acknowledgments JSON file')
  .option('--ci', 'Exit non-zero on unacknowledged breaking changes', false)
  .option('-o, --output <path>', 'Write output to file')
  .action(async (oldIR, newIR, options = {}) => {
    await breakingChangeCommand(oldIR, newIR, options);
  });

/**
 * manifest migrate
 *
 * IR diff analysis for database migration planning.
 */
program
  .command('migrate')
  .description('Analyze IR diff for database migration (dry-run, preview, reversibility checks)')
  .requiredOption('--old-ir <path>', 'Path to old IR JSON file')
  .requiredOption('--new-ir <path>', 'Path to new IR JSON file')
  .option('--dry-run', 'Show migration plan without applying', false)
  .option('--preview', 'Show SQL and Prisma migration steps', false)
  .option('--force', 'Apply even with warnings or unacknowledged breaking changes', false)
  .option('--json', 'JSON output', false)
  .option('--tool <tool>', 'Migration tool (prisma, drizzle)', 'prisma')
  .option('--no-check-reversibility', 'Skip reversibility validation')
  .option('-o, --output <path>', 'Write output to file')
  .action(async (options = {}) => {
    await migrateCommand({
      oldIR: options.oldIr,
      newIR: options.newIr,
      dryRun: options.dryRun,
      preview: options.preview,
      force: options.force,
      json: options.json,
      output: options.output,
      tool: options.tool,
      checkReversibility: options.checkReversibility,
    });
  });

/**
 * manifest changelog <from-ref> [to-ref]
 *
 * Generate a human-readable Markdown changelog from IR diffs between Git refs.
 * Compiles .manifest sources at each ref, classifies changes as new entities,
 * modified constraints, added policies, or breaking schema changes. Outputs
 * Markdown formatted for GitHub Releases and Keep a Changelog conventions.
 */
program
  .command('changelog')
  .description('Generate Markdown changelog from IR diffs between Git refs')
  .argument('<from-ref>', 'Base Git ref (tag, branch, or SHA)')
  .argument('[to-ref]', 'Target Git ref (default: HEAD)', 'HEAD')
  .option('-s, --source <pattern>', 'Glob pattern for .manifest files', '**/*.manifest')
  .option('-o, --output <path>', 'Write changelog to file')
  .option('-t, --title <title>', 'Custom heading for the changelog')
  .option('--json', 'Emit structured JSON instead of Markdown', false)
  .action(async (fromRef, toRef, options = {}) => {
    await changelogCommand(fromRef, toRef, {
      source: options.source,
      output: options.output,
      title: options.title,
      json: options.json,
    });
  });

/**
 * manifest duplicates
 */
program
  .command('duplicates')
  .description('Summarize duplicate merge reports (*.merge-report.json)')
  .option('--entity <name>', 'Filter duplicate entries by entity name/key')
  .option('--merge-report <pattern>', 'Override merge report glob pattern')
  .option('--json', 'JSON output', false)
  .action(async (options = {}) => {
    await duplicatesCommand(options);
  });

/**
 * manifest runtime-check <EntityName> <command>
 */
program
  .command('runtime-check')
  .description('Correlate route surface, source manifests, and precompiled IR for a command')
  .argument('<entityName>', 'Entity name')
  .argument('<commandName>', 'Command name')
  .option('--route <path>', 'Optional canonical route path to validate (exact match)')
  .option('--json', 'JSON output', false)
  .option('--src <pattern>', 'Source manifest glob pattern')
  .option('--ir-root <path...>', 'Compiled IR root directory/directories')
  .action(async (entityName, commandName, options = {}) => {
    await runtimeCheckCommand(entityName, commandName, options);
  });

/**
 * manifest cache-status
 */
program
  .command('cache-status')
  .description('Show offline cache guidance (precompiled IR timestamps + restart advice)')
  .option('--entity <name>', 'Optional entity context for guidance text')
  .option('--command <name>', 'Optional command context for guidance text')
  .option('--json', 'JSON output', false)
  .option('--ir-root <path...>', 'Compiled IR root directory/directories')
  .action(async (options = {}) => {
    await cacheStatusCommand(options);
  });

/**
 * manifest doctor
 */
program
  .command('doctor')
  .description('Run ranked offline diagnostics for source/IR/route drift and duplicate merges')
  .option('--entity <name>', 'Optional entity to focus the diagnosis')
  .option('--command <name>', 'Optional command to focus the diagnosis')
  .option('--route <path>', 'Optional route path for route-surface correlation')
  .option('--json', 'JSON output', false)
  .option('--src <pattern>', 'Source manifest glob pattern')
  .option('--ir-root <path...>', 'Compiled IR root directory/directories')
  .action(async (options = {}) => {
    await doctorCommand(options);
  });

/**
 * manifest integration-check
 *
 * End-to-end validation that a downstream repo is correctly integrated
 * with the Manifest governance contract. Runs static governance + bypass
 * audit + dispatcher presence + runtime smoke (audit/outbox adapters) +
 * package shape. Exit code is 0 only if every section passes.
 */
program
  .command('integration-check')
  .description('Validate a downstream repo against the full Manifest governance + runtime contract')
  .option('--root <path>', 'Downstream repo root (defaults to cwd)')
  .option('--commands-registry <path>', 'Path to a commands registry JSON')
  .option('--bypass-registry <path>', 'Path to a bypass registry JSON')
  .option('--format <fmt>', 'Output format: text | json', 'text')
  .option('--strict', 'Treat warnings as failures', false)
  .option('--skip-runtime-smoke', 'Skip the in-memory RuntimeEngine smoke', false)
  .option('--skip-package-shape', 'Skip the package-shape check', false)
  .option('--skip-tarball', 'Skip the `npm pack --dry-run` sub-step in package-shape', false)
  .option('--package-root <path>', 'Override the @angriff36/manifest package root for the package-shape check')
  .action(async (options = {}) => {
    const result = await integrationCheckCommand({
      root: options.root,
      commandsRegistry: options.commandsRegistry,
      bypassRegistry: options.bypassRegistry,
      format: options.format === 'json' ? 'json' : 'text',
      strict: !!options.strict,
      skipRuntimeSmoke: !!options.skipRuntimeSmoke,
      skipPackageShape: !!options.skipPackageShape,
      skipTarball: !!options.skipTarball,
      packageRoot: options.packageRoot,
    });
    if (!result.ok) process.exit(1);
  });

/**
 * manifest config
 *
 * Inspection and validation surface for manifest.config.{yaml,yml,ts,js}.
 * Generic to Manifest itself — not tied to any downstream consumer.
 */
const configProgram = program
  .command('config')
  .description('Inspect and validate manifest.config.{yaml,ts,js}');

configProgram
  .command('validate')
  .description('Validate manifest.config against the JSON schema')
  .option('--json', 'JSON output (and non-zero exit on failure)', false)
  .action(async (options = {}) => {
    await configValidateCommand({ json: !!options.json });
  });

configProgram
  .command('print-defaults')
  .description('Print the canonical defaults Manifest applies when no config is set')
  .option('--json', 'JSON output (default: yes)', true)
  .action(async (options = {}) => {
    await configPrintDefaultsCommand({ json: options.json !== false });
  });

configProgram
  .command('inspect')
  .alias('print-effective')
  .description('Print the effective config (defaults + user overrides). Stable, key-sorted; safe for CI snapshots.')
  .option('--json', 'JSON output (default: yes)', true)
  .action(async (options = {}) => {
    await configInspectCommand({ json: options.json !== false });
  });

/**
 * manifest versions
 *
 * IR snapshot versioning with semantic tags, changelog, and integrity verification.
 */
const versionsProgram = program
  .command('versions')
  .description('Manage IR version snapshots (.manifest-versions/)');

versionsProgram
  .command('list')
  .description('List saved IR versions')
  .option('--store <path>', 'Version store directory', '.manifest-versions')
  .option('--json', 'JSON output', false)
  .action(async (options = {}) => {
    await versionsListCommand({ store: options.store, json: options.json });
  });

versionsProgram
  .command('show')
  .description('Show version metadata (by number, tag, or "latest")')
  .argument('<version>', 'Version number, tag, or "latest"')
  .option('--store <path>', 'Version store directory', '.manifest-versions')
  .option('--json', 'JSON output', false)
  .action(async (version, options = {}) => {
    await versionsShowCommand(version, { store: options.store, json: options.json });
  });

versionsProgram
  .command('save')
  .description('Compile and save a new IR snapshot')
  .argument('[source]', 'Path to .manifest source file')
  .option('--store <path>', 'Version store directory', '.manifest-versions')
  .option('--tag <tag>', 'Semantic version tag (e.g. 1.0.0)')
  .option('--auto-tag', 'Auto-increment semver from previous version', false)
  .option('--label <text>', 'Human-readable label for this version')
  .action(async (source, options = {}) => {
    await versionsSaveCommand(source, {
      store: options.store,
      tag: options.tag,
      autoTag: options.autoTag,
      label: options.label,
    });
  });

versionsProgram
  .command('diff')
  .description('Compare two saved IR versions')
  .argument('<from>', 'Source version (number, tag, or "latest")')
  .argument('<to>', 'Target version (number, tag, or "latest")')
  .option('--store <path>', 'Version store directory', '.manifest-versions')
  .option('--json', 'JSON output', false)
  .option('--breaking', 'Include breaking change analysis', false)
  .option('--sql', 'Include migration SQL preview', false)
  .action(async (from, to, options = {}) => {
    await versionsDiffCommand(from, to, {
      store: options.store,
      json: options.json,
      breaking: options.breaking,
      sql: options.sql,
    });
  });

versionsProgram
  .command('changelog')
  .description('Generate changelog between two versions')
  .argument('[from]', 'Source version (default: previous)')
  .argument('[to]', 'Target version (default: latest)')
  .option('--store <path>', 'Version store directory', '.manifest-versions')
  .option('--json', 'JSON output', false)
  .action(async (from, to, options = {}) => {
    await versionsChangelogCommand(from, to, { store: options.store, json: options.json });
  });

versionsProgram
  .command('tag')
  .description('Apply a semantic version tag to a saved version')
  .argument('<version>', 'Version number or "latest"')
  .argument('<tag>', 'Semantic version tag (e.g. 1.0.0)')
  .option('--store <path>', 'Version store directory', '.manifest-versions')
  .action(async (version, tag, options = {}) => {
    await versionsTagCommand(version, tag, { store: options.store });
  });

versionsProgram
  .command('rollback')
  .description('Output a previous IR snapshot')
  .argument('<version>', 'Version number, tag, or "latest"')
  .option('--store <path>', 'Version store directory', '.manifest-versions')
  .option('-o, --output <path>', 'Write IR to file instead of stdout')
  .action(async (version, options = {}) => {
    await versionsRollbackCommand(version, { store: options.store, output: options.output });
  });

versionsProgram
  .command('verify')
  .description('Verify IR integrity via SHA-256 hash comparison')
  .argument('[version]', 'Version to verify (default: latest)')
  .option('--store <path>', 'Version store directory', '.manifest-versions')
  .option('--json', 'JSON output', false)
  .option('--all', 'Verify all saved versions', false)
  .action(async (version, options = {}) => {
    await versionsVerifyCommand(version, { store: options.store, json: options.json, all: options.all });
  });

/**
 * manifest plugins
 *
 * List and inspect loaded plugins from manifest.config.yaml.
 */
const pluginsProgram = program
  .command('plugins')
  .description('List and inspect Manifest plugins');

pluginsProgram
  .command('list')
  .description('List plugins declared in manifest.config')
  .option('--json', 'JSON output', false)
  .action(async (options = {}) => {
    const config = (await getConfig()) ?? {};
    const pluginDecls = config.plugins ?? [];

    if (pluginDecls.length === 0) {
      if (options.json) {
        console.log(JSON.stringify({ plugins: [], message: 'No plugins declared in manifest.config' }, null, 2));
      } else {
        console.log(chalk.gray('No plugins declared in manifest.config'));
      }
      return;
    }

    const summary = pluginDecls.map((p) => ({
      module: p.module,
      enabled: p.enabled !== false,
      hasOptions: !!p.options && Object.keys(p.options).length > 0,
    }));

    if (options.json) {
      console.log(JSON.stringify({ plugins: summary }, null, 2));
    } else {
      console.log(chalk.bold('Declared plugins:\n'));
      for (const p of summary) {
        const status = p.enabled ? chalk.green('enabled') : chalk.red('disabled');
        const opts = p.hasOptions ? chalk.gray(' (with options)') : '';
        console.log(`  ${chalk.cyan(p.module)} ${status}${opts}`);
      }
      console.log(`\n  Total: ${summary.length} plugin(s)`);
    }
  });

/**
 * Run the CLI
 *
 * This function is exported so it can be called from the bin file.
 */
export async function runCli(): Promise<void> {
  await program.parseAsync(process.argv);
}

function normalizeForComparison(path: string): string {
  const normalizedPath = normalize(path);
  return process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath;
}

async function resolveRealPath(inputPath: string): Promise<string | undefined> {
  try {
    return await realpath(inputPath);
  } catch {
    return undefined;
  }
}

async function isDirectExecution(): Promise<boolean> {
  const modulePath = await resolveRealPath(fileURLToPath(import.meta.url));
  const argvEntry = process.argv[1];

  if (!modulePath) {
    return false;
  }

  if (argvEntry) {
    const argvResolvedPath = resolve(argvEntry);
    const argvPath = await resolveRealPath(argvResolvedPath);

    if (argvPath) {
      return normalizeForComparison(modulePath) === normalizeForComparison(argvPath);
    }

    // Fallback for shim/symlink bin paths that cannot be resolved.
    const normalizedArgv = normalizeForComparison(argvResolvedPath);
    if (normalizedArgv.includes('manifest') || normalizedArgv.endsWith('index.js')) {
      return true;
    }

    // ESM equivalent of "module is main".
    if (import.meta.url === pathToFileURL(argvResolvedPath).href) {
      return true;
    }
  }

  return false;
}

void isDirectExecution().then((shouldRun) => {
  if (shouldRun) {
    runCli().catch((error) => {
      console.error('CLI error:', error);
      process.exit(1);
    });
  }
});
