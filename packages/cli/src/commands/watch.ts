/**
 * manifest watch command
 *
 * Monitors .manifest files for changes and performs incremental
 * re-compilation, re-projection, and emits structured change events
 * for downstream build tools.
 *
 * Uses Node.js fs.watch (recursive mode) to minimize rebuild time.
 */

import fs from 'fs/promises';
import { watch as fsWatch, watchFile, type FSWatcher } from 'fs';
import path from 'path';
import { glob } from 'glob';
import chalk from 'chalk';
import ora from 'ora';
import { compileCommand } from './compile.js';
import { generateCommand } from './generate.js';

export interface WatchOptions {
  projection: string;
  surface: string;
  irOutput: string;
  codeOutput: string;
  glob?: string;
  auth: string;
  database: string;
  runtime: string;
  response: string;
  debounce: number;
  /** Emit structured JSON events to stdout for downstream tooling. */
  events: boolean;
  /** Clear terminal on each rebuild. */
  clear: boolean;
  /** Forwarded to generate.ts so dispatcher/concreteCommandRoutes config flows through. */
  projectionOptionsFromConfig?: Record<string, unknown>;
}

/** Structured change event emitted to stdout when --events is enabled. */
interface WatchEvent {
  type: 'ready' | 'change' | 'build:start' | 'build:success' | 'build:error';
  timestamp: string;
  files?: string[];
  error?: string;
  irOutput?: string;
  codeOutput?: string;
}

function emitEvent(event: WatchEvent): void {
  // Write to stdout as a single JSON line for easy parsing
  console.log(JSON.stringify(event));
}

/**
 * Resolve the source directory/pattern to a watchable root.
 *
 * When source is a file, watch its parent directory.
 * When source is a directory, watch that directory.
 * When source is omitted, watch cwd.
 */
async function resolveWatchRoot(source: string | undefined): Promise<string> {
  if (!source) {
    return process.cwd();
  }

  const resolved = path.resolve(process.cwd(), source);
  const stat = await fs.stat(resolved).catch(() => null);

  if (!stat) {
    throw new Error(`Source not found: ${source}`);
  }

  return stat.isFile() ? path.dirname(resolved) : resolved;
}

/**
 * Discover manifest files matching the watch pattern.
 */
async function discoverFiles(
  source: string | undefined,
  globPattern?: string
): Promise<string[]> {
  const pattern = globPattern || '**/*.manifest';
  const cwd = source
    ? path.resolve(process.cwd(), source)
    : process.cwd();

  // If source points to a single file, just return it
  if (source) {
    const resolved = path.resolve(process.cwd(), source);
    const stat = await fs.stat(resolved).catch(() => null);
    if (stat?.isFile()) {
      return [resolved];
    }
  }

  const searchCwd = await fs.stat(cwd).catch(() => null);
  const effectiveCwd = searchCwd?.isDirectory() ? cwd : process.cwd();

  const files = await glob(pattern, { cwd: effectiveCwd });
  return files.map(f => path.resolve(effectiveCwd, f));
}

/**
 * Run a single build cycle (compile + generate).
 *
 * Returns true on success, false on error.
 * Errors are caught and reported rather than thrown so the watcher
 * keeps running.
 */
async function runBuild(
  source: string | undefined,
  options: WatchOptions
): Promise<boolean> {
  try {
    // Ensure output directories exist so compileCommand resolves them
    // as directories (not files) when computing output paths.
    await fs.mkdir(options.irOutput, { recursive: true });
    await fs.mkdir(options.codeOutput, { recursive: true });

    // Compile
    await compileCommand(source, {
      output: options.irOutput,
      glob: options.glob,
      diagnostics: false,
      pretty: true,
    });

    // Generate
    await generateCommand(options.irOutput, {
      projection: options.projection,
      surface: options.surface,
      output: options.codeOutput,
      auth: options.auth,
      database: options.database,
      runtime: options.runtime,
      response: options.response,
      projectionOptionsFromConfig: options.projectionOptionsFromConfig,
    });

    return true;
  } catch {
    return false;
  }
}

/**
 * Watch command handler
 *
 * Monitors .manifest files and re-builds on change.
 */
