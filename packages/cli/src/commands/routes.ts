/**
 * manifest routes command
 *
 * Compiles all .manifest files, runs the RoutesProjection, and outputs
 * the canonical route manifest as JSON.
 *
 * This is the agent-accessible equivalent of the DevTools Route Surface tab.
 * Same data, CLI output.
 *
 * Usage:
 *   manifest routes                     # JSON route manifest to stdout
 *   manifest routes --format summary    # Human-readable summary
 *   manifest routes --src path/to/dir   # Custom source directory
 *
 * See docs/spec/manifest-vnext.md § "Canonical Routes (Normative)".
 */

import { glob } from 'glob';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { getConfig } from '../utils/config.js';

interface RoutesCommandOptions {
  src?: string;
  format?: 'json' | 'summary';
  basePath?: string;
}

export async function routesCommand(options: RoutesCommandOptions = {}): Promise<void> {
  const spinner = ora('Compiling manifest files').start();

  try {
    const cwd = process.cwd();
    const config = await getConfig(cwd);
    const srcPattern = options.src || config.src || '**/*.manifest';
    const basePath = options.basePath || '/api';

    // 1. Find all .manifest files
    const files = await glob(srcPattern, {
      cwd,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
      absolute: true,
    });

    if (files.length === 0) {
      spinner.warn('No .manifest files found');
      return;
    }

    spinner.text = `Compiling ${files.length} manifest file(s)...`;

    // 2. Dynamically import the compiler and projection
    const { compileToIR } = await import('@angriff36/manifest/ir-compiler');
    const { RoutesProjection } = await import('@angriff36/manifest/projections/routes');

    const projection = new RoutesProjection();

    // 3. Compile all files and collect routes
    const allRoutes: any[] = [];
    const allDiagnostics: any[] = [];
    let filesCompiled = 0;

    for (const file of files) {
      const source = await fs.readFile(file, 'utf-8');
      const result = await compileToIR(source);

      if (!result.ir) {
        allDiagnostics.push({
          file: path.relative(cwd, file),
          severity: 'error',
          message: `Compilation failed: ${result.diagnostics.map((d: any) => d.message).join('; ')}`,
        });
        continue;
      }

      filesCompiled++;

      // Run routes projection
      const routeResult = projection.generate(result.ir, {
        surface: 'routes.manifest',
        options: {
          basePath,
          generatedAt: new Date().toISOString(),
        },
      });

      if (routeResult.diagnostics.length > 0) {
        for (const d of routeResult.diagnostics) {
          allDiagnostics.push({
            file: path.relative(cwd, file),
            ...d,
          });
        }
      }

      // Extract routes from the manifest JSON
      if (routeResult.artifacts.length > 0) {
        const manifest = JSON.parse(routeResult.artifacts[0].code);
        allRoutes.push(...manifest.routes);
      }
    }

    spinner.stop();

    // 4. Output
    if (options.format === 'summary') {
      // Human-readable summary (for agents and humans)
      const reads = allRoutes.filter(r => r.source.kind === 'entity-read');
      const writes = allRoutes.filter(r => r.source.kind === 'command');
      const manual = allRoutes.filter(r => r.source.kind === 'manual');

      console.log(chalk.bold('\nRoute Surface Summary'));
      console.log(`  Files compiled: ${filesCompiled}`);
      console.log(`  Total routes:   ${chalk.cyan(String(allRoutes.length))}`);
      console.log(`  Read (GET):     ${chalk.blue(String(reads.length))}`);
      console.log(`  Write (POST):   ${chalk.yellow(String(writes.length))}`);
      console.log(`  Manual:         ${manual.length}`);
      console.log('');

      if (allDiagnostics.length > 0) {
        console.log(chalk.red(`  Diagnostics: ${allDiagnostics.length}`));
        for (const d of allDiagnostics) {
          console.log(`    ${d.severity}: ${d.message} (${d.file || ''})`);
        }
        console.log('');
      }

      // Route table
      console.log(chalk.bold('  Method  Path                                    Source'));
      console.log('  ' + '─'.repeat(70));
      for (const route of allRoutes) {
        const method = route.method === 'GET'
          ? chalk.blue(route.method.padEnd(6))
          : chalk.yellow(route.method.padEnd(6));
        const pathStr = route.path.padEnd(40);
        const source = route.source.kind === 'entity-read'
          ? route.source.entity
          : route.source.kind === 'command'
            ? `${route.source.entity}.${route.source.command}`
            : `manual:${route.source.id}`;
        console.log(`  ${method}${pathStr}${source}`);
      }
      console.log('');
    } else {
      // JSON output (default — for programmatic consumption by agents)
      const output = {
        $schema: 'https://manifest.lang/spec/routes-v1.schema.json',
        version: '1.0',
        generatedAt: new Date().toISOString(),
        basePath,
        filesCompiled,
        routes: allRoutes,
        diagnostics: allDiagnostics,
      };
      console.log(JSON.stringify(output, null, 2));
    }

    // Exit non-zero if there were errors
    if (allDiagnostics.some(d => d.severity === 'error')) {
      process.exit(1);
    }
  } catch (error: any) {
    spinner.fail(`Route generation failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}
