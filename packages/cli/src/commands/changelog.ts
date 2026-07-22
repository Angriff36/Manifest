/**
 * manifest changelog <from-ref> [to-ref]
 *
 * Generates a human-readable Markdown changelog from IR diffs between two
 * Git refs (tags, branches, SHAs). Compiles .manifest sources at each ref,
 * diffs the resulting IR, classifies changes, and emits Markdown formatted
 * for GitHub Releases and Keep a Changelog conventions.
 *
 * Usage:
 *   manifest changelog v1.0.0 v1.1.0
 *   manifest changelog v1.0.0              # compares to HEAD
 *   manifest changelog v1.0.0 --json       # structured JSON output
 *   manifest changelog v1.0.0 -o CHANGELOG.md
 */

import { execSync } from 'node:child_process';
import chalk from 'chalk';
import ora from 'ora';

// ============================================================================
// Lazy loaders (match vitest alias resolution pattern used by other commands)
// ============================================================================

async function loadCompiler() {
  return await import('@angriff36/manifest/ir-compiler');
}

async function loadDiff() {
  return await import('@angriff36/manifest/ir-diff');
}

async function loadBreaking() {
  return await import('@angriff36/manifest/breaking-change');
}

// ============================================================================
// Types
// ============================================================================

export interface ChangelogOptions {
  /** Glob pattern for .manifest sources (default: **\/*.manifest) */
  source?: string;
  /** Output file path (writes Markdown or JSON depending on --json) */
  output?: string;
  /** Emit structured JSON instead of Markdown */
  json?: boolean;
  /** Custom title for the changelog heading */
  title?: string;
  /** Preview -o write without touching the filesystem. */
  dryRun?: boolean;
}

interface ChangelogSection {
  heading: string;
  items: string[];
}

// ============================================================================
// Git helpers
// ============================================================================

function gitShowFile(ref: string, filePath: string): string | null {
  try {
    return execSync(`git show ${ref}:${filePath}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

function gitListFiles(ref: string, pattern: string): string[] {
  try {
    const output = execSync(`git ls-tree -r --name-only ${ref}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });
    const allFiles = output.trim().split('\n').filter(Boolean);
    // Match against the glob pattern (simple: ends with .manifest)
    const suffix = '.manifest';
    if (pattern === '**/*.manifest' || pattern === '*.manifest') {
      return allFiles.filter((f) => f.endsWith(suffix));
    }
    // For custom patterns, do a basic directory prefix match
    const prefix = pattern.replace(/\*\*\/\*\.manifest$/, '').replace(/\*\.manifest$/, '');
    return allFiles.filter((f) => f.endsWith(suffix) && f.startsWith(prefix));
  } catch {
    return [];
  }
}

