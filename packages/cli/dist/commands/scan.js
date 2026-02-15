/**
 * manifest scan command
 *
 * Scans .manifest files for configuration issues before runtime.
 * Primary goal: "If scan passes, the code works."
 *
 * Checks performed:
 * - Policy coverage: Every command has a policy
 * - Store consistency: Store targets are recognized
 * - Route context: Generated routes pass required user context
 * - (Future) Property alignment: Manifest properties match store schema
 */
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import chalk from 'chalk';
import ora from 'ora';
import { loadAllConfigs, getStoreBindingsInfo, findPrismaSchemaPath, parsePrismaSchema, getPrismaModel, propertyExistsInModel, getPrismaFieldNames } from '../utils/config.js';
// Import from the main Manifest package
async function loadCompiler() {
    const module = await import('@manifest/runtime/ir-compiler');
    return module.compileToIR;
}
/**
 * Check if an expression string references user context
 */
function expressionReferencesUser(expression) {
    // Match user.* patterns (user.id, user.role, user.tenantId, etc.)
    return /\buser\.[a-zA-Z_]/.test(expression);
}
/**
 * Check if a command requires user context based on its guards and policies
 */
function commandRequiresUserContext(command, policies) {
    // Check guards for user references
    for (const guard of command.guards || []) {
        if (expressionReferencesUser(guard.expression)) {
            return true;
        }
    }
    // Check policies for user references
    const policyMap = new Map(policies.map(p => [p.name, p]));
    for (const policyName of command.policies || []) {
        const policy = policyMap.get(policyName);
        if (policy?.expression && expressionReferencesUser(policy.expression)) {
            return true;
        }
    }
    return false;
}
/**
 * Scan a route file to check if it properly passes user context
 */
