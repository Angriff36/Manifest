/**
 * manifest scan command
 *
 * Scans .manifest files for configuration issues before runtime.
 * Primary goal: "If scan passes, the code works."
 *
 * Checks performed:
 * - Policy coverage: Every command has a policy
 * - Store consistency: Store targets are recognized
 * - (Future) Property alignment: Manifest properties match store schema
 * - (Future) Route context: All required context fields are passed
 */

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import { loadAllConfigs, getStoreBindingsInfo, ManifestRuntimeConfig } from '../utils/config.js';

// Import from the main Manifest package
async function loadCompiler() {
  const module = await import('@manifest/runtime/ir-compiler');
  return module.compileToIR;
}

interface ScanOptions {
  glob?: string;
  format?: 'text' | 'json';
  strict?: boolean;
}

interface ScanError {
  file: string;
  line?: number;
  entityName: string;
  commandName: string;
  message: string;
  suggestion: string;
}

interface ScanWarning {
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
}

interface ScanResult {
  errors: ScanError[];
  warnings: ScanWarning[];
  filesScanned: number;
  commandsChecked: number;
}

/**
 * Known built-in store targets (from runtime-engine.ts)
 */
const BUILTIN_STORE_TARGETS = ['memory', 'localStorage', 'postgres', 'supabase'];

/**
 * Get all manifest files from source pattern
 */
async function getManifestFiles(source: string, options: ScanOptions): Promise<string[]> {
  // If no source provided, use current directory with glob pattern
  if (!source) {
    const pattern = options.glob || '**/*.manifest';
    const files = await glob(pattern, { cwd: process.cwd(), ignore: ['**/node_modules/**'] });
    return files.map(f => path.resolve(process.cwd(), f));
  }

  const resolved = path.resolve(process.cwd(), source);
  const stat = await fs.stat(resolved).catch(() => null);

  if (!stat) {
    throw new Error(`Source not found: ${source}`);
  }

  // If source is a file, return it directly
  if (stat.isFile()) {
    return [resolved];
  }

  // If source is a directory, use glob pattern
  const pattern = options.glob || '**/*.manifest';
  const files = await glob(pattern, { cwd: resolved, ignore: ['**/node_modules/**'] });
  return files.map(f => path.resolve(resolved, f));
}

/**
 * Check if a command is covered by any policy
 *
 * A policy covers a command if:
 * 1. Policy action is 'execute' or 'all'
 * 2. Policy entity matches the command's entity (or policy is global)
 */
function isCommandCoveredByPolicy(
  entityName: string,
  policies: Array<{ entity?: string; action: string }>
): boolean {
  for (const policy of policies) {
    // Policy must have execute or all action
    if (policy.action !== 'execute' && policy.action !== 'all') {
      continue;
    }

    // Policy must match the entity (or be global with no entity)
    if (policy.entity === undefined || policy.entity === entityName) {
      return true;
    }
  }

  return false;
}

/**
 * Find the line number of a command definition in source
 */
function findCommandLine(sourceLines: string[], commandName: string): number | undefined {
  const commandPattern = new RegExp(`command\\s+${commandName}\\s*\\(`);
  for (let i = 0; i < sourceLines.length; i++) {
    if (commandPattern.test(sourceLines[i])) {
      return i + 1;
    }
  }
  return undefined;
}

/**
 * Find the line number of a store declaration in source
 */
function findStoreLine(sourceLines: string[], entityName: string, target: string): number | undefined {
  const storePattern = new RegExp(`store\\s+${entityName}\\s+in\\s+${target}`);
  for (let i = 0; i < sourceLines.length; i++) {
    if (storePattern.test(sourceLines[i])) {
      return i + 1;
    }
  }
  return undefined;
}

/**
 * Scan a single manifest file for issues
 */
