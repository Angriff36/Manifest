/**
 * manifest integration-check
 *
 * Umbrella command that proves a downstream repo is correctly integrated
 * with the Manifest governance contract. Wraps the existing detectors and
 * adds three new checks tailored to the v0.5-era runtime surface:
 *
 *   1. Static governance — delegates to `audit-governance` (5 detectors).
 *   2. Bypass registry  — delegates to `audit-bypasses`.
 *   3. Dispatcher route — confirms the canonical /api/manifest/[entity]/
 *      commands/[command]/route.ts exists. The `route-drift` detector
 *      flags routes that bypass the dispatcher; this complements it by
 *      asserting the dispatcher itself is present.
 *   4. Runtime smoke    — wires MemoryAuditSink + MemoryOutboxStore into
 *      a tiny RuntimeEngine and asserts exactly-one-audit + outbox
 *      enqueue. Proves the adapter contracts function end-to-end in
 *      THIS installed build of @angriff36/manifest.
 *   5. Package shape    — programmatic import of every documented
 *      subpath export + `npm pack --dry-run` audit of the tarball.
 *
 * Application-agnostic. The downstream repo's path is supplied via the
 * positional argument (default: cwd). The command performs no writes;
 * temporary registry files emitted during the check live in memory.
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import chalk from 'chalk';
import { auditGovernanceCommand, type AuditGovernanceResult } from './audit-governance.js';
import { auditBypassesCommand, type AuditBypassesResult } from './audit-bypasses.js';
import {
  checkDispatcherPresence,
  type DispatcherPresenceResult,
} from '../checks/dispatcher-presence.js';
import { runRuntimeSmoke, type RuntimeSmokeResult } from '../checks/runtime-smoke.js';
import { checkPackageShape, type PackageShapeResult } from '../checks/package-shape.js';

export interface IntegrationCheckOptions {
  /** Downstream repo root. Default: process.cwd(). */
  root?: string;
  /** Path to a commands registry JSON (commands.json). Optional. */
  commandsRegistry?: string;
  /** Path to a bypass registry JSON (bypasses.json). Optional. */
  bypassRegistry?: string;
  /** Skip the runtime smoke (e.g. when only running static analysis). */
  skipRuntimeSmoke?: boolean;
  /** Skip the package-shape check. */
  skipPackageShape?: boolean;
  /** Skip the `npm pack --dry-run` sub-check inside package shape. */
  skipTarball?: boolean;
  /** Output format. */
  format?: 'text' | 'json';
  /** Treat warnings as errors when deciding the process exit code. */
  strict?: boolean;
  /**
   * Absolute path to the @angriff36/manifest package root. Defaults to a
   * walk-up from this file. The package-shape check uses this for
   * `npm pack --dry-run`.
   */
  packageRoot?: string;
}

export interface IntegrationCheckSection {
  name: string;
  ok: boolean;
  /** Short human-readable summary, e.g. "0 errors, 0 warnings". */
  summary: string;
  /** Section-specific structured payload, included verbatim in JSON output. */
  detail: unknown;
}