async function scanRouteFile(filePath, commandsRequiringUserContext) {
    const warnings = [];
    let routesScanned = 0;
    const content = await fs.readFile(filePath, 'utf-8');
    // Check if this is a command route (POST handler that uses createManifestRuntime)
    const isCommandRoute = /createManifestRuntime|runCommand/.test(content);
    if (!isCommandRoute) {
        return { warnings, routesScanned: 0 };
    }
    routesScanned = 1;
    // Extract entity and command from the route file path or content
    // Routes typically follow: app/api/{entity}/{command}/route.ts pattern
    const pathParts = filePath.split(/[/\\]/);
    const apiIndex = pathParts.findIndex(p => p === 'api');
    let entityName = null;
    let commandName = null;
    if (apiIndex >= 0 && pathParts.length > apiIndex + 2) {
        entityName = pathParts[apiIndex + 1];
        // Check if this is a command route (not a list route)
        const possibleCommand = pathParts[apiIndex + 2];
        if (possibleCommand !== 'list' && possibleCommand !== 'route.ts') {
            commandName = possibleCommand;
        }
    }
    // Also try to extract from content
    const entityMatch = content.match(/entityName:\s*["']([^"']+)["']/);
    const commandMatch = content.match(/runCommand\(\s*["']([^"']+)["']/);
    if (entityMatch)
        entityName = entityMatch[1];
    if (commandMatch)
        commandName = commandMatch[1];
    if (!entityName || !commandName) {
        return { warnings, routesScanned };
    }
    const commandKey = `${entityName}.${commandName}`;
    // Only check routes for commands that require user context
    if (!commandsRequiringUserContext.has(commandKey)) {
        return { warnings, routesScanned };
    }
    // Check if the route passes user context
    const passesUserContext = /user:\s*\{|user:\s*userId|user:\s*{\s*id:\s*userId/.test(content);
    if (!passesUserContext) {
        warnings.push({
            file: filePath,
            message: `Route for '${commandKey}' does not pass user context, but command requires it.`,
            suggestion: `Ensure the route passes user context to createManifestRuntime:\n  const runtime = await createManifestRuntime({ user: { id: userId, ... } });\n\n  Or configure resolveUser in manifest.config.ts for auto-injection.`,
        });
    }
    return { warnings, routesScanned };
}
/**
 * Scan project for route files
 */
async function scanRoutes(projectRoot, ir, spinner) {
    const warnings = [];
    let routesScanned = 0;
    // Build set of commands requiring user context
    const commandsRequiringUserContext = new Set();
    for (const command of ir.commands || []) {
        if (!command.entity || !command.name)
            continue;
        if (commandRequiresUserContext(command, ir.policies || [])) {
            commandsRequiringUserContext.add(`${command.entity}.${command.name}`);
        }
    }
    // If no commands require user context, skip route scanning
    if (commandsRequiringUserContext.size === 0) {
        return { warnings, routesScanned: 0 };
    }
    // Find route files (Next.js App Router pattern)
    const routePatterns = [
        'app/api/**/route.ts',
        'app/api/**/route.js',
        'src/app/api/**/route.ts',
        'src/app/api/**/route.js',
        'apps/*/app/api/**/route.ts',
        'apps/*/app/api/**/route.js',
    ];
    const routeFiles = [];
    for (const pattern of routePatterns) {
        const files = await glob(pattern, {
            cwd: projectRoot,
            ignore: ['**/node_modules/**', '**/.next/**'],
            absolute: true
        });
        routeFiles.push(...files);
    }
    if (routeFiles.length === 0) {
        // No route files found - informational warning
        if (commandsRequiringUserContext.size > 0) {
            spinner.info(`No route files found. ${commandsRequiringUserContext.size} command(s) require user context.`);
        }
        return { warnings, routesScanned: 0 };
    }
    // Scan each route file
    for (const routeFile of routeFiles) {
        const result = await scanRouteFile(routeFile, commandsRequiringUserContext);
        warnings.push(...result.warnings);
        routesScanned += result.routesScanned;
    }
    return { warnings, routesScanned };
}
/**
 * Known built-in store targets (from runtime-engine.ts)
 */
const BUILTIN_STORE_TARGETS = ['memory', 'localStorage', 'postgres', 'supabase'];
/**
 * Get all manifest files from source pattern
 */
async function getManifestFiles(source, options) {
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
function isCommandCoveredByPolicy(entityName, policies) {
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
function findCommandLine(sourceLines, commandName) {
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
function findStoreLine(sourceLines, entityName, target) {
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
async function scanFile(filePath, spinner, runtimeConfig) {
    const compileToIR = await loadCompiler();
    const errors = [];
    const warnings = [];
    let commandsChecked = 0;
    let ir = null;
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
            return { errors, warnings, commandsChecked: 0, ir: null };
        }
    }
    // No IR means nothing to scan
    if (!result.ir) {
        return { errors, warnings, commandsChecked: 0, ir: null };
    }
    ir = result.ir;
    // Build a map of entity name → entity for command lookup
    const entityMap = new Map();
    for (const entity of ir.entities || []) {
        entityMap.set(entity.name, entity);
    }
    // Build a map of entity → store target from ir.stores
    const storeMap = new Map();
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
        }
        else if (!isBuiltin && hasConfigBinding) {
            // Custom store target WITH config binding - just informational
            // This is valid usage, no warning needed
        }
    }
    return { errors, warnings, commandsChecked, ir };
}
/**
 * Capitalize first letter of a string
 */
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
// ============================================================================
// Property Alignment Scanner (P1-B)
// ============================================================================
/**
 * Levenshtein distance between two strings
 * Used for "Did you mean X?" suggestions
 */
function levenshteinDistance(a, b) {
    if (a.length === 0)
        return b.length;
    if (b.length === 0)
        return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            }
            else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, // substitution
                matrix[i][j - 1] + 1, // insertion
                matrix[i - 1][j] + 1 // deletion
                );
            }
        }
    }
    return matrix[b.length][a.length];
}
/**
 * Find closest matching Prisma field names for suggestions
 */
function findClosestFields(propertyName, fieldNames, maxDistance = 3) {
    const suggestions = [];
    for (const fieldName of fieldNames) {
        const distance = levenshteinDistance(propertyName.toLowerCase(), fieldName.toLowerCase());
        if (distance <= maxDistance) {
            suggestions.push({ name: fieldName, distance });
        }
    }
    // Sort by distance and return names
    return suggestions
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 3)
        .map(s => s.name);
}
/**
 * Scan an entity's properties against a Prisma model for alignment issues
 */