function gitRefExists(ref: string): boolean {
  try {
    execSync(`git rev-parse --verify ${ref}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

function gitRefLabel(ref: string): string {
  try {
    // Try to get tag name or branch name
    const tag = execSync(`git describe --tags --exact-match ${ref}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (tag) return tag;
  } catch {
    // Not an exact tag — fall through
  }
  return ref;
}

// ============================================================================
// Compile manifest sources at a given Git ref
// ============================================================================

async function compileAtRef(
  ref: string,
  sourcePattern: string,
): Promise<{ ir: import('@angriff36/manifest/ir').IR | null; error?: string }> {
  const compiler = await loadCompiler();
  const files = gitListFiles(ref, sourcePattern);

  if (files.length === 0) {
    return { ir: null, error: `No .manifest files found at ref '${ref}'` };
  }

  // Compile each file and merge — for single-file projects this is straightforward.
  // For multi-file projects, compile each and take the last valid IR
  // (real multi-file merge would require the full compiler pipeline, but
  // the IR compiler handles each file independently).
  let lastIR: import('@angriff36/manifest/ir').IR | null = null;
  const allDiagnostics: Array<{ severity?: string; message?: string }> = [];

  for (const file of files) {
    const source = gitShowFile(ref, file);
    if (!source) continue;

    const result = await compiler.compileToIR(source, { sourcePath: file });
    if (result.ir) {
      lastIR = result.ir as import('@angriff36/manifest/ir').IR;
    }
    if (result.diagnostics) {
      allDiagnostics.push(...result.diagnostics);
    }
  }

  const errors = allDiagnostics.filter((d) => d.severity === 'error');
  if (!lastIR) {
    return {
      ir: null,
      error:
        errors.length > 0
          ? `Compilation failed at ref '${ref}': ${errors[0].message}`
          : `No valid IR produced at ref '${ref}'`,
    };
  }

  return { ir: lastIR };
}

// ============================================================================
// Markdown generation (Keep a Changelog + GitHub Releases format)
// ============================================================================

function generateMarkdown(
  fromRef: string,
  toRef: string,
  diffReport: import('@angriff36/manifest/ir-diff').IRDiffReport,
  breakingReport: import('@angriff36/manifest/breaking-change').BreakingChangeReport,
  title?: string,
): string {
  const date = new Date().toISOString().slice(0, 10);
  const fromLabel = gitRefLabel(fromRef);
  const toLabel = gitRefLabel(toRef);

  const heading = title ?? `${toLabel}`;
  const lines: string[] = [];

  lines.push(`## ${heading} — ${date}`);
  lines.push('');
  lines.push(`Comparing \`${fromLabel}\` → \`${toLabel}\``);
  lines.push('');

  if (!diffReport.summary.hasChanges) {
    lines.push('No changes detected.');
    return lines.join('\n');
  }

  const sections: ChangelogSection[] = [];

  // --- Breaking Changes ---
  if (breakingReport.summary.breaking > 0) {
    const items: string[] = [];
    for (const change of breakingReport.classified.filter((c) => c.severity === 'breaking')) {
      const impact =
        change.consumerImpact.length > 0 ? ` (impacts: ${change.consumerImpact.join(', ')})` : '';
      items.push(`**BREAKING**: ${change.description} — \`${change.path}\`${impact}`);
    }
    sections.push({ heading: 'Breaking Changes', items });
  }

  // --- Added ---
  const added: string[] = [];

  // New entities
  for (const entity of diffReport.entities.filter((e) => e.change === 'added')) {
    added.push(`New entity \`${entity.name}\``);
  }

  // New commands
  for (const cmd of diffReport.commands.filter((c) => c.change === 'added')) {
    const entityNote = cmd.details?.entity?.to ? ` on \`${cmd.details.entity.to}\`` : '';
    added.push(`New command \`${cmd.name}\`${entityNote}`);
  }

  // New policies
  for (const pol of diffReport.policies.filter((p) => p.change === 'added')) {
    added.push(`New policy \`${pol.name}\``);
  }

  // New events
  for (const evt of diffReport.events.filter((e) => e.change === 'added')) {
    added.push(`New event \`${evt.name}\``);
  }

  // New stores
  for (const store of diffReport.stores.filter((s) => s.change === 'added')) {
    added.push(`New store for \`${store.entity}\``);
  }

  // New properties on existing entities
  for (const entity of diffReport.entities.filter((e) => e.change === 'changed')) {
    for (const prop of entity.properties.filter((p) => p.change === 'added')) {
      added.push(`New property \`${entity.name}.${prop.name}\``);
    }
    for (const cp of entity.computedProperties.filter((c) => c.change === 'added')) {
      added.push(`New computed property \`${entity.name}.${cp.name}\``);
    }
    for (const rel of entity.relationships.filter((r) => r.change === 'added')) {
      added.push(`New relationship \`${entity.name}.${rel.name}\``);
    }
    for (const con of entity.constraints.filter((c) => c.change === 'added')) {
      added.push(`New constraint \`${entity.name}.${con.name}\``);
    }
  }

  if (added.length > 0) {
    sections.push({ heading: 'Added', items: added });
  }

  // --- Changed ---
  const changed: string[] = [];

  for (const entity of diffReport.entities.filter((e) => e.change === 'changed')) {
    for (const prop of entity.properties.filter((p) => p.change === 'changed')) {
      const details: string[] = [];
      if (prop.details?.type) {
        details.push(`type: \`${prop.details.type.from}\` → \`${prop.details.type.to}\``);
      }
      if (prop.details?.modifiers) {
        details.push(
          `modifiers: [${prop.details.modifiers.from.join(', ')}] → [${prop.details.modifiers.to.join(', ')}]`,
        );
      }
      const detailStr = details.length > 0 ? ` (${details.join('; ')})` : '';
      changed.push(`Modified property \`${entity.name}.${prop.name}\`${detailStr}`);
    }
    for (const cp of entity.computedProperties.filter((c) => c.change === 'changed')) {
      changed.push(`Modified computed property \`${entity.name}.${cp.name}\``);
    }
    for (const rel of entity.relationships.filter((r) => r.change === 'changed')) {
      const kindDetail = rel.details?.kind
        ? ` (kind: \`${rel.details.kind.from}\` → \`${rel.details.kind.to}\`)`
        : '';
      changed.push(`Modified relationship \`${entity.name}.${rel.name}\`${kindDetail}`);
    }
    for (const con of entity.constraints.filter((c) => c.change === 'changed')) {
      changed.push(`Modified constraint \`${entity.name}.${con.name}\``);
    }
  }

  for (const cmd of diffReport.commands.filter((c) => c.change === 'changed')) {
    changed.push(`Modified command \`${cmd.name}\``);
  }

  for (const pol of diffReport.policies.filter((p) => p.change === 'changed')) {
    changed.push(`Modified policy \`${pol.name}\``);
  }

  for (const evt of diffReport.events.filter((e) => e.change === 'changed')) {
    changed.push(`Modified event \`${evt.name}\``);
  }

  if (changed.length > 0) {
    sections.push({ heading: 'Changed', items: changed });
  }

  // --- Deprecated ---
  if (breakingReport.summary.deprecated > 0) {
    const items: string[] = [];
    for (const change of breakingReport.classified.filter((c) => c.severity === 'deprecated')) {
      items.push(`${change.description} — \`${change.path}\``);
    }
    sections.push({ heading: 'Deprecated', items });
  }

  // --- Removed ---
  const removed: string[] = [];

  for (const entity of diffReport.entities.filter((e) => e.change === 'removed')) {
    removed.push(`Removed entity \`${entity.name}\``);
  }

  for (const cmd of diffReport.commands.filter((c) => c.change === 'removed')) {
    removed.push(`Removed command \`${cmd.name}\``);
  }

  for (const pol of diffReport.policies.filter((p) => p.change === 'removed')) {
    removed.push(`Removed policy \`${pol.name}\``);
  }

  for (const evt of diffReport.events.filter((e) => e.change === 'removed')) {
    removed.push(`Removed event \`${evt.name}\``);
  }

  for (const store of diffReport.stores.filter((s) => s.change === 'removed')) {
    removed.push(`Removed store for \`${store.entity}\``);
  }

  // Removed properties on existing entities
  for (const entity of diffReport.entities.filter((e) => e.change === 'changed')) {
    for (const prop of entity.properties.filter((p) => p.change === 'removed')) {
      removed.push(`Removed property \`${entity.name}.${prop.name}\``);
    }
    for (const cp of entity.computedProperties.filter((c) => c.change === 'removed')) {
      removed.push(`Removed computed property \`${entity.name}.${cp.name}\``);
    }
    for (const rel of entity.relationships.filter((r) => r.change === 'removed')) {
      removed.push(`Removed relationship \`${entity.name}.${rel.name}\``);
    }
  }

  if (removed.length > 0) {
    sections.push({ heading: 'Removed', items: removed });
  }

  // --- Render sections ---
  for (const section of sections) {
    lines.push(`### ${section.heading}`);
    lines.push('');
    for (const item of section.items) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

// ============================================================================
// Command handler
// ============================================================================

export async function changelogCommand(
  fromRef: string,
  toRef: string,
  options: ChangelogOptions = {},
): Promise<void> {
  const sourcePattern = options.source ?? '**/*.manifest';
  const spinner = ora(`Generating changelog ${fromRef} → ${toRef}`).start();

  try {
    // Validate refs
    if (!gitRefExists(fromRef)) {
      spinner.fail(`Git ref not found: ${fromRef}`);
      process.exit(1);
      return;
    }
    if (!gitRefExists(toRef)) {
      spinner.fail(`Git ref not found: ${toRef}`);
      process.exit(1);
      return;
    }

    // Compile at each ref
    spinner.text = `Compiling .manifest files at ${fromRef}`;
    const oldResult = await compileAtRef(fromRef, sourcePattern);
    if (!oldResult.ir) {
      spinner.fail(oldResult.error ?? `Failed to compile at ${fromRef}`);
      process.exit(1);
      return;
    }

    spinner.text = `Compiling .manifest files at ${toRef}`;
    const newResult = await compileAtRef(toRef, sourcePattern);
    if (!newResult.ir) {
      spinner.fail(newResult.error ?? `Failed to compile at ${toRef}`);
      process.exit(1);
      return;
    }

    // Diff
    spinner.text = 'Analyzing IR differences';
    const diffMod = await loadDiff();
    const breakingMod = await loadBreaking();

    const diffReport = diffMod.diffIR(oldResult.ir, newResult.ir);
    const breakingReport = breakingMod.classifyBreakingChanges(diffReport);

    spinner.stop();

    // JSON output
    if (options.json) {
      const jsonOutput = JSON.stringify(
        {
          fromRef,
          toRef,
          date: new Date().toISOString().slice(0, 10),
          diff: diffReport,
          breaking: breakingReport,
        },
        null,
        2,
      );

      if (options.output) {
        const { writeTextFile } = await import('../utils/dry-run-fs.js');
        await writeTextFile(options.output, jsonOutput, { dryRun: options.dryRun });
        if (!options.dryRun) {
          console.log(chalk.green(`Changelog JSON written to ${options.output}`));
        }
      } else {
        console.log(jsonOutput);
      }
      return;
    }

    // Markdown output
    const markdown = generateMarkdown(fromRef, toRef, diffReport, breakingReport, options.title);

    if (options.output) {
      const { writeTextFile } = await import('../utils/dry-run-fs.js');
      await writeTextFile(options.output, markdown, { dryRun: options.dryRun });
      if (!options.dryRun) {
        console.log(chalk.green(`Changelog written to ${options.output}`));
      }
    } else {
      console.log(markdown);
    }
  } catch (error) {
    spinner.fail(
      `Changelog generation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}