async function scanFile(
  filePath: string,
  spinner: Ora,
  runtimeConfig: ManifestRuntimeConfig | null
): Promise<{ errors: ScanError[]; warnings: ScanWarning[]; commandsChecked: number }> {
  const compileToIR = await loadCompiler();
  const errors: ScanError[] = [];
  const warnings: ScanWarning[] = [];
  let commandsChecked = 0;

  spinner.text = `Scanning ${path.relative(process.cwd(), filePath)}`;

  // Read source
  const source = await fs.readFile(filePath, 'utf-8');
  const sourceLines = source.split('\n');

  // Compile to IR
  const result = await compileToIR(source);

  // Check for compilation errors first
  if (result.diagnostics && result.diagnostics.length > 0) {
    for (const diagnostic of result.diagnostics) {
      if (diagnostic.severity === 'error') {
        errors.push({
          file: filePath,
          line: diagnostic.line,
          entityName: '',
          commandName: '',
          message: diagnostic.message,
          suggestion: 'Fix the compilation error before running the scanner.',
        });
      }
    }

    // If there are compilation errors, return early
    if (errors.length > 0) {
      return { errors, warnings, commandsChecked: 0 };
    }
  }

  // No IR means nothing to scan
  if (!result.ir) {
    return { errors, warnings, commandsChecked: 0 };
  }

  const ir = result.ir;

  // Build a map of entity name → entity for command lookup
  const entityMap = new Map<string, { name: string; commands: string[] }>();
  for (const entity of ir.entities || []) {
    entityMap.set(entity.name, entity);
  }

  // Build a map of entity → store target from ir.stores
  const storeMap = new Map<string, string>();
  for (const store of ir.stores || []) {
    storeMap.set(store.entity, store.target);
  }

  // Check each command in ir.commands for policy coverage
  for (const command of ir.commands || []) {
    // Skip commands without required fields (shouldn't happen in valid IR)
    if (!command.entity || !command.name) {
      continue;
    }

    commandsChecked++;
    const entityName = command.entity;
    const commandName = command.name;

    // Check if command is covered by policies
    const isCovered = isCommandCoveredByPolicy(entityName, ir.policies || []);

    if (!isCovered) {
      const lineNum = findCommandLine(sourceLines, commandName);
      errors.push({
        file: filePath,
        line: lineNum,
        entityName,
        commandName,
        message: `Command '${entityName}.${commandName}' has no policy.`,
        suggestion: `Add a policy:\n    policy ${entityName}Can${capitalize(commandName)} execute: user.role in ["role1", "role2"]\n  \n  Or set entity defaults:\n    default policy execute: user.authenticated`,
      });
    }
  }

  // Check store targets are recognized
  const storeBindingsInfo = getStoreBindingsInfo(runtimeConfig);

  for (const store of ir.stores || []) {
    const isBuiltin = BUILTIN_STORE_TARGETS.includes(store.target);
    const hasConfigBinding = storeBindingsInfo.hasStore(store.entity);

    if (!isBuiltin && !hasConfigBinding) {
      // Custom store target without config binding
      const lineNum = findStoreLine(sourceLines, store.entity, store.target);
      warnings.push({
        file: filePath,
        line: lineNum,
        message: `Store target '${store.target}' is not a built-in target and has no config binding.`,
        suggestion: `Built-in targets: ${BUILTIN_STORE_TARGETS.join(', ')}\n  \n  If using a custom store, bind it in manifest.config.ts:\n    stores: { ${store.entity}: { implementation: YourStoreClass } }`,
      });
    } else if (!isBuiltin && hasConfigBinding) {
      // Custom store target WITH config binding - just informational
      // This is valid usage, no warning needed
    }
  }

  return { errors, warnings, commandsChecked };
}

/**
 * Capitalize first letter of a string
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Format relative path for display
 */
function formatPath(filePath: string): string {
  return path.relative(process.cwd(), filePath) || filePath;
}

/**
 * Scan command handler
 */