function scanPropertyAlignment(entityName, entityProperties, prismaSchema, prismaModelName, propertyMapping) {
    const warnings = [];
    const model = getPrismaModel(prismaSchema, prismaModelName);
    if (!model) {
        warnings.push({
            file: '',
            message: `Entity '${entityName}' references Prisma model '${prismaModelName}' but model not found in schema.`,
            suggestion: `Available models: ${prismaSchema.models.map(m => m.name).join(', ')}`,
        });
        return warnings;
    }
    const fieldNames = getPrismaFieldNames(model);
    for (const prop of entityProperties) {
        const exists = propertyExistsInModel(model, prop.name, propertyMapping);
        if (!exists) {
            // Find suggestions
            const suggestions = findClosestFields(prop.name, fieldNames);
            let suggestionMsg = '';
            if (suggestions.length > 0) {
                suggestionMsg = `\n  Did you mean: ${suggestions.join(', ')}?`;
            }
            // Check if property might need mapping
            const hasMapping = propertyMapping && Object.values(propertyMapping).includes(prop.name);
            if (hasMapping) {
                continue; // Property is mapped, skip warning
            }
            warnings.push({
                file: '',
                message: `Entity '${entityName}' property '${prop.name}' (${prop.type}) not found in Prisma model '${prismaModelName}'.`,
                suggestion: `Add field to Prisma model or configure property mapping in manifest.config.ts.${suggestionMsg}`,
            });
        }
    }
    return warnings;
}
/**
 * Scan all entities for property alignment issues using Prisma schema
 */
async function scanPropertyAlignmentForIR(ir, runtimeConfig, buildConfig, projectRoot) {
    const warnings = [];
    // Find Prisma schema
    const schemaPath = await findPrismaSchemaPath(projectRoot, buildConfig);
    if (!schemaPath) {
        // No Prisma schema found - skip this check
        return warnings;
    }
    // Parse schema
    let prismaSchema;
    try {
        prismaSchema = await parsePrismaSchema(schemaPath);
    }
    catch (error) {
        warnings.push({
            file: schemaPath,
            message: `Failed to parse Prisma schema: ${error instanceof Error ? error.message : String(error)}`,
        });
        return warnings;
    }
    if (prismaSchema.models.length === 0) {
        warnings.push({
            file: schemaPath,
            message: 'Prisma schema found but contains no models.',
        });
        return warnings;
    }
    // Get store bindings for property mapping
    const storeBindingsInfo = getStoreBindingsInfo(runtimeConfig);
    // Check each entity
    for (const entity of ir.entities || []) {
        if (!entity.name || !entity.properties)
            continue;
        // Get the Prisma model name from config binding
        const prismaModelName = storeBindingsInfo.getPrismaModel(entity.name);
        if (!prismaModelName) {
            // Entity has no Prisma model binding - skip
            continue;
        }
        // Get property mapping if configured
        const propertyMapping = storeBindingsInfo.getPropertyMapping(entity.name);
        // Scan properties
        const entityWarnings = scanPropertyAlignment(entity.name, entity.properties.map((p) => ({ name: p.name, type: p.type })), prismaSchema, prismaModelName, propertyMapping);
        // Add file context to warnings
        for (const warning of entityWarnings) {
            warnings.push({
                ...warning,
                message: `[${entity.name}] ${warning.message}`,
            });
        }
    }
    return warnings;
}
/**
 * Format relative path for display
 */
function formatPath(filePath) {
    return path.relative(process.cwd(), filePath) || filePath;
}
/**
 * Scan command handler
 */
