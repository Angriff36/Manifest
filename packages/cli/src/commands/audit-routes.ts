import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import chalk from 'chalk';
import ora from 'ora';
import * as ts from 'typescript';

type Severity = 'error' | 'warning';

export interface RouteAuditFinding {
  file: string;
  severity: Severity;
  code: string;
  message: string;
  suggestion?: string;
}

export interface RouteAuditFileResult {
  methods: string[];
  findings: RouteAuditFinding[];
}

/**
 * A single entry in the commands manifest (projection-agnostic).
 * Derived from IR commands — no URL paths, no framework conventions.
 */
export interface CommandsManifestEntry {
  entity: string;
  command: string;
  commandId: string;
}

/**
 * A single exemption in the exemption registry.
 * Manual write routes that legitimately exist outside Manifest ownership.
 */
export interface RouteExemption {
  /** Relative path from repo root to the route file */
  path: string;
  /** HTTP methods that are exempted */
  methods: string[];
  /** Human-readable reason for the exemption */
  reason: string;
  /** Category for reporting */
  category?: string;
}

export interface AuditRoutesOptions {
  root?: string;
  format?: 'text' | 'json';
  strict?: boolean;
  tenantField?: string;
  deletedField?: string;
  locationField?: string;
  /** Path to commands manifest JSON (e.g. kitchen.commands.json) */
  commandsManifest?: string;
  /** Path to exemptions registry JSON */
  exemptions?: string;
}

const READ_METHODS = new Set(['GET']);
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const ROUTE_PATTERNS = [
  'app/api/**/route.ts',
  'app/api/**/route.js',
  'src/app/api/**/route.ts',
  'src/app/api/**/route.js',
  'apps/*/app/api/**/route.ts',
  'apps/*/app/api/**/route.js',
];