export interface IntegrationCheckResult {
  ok: boolean;
  sections: IntegrationCheckSection[];
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function resolvePackageRoot(explicit?: string): Promise<string> {
  if (explicit) return path.resolve(explicit);
  // Walk up from this module's directory looking for the @angriff36/manifest
  // package.json. Matches the same strategy used by getPackageVersion in
  // index.ts.
  const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:'));
  for (let dir = here, prev = ''; dir !== prev; prev = dir, dir = path.dirname(dir)) {
    const pkg = path.join(dir, 'package.json');
    if (await fileExists(pkg)) {
      try {
        const raw = JSON.parse(await fs.readFile(pkg, 'utf-8'));
        if (raw?.name === '@angriff36/manifest') return dir;
      } catch {
        // skip unreadable package.json
      }
    }
  }
  // Fallback: cwd. Package-shape check will surface a clear error if this
  // is wrong.
  return process.cwd();
}

export async function integrationCheckCommand(
  options: IntegrationCheckOptions = {},
): Promise<IntegrationCheckResult> {
  const root = path.resolve(options.root ?? '.');
  const format = options.format ?? 'text';
  const sections: IntegrationCheckSection[] = [];

  // Detector context resolves registry paths relative to `root`, so we
  // pre-resolve any caller-supplied paths to absolute against process.cwd()
  // first. That way `--bypass-registry path/from/cwd.json` works regardless
  // of where `root` points.
  const commandsRegistryAbs = options.commandsRegistry
    ? path.resolve(process.cwd(), options.commandsRegistry)
    : undefined;
  const bypassRegistryAbs = options.bypassRegistry
    ? path.resolve(process.cwd(), options.bypassRegistry)
    : undefined;

  // --- Static governance ----------------------------------------------------
  let governance: AuditGovernanceResult;
  try {
    governance = await auditGovernanceCommand({
      root,
      commandsRegistry: commandsRegistryAbs,
      bypassRegistry: bypassRegistryAbs,
      format: 'json', // suppress the detector's own pretty output; we re-render below
    });
  } catch (e) {
    governance = {
      findings: [
        {
          severity: 'error',
          code: 'GOVERNANCE_AUDIT_THREW',
          message: e instanceof Error ? e.message : String(e),
          detector: 'audit-governance',
        },
      ],
      errorCount: 1,
      warningCount: 0,
      detectorsRun: [],
    };
  }
  sections.push({
    name: 'governance',
    ok: governance.errorCount === 0 && (!options.strict || governance.warningCount === 0),
    summary: `${governance.detectorsRun.length} detectors — ${governance.errorCount} errors, ${governance.warningCount} warnings`,
    detail: governance,
  });

  // --- Bypass registry ------------------------------------------------------
  // When the caller didn't pass a registry, check the conventional location.
  // If that file doesn't exist either, skip the bypass audit cleanly — apps
  // without bypasses shouldn't fail the integration check.
  let bypasses: AuditBypassesResult | { skipped: true; reason: string };
  let bypassesOk = true;
  let bypassesSummary = 'no bypass registry — skipped';
  const conventionalBypass = path.join(root, 'bypasses.json');
  const registryPath =
    bypassRegistryAbs ?? ((await fileExists(conventionalBypass)) ? conventionalBypass : undefined);

  if (!registryPath) {
    bypasses = { skipped: true, reason: 'no bypasses.json under root' };
  } else {
    try {
      const r = await auditBypassesCommand({
        registry: registryPath,
        root,
        format: 'json',
      });
      bypasses = r;
      bypassesOk = r.errorCount === 0 && (!options.strict || r.warningCount === 0);
      bypassesSummary = `${r.errorCount} errors, ${r.warningCount} warnings`;
    } catch (e) {
      bypasses = {
        findings: [
          {
            severity: 'error',
            code: 'AUDIT_BYPASSES_THREW',
            message: e instanceof Error ? e.message : String(e),
          },
        ],
        errorCount: 1,
        warningCount: 0,
      };
      bypassesOk = false;
      bypassesSummary = 'audit-bypasses threw';
    }
  }
  sections.push({
    name: 'bypasses',
    ok: bypassesOk,
    summary: bypassesSummary,
    detail: bypasses,
  });

  // --- Dispatcher route -----------------------------------------------------
  const dispatcher: DispatcherPresenceResult = await checkDispatcherPresence(root);
  sections.push({
    name: 'dispatcher',
    ok: dispatcher.found,
    summary: dispatcher.found
      ? `canonical dispatcher present at ${dispatcher.path}`
      : 'canonical dispatcher MISSING — generate via @angriff36/manifest/projections/nextjs',
    detail: dispatcher,
  });

  // --- Runtime smoke --------------------------------------------------------
  let runtime: RuntimeSmokeResult | { skipped: true };
  if (options.skipRuntimeSmoke) {
    runtime = { skipped: true };
    sections.push({
      name: 'runtime-smoke',
      ok: true,
      summary: 'skipped',
      detail: runtime,
    });
  } else {
    const result = await runRuntimeSmoke();
    runtime = result;
    sections.push({
      name: 'runtime-smoke',
      ok: result.ok,
      summary: result.fatal
        ? `fatal: ${result.fatal}`
        : `${result.assertions.filter((a) => a.passed).length}/${result.assertions.length} assertions passed`,
      detail: result,
    });
  }

  // --- Package shape --------------------------------------------------------
  let packageShape: PackageShapeResult | { skipped: true };
  if (options.skipPackageShape) {
    packageShape = { skipped: true };
    sections.push({
      name: 'package-shape',
      ok: true,
      summary: 'skipped',
      detail: packageShape,
    });
  } else {
    const packageRoot = await resolvePackageRoot(options.packageRoot);
    const shape = await checkPackageShape({ packageRoot, skipTarball: options.skipTarball });
    packageShape = shape;
    const failed = shape.subpathImports.filter((r) => !r.ok).length;
    let tarballNote: string;
    if (shape.tarballSkipped) {
      tarballNote = 'tarball check skipped';
    } else if (!shape.tarball.ran) {
      // npm pack failed to spawn — surface that as a real failure, not a skip.
      tarballNote = `tarball check FAILED to run (${shape.tarball.error ?? 'unknown'})`;
    } else if (shape.tarball.ok === false) {
      tarballNote = 'tarball MISSING REQUIRED ENTRIES';
    } else {
      tarballNote = `tarball OK (${shape.tarball.files.length} files)`;
    }
    sections.push({
      name: 'package-shape',
      ok: shape.ok,
      summary: `${shape.subpathImports.length - failed}/${shape.subpathImports.length} subpaths import, ${tarballNote}`,
      detail: shape,
    });
  }

  // --- Aggregate ------------------------------------------------------------
  const ok = sections.every((s) => s.ok);
  const result: IntegrationCheckResult = { ok, sections };

  if (format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    renderText(result, root);
  }

  return result;
}

function renderText(result: IntegrationCheckResult, root: string): void {
  console.log(chalk.bold(`\nManifest integration-check — ${root}`));
  for (const section of result.sections) {
    const marker = section.ok ? chalk.green('✓') : chalk.red('✗');
    console.log(`  ${marker} ${section.name.padEnd(15)} ${section.summary}`);
    if (!section.ok) {
      renderSectionDetail(section);
    }
  }
  console.log('');
  if (result.ok) {
    console.log(chalk.green.bold('integration-check PASSED'));
  } else {
    console.log(chalk.red.bold('integration-check FAILED'));
  }
}

function renderSectionDetail(section: IntegrationCheckSection): void {
  if (section.name === 'governance') {
    const detail = section.detail as AuditGovernanceResult;
    for (const f of detail.findings) {
      const tag = f.severity === 'error' ? chalk.red('error') : chalk.yellow('warning');
      console.log(
        `      ${tag} ${f.detector} ${f.code}: ${f.message}${f.file ? ` [${f.file}]` : ''}`,
      );
    }
  } else if (section.name === 'bypasses') {
    if ('skipped' in (section.detail as object)) return;
    const detail = section.detail as AuditBypassesResult;
    for (const f of detail.findings) {
      const tag = f.severity === 'error' ? chalk.red('error') : chalk.yellow('warning');
      console.log(`      ${tag} ${f.code}: ${f.message}`);
    }
  } else if (section.name === 'dispatcher') {
    const detail = section.detail as DispatcherPresenceResult;
    console.log('      searched:');
    for (const c of detail.candidatesSearched) {
      console.log(`        - ${c}`);
    }
    console.log(chalk.gray('      generate the canonical dispatcher route with:'));
    console.log(chalk.gray('        manifest generate nextjs.dispatcher'));
  } else if (section.name === 'runtime-smoke') {
    const detail = section.detail as RuntimeSmokeResult;
    if (detail.fatal) {
      console.log(`      ${chalk.red('fatal')}: ${detail.fatal}`);
      console.log(
        chalk.gray(
          '      most common cause: package install missing v0.5+ audit/outbox subpath exports',
        ),
      );
    } else {
      for (const a of detail.assertions.filter((a) => !a.passed)) {
        console.log(
          `      ${chalk.red('assertion')} ${a.name}: expected ${JSON.stringify(a.expected)}, got ${JSON.stringify(a.actual)}`,
        );
      }
    }
  } else if (section.name === 'package-shape') {
    const detail = section.detail as PackageShapeResult;
    for (const r of detail.subpathImports.filter((r) => !r.ok)) {
      console.log(`      ${chalk.red('subpath')} ${r.subpath}: ${r.error}`);
    }
    if (detail.tarball.ran && detail.tarball.ok === false) {
      if (detail.tarball.error) {
        console.log(`      ${chalk.red('tarball')} ${detail.tarball.error}`);
      }
      for (const missing of detail.tarball.missingExpectedEntries) {
        console.log(`      ${chalk.red('tarball')} missing required entry: ${missing}`);
      }
    }
  }
}
