/**
 * manifest config
 *
 * Inspection and validation surface for manifest.config.{yaml,yml,ts,js}.
 *
 * Subcommands:
 *   - validate         JSON-schema validate the build config (yaml)
 *   - print-defaults   Print the canonical defaults snapshot
 *   - inspect          Print the effective config = defaults + user overrides
 *                      (alias: print-effective)
 *
 * The effective config output is deterministic and key-sorted so downstream
 * repos can snapshot it in CI and detect drift.
 */

import chalk from 'chalk';
import { getActiveConfigPath, loadAllConfigs } from '../utils/config.js';
import { validateConfig, formatDiagnostic } from '../utils/config-validate.js';
import { resolveBuildNaming, getProjectionBlock } from '@angriff36/manifest/config';

interface ConfigCommandOptions {
  json?: boolean;
  cwd?: string;
}

/**
 * Lazy load the canonical defaults snapshot from the main package. The
 * defaults live in src/manifest/projections/nextjs/defaults.ts and are
 * re-exported from @angriff36/manifest/projections/nextjs.
 */
async function loadDefaultsSnapshot() {
  const mod = await import('@angriff36/manifest/projections/nextjs');
  return mod.getManifestDefaultsSnapshot();
}

/**
 * Stable, key-sorted JSON. The output is consumed by `git diff` in CI
 * snapshot workflows, so any reordering would create false positives.
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, sortKeys, 2);
}

function sortKeys(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value as Record<string, unknown>)
      .sort((a, b) => a.localeCompare(b))
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = (value as Record<string, unknown>)[k];
        return acc;
      }, {});
  }
  return value;
}

// ============================================================================
// Subcommand: validate
// ============================================================================

export async function configValidateCommand(options: ConfigCommandOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const activePath = await getActiveConfigPath(cwd);
  const { build } = await loadAllConfigs(cwd);

  // Validate only the YAML-shaped portion. The TS runtime config is loaded
  // structurally by config.ts; its build sub-block is merged in below.
  const result = await validateConfig(build);

  if (options.json) {
    process.stdout.write(
      JSON.stringify(
        {
          configPath: activePath,
          ok: result.ok,
          diagnostics: result.diagnostics,
        },
        null,
        2,
      ) + '\n',
    );
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (!activePath) {
    console.log(chalk.gray('No manifest.config.* file found — defaults apply.'));
  } else {
    console.log(chalk.gray(`Config: ${activePath}`));
  }

  if (result.ok) {
    console.log(chalk.green('Config is valid.'));
    return;
  }

  console.error(chalk.red(`Config has ${result.diagnostics.length} violation(s):`));
  for (const d of result.diagnostics) {
    console.error(chalk.red(formatDiagnostic(d)));
  }
  process.exitCode = 1;
}

// ============================================================================
// Subcommand: print-defaults
// ============================================================================

export async function configPrintDefaultsCommand(
  options: ConfigCommandOptions = {},
): Promise<void> {
  const snapshot = await loadDefaultsSnapshot();
  if (options.json) {
    process.stdout.write(stableStringify(snapshot) + '\n');
    return;
  }
  console.log(chalk.bold('Manifest projection defaults'));
  console.log(chalk.gray('(Source of truth: src/manifest/projections/nextjs/defaults.ts)'));
  console.log('');
  console.log(stableStringify(snapshot));
}

// ============================================================================
// Subcommand: inspect (alias: print-effective)
// ============================================================================

/**
 * Merge defaults under user-provided projection options. Only keys that
 * exist as user overrides win; unset keys fall through to defaults. This
 * mirrors the per-key fall-through in NextJsProjection.normalizeOptions.
 */
function mergeNextJsOptions(
  defaults: Record<string, unknown>,
  user: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!user) return { ...defaults };
  const out: Record<string, unknown> = { ...defaults };
  for (const [k, v] of Object.entries(user)) {
    if (v === undefined) continue;
    // Nested objects (dispatcher, concreteCommandRoutes, tenantProvider)
    // are merged one level deep — every other key is a primitive.
    if (
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      defaults[k] &&
      typeof defaults[k] === 'object' &&
      !Array.isArray(defaults[k])
    ) {
      out[k] = mergeNextJsOptions(
        defaults[k] as Record<string, unknown>,
        v as Record<string, unknown>,
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}

interface EffectiveConfig {
  configPath: string | null;
  build: {
    src: string;
    output: string;
    prismaSchema?: string;
  };
  /** Resolved naming policy (normalization off by default). */
  naming: Record<string, unknown>;
  projections: {
    nextjs: {
      output: string;
      options: Record<string, unknown>;
    };
    routes: {
      output: string;
      options: Record<string, unknown>;
    };
  };
}

export async function loadEffectiveConfig(
  cwd: string = process.cwd(),
): Promise<{ configPath: string | null; effective: EffectiveConfig; json: string }> {
  const activePath = await getActiveConfigPath(cwd);
  const { build } = await loadAllConfigs(cwd);
  const snapshot = await loadDefaultsSnapshot();

  const userNextJsOptions = getProjectionBlock(build.projections, 'nextjs')?.options;
  const userRoutesOptions = getProjectionBlock(build.projections, 'routes')?.options;

  const nextjsDefaults: Record<string, unknown> = {
    ...snapshot.nextjs,
    tenantProvider: snapshot.tenantProvider,
    dispatcher: snapshot.dispatcher,
    concreteCommandRoutes: snapshot.concreteCommandRoutes,
  };

  const effective: EffectiveConfig = {
    configPath: activePath,
    build: {
      src: build.src ?? '**/*.manifest',
      output: build.output ?? 'ir/',
      ...(build.prismaSchema ? { prismaSchema: build.prismaSchema } : {}),
    },
    naming: resolveBuildNaming(build) as unknown as Record<string, unknown>,
    projections: {
      nextjs: {
        output: getProjectionBlock(build.projections, 'nextjs')?.output ?? 'generated/',
        options: mergeNextJsOptions(nextjsDefaults, userNextJsOptions),
      },
      routes: {
        output:
          (build.projections as Record<string, { output?: string }> | undefined)?.routes?.output ??
          'generated/',
        options: mergeNextJsOptions(snapshot.routes as Record<string, unknown>, userRoutesOptions),
      },
    },
  };

  return { configPath: activePath, effective, json: stableStringify(effective) + '\n' };
}

export async function configInspectCommand(options: ConfigCommandOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const { configPath: activePath, json } = await loadEffectiveConfig(cwd);

  if (options.json !== false) {
    process.stdout.write(json);
    return;
  }

  console.log(chalk.bold('Effective Manifest configuration'));
  if (activePath) {
    console.log(chalk.gray(`Source: ${activePath}`));
  } else {
    console.log(chalk.gray('Source: defaults only (no config file found)'));
  }
  console.log('');
  console.log(json.trimEnd());
}
