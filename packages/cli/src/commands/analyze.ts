/**
 * manifest analyze command
 *
 * Analyzes generated projection code bundle sizes per entity, command,
 * and store adapter. Runs the projection generator to produce artifacts
 * and reports their sizes (raw + minified estimate). Flags IR definitions
 * that result in disproportionately large generated output.
 *
 * The minified size is an approximation: comments and excess whitespace
 * are stripped. It is not a full production build (no tree-shaking or
 * minification by a real bundler) but it gives a useful relative metric
 * for comparing IR entities against each other.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import chalk from 'chalk';
import ora from 'ora';
import type { IR, IREntity, IRStore } from '@angriff36/manifest/ir';
import {
  getProjection,
  listProjections,
  type ProjectionTarget,
  type ProjectionArtifact,
} from '@angriff36/manifest/projections';

// ---------- Public types ----------

export type AnalyzeFormat = 'text' | 'json';

export interface AnalyzeOptions {
  /** Source file (.manifest or .ir.json) or directory */
  source?: string;
  /** Projection to analyze (default: nextjs) */
  projection?: string;
  /** Output format */
  format?: AnalyzeFormat;
  /** Size threshold in bytes to flag an entity/command as "large" (default: 10240 = 10KB) */
  flagThreshold?: number;
  /** Emit structured JSON to stdout */
  json?: boolean;
}

export interface ArtifactSize {
  /** Artifact id from the projection */
  id: string;
  /** Suggested file path */
  pathHint?: string;
  /** Entity this artifact maps to, if any */
  entity?: string;
  /** Command this artifact maps to, if any */
  command?: string;
  /** Raw byte size of generated code */
  rawSize: number;
  /** Estimated minified size (whitespace + comments stripped) */
  minifiedSize: number;
  /** Number of lines in raw output */
  lineCount: number;
  /** Whether this artifact exceeds the flag threshold */
  flagged: boolean;
}

export interface EntityReport {
  name: string;
  totalRawSize: number;
  totalMinifiedSize: number;
  artifactCount: number;
  commandCount: number;
  propertyCount: number;
  flagged: boolean;
  artifacts: ArtifactSize[];
}

export interface CommandReport {
  name: string;
  entity: string;
  totalRawSize: number;
  totalMinifiedSize: number;
  artifactCount: number;
  guardCount: number;
  mutationCount: number;
  flagged: boolean;
  artifacts: ArtifactSize[];
}

export interface StoreReport {
  entity: string;
  target: string;
  totalRawSize: number;
  totalMinifiedSize: number;
  artifactCount: number;
  flagged: boolean;
  artifacts: ArtifactSize[];
}

export interface AnalyzeReport {
  projection: string;
  source: string;
  totalRawSize: number;
  totalMinifiedSize: number;
  entityCount: number;
  commandCount: number;
  storeCount: number;
  flaggedCount: number;
  entities: EntityReport[];
  commands: CommandReport[];
  stores: StoreReport[];
  globalArtifacts: ArtifactSize[];
  flags: Array<{
    type: 'entity' | 'command' | 'store';
    name: string;
    rawSize: number;
    threshold: number;
  }>;
}

export type AnalyzeResult = AnalyzeReport;

// ---------- Constants ----------

const DEFAULT_FLAG_THRESHOLD = 10240; // 10KB

// ---------- IR loader ----------

