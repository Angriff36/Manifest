#!/usr/bin/env node

/**
 * Manifest CLI
 *
 * Command-line interface for the Manifest language.
 * Provides commands for compiling, generating code, and managing Manifest projects.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { compileCommand, compileAllFromConfig } from './commands/compile.js';
import { generateCommand, generateAllFromConfig } from './commands/generate.js';
import { buildCommand, buildAllFromConfig } from './commands/build.js';
import { analyzeCommand } from './commands/analyze.js';
import { seedCommand } from './commands/seed.js';
import {
  seedTemplateCommand,
  seedFillCommand,
  seedValidateCommand,
} from './commands/seed-pack-cli.js';
import { profileCommand } from './commands/profile.js';
import { packCommand, unpackCommand } from './commands/pack-unpack.js';
import { watchCommand } from './commands/watch.js';
import { validateCommand } from './commands/validate.js';
import { validateAICommand } from './commands/validate-ai.js';
import { docsCommand } from './commands/docs.js';
import { diagramCommand } from './commands/diagram.js';
import { preflightCommand } from './commands/preflight.js';
import { checkCommand } from './commands/check.js';
import { initCommand } from './commands/init.js';
import { initCiCommand } from './commands/init-ci.js';
import { dbInitCommand } from './commands/db-init.js';
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
import { wiringCoverageCommand } from './commands/wiring-coverage.js';
import { wiringInspectCommand } from './commands/wiring-inspect.js';
import { wiringRemediateCommand } from './commands/wiring-remediate.js';
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
import { loadTestCommand } from './commands/load-test.js';
import { mockCommand } from './commands/mock.js';
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
import {
  getConfig,
  resolveNextJsProjectionOptions,
  resolveProjectionOptions,
} from './utils/config.js';
import { registerPluginCliCommands } from '@angriff36/manifest/plugin-loader';
import type { CliProgramLike } from '@angriff36/manifest/plugin-api';
import { loadDeclaredPlugins, reportPluginDiagnostics } from './utils/plugins.js';
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
  .option(
    '--node-versions <versions>',
    'Comma-separated Node.js versions for CI matrix (default: 18,20,22)',
  )
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
 * manifest db init
 *
 * Print or apply the Postgres adapter schemas shipped with @angriff36/manifest
 * (approval, audit, outbox, jobs, idempotency). Default prints SQL to stdout.
 */
const dbProgram = program.command('db').description('Database adapter schema helpers');