export async function scanCommand(source, options = {}) {
    const spinner = ora('Scanning manifest files').start();
    try {
        // Load runtime config for store binding validation
        let runtimeConfig = null;
        try {
            const configs = await loadAllConfigs(process.cwd());
            runtimeConfig = configs.runtime;
        }
        catch {
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
        const result = {
            errors: [],
            warnings: [],
            filesScanned: files.length,
            commandsChecked: 0,
            routesScanned: 0,
        };
        // Collect all IRs for route scanning
        const allIRs = [];
        for (const file of files) {
            const fileSpinner = ora().start();
            try {
                const fileResult = await scanFile(file, fileSpinner, runtimeConfig);
                result.errors.push(...fileResult.errors);
                result.warnings.push(...fileResult.warnings);
                result.commandsChecked += fileResult.commandsChecked;
                // Collect IR for route scanning
                if (fileResult.ir) {
                    allIRs.push(fileResult.ir);
                }
                if (fileResult.errors.length === 0 && fileResult.warnings.length === 0) {
                    fileSpinner.succeed(`${formatPath(file)} - OK`);
                }
                else if (fileResult.errors.length > 0) {
                    fileSpinner.fail(`${formatPath(file)} - ${fileResult.errors.length} error(s)`);
                }
                else {
                    fileSpinner.warn(`${formatPath(file)} - ${fileResult.warnings.length} warning(s)`);
                }
            }
            catch (error) {
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
        // Scan routes for context issues (if no compilation errors)
        if (result.errors.length === 0 && allIRs.length > 0) {
            const routeSpinner = ora('Scanning routes for context issues').start();
            try {
                // Merge all IRs for route scanning
                const mergedIR = {
                    commands: allIRs.flatMap(ir => ir.commands || []),
                    policies: allIRs.flatMap(ir => ir.policies || []),
                };
                const routeResult = await scanRoutes(process.cwd(), mergedIR, routeSpinner);
                result.warnings.push(...routeResult.warnings);
                result.routesScanned = routeResult.routesScanned;
                if (routeResult.warnings.length === 0 && routeResult.routesScanned > 0) {
                    routeSpinner.succeed(`Scanned ${routeResult.routesScanned} route(s) - OK`);
                }
                else if (routeResult.warnings.length > 0) {
                    routeSpinner.warn(`Found ${routeResult.warnings.length} route context issue(s)`);
                }
                else {
                    routeSpinner.info('No route files found to scan');
                }
            }
            catch (error) {
                routeSpinner.info(`Route scanning skipped: ${error.message}`);
            }
        }
        // Scan property alignment (Prisma schema validation) - P1-B
        if (result.errors.length === 0 && allIRs.length > 0) {
            const propertySpinner = ora('Scanning property alignment with Prisma schema').start();
            try {
                // Get build config for schema path
                const configs = await loadAllConfigs(process.cwd());
                // Merge all IRs for property scanning
                const mergedIR = {
                    entities: allIRs.flatMap(ir => ir.entities || []),
                    commands: allIRs.flatMap(ir => ir.commands || []),
                    policies: allIRs.flatMap(ir => ir.policies || []),
                };
                const propertyWarnings = await scanPropertyAlignmentForIR(mergedIR, runtimeConfig, configs.build, process.cwd());
                result.warnings.push(...propertyWarnings);
                if (propertyWarnings.length === 0) {
                    propertySpinner.succeed('Property alignment check passed');
                }
                else {
                    propertySpinner.warn(`Found ${propertyWarnings.length} property alignment issue(s)`);
                }
            }
            catch (error) {
                propertySpinner.info(`Property alignment scanning skipped: ${error.message}`);
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
                }
                else {
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
        if (result.routesScanned > 0) {
            console.log(`  Routes scanned: ${result.routesScanned}`);
        }
        if (result.errors.length === 0 && result.warnings.length === 0) {
            spinner.succeed('Scan passed - no issues found');
            console.log(chalk.green('\n  If `manifest scan` passes, the code works.'));
        }
        else if (result.errors.length === 0) {
            console.log(chalk.yellow(`  Warnings: ${result.warnings.length}`));
            if (options.strict) {
                spinner.fail('Scan failed with warnings (strict mode)');
                process.exit(1);
            }
            else {
                spinner.warn('Scan passed with warnings');
            }
        }
        else {
            spinner.fail(`Scan failed with ${result.errors.length} error(s), ${result.warnings.length} warning(s)`);
            process.exit(1);
        }
    }
    catch (error) {
        spinner.fail(`Scan failed: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}
//# sourceMappingURL=scan.js.map