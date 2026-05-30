/**
 * manifest diagram command
 *
 * Generates Mermaid diagrams from Manifest IR:
 *   - ER diagrams (entity-relationship)
 *   - State machine diagrams (from entity transitions)
 *   - Sequence diagrams (from command execution flows)
 *
 * Accepts .manifest source files or precompiled .ir.json files.
 * Outputs .mmd files (or optionally markdown-wrapped code blocks).
 */

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import chalk from 'chalk';
import ora from 'ora';

// Import from the main Manifest package
async function loadCompiler() {
  const module = await import('@angriff36/manifest/ir-compiler');
  return { compileToIR: module.compileToIR };
}

async function loadMermaidProjection() {
  const module = await import('@angriff36/manifest/projections/mermaid');
  return { MermaidProjection: module.MermaidProjection };
}

// ─── Minimal IR type stubs ──────────────────────────────────────────────

interface IR {
  version: string;
  provenance: {
    contentHash: string;
    compilerVersion: string;
    schemaVersion: string;
    compiledAt: string;
  };
  modules: Array<{ name: string; entities: string[] }>;
  values?: unknown[];
  entities: unknown[];
  enums?: unknown[];
  stores: unknown[];
  events: unknown[];
  commands: unknown[];
  policies: unknown[];
}

export interface DiagramOptions {
  output?: string;
  type?: 'er' | 'state' | 'sequence' | 'all';
  entity?: string;
  markdown?: boolean;
}

/**
 * Load IR from a file (either .manifest source or .ir.json).
 */
async function loadIR(filePath: string): Promise<IR> {
  const resolved = path.resolve(process.cwd(), filePath);
  const content = await fs.readFile(resolved, 'utf-8');

  if (filePath.endsWith('.manifest')) {
    const { compileToIR } = await loadCompiler();
    const result = await compileToIR(content, { sourcePath: resolved });
    if (!result.ir) {
      const errors = (result.diagnostics || [])
        .filter((d: { severity?: string }) => d.severity === 'error')
        .map((d: { message?: string }) => d.message)
        .join('\n');
      throw new Error(`Compilation failed:\n${errors}`);
    }
    return result.ir as IR;
  }

  return JSON.parse(content) as IR;
}

/**
 * Get all input files (manifest or IR).
 */
async function getInputFiles(source: string): Promise<string[]> {
  const resolved = path.resolve(process.cwd(), source);
  const stat = await fs.stat(resolved).catch(() => null);

  if (!stat) {
    throw new Error(`Source not found: ${source}`);
  }

  if (stat.isFile()) {
    return [resolved];
  }

  // Directory: find both .manifest and .ir.json files
  const manifestFiles = await glob('**/*.manifest', { cwd: resolved });
  const irFiles = await glob('**/*.ir.json', { cwd: resolved });
  const all = [...manifestFiles, ...irFiles];
  return all.map(f => path.join(resolved, f));
}

/**
 * Map diagram type to Mermaid projection surface name.
 */
function typeToSurface(type: string): string {
  switch (type) {
    case 'er': return 'mermaid.er';
    case 'state': return 'mermaid.state';
    case 'sequence': return 'mermaid.sequence';
    case 'all': return 'mermaid.all';
    default: return 'mermaid.all';
  }
}

/**
 * Generate Mermaid diagrams from IR or .manifest source files.
 */
export async function diagramCommand(
  source: string | undefined,
  options: DiagramOptions = {}
): Promise<void> {
  const spinner = ora('Preparing to generate diagrams').start();
  const diagramType = options.type || 'all';
  const outputDir = path.resolve(process.cwd(), options.output || 'diagrams');

  try {
    if (!source) {
      spinner.fail('Source argument is required (path to .manifest file, .ir.json file, or directory)');
      process.exitCode = 1;
      return;
    }

    // Collect all IRs
    const files = await getInputFiles(source);
    if (files.length === 0) {
      spinner.warn('No .manifest or .ir.json files found');
      return;
    }

    spinner.text = `Loading ${files.length} file(s)...`;

    // Merge all IRs into one
    const mergedIR: IR = {
      version: '1.0',
      provenance: {
        contentHash: '',
        compilerVersion: '',
        schemaVersion: '',
        compiledAt: new Date().toISOString(),
      },
      modules: [],
      values: [],
      entities: [],
      enums: [],
      stores: [],
      events: [],
      commands: [],
      policies: [],
    };

    for (const file of files) {
      const ir = await loadIR(file);
      if (!mergedIR.provenance.compilerVersion) {
        mergedIR.provenance = ir.provenance;
      }
      mergedIR.modules.push(...ir.modules);
      (mergedIR.entities as unknown[]).push(...ir.entities);
      (mergedIR.stores as unknown[]).push(...ir.stores);
      (mergedIR.events as unknown[]).push(...ir.events);
      (mergedIR.commands as unknown[]).push(...ir.commands);
      (mergedIR.policies as unknown[]).push(...ir.policies);
    }

    // Create output directory
    await fs.mkdir(outputDir, { recursive: true });

    // Load and invoke the Mermaid projection
    spinner.text = 'Generating diagrams...';
    const { MermaidProjection } = await loadMermaidProjection();
    const projection = new MermaidProjection();

    const surface = typeToSurface(diagramType);
    const result = projection.generate(mergedIR as never, {
      surface,
      entity: options.entity,
      options: {
        markdown: options.markdown ?? false,
        includeProperties: true,
        entity: options.entity,
      },
    });

    // Show diagnostics
    for (const d of result.diagnostics) {
      if (d.severity === 'error') {
        console.error(chalk.red(`  Error: ${d.message}`));
      } else if (d.severity === 'warning') {
        console.warn(chalk.yellow(`  Warning: ${d.message}`));
      } else {
        console.log(chalk.gray(`  Info: ${d.message}`));
      }
    }

    // Write artifacts
    let artifactCount = 0;
    for (const artifact of result.artifacts) {
      if (!artifact.pathHint) continue;

      const outputPath = path.resolve(outputDir, path.basename(artifact.pathHint));
      await fs.writeFile(outputPath, artifact.code, 'utf-8');
      console.log(chalk.gray(`  -> ${path.relative(process.cwd(), outputPath)}`));
      artifactCount++;
    }

    if (artifactCount === 0) {
      spinner.warn('No diagrams generated (check diagnostics above)');
    } else {
      spinner.succeed(
        `Generated ${artifactCount} diagram(s) -> ${chalk.cyan(path.relative(process.cwd(), outputDir))}`
      );
    }
  } catch (error: unknown) {
    spinner.fail(`Diagram generation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