dbProgram
  .command('init')
  .description(
    'Print or apply Manifest Postgres adapter schemas (audit/outbox/approval/jobs/idempotency)',
  )
  .option('--apply', 'Execute SQL against DATABASE_URL (requires the `pg` package)', false)
  .option('--database-url <url>', 'Postgres connection string (default: env DATABASE_URL)')
  .option('--out <file>', 'Write concatenated SQL to a file instead of stdout')
  .option('--list', 'List schema ids and resolved file paths', false)
  .option('--only <ids>', 'Comma-separated schema ids (audit,outbox,approval,jobs,idempotency)')
  .action(async (options) => {
    const code = await dbInitCommand({
      apply: options.apply,
      databaseUrl: options.databaseUrl,
      out: options.out,
      list: options.list,
      only: options.only,
    });
    process.exitCode = code;
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
  .option(
    '--all',
    'Compile every source in manifest.config.yaml into one merged IR (config-driven; resolves use/mixin; ignores [source]/-o)',
  )
  .option('--entry <files...>', 'Entry file(s) for merge compilation (auto-detected if omitted)')
  .action(async (source, options = {}) => {
    // --all: merged, config-driven compile — the partner to `generate --all`.
    if (options.all) {
      await compileAllFromConfig({ diagnostics: options.diagnostics, pretty: options.pretty });
      return;
    }
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
  .argument(
    '[ir]',
    'IR file or directory. With --all, an optional explicit IR file overrides the config output as the source (e.g. a merged IR).',
  )
  .option(
    '-p, --projection <name>',
    'Projection name — any registered projection (nextjs, prisma, zod, kysely, ...)',
    'nextjs',
  )
  .option('-s, --surface <name>', 'Projection surface (route, command, types, client, all)', 'all')
  .option('-o, --output <path>', 'Output directory')
  .option(
    '--all',
    'Generate every projection declared in manifest.config.yaml (ignores -p/-o/<ir>)',
  )
  .option('--auth <provider>', 'Auth provider or import path')
  .option('--database <path>', 'Database import path')
  .option('--runtime <path>', 'Runtime import path')
  .option('--response <path>', 'Response helpers import path')
  .option(
    '--check',
    'Compare generated code to committed files and exit non-zero on drift (writes nothing)',
  )
  .action(async (ir, options = {}) => {
    // --all: drive every configured projection from manifest.config.yaml.
    // An optional explicit <ir> overrides the config `output` as the IR source —
    // use it to point at a single merged IR (from `compile --all`) instead of
    // globbing an output dir that may also hold stale per-file shards.
    if (options.all) {
      await generateAllFromConfig({ check: options.check, irOverride: ir });
      return;
    }

    if (!ir) {
      console.error("error: missing required argument 'ir' (or pass --all to use config)");
      process.exit(1);
    }

    // Resolve the SELECTED projection's own options block (not nextjs-only),
    // layering the global `naming` convention under it — the single-run analogue
    // of the --all path. No projection defaults are baked in (normalizeOptions
    // owns those); CLI flag overrides are layered on inside generateCommand.
    const projectionOptionsFromConfig = await resolveProjectionOptions(options.projection);

    // Default to cwd — the projection's pathHint already contains the full
    // relative path from project root (e.g. apps/api/app/api/…).  Omitting
    // -o should write files relative to the project root, not crash.
    if (!options.output) {
      options.output = '.';
    }

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
  .option(
    '-p, --projection <name>',
    'Projection name — any registered projection (nextjs, prisma, zod, kysely, ...)',
    'nextjs',
  )
  .option('-s, --surface <name>', 'Projection surface (route, command, types, client, all)', 'all')
  .option(
    '--all',
    'Compile every source + generate every projection from manifest.config.yaml (config-driven; ignores -p/-s/--ir-output/--code-output/-g/source)',
  )
  .option('--ir-output <path>', 'IR output directory')
  .option('--code-output <path>', 'Generated code output directory')
  .option('-g, --glob <pattern>', 'Glob pattern for multiple files')
  .option('--auth <provider>', 'Auth provider or import path')
  .option('--database <path>', 'Database import path')
  .option('--runtime <path>', 'Runtime import path')
  .option('--response <path>', 'Response helpers import path')
  .action(async (source, options = {}, cmd) => {
    // --all: config-driven compile-all + generate-all in one call (the native
    // equivalent of the CI-chained `compile --all && generate --all`). Every
    // per-run flag comes from manifest.config.yaml, so any explicitly-set
    // single-run flag is a mistake — error rather than silently ignore it.
    if (options.all) {
      const singleRunFlags: Array<[string, string]> = [
        ['projection', '-p/--projection'],
        ['surface', '-s/--surface'],
        ['irOutput', '--ir-output'],
        ['codeOutput', '--code-output'],
        ['glob', '-g/--glob'],
        ['auth', '--auth'],
        ['database', '--database'],
        ['runtime', '--runtime'],
        ['response', '--response'],
      ];
      const conflicting = singleRunFlags
        .filter(([name]) => cmd?.getOptionValueSource?.(name) === 'cli')
        .map(([, label]) => label);
      if (source) conflicting.unshift('[source]');
      if (conflicting.length > 0) {
        console.error(
          `error: --all is config-driven and ignores ${conflicting.join(', ')}; ` +
            'remove them or drop --all.',
        );
        process.exit(1);
      }
      await buildAllFromConfig();
      return;
    }

    const config = (await getConfig()) ?? {};
    // Resolve the SELECTED projection's own options + output (not nextjs-only),
    // layering the global `naming` convention under it.
    const projectionOptionsFromConfig = await resolveProjectionOptions(options.projection);

    const finalOptions = {
      ...options,
      irOutput: options.irOutput || config?.output || 'ir/',
      codeOutput:
        options.codeOutput || config?.projections?.[options.projection]?.output || 'generated/',
      projectionOptionsFromConfig,
    };

    await buildCommand(source, finalOptions);
  });

/**
 * manifest analyze [source]
 *
 * Report generated projection code bundle sizes per entity, command, and
 * store adapter, flagging IR definitions with disproportionately large output.
 */
program
  .command('analyze')
  .description('Analyze generated projection code bundle sizes (per entity/command/store)')
  .argument('[source]', 'Source .manifest file or compiled .ir.json')
  .option('-p, --projection <name>', 'Projection to analyze', 'nextjs')
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .option('--threshold <bytes>', 'Byte size threshold to flag large output', (v) => parseInt(v, 10))
  .option('--json', 'Emit structured JSON to stdout', false)
  .action(async (source, options = {}) => {
    await analyzeCommand({
      source,
      projection: options.projection,
      format: options.format,
      flagThreshold: options.threshold,
      json: options.json === true || options.format === 'json',
    });
  });

/**
 * manifest seed
 *
 * Legacy: generate synthetic JSON/SQL/Supabase files from IR.
 * Pack workflow: template → fill → validate (apply/clear via seed-pack library).
 */
const seedCmd = program
  .command('seed')
  .description('Generate seed data (legacy files) or IR sample seed packs')
  .argument('[source]', 'Source .manifest file or compiled .ir.json')
  .option('-o, --output <path>', 'Output file or directory')
  .option('--profile <profile>', 'Record-count profile: dev | staging | demo', 'dev')
  .option('-f, --format <format>', 'Output format: json | sql | supabase', 'json')
  .option('--count <n>', 'Override record count per entity', (v) => parseInt(v, 10))
  .option('--entity <name...>', 'Only seed the named entity (repeatable)')
  .option('--seed <n>', 'Deterministic PRNG seed for reproducible output', (v) => parseInt(v, 10))
  .option('--json', 'Emit structured JSON to stdout instead of writing files', false)
  .action(async (source, options = {}) => {
    await seedCommand({
      source,
      output: options.output,
      profile: options.profile,
      format: options.format,
      count: options.count,
      entity: options.entity,
      seed: options.seed,
      json: options.json,
    });
  });

seedCmd
  .command('template')
  .description('Write a blank IR sample seed pack (seedKeys + {{fill}} placeholders)')
  .argument('<source>', 'Source .manifest or .ir.json')
  .requiredOption('-o, --output <dir>', 'Output pack directory')
  .option('--pack-id <id>', 'Pack id', 'demo')
  // eslint-disable-next-line manifest/no-hardcoded-versions -- default seed-pack version (user data), not the CLI version
  .option('--pack-version <ver>', 'Pack version (avoid --version; reserved by CLI)', '1.0.0')
  .option('--profile <profile>', 'dev | staging | demo', 'demo')
  .option('--count <n>', 'Rows per entity', (v) => parseInt(v, 10), 2)
  .option('--entity <name...>', 'Only include named entities')
  .action(async (source, options) => {
    await seedTemplateCommand({
      source,
      output: options.output,
      packId: options.packId,
      version: options.packVersion,
      profile: options.profile,
      count: options.count,
      entity: options.entity,
    });
  });

seedCmd
  .command('fill')
  .description('Fill blank/{{fill}} cells in a seed pack (default: heuristic; ollama optional)')
  .argument('<packDir>', 'Seed pack directory')
  .option('--source <path>', 'IR/.manifest for validation context')
  .option('--provider <name>', 'heuristic | ollama', 'heuristic')
  .option('--model <id>', 'Ollama model id')
  .option('--overwrite', 'Regenerate non-blank cells', false)
  .action(async (packDir, options) => {
    await seedFillCommand({
      packDir,
      source: options.source,
      provider: options.provider,
      model: options.model,
      overwrite: options.overwrite,
    });
  });

seedCmd
  .command('validate')
  .description('Validate a seed pack against IR (soft drift)')
  .argument('<packDir>', 'Seed pack directory')
  .option('--source <path>', 'IR/.manifest')
  .option('--require-filled', 'Fail on blank required properties', false)
  .action(async (packDir, options) => {
    await seedValidateCommand({
      packDir,
      source: options.source,
      requireFilled: options.requireFilled,
    });
  });

/**
 * manifest profile
 *
 * Profile command execution timing (per-phase breakdown, slowest commands)
 * against the runtime engine to identify performance bottlenecks.
 */
program
  .command('profile')
  .description('Profile command execution timing to find runtime bottlenecks')
  .option('--ir <path>', 'IR file to load (default: first *.ir.json found)')
  .option('-f, --format <format>', 'Output format: table | json | flame', 'table')
  .option('--iterations <n>', 'Times to run each command (for averaging)', (v) => parseInt(v, 10))
  .option('--command <name>', 'Command to profile')
  .option('--entity <name>', 'Entity name for the command')
  .option('--input <json>', 'Input JSON for the command')
  .option('--export <path>', 'Export profiling data to a JSON file')
  .option('--detailed', 'Include detailed per-operation timing', false)
  .action(async (options = {}) => {
    await profileCommand({
      ir: options.ir,
      format: options.format,
      iterations: options.iterations,
      command: options.command,
      entity: options.entity,
      input: options.input,
      export: options.export,
      detailed: options.detailed,
    });
  });

/**
 * manifest pack <input> / manifest unpack <input>
 *
 * Convert IR between JSON and the binary MessagePack `.mir` format. Binary IR
 * is smaller and parses faster; use it for storage/transport, not editing.
 */
program
  .command('pack')
  .description('Convert a JSON IR file to the binary MessagePack .mir format')
  .argument('<input>', 'Path to a .ir.json file')
  .option('-o, --output <path>', 'Output .mir path (default: alongside input)')
  .action(async (input, options = {}) => {
    await packCommand(input, { output: options.output });
  });

program
  .command('unpack')
  .description('Convert a binary .mir file back to JSON IR')
  .argument('<input>', 'Path to a .mir file')
  .option('-o, --output <path>', 'Output .ir.json path (default: alongside input)')
  .option('--no-pretty', 'Emit compact JSON (no indentation)')
  .action(async (input, options = {}) => {
    await unpackCommand(input, { output: options.output, pretty: options.pretty });
  });

/**
 * manifest generate-from-prompt <prompt>
 *
 * Generate .manifest source from a natural-language prompt using an LLM.
 * LLM-backed (like generate-tests) — requires ANTHROPIC_API_KEY. Generated
 * source is compiled/validated before output. The command imports its LLM
 * dependencies lazily so the rest of the CLI stays fast.
 */
program
  .command('generate-from-prompt')
  .description(
    'Generate .manifest source from a natural-language prompt via an LLM (requires ANTHROPIC_API_KEY)',
  )
  .argument('<prompt>', 'Natural-language description of the system to generate')
  .option('--model <model>', 'Claude model to use')
  .option('-o, --output <path>', 'Write generated .manifest to this file (default: stdout)')
  .option('--max-retries <n>', 'Max validation-retry attempts', (v) => parseInt(v, 10))
  .option('--temperature <n>', 'Generation temperature (0-1)', (v) => parseFloat(v))
  .option('--api-key <key>', 'Anthropic API key (default: ANTHROPIC_API_KEY env var)')
  .option('--skip-validation', 'Skip compiling generated source (not recommended)', false)
  .option('--verbose', 'Show per-iteration validation details', false)
  .action(async (prompt, options = {}) => {
    const { generateFromPromptCommand } = await import('./commands/generate-from-prompt.js');
    await generateFromPromptCommand(prompt, {
      model: options.model,
      output: options.output,
      maxRetries: options.maxRetries,
      temperature: options.temperature,
      apiKey: options.apiKey,
      skipValidation: options.skipValidation,
      verbose: options.verbose,
    });
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
  .option(
    '-p, --projection <name>',
    'Projection name — any registered projection (nextjs, prisma, zod, kysely, ...)',
    'nextjs',
  )
  .option('-s, --surface <name>', 'Projection surface (route, command, types, client, all)', 'all')
  .option('--all', 'Rebuild every projection declared in manifest.config.yaml (ignores -p)')
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
      irOutput: options.irOutput || config?.output || 'ir/',
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
 * manifest generate-tests [source]
 *
 * LLM-driven conformance fixture generation: analyzes existing fixtures
 * and emits new .manifest sources + expected IR covering edge cases,
 * boundary conditions, and adversarial inputs. Generated fixtures are
 * compiled and validated before being written.
 */
program
  .command('generate-tests')
  .alias('gen-tests')
  .description('Generate conformance test fixtures via LLM analysis of existing fixtures')
  .argument('[source]', 'Source .manifest file, directory, or glob to analyze')
  .option('--feature <description>', 'Feature description to focus generation on')
  .option(
    '--category <type>',
    'Test category: edge-cases, boundary, adversarial, coverage',
    'edge-cases',
  )
  .option('--count <n>', 'Number of fixtures to generate', (v) => parseInt(v, 10), 3)
  .option('--output <path>', 'Output directory for fixtures (default: conformance fixtures dir)')
  .option('--api-key <key>', 'Anthropic API key (default: ANTHROPIC_API_KEY env var)')
  .option('--model <model>', 'Claude model to use')
  .option('--temperature <n>', 'Generation temperature (0-1)', (v) => parseFloat(v))
  .option('--max-retries <n>', 'Max retry attempts for validation failures', (v) => parseInt(v, 10))
  .option('--dry-run', 'Preview generated fixtures without writing files', false)
  .option('--verbose', 'Show detailed iteration logs', false)
  .action(async (source, options = {}) => {
    const { genTestsCommand } = await import('./commands/gen-tests.js');
    const result = await genTestsCommand(source, {
      feature: options.feature,
      category: options.category,
      count: options.count,
      output: options.output,
      apiKey: options.apiKey,
      model: options.model,
      temperature: options.temperature,
      maxRetries: options.maxRetries,
      dryRun: options.dryRun,
      verbose: options.verbose,
    });
    if (result.failed > 0) {
      process.exitCode = 1;
    }
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
 * manifest mock <source>
 *
 * Start a local HTTP mock server that simulates API routes derived from
 * compiled Manifest IR. Uses RuntimeEngine with in-memory stores for real
 * command execution. Enables frontend teams to develop against a realistic
 * API before the backend is deployed.
 */
program
  .command('mock')
  .description('Start a local mock HTTP server from IR (for frontend development)')
  .argument('<source>', 'Source .manifest file or compiled .ir.json')
  .option('-p, --port <number>', 'Port number', '4000')
  .option('--host <host>', 'Bind host', '127.0.0.1')
  .option('--cors', 'Enable CORS headers', false)
  .option('--scenario <mode>', 'Hint mode: default|guard-fail|constraint-fail', 'default')
  .action(async (source, options = {}) => {
    await mockCommand(source, {
      port: options.port,
      host: options.host,
      cors: options.cors,
      scenario: options.scenario,
    });
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
const emitProgram = program.command('emit').description('Emit IR-derived artifacts');

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
  .description(
    'Run the full governance audit suite (umbrella). `audit-constitution` is a deprecated alias.',
  )
  .option('-r, --root <path>', 'Root directory to audit', '.')
  .option('--only <list>', 'Comma-separated detector names to run (default: all)')
  .option('--commands-registry <path>', 'Path to commands.json (enables missing-tests detector)')
  .option('--bypass-registry <path>', 'Path to bypasses.json (enables bypass-violations detector)')
  .option('--strict', 'Exit non-zero on any error finding', false)
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .option(
    '--write-receiver <name>',
    'ORM client identifier direct-write detectors match on (default: prisma)',
  )
  .action(async (options = {}, cmd) => {
    // Surface a deprecation hint when callers invoke the legacy alias.
    const invokedAs = cmd?.args?.[0] ?? cmd?.name?.();
    const calledByAlias = process.argv.includes('audit-constitution');
    if (calledByAlias) {
      console.warn(
        chalk.yellow(
          '[deprecation] `manifest audit-constitution` is renamed to `manifest audit-governance`. ' +
            'The alias still works but will be removed in a future release.',
        ),
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
  .description('Enforce that application code only writes through registered Manifest commands')
  .requiredOption('--root <path>', 'Repository or application root to scan')
  .requiredOption('--commands-registry <path>', 'Path to commands.json emitted from Manifest IR')
  .option('--entities-registry <path>', 'Path to entities.json emitted from Manifest IR')
  .option('--bypass-registry <path>', 'Path to bypasses.json (approved exceptions)')
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .option('--strict', 'Exit non-zero on any error finding', false)
  .option('--include <glob...>', 'Additional include globs')
  .option('--exclude <glob...>', 'Exclude globs (generated files, build output, fixtures, etc.)')
  .option(
    '--write-receiver <name>',
    'ORM client identifier direct-write detectors match on (default: prisma)',
  )
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
      writeReceiver: options.writeReceiver,
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
            `Coverage ${result.overall.percentage}% is below threshold ${options.minCoverage}%`,
          ),
        );
        process.exitCode = 1;
      }
    }
  });

/**
 * manifest wiring-coverage
 *
 * Compare a generated product-wiring contract against an application consumer
 * registry. Reports unwired capabilities and stale consumer references.
 * Does not inspect visual UI source — the app supplies an explicit registry.
 */
program
  .command('wiring-coverage')
  .description('Validate Manifest capability coverage against an application consumer registry')
  .requiredOption('--contract <path>', 'Path to manifest-wiring-contract.json')
  .requiredOption('--consumers <path>', 'Path to application wiring-consumers.json')
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .option('--strict', 'Exit non-zero when unwired or stale consumers exist', false)
  .action(async (options = {}) => {
    await wiringCoverageCommand(options);
  });

/**
 * manifest wiring-inspect
 *
 * Inspect application source against a wiring contract. Automatic consumer
 * proof is primary; explicit registries are overrides/fallbacks.
 */
program
  .command('wiring-inspect')
  .description(
    'Inspect application source for Manifest capability consumers and contract mismatches',
  )
  .requiredOption('--contract <path>', 'Path to manifest-wiring-contract.json')
  .option(
    '--root <path>',
    'Application source root (repeatable)',
    (val: string, prev: string[]) => {
      prev.push(val);
      return prev;
    },
    [] as string[],
  )
  .option('--config <path>', 'Optional wiring-inspect config JSON')
  .option('--overrides <path>', 'Optional explicit consumers registry (overrides only)')
  .option(
    '--include <pattern>',
    'Include path substring (repeatable)',
    (val: string, prev: string[]) => {
      prev.push(val);
      return prev;
    },
    [] as string[],
  )
  .option(
    '--exclude <pattern>',
    'Exclude path substring (repeatable)',
    (val: string, prev: string[]) => {
      prev.push(val);
      return prev;
    },
    [] as string[],
  )
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .option('--strict-coverage', 'Treat unwired capabilities as defects', false)
  .option(
    '--fail-on <list>',
    'Comma-separated defect classes: stale-consumer,contract-mismatch,unwired',
  )
  .option('--strict', 'Exit non-zero when the inspect gate fails', false)
  .action(async (options = {}) => {
    await wiringInspectCommand({
      contract: options.contract,
      root: options.root,
      config: options.config,
      overrides: options.overrides,
      include: options.include?.length ? options.include : undefined,
      exclude: options.exclude?.length ? options.exclude : undefined,
      format: options.format,
      strict: options.strict,
      strictCoverage: options.strictCoverage,
      failOn: options.failOn,
    });
  });

/**
 * manifest wiring-remediate
 *
 * Automatic application wiring repair: inspect → plan → apply → verify.
 * Does not design UI. One-defect mode patches a single proven finding.
 */
program
  .command('wiring-remediate')
  .description('Plan or apply deterministic Manifest wiring repairs against application source')
  .requiredOption('--contract <path>', 'Path to manifest-wiring-contract.json')
  .option(
    '--root <path>',
    'Application source root (repeatable)',
    (val: string, prev: string[]) => {
      prev.push(val);
      return prev;
    },
    [] as string[],
  )
  .option('--config <path>', 'Optional wiring-inspect config JSON')
  .option('--overrides <path>', 'Optional explicit consumers registry (overrides only)')
  .option(
    '--include <pattern>',
    'Include path substring (repeatable)',
    (val: string, prev: string[]) => {
      prev.push(val);
      return prev;
    },
    [] as string[],
  )
  .option(
    '--exclude <pattern>',
    'Exclude path substring (repeatable)',
    (val: string, prev: string[]) => {
      prev.push(val);
      return prev;
    },
    [] as string[],
  )
  .option('--mode <mode>', 'plan | dry-run | apply | one-defect (default: plan)', 'plan')
  .option('--capability <id>', 'Limit to Entity.command capability id')
  .option('--finding <id>', 'Limit to a specific finding id')
  .option('--auto-fixable-only', 'Apply only auto-fixable decisions', false)
  .option('--no-write', 'Do not write files even in apply modes')
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .action(async (options = {}) => {
    await wiringRemediateCommand({
      contract: options.contract,
      root: options.root,
      config: options.config,
      overrides: options.overrides,
      include: options.include?.length ? options.include : undefined,
      exclude: options.exclude?.length ? options.exclude : undefined,
      mode: options.mode,
      capability: options.capability,
      finding: options.finding,
      autoFixableOnly: options.autoFixableOnly,
      write: options.write,
      format: options.format,
    });
  });

/**
 * manifest load-test [source]
 *
 * Generate k6 or Artillery load test scripts from IR entities and commands.
 * Produces self-contained scripts with realistic data generation (faker.js
 * patterns), configurable ramp-up profiles, SLO thresholds, and optional
 * integration with the Manifest performance profiler.
 */
program
  .command('load-test')
  .description('Generate k6 or Artillery load test scripts from IR')
  .argument('[source]', 'Source .manifest file, .ir.json file, or directory')
  .option('-o, --output <path>', 'Output directory for generated scripts', 'load-tests')
  .option('-f, --format <format>', 'Script format: k6 | artillery (default: k6)', 'k6')
  .option('--base-url <url>', 'Base URL for the API under test', 'http://localhost:3000')
  .option(
    '--ramp-up <stages>',
    'Ramp-up profile: "duration:target,duration:target" (e.g. "10s:5,30s:20,1m:50")',
    '10s:5,30s:20,1m:50',
  )
  .option(
    '--slo <thresholds>',
    'SLO thresholds: "metric:op:value" (e.g. "p95:<:500ms,error_rate:<=:0.01")',
  )
  .option('--command <name...>', 'Only generate for the named command(s)')
  .option('--entity <name...>', 'Only include the named entity/entities')
  .option('--profile', 'Emit per-request profiling timestamps for profiler correlation', false)
  .option('--timeout <ms>', 'Request timeout in milliseconds', (v) => parseInt(v, 10), 30000)
  .option('--json', 'Emit structured JSON to stdout instead of writing files', false)
  .action(async (source, options = {}) => {
    await loadTestCommand({
      source,
      output: options.output,
      format: options.format,
      baseUrl: options.baseUrl,
      rampUp: options.rampUp,
      slo: options.slo,
      command: options.command,
      entity: options.entity,
      profile: options.profile,
      timeout: options.timeout,
      json: options.json,
    });
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
/**
 * manifest repl [source]
 *
 * Interactive REPL for inspecting IR and running commands against the runtime.
 */
program
  .command('repl')
  .description('Interactive Manifest runtime REPL for debugging guards, policies, and entity state')
  .argument('[source]', 'Source .manifest file or directory')
  .option('--json', 'JSON output mode for machine-readable responses', false)
  .option('--user <id>', 'User id for runtime context')
  .option('--tenant <id>', 'Tenant id for runtime context')
  .option('--context <json>', 'Additional runtime context JSON')
  .action(async (source, options = {}) => {
    const { replCommand } = await import('./commands/repl.js');
    await replCommand(source, {
      json: options.json,
      user: options.user,
      tenant: options.tenant,
      context: options.context,
    });
  });

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
  .option(
    '--package-root <path>',
    'Override the @angriff36/manifest package root for the package-shape check',
  )
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
  .description(
    'Print the effective config (defaults + user overrides). Stable, key-sorted; safe for CI snapshots.',
  )
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
    await versionsVerifyCommand(version, {
      store: options.store,
      json: options.json,
      all: options.all,
    });
  });

/**
 * manifest plugins
 *
 * List and inspect loaded plugins from manifest.config.yaml.
 */
const pluginsProgram = program.command('plugins').description('List and inspect Manifest plugins');

pluginsProgram
  .command('list')
  .description('List plugins declared in manifest.config and their load status')
  .option('--json', 'JSON output', false)
  .action(async (options = {}) => {
    const config = (await getConfig()) ?? {};
    const pluginDecls = config.plugins ?? [];

    if (pluginDecls.length === 0) {
      if (options.json) {
        console.log(
          JSON.stringify(
            { plugins: [], message: 'No plugins declared in manifest.config' },
            null,
            2,
          ),
        );
      } else {
        console.log(chalk.gray('No plugins declared in manifest.config'));
      }
      return;
    }

    const declared = pluginDecls.map((p) => ({
      module: p.module,
      enabled: p.enabled !== false,
      hasOptions: !!p.options && Object.keys(p.options).length > 0,
    }));

    // Actually load the declared plugins so the report reflects reality
    // (imported, validated, contributed capabilities) rather than echoing
    // config. Reuses the same memoized load the CLI performed at startup.
    const manifestVersion = packageVersion;
    const registries = await loadDeclaredPlugins(manifestVersion);

    const loaded = (registries?.loadedPlugins ?? []).map((plugin) => ({
      name: plugin.manifest.name,
      version: plugin.manifest.version,
      projections: (plugin.projections ?? []).map((x) => x.name),
      storeAdapters: (plugin.storeAdapters ?? []).map((x) => x.scheme),
      auditSinks: (plugin.auditSinks ?? []).map((x) => x.id),
      builtins: (plugin.builtins ?? []).map((x) => x.name),
      cliCommands: (plugin.cliCommands ?? []).map((x) => x.name),
    }));
    const diagnostics = registries?.diagnostics ?? [];
    const errors = diagnostics.filter((d) => d.severity === 'error');
    const warnings = diagnostics.filter((d) => d.severity === 'warning');

    if (options.json) {
      console.log(JSON.stringify({ manifestVersion, declared, loaded, diagnostics }, null, 2));
      return;
    }

    console.log(chalk.bold('Declared plugins:\n'));
    for (const p of declared) {
      const status = p.enabled ? chalk.green('enabled') : chalk.red('disabled');
      const opts = p.hasOptions ? chalk.gray(' (with options)') : '';
      console.log(`  ${chalk.cyan(p.module)} ${status}${opts}`);
    }

    console.log(chalk.bold(`\nLoad results ${chalk.gray(`(Manifest v${manifestVersion})`)}:\n`));
    if (loaded.length === 0) {
      console.log(chalk.gray('  No plugins loaded.'));
    } else {
      for (const p of loaded) {
        const caps: string[] = [];
        if (p.projections.length) caps.push(`projections: ${p.projections.join(', ')}`);
        if (p.storeAdapters.length) caps.push(`stores: ${p.storeAdapters.join(', ')}`);
        if (p.builtins.length) caps.push(`builtins: ${p.builtins.join(', ')}`);
        if (p.auditSinks.length) caps.push(`audit sinks: ${p.auditSinks.join(', ')}`);
        if (p.cliCommands.length) caps.push(`cli: ${p.cliCommands.join(', ')}`);
        console.log(`  ${chalk.green('OK')} ${chalk.cyan(p.name)} ${chalk.gray('v' + p.version)}`);
        if (caps.length) console.log(`      ${chalk.gray(caps.join(' | '))}`);
      }
    }

    if (errors.length || warnings.length) {
      console.log(chalk.bold('\nDiagnostics:\n'));
      for (const d of [...errors, ...warnings]) {
        const tag = d.pluginName ? ` [${d.pluginName}]` : '';
        const color = d.severity === 'error' ? chalk.red : chalk.yellow;
        console.log(`  ${color(d.severity)}${tag}: ${d.message}`);
      }
    }

    console.log(
      `\n  ${declared.length} declared | ${loaded.length} loaded | ${errors.length} error(s) | ${warnings.length} warning(s)`,
    );
  });

/**
 * Load config-declared plugins at startup and register their CLI commands so
 * they appear in `--help` and are dispatchable. Conditional and fail-soft:
 *   - No `plugins` declared → returns immediately (plugin-free projects pay
 *     nothing beyond the config read).
 *   - A plugin that fails to load surfaces a diagnostic and is skipped; the
 *     CLI never bricks. Diagnostic output is deferred to `manifest plugins`
 *     itself so that command can render the full picture without duplication;
 *     every other command surfaces load warnings/errors here so a broken
 *     plugin is never silent.
 */
async function activateDeclaredPlugins(): Promise<void> {
  try {
    const registries = await loadDeclaredPlugins(packageVersion);
    if (!registries) return;
    if (process.argv[2] !== 'plugins') {
      reportPluginDiagnostics(registries);
    }
    registerPluginCliCommands(registries.cliCommands, program as unknown as CliProgramLike);
  } catch (err) {
    // Plugin activation must never brick the CLI.
    console.error(
      chalk.yellow(
        `Warning: plugin activation failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }
}

/**
 * Run the CLI
 *
 * This function is exported so it can be called from the bin file.
 */
export async function runCli(): Promise<void> {
  await activateDeclaredPlugins();
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