async function loadIR(source: string | undefined): Promise<IR> {
  if (!source) {
    throw new Error('No source specified. Provide a .manifest or .ir.json file.');
  }

  const resolved = path.resolve(process.cwd(), source);
  const stat = await fs.stat(resolved).catch(() => null);
  if (!stat) {
    throw new Error(`Source not found: ${source}`);
  }

  if (stat.isFile()) {
    if (resolved.endsWith('.ir.json')) {
      const content = await fs.readFile(resolved, 'utf-8');
      return JSON.parse(content) as IR;
    }
    // Treat as .manifest source — compile to IR.
    const { compileToIR } = await import('@angriff36/manifest/ir-compiler');
    const fileContent = await fs.readFile(resolved, 'utf-8');
    const result = await compileToIR(fileContent, { sourcePath: resolved });
    if (!result.ir) {
      const errors = (result.diagnostics || [])
        .filter((d) => d.severity === 'error')
        .map((d) => d.message)
        .join('; ');
      throw new Error(`Compilation failed: ${errors || 'unknown error'}`);
    }
    return result.ir;
  }

  // Directory: find an .ir.json inside
  const irFiles = await glob('**/*.ir.json', { cwd: resolved });
  if (irFiles.length === 0) {
    throw new Error(`No .ir.json files found in directory: ${source}`);
  }
  const first = path.join(resolved, irFiles[0]!);
  const content = await fs.readFile(first, 'utf-8');
  return JSON.parse(content) as IR;
}

// ---------- Minification proxy ----------

/**
 * Estimate minified size by stripping comments and collapsing whitespace.
 * This is NOT a real minifier (no tree-shaking, no mangling) but gives a
 * useful approximation of what a production bundle would look like.
 */
