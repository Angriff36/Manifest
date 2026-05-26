/**
 * manifest versions — CLI subcommand group for IR version management.
 *
 * Subcommands: list, show, save, diff, changelog, tag, rollback, verify
 *
 * Filesystem layout under `.manifest-versions/`:
 *   manifest.json           — Version index
 *   v{N}/ir.json            — Full IR snapshot
 *   v{N}/meta.json          — Version metadata
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import type { IR } from '@angriff36/manifest/ir';
import type { IRDiffReport, MigrationReport } from '@angriff36/manifest/ir-diff';
import type { BreakingChangeReport } from '@angriff36/manifest/breaking-change';
import type {
  IRVersionIndex,
  IRVersionMeta,
} from '@angriff36/manifest/ir-version-store';

// ============================================================================
// Dynamic imports (lazy-loaded to match vitest alias resolution)
// ============================================================================

async function loadCompiler() {
  const mod = await import('@angriff36/manifest/ir-compiler');
  return mod;
}

async function loadDiff() {
  const mod = await import('@angriff36/manifest/ir-diff');
  return mod;
}

async function loadBreaking() {
  const mod = await import('@angriff36/manifest/breaking-change');
  return mod;
}

async function loadVersionStore() {
  const mod = await import('@angriff36/manifest/ir-version-store');
  return mod;
}

// ============================================================================
// Helpers
// ============================================================================

function createSpinner(message: string, enabled: boolean) {
  if (!enabled) {
    return { text: message, stop() {}, fail(_msg?: string) {}, succeed(_msg?: string) {} };
  }
  return ora(message).start();
}

function tableLine(label: string, value: string): string {
  return `${label.padEnd(22)} ${value}`;
}

const DEFAULT_STORE_DIR = '.manifest-versions';

function resolveStoreRoot(storePath?: string): string {
  return path.resolve(storePath ?? DEFAULT_STORE_DIR);
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// I/O operations
// ============================================================================

async function initStore(storeRoot: string): Promise<void> {
  const vs = await loadVersionStore();
  await ensureDir(storeRoot);
  const index = vs.createVersionIndex();
  await fs.writeFile(
    path.join(storeRoot, 'manifest.json'),
    JSON.stringify(index, null, 2),
    'utf-8',
  );
}

async function loadIndex(storeRoot: string): Promise<IRVersionIndex> {
  const raw = await fs.readFile(path.join(storeRoot, 'manifest.json'), 'utf-8');
  return JSON.parse(raw) as IRVersionIndex;
}

async function saveIndex(storeRoot: string, index: IRVersionIndex): Promise<void> {
  await fs.writeFile(
    path.join(storeRoot, 'manifest.json'),
    JSON.stringify(index, null, 2),
    'utf-8',
  );
}

async function loadVersionIR(storeRoot: string, versionNumber: number): Promise<IR> {
  const irPath = path.join(storeRoot, `v${versionNumber}`, 'ir.json');
  const raw = await fs.readFile(irPath, 'utf-8');
  return JSON.parse(raw) as IR;
}

async function saveVersionFiles(
  storeRoot: string,
  ir: IR,
  meta: IRVersionMeta,
): Promise<void> {
  const versionDir = path.join(storeRoot, `v${meta.versionNumber}`);
  await ensureDir(versionDir);
  await fs.writeFile(path.join(versionDir, 'ir.json'), JSON.stringify(ir, null, 2), 'utf-8');
  await fs.writeFile(path.join(versionDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
}

// ============================================================================
// Subcommand: list
// ============================================================================

export interface VersionsListOptions {
  store?: string;
  json?: boolean;
}

export async function versionsListCommand(options: VersionsListOptions = {}): Promise<void> {
  const storeRoot = resolveStoreRoot(options.store);

  if (!(await fileExists(path.join(storeRoot, 'manifest.json')))) {
    if (options.json) {
      console.log(JSON.stringify({ versions: [], message: 'No version store found' }));
    } else {
      console.log(chalk.yellow('No version store found. Run `manifest versions save` first.'));
    }
    return;
  }

  const index = await loadIndex(storeRoot);

  if (options.json) {
    console.log(JSON.stringify(index, null, 2));
    return;
  }

  if (index.versions.length === 0) {
    console.log(chalk.yellow('No versions saved.'));
    return;
  }

  console.log(chalk.bold(`\nIR Versions (${index.versions.length} total)\n`));
  for (const v of index.versions) {
    const tagStr = v.tag ? chalk.cyan(` [${v.tag}]`) : '';
    const labelStr = v.label ? chalk.gray(` — ${v.label}`) : '';
    const isCurrent = v.versionNumber === index.currentVersionNumber;
    const marker = isCurrent ? chalk.green('*') : ' ';
    console.log(`${marker} v${v.versionNumber}${tagStr}${labelStr}`);
    console.log(`    saved: ${v.savedAt}  irHash: ${v.irHash.slice(0, 12)}...`);
  }
}

// ============================================================================
// Subcommand: show
// ============================================================================

export interface VersionsShowOptions {
  store?: string;
  json?: boolean;
}

export async function versionsShowCommand(
  version: string,
  options: VersionsShowOptions = {},
): Promise<void> {
  const vs = await loadVersionStore();
  const storeRoot = resolveStoreRoot(options.store);
  const index = await loadIndex(storeRoot);
  const versionNum = vs.resolveVersionRef(index, version);

  if (!versionNum) {
    console.error(chalk.red(`Version '${version}' not found.`));
    process.exit(1);
    return;
  }

  const meta = index.versions.find(v => v.versionNumber === versionNum)!;

  if (options.json) {
    const ir = await loadVersionIR(storeRoot, versionNum);
    console.log(JSON.stringify({ meta, ir }, null, 2));
    return;
  }

  console.log(chalk.bold(`\nVersion v${meta.versionNumber}`));
  if (meta.tag) console.log(tableLine('Tag', chalk.cyan(meta.tag)));
  if (meta.label) console.log(tableLine('Label', meta.label));
  console.log(tableLine('IR Hash', meta.irHash));
  console.log(tableLine('Content Hash', meta.contentHash));
  console.log(tableLine('Compiler', meta.compilerVersion));
  console.log(tableLine('Schema', meta.schemaVersion));
  console.log(tableLine('Saved At', meta.savedAt));
}

// ============================================================================
// Subcommand: save
// ============================================================================

export interface VersionsSaveOptions {
  store?: string;
  tag?: string;
  autoTag?: boolean;
  label?: string;
}

export async function versionsSaveCommand(
  source: string | undefined,
  options: VersionsSaveOptions = {},
): Promise<void> {
  const compiler = await loadCompiler();
  const diffMod = await loadDiff();
  const breakingMod = await loadBreaking();
  const vs = await loadVersionStore();

  const storeRoot = resolveStoreRoot(options.store);

  // Init store if needed
  if (!(await fileExists(path.join(storeRoot, 'manifest.json')))) {
    await initStore(storeRoot);
  }

  // Compile source
  if (!source) {
    console.error(chalk.red('Source .manifest file path is required.'));
    process.exit(1);
    return;
  }

  const spinner = createSpinner(`Compiling ${source}`, true);
  let sourceContent: string;
  try {
    sourceContent = await fs.readFile(source, 'utf-8');
  } catch {
    spinner.fail(`Cannot read source file: ${source}`);
    process.exit(1);
    return;
  }

  const { ir, diagnostics } = await compiler.compileToIR(sourceContent, { sourcePath: source });
  if (!ir) {
    spinner.fail('Compilation failed');
    for (const d of diagnostics) {
      console.error(chalk.red(`  ${d.severity}: ${d.message}${d.line ? ` (line ${d.line})` : ''}`));
    }
    process.exit(1);
    return;
  }
  spinner.succeed('Compiled successfully');

  const index = await loadIndex(storeRoot);
  const nextVersionNum = index.currentVersionNumber + 1;

  // Determine tag
  let tag = options.tag;

  if (options.autoTag && index.versions.length > 0) {
    const prevIR = await loadVersionIR(storeRoot, index.currentVersionNumber);
    const prevMeta = index.versions[index.versions.length - 1];
    const diffReport = diffMod.diffIR(prevIR, ir);
    const breakingReport = breakingMod.classifyBreakingChanges(diffReport);
    tag = vs.autoIncrementSemver(prevMeta.tag, diffReport, breakingReport);
  }

  const meta = vs.createVersionMeta(ir, nextVersionNum, { tag, label: options.label });
  await saveVersionFiles(storeRoot, ir, meta);

  const updatedIndex = vs.addVersionToIndex(index, meta);
  await saveIndex(storeRoot, updatedIndex);

  console.log(chalk.green(`\nSaved version v${nextVersionNum}${tag ? ` [${tag}]` : ''}`));
  console.log(`  IR hash: ${meta.irHash.slice(0, 16)}...`);
  console.log(`  Store:   ${storeRoot}`);
}

// ============================================================================
// Subcommand: diff
// ============================================================================

export interface VersionsDiffOptions {
  store?: string;
  json?: boolean;
  breaking?: boolean;
  sql?: boolean;
}

export async function versionsDiffCommand(
  from: string,
  to: string,
  options: VersionsDiffOptions = {},
): Promise<void> {
  const diffMod = await loadDiff();
  const breakingMod = await loadBreaking();
  const vs = await loadVersionStore();

  const storeRoot = resolveStoreRoot(options.store);
  const index = await loadIndex(storeRoot);
  const fromNum = vs.resolveVersionRef(index, from);
  const toNum = vs.resolveVersionRef(index, to);

  if (!fromNum) {
    console.error(chalk.red(`Version '${from}' not found.`));
    process.exit(1);
    return;
  }
  if (!toNum) {
    console.error(chalk.red(`Version '${to}' not found.`));
    process.exit(1);
    return;
  }

  const spinner = createSpinner(`Comparing v${fromNum} → v${toNum}`, !options.json);
  const [oldIR, newIR] = await Promise.all([
    loadVersionIR(storeRoot, fromNum),
    loadVersionIR(storeRoot, toNum),
  ]);
  spinner.stop();

  const diffReport = diffMod.diffIR(oldIR, newIR);

  if (options.breaking) {
    const breakingReport = breakingMod.classifyBreakingChanges(diffReport);
    if (options.json) {
      console.log(JSON.stringify({ diff: diffReport, breaking: breakingReport }, null, 2));
    } else {
      console.log(chalk.bold(`\nBreaking Change Analysis: v${fromNum} → v${toNum}\n`));
      console.log(tableLine('Compatible', String(breakingReport.summary.compatible)));
      console.log(tableLine('Deprecated', String(breakingReport.summary.deprecated)));
      console.log(tableLine('Breaking', String(breakingReport.summary.breaking)));
      if (breakingReport.summary.breaking > 0) {
        console.log('');
        for (const c of breakingReport.unacknowledged) {
          console.log(chalk.red(`  [${c.severity}] ${c.path}: ${c.description}`));
        }
      }
    }
    return;
  }

  if (options.sql) {
    const migration = diffMod.generateMigration(diffReport, oldIR, newIR);
    if (options.json) {
      console.log(JSON.stringify({ diff: diffReport, migration }, null, 2));
    } else {
      console.log(chalk.bold(`\nMigration: v${fromNum} → v${toNum}\n`));
      if (migration.sql.length > 0) {
        for (const stmt of migration.sql) {
          console.log(stmt);
        }
      } else {
        console.log(chalk.green('No schema changes detected.'));
      }
      if (migration.warnings.length > 0) {
        console.log('');
        for (const w of migration.warnings) {
          console.log(chalk.yellow(`⚠ ${w}`));
        }
      }
    }
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(diffReport, null, 2));
    return;
  }

  // Human-readable
  const s = diffReport.summary;
  console.log(chalk.bold(`\nDiff: v${fromNum} → v${toNum}`));
  if (!s.hasChanges) {
    console.log(chalk.green('No differences.'));
    return;
  }
  if (s.entitiesAdded + s.entitiesRemoved + s.entitiesChanged > 0)
    console.log(tableLine('Entities', `+${s.entitiesAdded} -${s.entitiesRemoved} ~${s.entitiesChanged}`));
  if (s.commandsAdded + s.commandsRemoved + s.commandsChanged > 0)
    console.log(tableLine('Commands', `+${s.commandsAdded} -${s.commandsRemoved} ~${s.commandsChanged}`));
  if (s.policiesAdded + s.policiesRemoved + s.policiesChanged > 0)
    console.log(tableLine('Policies', `+${s.policiesAdded} -${s.policiesRemoved} ~${s.policiesChanged}`));
  if (s.eventsAdded + s.eventsRemoved + s.eventsChanged > 0)
    console.log(tableLine('Events', `+${s.eventsAdded} -${s.eventsRemoved} ~${s.eventsChanged}`));
  if (s.storesAdded + s.storesRemoved + s.storesChanged > 0)
    console.log(tableLine('Stores', `+${s.storesAdded} -${s.storesRemoved} ~${s.storesChanged}`));
  if (s.modulesAdded + s.modulesRemoved > 0)
    console.log(tableLine('Modules', `+${s.modulesAdded} -${s.modulesRemoved}`));
}

// ============================================================================
// Subcommand: changelog
// ============================================================================

export interface VersionsChangelogOptions {
  store?: string;
  json?: boolean;
  output?: string;
}

export async function versionsChangelogCommand(
  from: string | undefined,
  to: string | undefined,
  options: VersionsChangelogOptions = {},
): Promise<void> {
  const vs = await loadVersionStore();

  const storeRoot = resolveStoreRoot(options.store);
  const index = await loadIndex(storeRoot);

  if (index.versions.length < 2) {
    console.log(chalk.yellow('Need at least 2 versions to generate a changelog.'));
    return;
  }

  const fromNum = vs.resolveVersionRef(index, from) ?? index.versions[index.versions.length - 2].versionNumber;
  const toNum = vs.resolveVersionRef(index, to) ?? index.currentVersionNumber;

  const fromMeta = index.versions.find(v => v.versionNumber === fromNum)!;
  const toMeta = index.versions.find(v => v.versionNumber === toNum)!;

  const spinner = createSpinner(`Generating changelog v${fromNum} → v${toNum}`, !options.json);
  const [oldIR, newIR] = await Promise.all([
    loadVersionIR(storeRoot, fromNum),
    loadVersionIR(storeRoot, toNum),
  ]);
  const entry = vs.generateChangelog(oldIR, newIR, fromMeta, toMeta);
  spinner.stop();

  if (options.json) {
    const output = JSON.stringify(entry, null, 2);
    if (options.output) {
      await fs.writeFile(options.output, output, 'utf-8');
      console.log(chalk.green(`Changelog written to ${options.output}`));
    } else {
      console.log(output);
    }
    return;
  }

  console.log(chalk.bold(`\nChangelog: v${fromNum} → v${toNum}\n`));

  const s = entry.diffReport.summary;
  console.log(chalk.bold('Summary'));
  console.log(tableLine('Changes', s.hasChanges ? 'Yes' : 'None'));
  console.log(tableLine('Breaking', String(entry.breakingReport.summary.breaking)));
  console.log(tableLine('Compatible', String(entry.breakingReport.summary.compatible)));
  console.log(tableLine('Deprecated', String(entry.breakingReport.summary.deprecated)));

  if (entry.migrationReport.summary.length > 0) {
    console.log('');
    console.log(chalk.bold('Changes'));
    for (const line of entry.migrationReport.summary) {
      console.log(`  ${line}`);
    }
  }

  if (entry.breakingReport.summary.breaking > 0) {
    console.log('');
    console.log(chalk.bold(chalk.red('Breaking Changes')));
    for (const c of entry.breakingReport.unacknowledged) {
      console.log(chalk.red(`  [${c.category}] ${c.path}: ${c.description}`));
    }
  }

  if (options.output) {
    await fs.writeFile(options.output, JSON.stringify(entry, null, 2), 'utf-8');
    console.log(chalk.gray(`\nFull changelog written to ${options.output}`));
  }
}

// ============================================================================
// Subcommand: tag
// ============================================================================

export interface VersionsTagOptions {
  store?: string;
}

export async function versionsTagCommand(
  version: string,
  tag: string,
  options: VersionsTagOptions = {},
): Promise<void> {
  const vs = await loadVersionStore();
  const storeRoot = resolveStoreRoot(options.store);
  const index = await loadIndex(storeRoot);
  const versionNum = vs.resolveVersionRef(index, version);

  if (!versionNum) {
    console.error(chalk.red(`Version '${version}' not found.`));
    process.exit(1);
    return;
  }

  const updated = vs.tagVersionInIndex(index, versionNum, tag);
  await saveIndex(storeRoot, updated);

  // Also update the meta.json file
  const metaPath = path.join(storeRoot, `v${versionNum}`, 'meta.json');
  const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8')) as IRVersionMeta;
  meta.tag = tag;
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

  console.log(chalk.green(`Tagged v${versionNum} as '${tag}'`));
}

// ============================================================================
// Subcommand: rollback
// ============================================================================

export interface VersionsRollbackOptions {
  store?: string;
  output?: string;
}

export async function versionsRollbackCommand(
  version: string,
  options: VersionsRollbackOptions = {},
): Promise<void> {
  const vs = await loadVersionStore();
  const storeRoot = resolveStoreRoot(options.store);
  const index = await loadIndex(storeRoot);
  const versionNum = vs.resolveVersionRef(index, version);

  if (!versionNum) {
    console.error(chalk.red(`Version '${version}' not found.`));
    process.exit(1);
    return;
  }

  const ir = await loadVersionIR(storeRoot, versionNum);

  if (options.output) {
    await fs.writeFile(options.output, JSON.stringify(ir, null, 2), 'utf-8');
    console.log(chalk.green(`Rolled back to v${versionNum} — IR written to ${options.output}`));
  } else {
    console.log(JSON.stringify(ir, null, 2));
  }
}

// ============================================================================
// Subcommand: verify
// ============================================================================

export interface VersionsVerifyOptions {
  store?: string;
  json?: boolean;
  all?: boolean;
}

export async function versionsVerifyCommand(
  version: string | undefined,
  options: VersionsVerifyOptions = {},
): Promise<void> {
  const vs = await loadVersionStore();
  const storeRoot = resolveStoreRoot(options.store);
  const index = await loadIndex(storeRoot);

  const versionsToCheck = options.all
    ? index.versions
    : version
      ? [index.versions.find(v => v.versionNumber === vs.resolveVersionRef(index, version))].filter(Boolean) as IRVersionMeta[]
      : [index.versions[index.versions.length - 1]].filter(Boolean) as IRVersionMeta[];

  if (versionsToCheck.length === 0) {
    console.log(chalk.yellow('No versions to verify.'));
    return;
  }

  const results: Array<{ versionNumber: number; tag?: string; valid: boolean; storedIrHash: string; computedIrHash: string }> = [];

  for (const meta of versionsToCheck) {
    const ir = await loadVersionIR(storeRoot, meta.versionNumber);
    const result = await vs.verifyIRIntegrity(ir, meta.irHash);
    results.push({ versionNumber: meta.versionNumber, tag: meta.tag, ...result });
  }

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  let allValid = true;
  for (const r of results) {
    const tagStr = r.tag ? ` [${r.tag}]` : '';
    if (r.valid) {
      console.log(chalk.green(`  v${r.versionNumber}${tagStr}: integrity OK`));
    } else {
      allValid = false;
      console.log(chalk.red(`  v${r.versionNumber}${tagStr}: TAMPERED`));
      console.log(chalk.red(`    stored:   ${r.storedIrHash}`));
      console.log(chalk.red(`    computed: ${r.computedIrHash}`));
    }
  }

  if (!allValid) {
    process.exit(1);
  }
}