const DIRECT_QUERY_RE = /\b(findMany|findFirst|findUnique|groupBy|aggregate)\s*\(/;
const RUNTIME_COMMAND_RE = /\brunCommand\s*\(/;
const USER_CONTEXT_RE = /\buser\s*:\s*\{/;
const DIRECT_QUERY_METHODS = new Set(['findMany', 'findFirst', 'findUnique', 'groupBy', 'aggregate']);

/** Matches paths containing a /commands/ segment (case-insensitive on Windows). */
const COMMANDS_NAMESPACE_RE = /[/\\]commands[/\\]/i;

/**
 * Thrown for invalid CLI usage: malformed JSON, unreadable files (non-ENOENT), etc.
 * Distinguished from rule-violation failures so the CLI can exit with code 2.
 */
export class AuditUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuditUsageError';
  }
}

// ============================================================================
// Commands manifest + exemption loading
// ============================================================================

/**
 * Load the commands manifest JSON.
 * Returns an empty array if the file doesn't exist (ENOENT).
 * Throws on malformed JSON or non-array content — a corrupted manifest
 * must fail loudly in CI, not silently disable enforcement.
 */
export async function loadCommandsManifest(filePath: string): Promise<CommandsManifestEntry[]> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new AuditUsageError(`Cannot read commands manifest at ${filePath}: ${(err as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AuditUsageError(`Commands manifest at ${filePath} is not valid JSON`);
  }
  if (!Array.isArray(parsed)) {
    throw new AuditUsageError(`Commands manifest at ${filePath} must be an array`);
  }
  return parsed.filter(
    (e: unknown): e is CommandsManifestEntry =>
      typeof e === 'object' && e !== null &&
      typeof (e as CommandsManifestEntry).entity === 'string' &&
      typeof (e as CommandsManifestEntry).command === 'string' &&
      typeof (e as CommandsManifestEntry).commandId === 'string',
  );
}

/**
 * Load the exemptions registry JSON.
 * Returns an empty array if the file doesn't exist (ENOENT).
 * Throws on malformed JSON or non-array content — a corrupted exemptions
 * file must fail loudly, not silently disable all exemptions.
 */
export async function loadExemptions(filePath: string): Promise<RouteExemption[]> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new AuditUsageError(`Cannot read exemptions at ${filePath}: ${(err as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AuditUsageError(`Exemptions file at ${filePath} is not valid JSON`);
  }
  if (!Array.isArray(parsed)) {
    throw new AuditUsageError(`Exemptions file at ${filePath} must be an array`);
  }
  return parsed.filter(
    (e: unknown): e is RouteExemption =>
      typeof e === 'object' && e !== null &&
      typeof (e as RouteExemption).path === 'string' &&
      Array.isArray((e as RouteExemption).methods),
  );
}

/**
 * Check whether a file path is inside the commands namespace.
 */
export function isInCommandsNamespace(filePath: string): boolean {
  return COMMANDS_NAMESPACE_RE.test(filePath);
}

/**
 * Check whether a file is exempted for a given HTTP method.
 * Paths are compared after normalizing separators and lowercasing.
 * Refuses to match files outside the root directory (path traversal guard).
 */
export function isExempted(
  filePath: string,
  method: string,
  exemptions: RouteExemption[],
  root: string,
): boolean {
  const relPath = path.relative(root, filePath).replace(/\\/g, '/');
  // Path traversal guard: refuse to match files outside root or absolute remnants
  if (relPath.startsWith('..') || path.isAbsolute(relPath)) return false;
  for (const exemption of exemptions) {
    const exemptPath = exemption.path.replace(/\\/g, '/');
    if (
      relPath.toLowerCase() === exemptPath.toLowerCase() &&
      exemption.methods.some((m) => m.toUpperCase() === method.toUpperCase())
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Extract the command name from a commands-namespace file path.
 * e.g. "app/api/kitchen/tasks/commands/create/route.ts" → "create"
 * Returns null if the path doesn't match the expected pattern.
 */
export function extractCommandFromPath(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, '/');
  const match = normalized.match(/\/commands\/([^/]+)\/route\.[tj]s$/i);
  return match ? match[1] : null;
}

/**
 * Extract the entity segment from a commands-namespace file path.
 * Looks for the segment immediately before /commands/.
 * e.g. "app/api/kitchen/tasks/commands/create/route.ts" → "tasks"
 */
export function extractEntitySegmentFromPath(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, '/');
  const match = normalized.match(/\/([^/]+)\/commands\/[^/]+\/route\.[tj]s$/i);
  return match ? match[1] : null;
}

/**
 * Check if a command route has a backing entry in the commands manifest.
 * Matches by command name only (case-insensitive).
 *
 * Entity naming conventions differ between IR (PascalCase, e.g. "CrmClient")
 * and filesystem (lowercase/kebab, e.g. "clients"), so entity segment matching
 * is intentionally not used. The command name is the stable identifier.
 */
export function hasCommandManifestBacking(
  filePath: string,
  commandsManifest: CommandsManifestEntry[],
): boolean {
  const commandName = extractCommandFromPath(filePath);
  if (!commandName) return false;
  return commandsManifest.some(
    (entry) => entry.command.toLowerCase() === commandName.toLowerCase(),
  );
}

function detectExportedMethods(content: string): string[] {
  const methods = new Set<string>();
  const re = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    methods.add(match[1]);
  }
  return Array.from(methods);
}

function hasFieldToken(content: string, fieldName: string): boolean {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fieldRe = new RegExp(`\\b${escaped}\\b`);
  return fieldRe.test(content);
}

function propertyNameMatches(name: ts.PropertyName, expected: string): boolean {
  if (ts.isIdentifier(name)) return name.text === expected;
  if (ts.isStringLiteral(name)) return name.text === expected;
  if (ts.isNumericLiteral(name)) return name.text === expected;
  if (ts.isComputedPropertyName(name) && ts.isStringLiteral(name.expression)) {
    return name.expression.text === expected;
  }
  return false;
}

function hasFieldInObjectLiteral(objectLiteral: ts.ObjectLiteralExpression, fieldName: string): boolean {
  for (const prop of objectLiteral.properties) {
    if (ts.isPropertyAssignment(prop) && propertyNameMatches(prop.name, fieldName)) {
      return true;
    }
    if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === fieldName) {
      return true;
    }
  }
  return false;
}

function isDirectQueryCall(node: ts.CallExpression): boolean {
  if (ts.isPropertyAccessExpression(node.expression)) {
    return DIRECT_QUERY_METHODS.has(node.expression.name.text);
  }
  if (ts.isElementAccessExpression(node.expression) && ts.isStringLiteral(node.expression.argumentExpression)) {
    return DIRECT_QUERY_METHODS.has(node.expression.argumentExpression.text);
  }
  return false;
}

function hasLocationFilterInDirectQueryWhere(content: string, locationField: string): boolean {
  const sourceFile = ts.createSourceFile('route.ts', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found = false;

  const visit = (node: ts.Node): void => {
    if (found) return;

    if (ts.isCallExpression(node) && isDirectQueryCall(node)) {
      const firstArg = node.arguments[0];
      if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
        const whereProperty = firstArg.properties.find(
          (prop): prop is ts.PropertyAssignment =>
            ts.isPropertyAssignment(prop) && propertyNameMatches(prop.name, 'where'),
        );

        if (whereProperty && ts.isObjectLiteralExpression(whereProperty.initializer)) {
          if (hasFieldInObjectLiteral(whereProperty.initializer, locationField)) {
            found = true;
            return;
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}

/**
 * Context for commands-namespace ownership rules.
 * When provided, enables the three ownership enforcement rules.
 */
export interface OwnershipContext {
  /** Loaded commands manifest entries (from kitchen.commands.json or equivalent) */
  commandsManifest: CommandsManifestEntry[];
  /** Loaded exemptions registry */
  exemptions: RouteExemption[];
  /** Root directory for relative path resolution */
  root: string;
  /**
   * Rollout mode: when true, new ownership rules emit as errors.
   * When false (default), they emit as warnings for gradual adoption.
   */
  enforceOwnership: boolean;
  /**
   * Whether --commands-manifest was explicitly provided by the user.
   * When true and the manifest parsed to an empty array, orphan detection
   * emits a warning (or error in strict mode) instead of silently skipping.
   */
  manifestExplicitlyProvided: boolean;
}

export function auditRouteFileContent(
  content: string,
  file: string,
  options: Required<Pick<AuditRoutesOptions, 'tenantField' | 'deletedField' | 'locationField'>>,
  ownership?: OwnershipContext,
): RouteAuditFileResult {
  const findings: RouteAuditFinding[] = [];
  const methods = detectExportedMethods(content);

  if (methods.length === 0) {
    return { methods, findings };
  }

  const hasRunCommand = RUNTIME_COMMAND_RE.test(content);
  const hasDirectQuery = DIRECT_QUERY_RE.test(content);
  const locationReferenced = hasFieldToken(content, options.locationField);
  const hasLocationFilter = hasLocationFilterInDirectQueryWhere(content, options.locationField);
  const inCommandsNamespace = isInCommandsNamespace(file);

  // Determine severity for new ownership rules based on rollout mode
  const ownershipSeverity: Severity = ownership?.enforceOwnership ? 'error' : 'warning';

  for (const method of methods) {
    // ====================================================================
    // Existing rules (retained as-is)
    // ====================================================================

    if (WRITE_METHODS.has(method) && !hasRunCommand) {
      findings.push({
        file,
        severity: 'error',
        code: 'WRITE_ROUTE_BYPASSES_RUNTIME',
        message: `${method} route appears to bypass runtime command execution (no runCommand call found).`,
        suggestion: 'Write routes should execute through RuntimeEngine.runCommand to enforce policy/guard/constraint semantics.',
      });
    }

    if (WRITE_METHODS.has(method) && hasRunCommand && !USER_CONTEXT_RE.test(content)) {
      findings.push({
        file,
        severity: 'warning',
        code: 'WRITE_ROUTE_USER_CONTEXT_NOT_VISIBLE',
        message: `${method} route calls runCommand but no explicit user context object was detected.`,
        suggestion: 'Ensure createManifestRuntime receives user context when command policies/guards reference user.* bindings.',
      });
    }

    if (READ_METHODS.has(method) && hasDirectQuery) {
      if (!hasFieldToken(content, options.tenantField)) {
        findings.push({
          file,
          severity: 'warning',
          code: 'READ_MISSING_TENANT_SCOPE',
          message: `GET route uses direct query but '${options.tenantField}' predicate was not detected.`,
          suggestion: 'Add tenant scoping to read queries or move read authorization/scope to an enforced data policy boundary.',
        });
      }

      const softDeletePattern = new RegExp(`\\b${options.deletedField.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*:\\s*null\\b`);
      if (!softDeletePattern.test(content)) {
        findings.push({
          file,
          severity: 'warning',
          code: 'READ_MISSING_SOFT_DELETE_FILTER',
          message: `GET route uses direct query but '${options.deletedField}: null' filter was not detected.`,
          suggestion: 'Apply a default soft-delete exclusion filter for analytics/listing correctness, unless intentionally reading deleted rows.',
        });
      }

      if (locationReferenced) {
        if (!hasLocationFilter) {
          findings.push({
            file,
            severity: 'warning',
            code: 'READ_LOCATION_REFERENCE_WITHOUT_FILTER',
            message: `GET route references '${options.locationField}' but a matching query filter was not detected.`,
            suggestion: 'If the endpoint is location-scoped, include the location predicate in the direct query where-clause.',
          });
        }
      }
    }

    // ====================================================================
    // New ownership enforcement rules (require ownership context)
    // ====================================================================

    if (ownership && WRITE_METHODS.has(method)) {
      // Rule: WRITE_OUTSIDE_COMMANDS_NAMESPACE
      // Write route outside /commands/ that is not exempted
      if (!inCommandsNamespace && !isExempted(file, method, ownership.exemptions, ownership.root)) {
        findings.push({
          file,
          severity: ownershipSeverity,
          code: 'WRITE_OUTSIDE_COMMANDS_NAMESPACE',
          message: `${method} route is outside the commands namespace and has no exemption.`,
          suggestion: 'Move this route to commands/<command>/route.ts or register an explicit exemption.',
        });
      }

      // Rule: COMMAND_ROUTE_MISSING_RUNTIME_CALL
      // Command-namespace route that doesn't call runCommand — no exemptions
      if (inCommandsNamespace && !hasRunCommand) {
        findings.push({
          file,
          severity: ownershipSeverity,
          code: 'COMMAND_ROUTE_MISSING_RUNTIME_CALL',
          message: `${method} route is in the commands namespace but does not call runCommand.`,
          suggestion: 'All command routes must execute through runtime.runCommand.',
        });
      }
    }
  }

  // Rule: COMMAND_ROUTE_ORPHAN (file-level, not per-method)
  // Command-namespace route that has no backing entry in commands manifest
  if (ownership && inCommandsNamespace) {
    if (ownership.commandsManifest.length === 0 && ownership.manifestExplicitlyProvided) {
      // Manifest was explicitly provided but parsed to empty — every command route is an orphan.
      findings.push({
        file,
        severity: ownershipSeverity,
        code: 'COMMAND_ROUTE_ORPHAN',
        message: 'Command route has no backing entry — commands manifest is empty.',
        suggestion: 'The commands manifest was explicitly provided but contains no entries. Add commands to your manifest or remove this route.',
      });
    } else if (ownership.commandsManifest.length > 0 && !hasCommandManifestBacking(file, ownership.commandsManifest)) {
      findings.push({
        file,
        severity: ownershipSeverity,
        code: 'COMMAND_ROUTE_ORPHAN',
        message: 'Command route has no backing entry in the commands manifest.',
        suggestion: 'This command route has no IR backing. Delete it or add the command to your manifest.',
      });
    }
  }

  return { methods, findings };
}

async function discoverRouteFiles(root: string): Promise<string[]> {
  const files = await Promise.all(
    ROUTE_PATTERNS.map((pattern) =>
      glob(pattern, {
        cwd: root,
        absolute: true,
        ignore: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/build/**'],
      }),
    ),
  );
  return Array.from(new Set(files.flat()));
}

export async function auditRoutesCommand(options: AuditRoutesOptions = {}): Promise<void> {
  const spinner = ora('Auditing route boundaries').start();

  try {
    const root = path.resolve(process.cwd(), options.root || '.');
    const tenantField = options.tenantField || 'tenantId';
    const deletedField = options.deletedField || 'deletedAt';
    const locationField = options.locationField || 'locationId';
    const routeFiles = await discoverRouteFiles(root);

    if (routeFiles.length === 0) {
      spinner.warn(`No route files found under ${root}`);
      return;
    }

    // Load ownership context if commands manifest is provided
    let ownership: OwnershipContext | undefined;
    if (options.commandsManifest) {
      const manifestPath = path.resolve(root, options.commandsManifest);
      const commandsManifest = await loadCommandsManifest(manifestPath);

      const exemptionsPath = options.exemptions
        ? path.resolve(root, options.exemptions)
        : undefined;
      const exemptions = exemptionsPath ? await loadExemptions(exemptionsPath) : [];

      ownership = {
        commandsManifest,
        exemptions,
        root,
        // In strict mode, ownership rules are errors. Otherwise warnings (rollout).
        enforceOwnership: options.strict ?? false,
        manifestExplicitlyProvided: true,
      };

      spinner.text = `Auditing route boundaries (${commandsManifest.length} commands, ${exemptions.length} exemptions)`;
    }

    const findings: RouteAuditFinding[] = [];
    let filesAudited = 0;

    for (const routeFile of routeFiles) {
      const content = await fs.readFile(routeFile, 'utf-8');
      const result = auditRouteFileContent(
        content,
        routeFile,
        { tenantField, deletedField, locationField },
        ownership,
      );
      if (result.methods.length > 0) {
        filesAudited++;
        findings.push(...result.findings);
      }
    }

    const errors = findings.filter((f) => f.severity === 'error');
    const warnings = findings.filter((f) => f.severity === 'warning');

    if (options.format === 'json') {
      spinner.stop();
      console.log(
        JSON.stringify(
          {
            root,
            filesAudited,
            errors: errors.length,
            warnings: warnings.length,
            commandsManifest: options.commandsManifest ?? null,
            exemptions: options.exemptions ?? null,
            findings,
          },
          null,
          2,
        ),
      );
    } else {
      if (findings.length === 0) {
        spinner.succeed(`Audited ${filesAudited} route file(s) — no boundary issues found`);
      } else {
        spinner.warn(`Audited ${filesAudited} route file(s) — ${errors.length} error(s), ${warnings.length} warning(s)`);
        console.log('');
        for (const finding of findings) {
          const relFile = path.relative(process.cwd(), finding.file) || finding.file;
          const color = finding.severity === 'error' ? chalk.red : chalk.yellow;
          console.log(color(`  [${finding.severity.toUpperCase()}] ${finding.code}`));
          console.log(`    ${relFile}`);
          console.log(`    ${finding.message}`);
          if (finding.suggestion) {
            console.log(chalk.gray(`    -> ${finding.suggestion}`));
          }
          console.log('');
        }
      }

      console.log(chalk.bold('SUMMARY:'));
      console.log(`  Root: ${root}`);
      console.log(`  Files audited: ${filesAudited}`);
      console.log(`  Errors: ${errors.length}`);
      console.log(`  Warnings: ${warnings.length}`);
      console.log(`  Fields: tenant=${tenantField}, deleted=${deletedField}, location=${locationField}`);
      if (ownership) {
        console.log(`  Commands manifest: ${options.commandsManifest}`);
        console.log(`  Exemptions: ${options.exemptions ?? '(none)'}`);
        console.log(`  Ownership enforcement: ${ownership.enforceOwnership ? 'strict (errors)' : 'rollout (warnings)'}`);
      }
    }

    if (errors.length > 0 || (options.strict && warnings.length > 0)) {
      process.exit(1);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    spinner.fail(`Route audit failed: ${message}`);
    // Exit code 2 for invalid usage (malformed JSON, unreadable files);
    // exit code 1 for rule violations (handled above).
    const exitCode = error instanceof AuditUsageError ? 2 : 1;
    process.exit(exitCode);
  }
}