export async function watchCommand(
  source: string | undefined,
  options: WatchOptions
): Promise<void> {
  const spinner = ora('Starting watch mode...').start();

  // Discover initial files
  const initialFiles = await discoverFiles(source, options.glob);
  if (initialFiles.length === 0) {
    spinner.warn('No .manifest files found. Watching for new files...');
  } else {
    spinner.info(`Found ${initialFiles.length} .manifest file(s)`);
  }

  // Run initial build
  spinner.start('Running initial build...');

  // Suppress process.exit from compile/generate on first build
  const origExit = process.exit;
  let buildExitCode: number | undefined;
  process.exit = ((code?: number) => {
    buildExitCode = code ?? 0;
  }) as typeof process.exit;

  const initialSuccess = await runBuild(source, options);

  process.exit = origExit;

  if (initialSuccess && buildExitCode === undefined) {
    spinner.succeed('Initial build complete');
  } else {
    spinner.warn('Initial build had errors (watching for changes...)');
  }

  // Resolve watch root
  const watchRoot = await resolveWatchRoot(source);

  if (options.events) {
    emitEvent({
      type: 'ready',
      timestamp: new Date().toISOString(),
      files: initialFiles.map(f => path.relative(process.cwd(), f)),
      irOutput: options.irOutput,
      codeOutput: options.codeOutput,
    });
  }

  console.log('');
  console.log(
    chalk.cyan('Watching for changes in'),
    chalk.bold(path.relative(process.cwd(), watchRoot) || '.'),
    chalk.cyan('...')
  );
  console.log(chalk.gray('Press Ctrl+C to stop'));
  console.log('');

  // Set up debounced rebuild
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingFiles: Set<string> = new Set();
  let isBuilding = false;

  const debouncedRebuild = (changedFile: string) => {
    pendingFiles.add(changedFile);

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(async () => {
      if (isBuilding) return;
      isBuilding = true;

      const files = Array.from(pendingFiles);
      pendingFiles = new Set();

      if (options.clear) {
        process.stdout.write('\x1Bc');
      }

      const relFiles = files.map(f => path.relative(process.cwd(), f));
      console.log(
        chalk.yellow(`\n[${new Date().toLocaleTimeString()}]`),
        chalk.white(`Change detected in ${relFiles.length} file(s):`),
      );
      relFiles.forEach(f => console.log(chalk.gray(`  ${f}`)));

      if (options.events) {
        emitEvent({
          type: 'change',
          timestamp: new Date().toISOString(),
          files: relFiles,
        });
        emitEvent({
          type: 'build:start',
          timestamp: new Date().toISOString(),
          files: relFiles,
        });
      }

      const buildSpinner = ora('Rebuilding...').start();

      // Suppress process.exit during rebuild
      let rebuildExitCode: number | undefined;
      process.exit = ((code?: number) => {
        rebuildExitCode = code ?? 0;
      }) as typeof process.exit;

      const success = await runBuild(source, options);

      process.exit = origExit;

      if (success && rebuildExitCode === undefined) {
        buildSpinner.succeed(
          `Rebuild complete ${chalk.gray(`[${new Date().toLocaleTimeString()}]`)}`
        );

        if (options.events) {
          emitEvent({
            type: 'build:success',
            timestamp: new Date().toISOString(),
            files: relFiles,
            irOutput: options.irOutput,
            codeOutput: options.codeOutput,
          });
        }
      } else {
        buildSpinner.fail(
          `Rebuild failed ${chalk.gray(`[${new Date().toLocaleTimeString()}]`)}`
        );

        if (options.events) {
          emitEvent({
            type: 'build:error',
            timestamp: new Date().toISOString(),
            files: relFiles,
            error: 'Build failed — check diagnostics above',
          });
        }
      }

      isBuilding = false;

      // If files changed during the build, trigger another rebuild
      if (pendingFiles.size > 0) {
        const next = pendingFiles.values().next().value as string;
        debouncedRebuild(next);
      }
    }, options.debounce);
  };

  // Start file system watcher
  let watcher: FSWatcher;

  try {
    watcher = fsWatch(watchRoot, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;

      // Only react to .manifest file changes
      if (!filename.endsWith('.manifest')) return;

      const fullPath = path.resolve(watchRoot, filename);
      debouncedRebuild(fullPath);
    });
  } catch (err) {
    // Fallback: recursive fs.watch is not supported on all platforms (Linux < 5.9).
    // Use polling-based fs.watchFile on each discovered manifest file.
    spinner.warn('Recursive fs.watch not supported — falling back to polling');

    const polledFiles = await discoverFiles(source, options.glob);
    for (const file of polledFiles) {
      watchFile(file, { interval: options.debounce }, () => {
        debouncedRebuild(file);
      });
    }

    // Store a noop watcher reference for cleanup
    watcher = { close: () => {} } as FSWatcher;
  }

  // Graceful shutdown
  const cleanup = () => {
    console.log(chalk.gray('\nStopping watch mode...'));
    watcher.close();
    if (debounceTimer) clearTimeout(debounceTimer);
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}
