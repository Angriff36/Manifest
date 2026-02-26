import path from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import {
  diffEntitySurface,
  formatRelative,
  inspectCompiledIR,
  inspectRouteSurfaceForCommand,
  inspectSourceEntities,
  mergeIREntityDefinitions,
  mergeSourceEntityDefinitions,
  readMergeReports,
  type DuplicateReportEntry,
  type EntitySurfaceDiff,
} from './doctor-lib.js';

interface CommonOptions {
  json?: boolean;
  src?: string;
  irRoot?: string[];
}

interface InspectEntityOptions extends CommonOptions {}
interface DiffSourceVsIROptions extends CommonOptions {}
interface DuplicatesOptions {
  json?: boolean;
  entity?: string;
  mergeReport?: string;
}
interface RuntimeCheckOptions extends CommonOptions {
  route?: string;
}
interface CacheStatusOptions extends CommonOptions {
  entity?: string;
  command?: string;
}
interface DoctorOptions extends RuntimeCheckOptions {
  entity?: string;
  command?: string;
}

function createSpinner(message: string, enabled: boolean) {
  if (!enabled) {
    return {
      text: message,
      stop() {},
      fail(_msg?: string) {},
    };
  }
  return ora(message).start();
}

function arrayify(value: string | string[] | undefined): string[] | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value : [value];
}

function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function tableLine(label: string, value: string): string {
  return `${label.padEnd(26)} ${value}`;
}

function summarizeDiff(diff: EntitySurfaceDiff): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (diff.entityMissingInSource) errors.push(`Entity '${diff.entityName}' not found in source manifests.`);
  if (diff.entityMissingInIR) errors.push(`Entity '${diff.entityName}' not found in compiled IR.`);
  if (diff.commands.missingInIR.length > 0) errors.push(`Commands missing in IR: ${diff.commands.missingInIR.join(', ')}`);
  if (diff.commands.extraInIR.length > 0) warnings.push(`Extra commands in IR: ${diff.commands.extraInIR.join(', ')}`);
  if (diff.properties.missingInIR.length > 0) errors.push(`Properties missing in IR: ${diff.properties.missingInIR.join(', ')}`);
  if (diff.properties.extraInIR.length > 0) warnings.push(`Extra properties in IR: ${diff.properties.extraInIR.join(', ')}`);
  if (diff.emits.missingInIR.length > 0) warnings.push(`Emitted events missing in IR: ${diff.emits.missingInIR.join(', ')}`);
  if (diff.emits.extraInIR.length > 0) warnings.push(`Extra emitted events in IR: ${diff.emits.extraInIR.join(', ')}`);

  return { errors, warnings };
}

function filterDuplicates(entries: DuplicateReportEntry[], entityName?: string): DuplicateReportEntry[] {
  if (!entityName) return entries;
  const needle = entityName.toLowerCase();
  return entries.filter((e) => {
    const key = e.key.toLowerCase();
    const kept = (e.keptFrom || '').toLowerCase();
    const dropped = (e.droppedFrom || '').toLowerCase();
    return key.includes(needle) || kept.includes(needle) || dropped.includes(needle);
  });
}

async function buildEntityContext(entityName: string, options: CommonOptions) {
  const cwd = process.cwd();
  const [sourceInspection, irInspection] = await Promise.all([
    inspectSourceEntities({ cwd, srcPattern: options.src }),
    inspectCompiledIR({ cwd, irRoots: arrayify(options.irRoot) }),
  ]);

  const sourceDefs = sourceInspection.entities.get(entityName);
  const irDefs = irInspection.entities.get(entityName);
  const source = mergeSourceEntityDefinitions(sourceDefs);
  const ir = mergeIREntityDefinitions(irDefs);
  const diff = diffEntitySurface({ entityName, source, ir });

  return { cwd, sourceInspection, irInspection, sourceDefs, irDefs, source, ir, diff };
}