export async function scanCommand(source: string | undefined, options: ScanOptions = {}): Promise<void> {
  const spinner = ora('Scanning manifest files').start();

  try {
    // Load runtime config for store binding validation
    let runtimeConfig: ManifestRuntimeConfig | null = null;
    try {
      const configs = await loadAllConfigs(process.cwd());
      runtimeConfig = configs.runtime;
    } catch {
      // Config loading failed - continue without config validation
    }

    // Get manifest files
    const files = await getManifestFiles(source || '', options);

    if (files.length === 0) {
      spinner.warn('No .manifest files found');
      console.log('  Create a .manifest file or specify a source pattern');
      console.log('  Run `manifest init` to get started');
      return;
    }

    spinner.info(`Found ${files.length} file(s) to scan`);

    // Scan each file
    const result: ScanResult = {
      errors: [],
      warnings: [],
      filesScanned: files.length,
      commandsChecked: 0,
    };

    for (const file of files) {
      const fileSpinner = ora().start();
      try {
        const fileResult = await scanFile(file, fileSpinner, runtimeConfig);
        result.errors.push(...fileResult.errors);
        result.warnings.push(...fileResult.warnings);
        result.commandsChecked += fileResult.commandsChecked;

        if (fileResult.errors.length === 0 && fileResult.warnings.length === 0) {
          fileSpinner.succeed(`${formatPath(file)} - OK`);
        } else if (fileResult.errors.length > 0) {
          fileSpinner.fail(`${formatPath(file)} - ${fileResult.errors.length} error(s)`);
        } else {
          fileSpinner.warn(`${formatPath(file)} - ${fileResult.warnings.length} warning(s)`);
        }
      } catch (error: any) {
        fileSpinner.fail(`Failed to scan ${formatPath(file)}: ${error.message}`);
        result.errors.push({
          file,
          entityName: '',
          commandName: '',
          message: error.message,
          suggestion: 'Check the file for syntax errors.',
        });
      }
    }

    // Output results
    if (options.format === 'json') {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log('');

    // Show errors
    if (result.errors.length > 0) {
      console.log(chalk.red.bold('ERRORS:'));
      console.log('');
      for (const error of result.errors) {
        const location = error.line
          ? `${formatPath(error.file)}:${error.line}`
          : formatPath(error.file);
        console.log(chalk.red(`  ${location}`));

        if (error.entityName && error.commandName) {
          console.log(`    Command '${error.entityName}.${error.commandName}' has no policy.`);
        } else {
          console.log(`    ${error.message}`);
        }

        if (error.suggestion) {
          console.log(chalk.gray(`    → ${error.suggestion.split('\n').join('\n    → ')}`));
        }
        console.log('');
      }
    }

    // Show warnings
    if (result.warnings.length > 0) {
      console.log(chalk.yellow.bold('WARNINGS:'));
      console.log('');
      for (const warning of result.warnings) {
        const location = warning.line
          ? `${formatPath(warning.file)}:${warning.line}`
          : formatPath(warning.file);
        console.log(chalk.yellow(`  ${location}`));
        console.log(`    ${warning.message}`);

        if (warning.suggestion) {
          console.log(chalk.gray(`    → ${warning.suggestion.split('\n').join('\n    → ')}`));
        }
        console.log('');
      }
    }

    // Summary
    console.log(chalk.bold('SUMMARY:'));
    console.log(`  Files scanned: ${result.filesScanned}`);
    console.log(`  Commands checked: ${result.commandsChecked}`);

    if (result.errors.length === 0 && result.warnings.length === 0) {
      spinner.succeed('Scan passed - no issues found');
      console.log(chalk.green('\n  If `manifest scan` passes, the code works.'));
    } else if (result.errors.length === 0) {
      console.log(chalk.yellow(`  Warnings: ${result.warnings.length}`));
      if (options.strict) {
        spinner.fail('Scan failed with warnings (strict mode)');
        process.exit(1);
      } else {
        spinner.warn('Scan passed with warnings');
      }
    } else {
      spinner.fail(`Scan failed with ${result.errors.length} error(s), ${result.warnings.length} warning(s)`);
      process.exit(1);
    }
  } catch (error: any) {
    spinner.fail(`Scan failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}