function estimateMinifiedSize(code: string): number {
  // Remove single-line comments (but not inside strings — simple heuristic)
  // Remove multi-line comments
  let minified = code.replace(/\/\*[\s\S]*?\*\//g, '');
  minified = minified.replace(/(^|[^:])\/\/.*$/gm, '$1');
  // Collapse multiple whitespace to single space
  minified = minified.replace(/\s+/g, ' ');
  // Remove leading/trailing whitespace on lines
  minified = minified.replace(/^\s+|\s+$/gm, '');
  // Remove empty lines
  minified = minified.replace(/\n\s*\n/g, '\n');
  return Buffer.byteLength(minified.trim(), 'utf-8');
}

// ---------- Size measurement ----------

function measureArtifact(artifact: ProjectionArtifact, threshold: number): ArtifactSize {
  const rawSize = Buffer.byteLength(artifact.code, 'utf-8');
  const minifiedSize = estimateMinifiedSize(artifact.code);
  const lineCount = artifact.code.split('\n').length;

  // Try to extract entity name from id or pathHint
  const entity = extractEntityFromArtifact(artifact);
  const command = extractCommandFromArtifact(artifact);

  return {
    id: artifact.id,
    pathHint: artifact.pathHint,
    entity,
    command,
    rawSize,
    minifiedSize,
    lineCount,
    flagged: rawSize > threshold,
  };
}

function extractEntityFromArtifact(artifact: ProjectionArtifact): string | undefined {
  // Try id first (usually contains entity name)
  if (artifact.id) {
    const fromId = tryExtractEntity(artifact.id);
    if (fromId) return fromId;
  }
  // Fall back to pathHint
  if (artifact.pathHint) {
    const fromPath = tryExtractEntity(artifact.pathHint);
    if (fromPath) return fromPath;
  }
  return undefined;
}

function tryExtractEntity(text: string): string | undefined {
  // Common patterns: "nextjs.route:Recipe", "Recipe-route", "app/api/recipes/route.ts"
  const patterns = [
    /nextjs\.\w+:(\w+)/,
    /(\w+)-route/,
    /api\/(\w+)\//,
    /\/(\w+)\/route\.\w+$/,
    /(\w+)\.types/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return undefined;
}

function extractCommandFromArtifact(artifact: ProjectionArtifact): string | undefined {
  if (artifact.id) {
    // Patterns like "nextjs.command:Recipe.create" or "Recipe.create"
    const match = artifact.id.match(/(?:nextjs\.command[:.])(.+)/);
    if (match && match[1]) return match[1];
    // Also try pathHint
    if (artifact.pathHint) {
      const pathMatch = artifact.pathHint.match(/commands\/(\w+)\//);
      if (pathMatch && pathMatch[1]) return pathMatch[1];
    }
  }
  return undefined;
}

// ---------- Artifact generation ----------

interface GeneratedArtifacts {
  all: ProjectionArtifact[];
  /** Artifacts grouped by entity name */
  byEntity: Map<string, ProjectionArtifact[]>;
  /** Artifacts that are global (not entity-scoped) */
  global: ProjectionArtifact[];
}

/**
 * Generate artifacts for all entities and commands in the IR.
 * Iterates over entity-scoped and command-scoped surfaces to produce
 * per-entity artifacts that can be measured.
 */
function generateArtifacts(ir: IR, projection: ProjectionTarget): GeneratedArtifacts {
  const all: ProjectionArtifact[] = [];
  const byEntity = new Map<string, ProjectionArtifact[]>();
  const global: ProjectionArtifact[] = [];

  // Determine which entity-scoped surfaces this projection supports
  const entitySurfaces = projection.surfaces.filter(
    (s) =>
      s.startsWith('nextjs.') ||
      s.endsWith('.entity') ||
      s.endsWith('.route') ||
      s.endsWith('.detail'),
  );

  // Generate per-entity artifacts
  for (const entity of ir.entities) {
    const entityArtifacts: ProjectionArtifact[] = [];

    for (const surface of entitySurfaces) {
      try {
        const result = projection.generate(ir, { surface, entity: entity.name });
        entityArtifacts.push(...result.artifacts);
      } catch {
        // Surface may not support this entity — skip silently
      }
    }

    byEntity.set(entity.name, entityArtifacts);
    all.push(...entityArtifacts);
  }

  // Generate global artifacts (types, client, dispatcher, etc.)
  const globalSurfaces = projection.surfaces.filter(
    (s) => !entitySurfaces.includes(s) && !s.endsWith('.command'),
  );

  for (const surface of globalSurfaces) {
    try {
      const result = projection.generate(ir, { surface });
      global.push(...result.artifacts);
      all.push(...result.artifacts);
    } catch {
      // Surface may not be applicable — skip
    }
  }

  return { all, byEntity, global };
}

// ---------- Report builders ----------

function buildEntityReports(
  ir: IR,
  artifacts: GeneratedArtifacts,
  threshold: number,
): EntityReport[] {
  return ir.entities.map((entity: IREntity) => {
    const entityArtifacts = artifacts.byEntity.get(entity.name) || [];
    const measured = entityArtifacts.map((a) => measureArtifact(a, threshold));

    // Also look in global artifacts for entity-specific pieces
    const globalForEntity = artifacts.global.filter(
      (a) => extractEntityFromArtifact(a) === entity.name,
    );
    const measuredGlobal = globalForEntity.map((a) => measureArtifact(a, threshold));
    const allMeasured = [...measured, ...measuredGlobal];

    const totalRawSize = allMeasured.reduce((sum, a) => sum + a.rawSize, 0);
    const totalMinifiedSize = allMeasured.reduce((sum, a) => sum + a.minifiedSize, 0);
    const commandCount = entity.commands?.length ?? 0;

    return {
      name: entity.name,
      totalRawSize,
      totalMinifiedSize,
      artifactCount: allMeasured.length,
      commandCount,
      propertyCount: entity.properties?.length ?? 0,
      flagged: totalRawSize > threshold,
      artifacts: allMeasured,
    };
  });
}

function buildCommandReports(
  ir: IR,
  artifacts: GeneratedArtifacts,
  threshold: number,
): CommandReport[] {
  const reports: CommandReport[] = [];

  // Find command artifacts in global set (nextjs.command surface artifacts)
  for (const command of ir.commands) {
    const commandName = command.name;
    const entityName = command.entity ?? '';

    // Look for command-specific artifacts
    const commandArtifacts = artifacts.all.filter(
      (a) => extractCommandFromArtifact(a) === commandName,
    );
    const measured = commandArtifacts.map((a) => measureArtifact(a, threshold));

    const totalRawSize = measured.reduce((sum, a) => sum + a.rawSize, 0);
    const totalMinifiedSize = measured.reduce((sum, a) => sum + a.minifiedSize, 0);
    const guardCount = command.guards?.length ?? 0;
    const mutationCount = command.actions?.length ?? 0;

    reports.push({
      name: commandName,
      entity: entityName,
      totalRawSize,
      totalMinifiedSize,
      artifactCount: measured.length,
      guardCount,
      mutationCount,
      flagged: totalRawSize > threshold,
      artifacts: measured,
    });
  }

  return reports;
}

function buildStoreReports(
  ir: IR,
  artifacts: GeneratedArtifacts,
  threshold: number,
): StoreReport[] {
  return ir.stores.map((store: IRStore) => {
    const entityName = store.entity;
    const target = store.target;

    // For store adapters, we estimate size from entity-scoped artifacts
    // that reference this store's target
    const storeArtifacts = artifacts.byEntity.get(entityName) || [];
    const measured = storeArtifacts.map((a) => measureArtifact(a, threshold));

    const totalRawSize = measured.reduce((sum, a) => sum + a.rawSize, 0);
    const totalMinifiedSize = measured.reduce((sum, a) => sum + a.minifiedSize, 0);

    return {
      entity: entityName,
      target,
      totalRawSize,
      totalMinifiedSize,
      artifactCount: measured.length,
      flagged: totalRawSize > threshold,
      artifacts: measured,
    };
  });
}

// ---------- Formatting ----------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

function formatTextReport(report: AnalyzeReport): string {
  const lines: string[] = [];

  lines.push(chalk.bold('\nBundle Size Analysis'));
  lines.push(chalk.gray('─'.repeat(60)));
  lines.push(`  Projection:  ${report.projection}`);
  lines.push(`  Source:      ${report.source}`);
  lines.push(`  Threshold:   ${formatBytes(10240)}`);
  lines.push('');

  // Summary
  lines.push(chalk.bold('Summary:'));
  lines.push(`  Entities:    ${report.entityCount}`);
  lines.push(`  Commands:    ${report.commandCount}`);
  lines.push(`  Stores:      ${report.storeCount}`);
  lines.push(`  Total raw:   ${formatBytes(report.totalRawSize)}`);
  lines.push(`  Minified:    ${formatBytes(report.totalMinifiedSize)}`);
  lines.push(`  Flagged:     ${report.flaggedCount > 0 ? chalk.yellow(report.flaggedCount) : '0'}`);
  lines.push('');

  // Per-entity breakdown
  if (report.entities.length > 0) {
    lines.push(chalk.bold('Per-Entity:'));
    const entityHeader = `  ${'Name'.padEnd(24)} ${'Raw'.padStart(10)} ${'Minified'.padStart(10)} ${'Cmds'.padStart(6)} ${'Props'.padStart(6)} ${'Flag'.padStart(6)}`;
    lines.push(chalk.gray(entityHeader));
    lines.push(chalk.gray(`  ${'─'.repeat(64)}`));
    for (const entity of report.entities) {
      const flag = entity.flagged ? chalk.yellow('  YES') : '   -';
      const name = entity.name.padEnd(24);
      lines.push(
        `  ${name} ${formatBytes(entity.totalRawSize).padStart(10)} ${formatBytes(entity.totalMinifiedSize).padStart(10)} ${String(entity.commandCount).padStart(6)} ${String(entity.propertyCount).padStart(6)}${flag}`,
      );
    }
    lines.push('');
  }

  // Per-store-adapter breakdown
  if (report.stores.length > 0) {
    lines.push(chalk.bold('Per-Store-Adapter:'));
    const storeHeader = `  ${'Entity'.padEnd(24)} ${'Target'.padStart(16)} ${'Raw'.padStart(10)} ${'Minified'.padStart(10)} ${'Flag'.padStart(6)}`;
    lines.push(chalk.gray(storeHeader));
    lines.push(chalk.gray(`  ${'─'.repeat(68)}`));
    for (const store of report.stores) {
      const flag = store.flagged ? chalk.yellow('  YES') : '   -';
      const entity = store.entity.padEnd(24);
      lines.push(
        `  ${entity} ${store.target.padStart(16)} ${formatBytes(store.totalRawSize).padStart(10)} ${formatBytes(store.totalMinifiedSize).padStart(10)}${flag}`,
      );
    }
    lines.push('');
  }

  // Flags
  if (report.flags.length > 0) {
    lines.push(chalk.bold('Flags (large generated output):'));
    for (const flag of report.flags) {
      lines.push(
        `  ${chalk.yellow('!')} ${flag.type}: ${flag.name} — ${formatBytes(flag.rawSize)} (threshold: ${formatBytes(flag.threshold)})`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------- Main command ----------

export async function analyzeCommand(options: AnalyzeOptions = {}): Promise<AnalyzeResult> {
  const spinner = ora('Loading IR').start();
  const projectionName = options.projection || 'nextjs';
  const threshold = options.flagThreshold ?? DEFAULT_FLAG_THRESHOLD;

  try {
    if (!options.source) {
      throw new Error('No source specified. Provide a .manifest or .ir.json file.');
    }

    const ir = await loadIR(options.source);
    spinner.text = `Generating artifacts with "${projectionName}" projection`;

    const projection = getProjection(projectionName);
    if (!projection) {
      const available = listProjections()
        .map((p) => p.name)
        .join(', ');
      throw new Error(`Unknown projection "${projectionName}". Available: ${available}`);
    }

    const artifacts = generateArtifacts(ir, projection);

    if (artifacts.all.length === 0) {
      spinner.warn('No artifacts generated — check projection surfaces and IR entities');
      const emptyReport: AnalyzeReport = {
        projection: projectionName,
        source: options.source,
        totalRawSize: 0,
        totalMinifiedSize: 0,
        entityCount: ir.entities.length,
        commandCount: ir.commands.length,
        storeCount: ir.stores.length,
        flaggedCount: 0,
        entities: [],
        commands: [],
        stores: [],
        globalArtifacts: [],
        flags: [],
      };
      if (options.json) {
        console.log(JSON.stringify(emptyReport, null, 2));
      }
      return emptyReport;
    }

    spinner.text = 'Measuring artifact sizes';

    const entityReports = buildEntityReports(ir, artifacts, threshold);
    const commandReports = buildCommandReports(ir, artifacts, threshold);
    const storeReports = buildStoreReports(ir, artifacts, threshold);
    const globalMeasured = artifacts.global.map((a) => measureArtifact(a, threshold));

    // Collect flags
    const flags: AnalyzeReport['flags'] = [];
    for (const entity of entityReports) {
      if (entity.flagged) {
        flags.push({ type: 'entity', name: entity.name, rawSize: entity.totalRawSize, threshold });
      }
    }
    for (const cmd of commandReports) {
      if (cmd.flagged) {
        flags.push({ type: 'command', name: cmd.name, rawSize: cmd.totalRawSize, threshold });
      }
    }
    for (const store of storeReports) {
      if (store.flagged) {
        flags.push({
          type: 'store',
          name: `${store.entity} (${store.target})`,
          rawSize: store.totalRawSize,
          threshold,
        });
      }
    }

    const totalRawSize =
      entityReports.reduce((s, e) => s + e.totalRawSize, 0) +
      globalMeasured.reduce((s, a) => s + a.rawSize, 0);
    const totalMinifiedSize =
      entityReports.reduce((s, e) => s + e.totalMinifiedSize, 0) +
      globalMeasured.reduce((s, a) => s + a.minifiedSize, 0);

    const report: AnalyzeReport = {
      projection: projectionName,
      source: options.source,
      totalRawSize,
      totalMinifiedSize,
      entityCount: ir.entities.length,
      commandCount: ir.commands.length,
      storeCount: ir.stores.length,
      flaggedCount: flags.length,
      entities: entityReports,
      commands: commandReports,
      stores: storeReports,
      globalArtifacts: globalMeasured,
      flags,
    };

    spinner.succeed(
      `Analyzed ${report.entityCount} entities, ${report.commandCount} commands, ${report.storeCount} stores → ${formatBytes(report.totalRawSize)} total`,
    );

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatTextReport(report));
    }

    return report;
  } catch (error: unknown) {
    spinner.fail(`Analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