export async function inspectEntityCommand(entityName: string, options: InspectEntityOptions = {}): Promise<void> {
  const spinner = createSpinner(`Inspecting entity ${entityName}`, !options.json);
  try {
    const ctx = await buildEntityContext(entityName, options);
    spinner.stop();

    const payload = {
      success: true,
      entity: entityName,
      source: {
        exists: ctx.source.exists,
        files: ctx.source.files.map((f) => ({
          file: formatRelative(ctx.cwd, f.file),
          line: f.line,
        })),
        commands: ctx.source.commands,
        properties: ctx.source.properties,
        emits: ctx.source.emits,
        policies: ctx.source.policies,
        parserFindings: ctx.source.parserFindings,
        parserErrors: ctx.source.parserErrors,
      },
      compiledIR: {
        exists: ctx.ir.exists,
        files: ctx.ir.files.map((f) => ({
          file: formatRelative(ctx.cwd, f.file),
          provenance: f.provenance || null,
        })),
        commands: ctx.ir.commands,
        properties: ctx.ir.properties,
        emits: ctx.ir.emits,
        policies: ctx.ir.policies,
        events: ctx.ir.events,
      },
      drift: ctx.diff,
    };

    if (options.json) {
      printJson(payload);
      if (ctx.diff.hasDrift) process.exit(1);
      return;
    }

    console.log(chalk.bold(`\nEntity Inspection: ${entityName}`));
    console.log('');
    console.log(chalk.cyan('Source manifests'));
    console.log(tableLine('Entity found', ctx.source.exists ? 'yes' : 'no'));
    console.log(tableLine('Definitions', String(ctx.source.files.length)));
    if (ctx.source.files.length > 0) {
      for (const f of ctx.source.files) {
        console.log(`  - ${formatRelative(ctx.cwd, f.file)}${f.line ? `:${f.line}` : ''}`);
      }
    }
    console.log(tableLine('Commands', ctx.source.commands.length ? ctx.source.commands.join(', ') : '(none)'));
    console.log(tableLine('Properties', ctx.source.properties.length ? ctx.source.properties.join(', ') : '(none)'));
    console.log(tableLine('Emits/events', ctx.source.emits.length ? ctx.source.emits.join(', ') : '(none)'));
    console.log(tableLine('Policies', ctx.source.policies.length ? ctx.source.policies.join(', ') : '(none)'));

    if (ctx.source.parserFindings.length > 0 || ctx.source.parserErrors.length > 0) {
      console.log('');
      console.log(chalk.yellow('Source parser/scanner diagnostics'));
      for (const finding of ctx.source.parserFindings) {
        console.log(`  [${finding.severity.toUpperCase()}] ${finding.code}: ${finding.message}`);
        if (finding.suggestion) console.log(chalk.gray(`    -> ${finding.suggestion}`));
      }
      for (const err of ctx.source.parserErrors.slice(0, 10)) {
        const at = err.line ? `:${err.line}${err.column ? `:${err.column}` : ''}` : '';
        console.log(`  [${(err.severity || 'error').toUpperCase()}] ${err.message}${at}`);
      }
      if (ctx.source.parserErrors.length > 10) {
        console.log(chalk.gray(`  ... ${ctx.source.parserErrors.length - 10} more parser diagnostics`));
      }
    }

    console.log('');
    console.log(chalk.cyan('Compiled IR'));
    console.log(tableLine('Entity found', ctx.ir.exists ? 'yes' : 'no'));
    console.log(tableLine('IR files', String(ctx.ir.files.length)));
    for (const f of ctx.ir.files) {
      const p = f.provenance || {};
      const compiledAt = typeof p.compiledAt === 'string' ? p.compiledAt : 'n/a';
      const compilerVersion = typeof p.compilerVersion === 'string' ? p.compilerVersion : 'n/a';
      console.log(`  - ${formatRelative(ctx.cwd, f.file)} (compiledAt=${compiledAt}, compilerVersion=${compilerVersion})`);
    }
    console.log(tableLine('Commands', ctx.ir.commands.length ? ctx.ir.commands.join(', ') : '(none)'));
    console.log(tableLine('Properties', ctx.ir.properties.length ? ctx.ir.properties.join(', ') : '(none)'));
    console.log(tableLine('Emits', ctx.ir.emits.length ? ctx.ir.emits.join(', ') : '(none)'));
    console.log(tableLine('IR events', ctx.ir.events.length ? ctx.ir.events.join(', ') : '(none)'));
    console.log(tableLine('Policies', ctx.ir.policies.length ? ctx.ir.policies.join(', ') : '(none)'));

    const summary = summarizeDiff(ctx.diff);
    console.log('');
    console.log(chalk.bold('Drift Summary'));
    if (!ctx.diff.hasDrift) {
      console.log(chalk.green('  No source-vs-IR drift detected for this entity.'));
    } else {
      for (const err of summary.errors) console.log(chalk.red(`  ERROR: ${err}`));
      for (const warn of summary.warnings) console.log(chalk.yellow(`  WARN:  ${warn}`));
      if (ctx.source.commands.length > 0 && ctx.ir.commands.length === 0) {
        console.log(chalk.red(`  Diagnosis: source defines commands for ${entityName}, but compiled IR has 0 commands. Precompiled IR is likely stale or generated from different sources.`));
      }
      process.exit(1);
    }
  } catch (error) {
    spinner.fail(`inspect entity failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

export async function diffSourceVsIRCommand(entityName: string, options: DiffSourceVsIROptions = {}): Promise<void> {
  const spinner = createSpinner(`Diffing source vs IR for ${entityName}`, !options.json);
  try {
    const ctx = await buildEntityContext(entityName, options);
    spinner.stop();

    const summary = summarizeDiff(ctx.diff);
    const payload = {
      success: !ctx.diff.hasDrift,
      entity: entityName,
      diff: ctx.diff,
      diagnostics: summary,
    };

    if (options.json) {
      printJson(payload);
    } else {
      console.log(chalk.bold(`\nSource vs IR Diff: ${entityName}`));
      if (!ctx.diff.hasDrift) {
        console.log(chalk.green('  No drift detected.'));
      } else {
        for (const err of summary.errors) console.log(chalk.red(`  ERROR: ${err}`));
        for (const warn of summary.warnings) console.log(chalk.yellow(`  WARN:  ${warn}`));
      }
      console.log('');
      console.log(tableLine('Source commands', ctx.source.commands.join(', ') || '(none)'));
      console.log(tableLine('IR commands', ctx.ir.commands.join(', ') || '(none)'));
      console.log(tableLine('Source props', ctx.source.properties.join(', ') || '(none)'));
      console.log(tableLine('IR props', ctx.ir.properties.join(', ') || '(none)'));
      console.log(tableLine('Source emits', ctx.source.emits.join(', ') || '(none)'));
      console.log(tableLine('IR emits', ctx.ir.emits.join(', ') || '(none)'));
    }

    if (ctx.diff.hasDrift) process.exit(1);
  } catch (error) {
    spinner.fail(`diff source-vs-ir failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

export async function duplicatesCommand(options: DuplicatesOptions = {}): Promise<void> {
  const spinner = createSpinner('Reading merge reports', !options.json);
  try {
    const reports = await readMergeReports({
      cwd: process.cwd(),
      pattern: options.mergeReport || '**/*.merge-report.json',
    });
    spinner.stop();

    const entries = filterDuplicates(reports.flatMap((r) => r.entries), options.entity);
    const suspicious = entries.filter((e) => e.classification === 'suspicious');

    const payload = {
      success: suspicious.length === 0,
      reports: reports.map((r) => ({
        file: formatRelative(process.cwd(), r.file),
        parseError: r.parseError || null,
        entries: filterDuplicates(r.entries, options.entity),
      })),
      summary: {
        reportsFound: reports.length,
        totalEntries: entries.length,
        knownDuplicates: entries.filter((e) => e.classification === 'known').length,
        suspiciousDuplicates: suspicious.length,
      },
    };

    if (options.json) {
      printJson(payload);
      if (suspicious.length > 0) process.exit(1);
      return;
    }

    console.log(chalk.bold('\nDuplicate / Merge Report'));
    if (reports.length === 0) {
      console.log(chalk.yellow('  No *.merge-report.json files found.'));
      console.log(chalk.gray('  This is not an error. Duplicate merge visibility is unavailable until a merge report is generated.'));
      return;
    }

    console.log('');
    for (const report of reports) {
      console.log(chalk.cyan(`  ${formatRelative(process.cwd(), report.file)}`));
      if (report.parseError) {
        console.log(chalk.red(`    parse error: ${report.parseError}`));
        continue;
      }
      const filtered = filterDuplicates(report.entries, options.entity);
      if (filtered.length === 0) {
        console.log(chalk.gray('    no matching duplicates'));
        continue;
      }
      for (const entry of filtered) {
        const color = entry.classification === 'known' ? chalk.yellow : chalk.red;
        console.log(color(`    [${entry.classification.toUpperCase()}] ${entry.type} ${entry.key}`));
        console.log(`      keptFrom: ${entry.keptFrom || 'n/a'}`);
        console.log(`      droppedFrom: ${entry.droppedFrom || 'n/a'}`);
      }
    }

    console.log('');
    console.log(chalk.bold('Summary'));
    console.log(tableLine('Reports found', String(payload.summary.reportsFound)));
    console.log(tableLine('Entries', String(payload.summary.totalEntries)));
    console.log(tableLine('Known duplicates', String(payload.summary.knownDuplicates)));
    console.log(tableLine('Suspicious duplicates', String(payload.summary.suspiciousDuplicates)));

    if (suspicious.length > 0) process.exit(1);
  } catch (error) {
    spinner.fail(`duplicates failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

export async function runtimeCheckCommand(entityName: string, commandName: string, options: RuntimeCheckOptions = {}): Promise<void> {
  const spinner = createSpinner(`Runtime readiness check ${entityName}.${commandName}`, !options.json);
  try {
    const [ctx, routeCheck] = await Promise.all([
      buildEntityContext(entityName, options),
      inspectRouteSurfaceForCommand({ entityName, commandName, routePath: options.route, cwd: process.cwd() }),
    ]);
    spinner.stop();

    const sourceHasCommand = ctx.source.commands.includes(commandName);
    const irHasCommand = ctx.ir.commands.includes(commandName);
    const routeExists = routeCheck.routeExists;
    const issues: Array<{ severity: 'error' | 'warning'; code: string; message: string; fix?: string }> = [];

    if (!sourceHasCommand) {
      issues.push({
        severity: 'error',
        code: 'SOURCE_COMMAND_MISSING',
        message: `Source manifests do not expose ${entityName}.${commandName}.`,
      });
    }
    if (!irHasCommand) {
      issues.push({
        severity: 'error',
        code: 'IR_COMMAND_MISSING',
        message: `Precompiled IR does not contain ${entityName}.${commandName}.`,
        fix: 'Rebuild manifests (e.g. `pnpm manifest:build`) and verify the generated IR file was updated.',
      });
    }
    if (!routeExists) {
      issues.push({
        severity: 'warning',
        code: 'ROUTE_SURFACE_COMMAND_NOT_FOUND',
        message: options.route
          ? `No canonical route manifest entry found for route ${options.route} -> ${entityName}.${commandName}.`
          : `No canonical route manifest entry found for ${entityName}.${commandName} (routes.manifest.json not found or route missing).`,
        fix: 'Generate or refresh canonical routes (`manifest routes --format json`) and verify route manifest output.',
      });
    }

    if (routeExists && sourceHasCommand && !irHasCommand) {
      issues.unshift({
        severity: 'error',
        code: 'ROUTE_EXISTS_BUT_PRECOMPILED_IR_MISSING_COMMAND',
        message: `Route exists but precompiled IR lacks ${entityName}.${commandName}. Route was generated from prior IR/source while current precompiled IR is stale.`,
        fix: 'Rebuild manifests and restart API process. Rebuilding IR alone may not fix a running server with cached IR.',
      });
    }

    const payload = {
      success: issues.every((i) => i.severity !== 'error'),
      target: { entity: entityName, command: commandName, route: options.route || null },
      checks: {
        source: {
          entityExists: ctx.source.exists,
          commandExists: sourceHasCommand,
          files: ctx.source.files.map((f) => ({ file: formatRelative(ctx.cwd, f.file), line: f.line })),
          parserFindings: ctx.source.parserFindings,
        },
        precompiledIR: {
          entityExists: ctx.ir.exists,
          commandExists: irHasCommand,
          files: ctx.ir.files.map((f) => ({ file: formatRelative(ctx.cwd, f.file), provenance: f.provenance || null })),
        },
        routeSurface: {
          routeExists,
          matches: routeCheck.matches.map((m) => ({
            ...m,
            manifestFile: formatRelative(ctx.cwd, m.manifestFile),
          })),
        },
      },
      issues,
      cacheGuidance: (sourceHasCommand && irHasCommand)
        ? `Compiled IR includes ${entityName}.${commandName}. If runtime still returns "Command '${commandName}' not found", restart the API dev server to clear in-process IR cache.`
        : `Fix source/IR drift first, then restart the API dev server to clear in-process IR cache.`,
    };

    if (options.json) {
      printJson(payload);
      if (!payload.success) process.exit(1);
      return;
    }

    console.log(chalk.bold(`\nRuntime Check: ${entityName}.${commandName}`));
    console.log('');
    console.log(chalk.cyan('Readiness Correlation'));
    console.log(tableLine('Source entity', ctx.source.exists ? 'yes' : 'no'));
    console.log(tableLine('Source command', sourceHasCommand ? 'yes' : 'no'));
    console.log(tableLine('Precompiled IR entity', ctx.ir.exists ? 'yes' : 'no'));
    console.log(tableLine('Precompiled IR command', irHasCommand ? 'yes' : 'no'));
    console.log(tableLine('Canonical route entry', routeExists ? 'yes' : 'no'));

    if (routeCheck.matches.length > 0) {
      for (const m of routeCheck.matches) {
        console.log(`  - ${m.method} ${m.routePath} (${formatRelative(ctx.cwd, m.manifestFile)})`);
      }
    }

    if (issues.length > 0) {
      console.log('');
      console.log(chalk.bold('Diagnosis'));
      for (const issue of issues) {
        const color = issue.severity === 'error' ? chalk.red : chalk.yellow;
        console.log(color(`  [${issue.severity.toUpperCase()}] ${issue.code}: ${issue.message}`));
        if (issue.fix) console.log(chalk.gray(`    -> ${issue.fix}`));
      }
    } else {
      console.log(chalk.green('\n  Source, precompiled IR, and route surface are aligned for this command.'));
    }

    console.log('');
    console.log(chalk.bold('Runtime Cache Guidance'));
    console.log(`  ${payload.cacheGuidance}`);

    if (!payload.success) process.exit(1);
  } catch (error) {
    spinner.fail(`runtime-check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

export async function cacheStatusCommand(options: CacheStatusOptions = {}): Promise<void> {
  const spinner = createSpinner('Inspecting compiled IR timestamps', !options.json);
  try {
    const irInspection = await inspectCompiledIR({ cwd: process.cwd(), irRoots: arrayify(options.irRoot) });
    spinner.stop();

    const compiledEntries = Array.from(irInspection.entities.values())
      .flat()
      .flatMap((def) => {
        const p = def.provenance || {};
        return [{
          file: def.irFile,
          entity: def.entityName,
          compiledAt: typeof p.compiledAt === 'string' ? p.compiledAt : null,
          compilerVersion: typeof p.compilerVersion === 'string' ? p.compilerVersion : null,
        }];
      })
      .sort((a, b) => String(b.compiledAt || '').localeCompare(String(a.compiledAt || '')));

    const latest = compiledEntries[0] || null;
    const payload = {
      success: true,
      canInspectRuntimeCacheDirectly: false,
      message: 'Direct in-process runtime cache introspection is not available from the CLI without app-specific hooks.',
      latestCompiledIR: latest ? {
        file: formatRelative(process.cwd(), latest.file),
        entity: latest.entity,
        compiledAt: latest.compiledAt,
        compilerVersion: latest.compilerVersion,
      } : null,
      guidance: options.entity && options.command
        ? `If ${options.entity}.${options.command} is now present in precompiled IR and runtime still reports command-not-found, restart the API dev server to clear in-process IR cache.`
        : 'After rebuilding manifests, restart long-running API processes (dev server/workers) to clear any in-process IR cache.',
    };

    if (options.json) {
      printJson(payload);
      return;
    }

    console.log(chalk.bold('\nCache Status / Guidance'));
    console.log(chalk.yellow('  Direct runtime cache introspection: unavailable (CLI is offline by design)'));
    if (latest) {
      console.log(`  Latest compiled IR: ${formatRelative(process.cwd(), latest.file)}`);
      console.log(`    entity: ${latest.entity}`);
      console.log(`    compiledAt: ${latest.compiledAt || 'n/a'}`);
      console.log(`    compilerVersion: ${latest.compilerVersion || 'n/a'}`);
    } else {
      console.log('  No precompiled IR files found.');
    }
    console.log('');
    console.log(chalk.bold('Guidance'));
    console.log(`  ${payload.guidance}`);
  } catch (error) {
    spinner.fail(`cache-status failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

export async function doctorCommand(options: DoctorOptions = {}): Promise<void> {
  const entityName = options.entity;
  const commandName = options.command;
  const spinner = createSpinner('Running manifest doctor', !options.json);
  try {
    const cwd = process.cwd();
    const [sourceInspection, irInspection, duplicates, routeCheck] = await Promise.all([
      inspectSourceEntities({ cwd, srcPattern: options.src }),
      inspectCompiledIR({ cwd, irRoots: arrayify(options.irRoot) }),
      readMergeReports({ cwd }),
      entityName && commandName
        ? inspectRouteSurfaceForCommand({ entityName, commandName, routePath: options.route, cwd })
        : Promise.resolve({ routeExists: false, matches: [] as any[] }),
    ]);
    spinner.stop();

    const findings: Array<{ rank: number; severity: 'error' | 'warning' | 'info'; code: string; message: string; fix?: string }> = [];

    // Global parser/scanner mismatch heuristics
    for (const defs of sourceInspection.entities.values()) {
      for (const def of defs) {
        if (entityName && def.entityName !== entityName) {
          continue;
        }
        for (const finding of def.parserHeuristics) {
          findings.push({
            rank: 10,
            severity: finding.severity === 'error' ? 'error' : 'warning',
            code: finding.code,
            message: `${formatRelative(cwd, def.file)}${def.line ? `:${def.line}` : ''} - ${finding.message}`,
            fix: finding.suggestion,
          });
        }
      }
    }

    let entityDiff: EntitySurfaceDiff | null = null;
    let sourceMerged: ReturnType<typeof mergeSourceEntityDefinitions> | null = null;
    let irMerged: ReturnType<typeof mergeIREntityDefinitions> | null = null;

    if (entityName) {
      sourceMerged = mergeSourceEntityDefinitions(sourceInspection.entities.get(entityName));
      irMerged = mergeIREntityDefinitions(irInspection.entities.get(entityName));
      entityDiff = diffEntitySurface({ entityName, source: sourceMerged, ir: irMerged });
      const diffSummary = summarizeDiff(entityDiff);
      for (const msg of diffSummary.errors) {
        findings.push({ rank: 20, severity: 'error', code: 'SOURCE_IR_DRIFT', message: `${entityName}: ${msg}` });
      }
      for (const msg of diffSummary.warnings) {
        findings.push({ rank: 21, severity: 'warning', code: 'SOURCE_IR_DRIFT_WARNING', message: `${entityName}: ${msg}` });
      }
      if (commandName && sourceMerged.commands.includes(commandName) && !irMerged.commands.includes(commandName)) {
        findings.push({
          rank: 25,
          severity: 'error',
          code: 'COMMAND_MISSING_IN_PRECOMPILED_IR',
          message: `${entityName}.${commandName} exists in source but not in precompiled IR.`,
          fix: 'Run your manifest build step (e.g. `pnpm manifest:build`) and verify precompiled IR is regenerated.',
        });
      }
      if (commandName && routeCheck.routeExists && sourceMerged.commands.includes(commandName) && !irMerged.commands.includes(commandName)) {
        findings.push({
          rank: 30,
          severity: 'error',
          code: 'ROUTE_EXISTS_BUT_IR_MISSING_COMMAND',
          message: `Route exists for ${entityName}.${commandName}, but precompiled IR lacks the command.`,
          fix: 'Route likely came from prior source/IR. Rebuild manifests and restart API dev server.',
        });
      }
      if (commandName && sourceMerged.commands.includes(commandName) && irMerged.commands.includes(commandName)) {
        findings.push({
          rank: 80,
          severity: 'warning',
          code: 'STALE_RUNTIME_CACHE_LIKELY_IF_ERROR_PERSISTS',
          message: `Source and precompiled IR both include ${entityName}.${commandName}. If runtime still returns command-not-found, in-process IR cache is likely stale.`,
          fix: 'Restart the API dev server / worker process.',
        });
      }
    }

    const duplicateEntries = duplicates.flatMap((r) => r.entries);
    const filteredDuplicateEntries = filterDuplicates(duplicateEntries, entityName);
    for (const entry of filteredDuplicateEntries) {
      findings.push({
        rank: entry.classification === 'suspicious' ? 40 : 70,
        severity: entry.classification === 'suspicious' ? 'warning' : 'info',
        code: entry.classification === 'suspicious' ? 'SUSPICIOUS_DUPLICATE' : 'KNOWN_DUPLICATE_MERGE',
        message: `${entry.type} ${entry.key} (kept=${entry.keptFrom || 'n/a'}, dropped=${entry.droppedFrom || 'n/a'})`,
      });
    }

    findings.sort((a, b) => a.rank - b.rank || a.code.localeCompare(b.code));

    const payload = {
      success: !findings.some((f) => f.severity === 'error'),
      target: entityName ? { entity: entityName, command: commandName || null, route: options.route || null } : null,
      summary: {
        filesScanned: {
          sourceManifests: sourceInspection.filesScanned,
          compiledIR: irInspection.filesScanned,
          mergeReports: duplicates.length,
        },
        parserErrorsInSourceFiles: sourceInspection.filesWithParseErrors,
        findings: {
          errors: findings.filter((f) => f.severity === 'error').length,
          warnings: findings.filter((f) => f.severity === 'warning').length,
          info: findings.filter((f) => f.severity === 'info').length,
        },
      },
      routeSurface: entityName && commandName ? {
        routeExists: routeCheck.routeExists,
        matches: routeCheck.matches.map((m) => ({ ...m, manifestFile: formatRelative(cwd, m.manifestFile) })),
      } : null,
      drift: entityDiff,
      findings,
      suggestedFixes: [
        'pnpm manifest:build',
        'Restart apps/api dev server (or the process hosting precompiled IR)',
        'Re-run `manifest doctor` or `manifest runtime-check <Entity> <command>`',
      ],
    };

    if (options.json) {
      printJson(payload);
      if (!payload.success) process.exit(1);
      return;
    }

    console.log(chalk.bold('\nManifest Doctor'));
    console.log('');
    console.log(chalk.cyan('Summary'));
    console.log(tableLine('Source manifests scanned', String(payload.summary.filesScanned.sourceManifests)));
    console.log(tableLine('Compiled IR files scanned', String(payload.summary.filesScanned.compiledIR)));
    console.log(tableLine('Merge reports found', String(payload.summary.filesScanned.mergeReports)));
    console.log(tableLine('Source parse-error files', String(payload.summary.parserErrorsInSourceFiles)));
    if (payload.target) {
      console.log(tableLine('Target', `${payload.target.entity}${payload.target.command ? `.${payload.target.command}` : ''}`));
      if (payload.target.route) console.log(tableLine('Route', payload.target.route));
      if (payload.routeSurface) console.log(tableLine('Route surface hit', payload.routeSurface.routeExists ? 'yes' : 'no'));
    }

    console.log('');
    console.log(chalk.bold('Ranked Diagnosis'));
    if (findings.length === 0) {
      console.log(chalk.green('  No issues detected by offline checks.'));
      if (entityName && commandName) {
        console.log(chalk.yellow(`  If runtime still returns "Command '${commandName}' not found", restart the API dev server to clear in-process IR cache.`));
      }
    } else {
      for (const finding of findings) {
        const prefix = finding.severity === 'error'
          ? chalk.red('ERROR')
          : finding.severity === 'warning'
            ? chalk.yellow('WARN ')
            : chalk.gray('INFO ');
        console.log(`  ${prefix} [${finding.code}] ${finding.message}`);
        if (finding.fix) console.log(chalk.gray(`        -> ${finding.fix}`));
      }
    }

    console.log('');
    console.log(chalk.bold('Fix Commands'));
    for (const cmd of payload.suggestedFixes) {
      console.log(`  ${cmd}`);
    }

    if (!payload.success) process.exit(1);
  } catch (error) {
    spinner.fail(`doctor failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
