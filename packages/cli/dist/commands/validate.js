/**
 * manifest validate command
 *
 * Validates IR against the schema.
 */
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import chalk from 'chalk';
import ora from 'ora';
/**
 * Load JSON schema
 */
async function loadSchema(schemaPath) {
    if (!schemaPath) {
        // Default to Manifest IR schema
        const defaultPath = path.resolve(process.cwd(), 'docs/spec/ir/ir-v1.schema.json');
        try {
            const content = await fs.readFile(defaultPath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            throw new Error(`Schema not found at ${defaultPath}. Specify --schema <path>`);
        }
    }
    const resolved = path.resolve(process.cwd(), schemaPath);
    const content = await fs.readFile(resolved, 'utf-8');
    return JSON.parse(content);
}
/**
 * Get all IR files
 */
async function getIRFiles(irInput) {
    if (irInput) {
        const resolved = path.resolve(process.cwd(), irInput);
        const stat = await fs.stat(resolved).catch(() => null);
        if (stat && stat.isDirectory()) {
            const files = await glob('**/*.ir.json', { cwd: resolved });
            return files.map(f => path.join(resolved, f));
        }
        return [resolved];
    }
    // Find all .ir.json files in current directory
    const files = await glob('**/*.ir.json', {
        cwd: process.cwd(),
        ignore: ['node_modules/**', 'dist/**', '.next/**']
    });
    return files.map(f => path.resolve(process.cwd(), f));
}
/**
 * Validate IR against schema
 *
 * Note: This is a basic implementation. For full JSON Schema validation,
 * you'd use a library like Ajv.
 */
async function validateIR(irPath, schema, strict) {
    const errors = [];
    const warnings = [];
    try {
        const irContent = await fs.readFile(irPath, 'utf-8');
        const ir = JSON.parse(irContent);
        // Basic validation: check required fields
        if (!ir.metadata) {
            errors.push('Missing required field: metadata');
        }
        else {
            if (!ir.metadata.compilerVersion) {
                errors.push('Missing required field: metadata.compilerVersion');
            }
            if (!ir.metadata.schemaVersion) {
                warnings.push('Missing recommended field: metadata.schemaVersion');
            }
        }
        if (!ir.entities && !ir.commands) {
            errors.push('IR must contain entities or commands');
        }
        // Check for valid schema version
        if (ir.metadata?.schemaVersion && ir.metadata.schemaVersion !== 'v1') {
            warnings.push(`Unknown schema version: ${ir.metadata.schemaVersion} (expected: v1)`);
        }
        // Validate entities if present
        if (ir.entities) {
            if (!Array.isArray(ir.entities)) {
                errors.push('entities must be an array');
            }
            else {
                ir.entities.forEach((entity, index) => {
                    if (!entity.name) {
                        errors.push(`entities[${index}].name is required`);
                    }
                    if (!entity.properties || !Array.isArray(entity.properties)) {
                        errors.push(`entities[${index}].properties must be an array`);
                    }
                });
            }
        }
        // Validate commands if present
        if (ir.commands) {
            if (!Array.isArray(ir.commands)) {
                errors.push('commands must be an array');
            }
            else {
                ir.commands.forEach((command, index) => {
                    if (!command.name) {
                        errors.push(`commands[${index}].name is required`);
                    }
                });
            }
        }
        // In strict mode, warnings are treated as errors
        if (strict && warnings.length > 0) {
            errors.push(...warnings.map(w => `[STRICT] ${w}`));
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return {
                valid: false,
                errors: [`File not found: ${irPath}`],
                warnings: [],
            };
        }
        if (error instanceof SyntaxError) {
            return {
                valid: false,
                errors: [`Invalid JSON: ${error.message}`],
                warnings: [],
            };
        }
        throw error;
    }
}
/**
 * Validate command handler
 */
export async function validateCommand(ir, options) {
    const spinner = ora('Loading schema').start();
    try {
        // Load schema
        const schema = await loadSchema(options.schema);
        spinner.text = 'Schema loaded';
        // Get IR files
        spinner.text = 'Finding IR files...';
        const irFiles = await getIRFiles(ir);
        if (irFiles.length === 0) {
            spinner.warn('No IR files found');
            console.log('  Generate IR first with: manifest compile <source>');
            return;
        }
        spinner.info(`Validating ${irFiles.length} IR file(s)`);
        console.log('');
        // Validate each file
        let validCount = 0;
        let invalidCount = 0;
        const allErrors = [];
        for (const irFile of irFiles) {
            const fileSpinner = ora(`Validating ${path.relative(process.cwd(), irFile)}`).start();
            const result = await validateIR(irFile, schema, options.strict);
            if (result.valid) {
                fileSpinner.succeed(chalk.green(`✓ ${path.relative(process.cwd(), irFile)}`));
                if (result.warnings.length > 0) {
                    result.warnings.forEach(warning => {
                        console.warn(chalk.yellow(`  ⚠ ${warning}`));
                    });
                }
                validCount++;
            }
            else {
                fileSpinner.fail(chalk.red(`✗ ${path.relative(process.cwd(), irFile)}`));
                result.errors.forEach(error => {
                    console.error(chalk.red(`  • ${error}`));
                });
                if (result.warnings.length > 0) {
                    result.warnings.forEach(warning => {
                        console.warn(chalk.yellow(`  ⚠ ${warning}`));
                    });
                }
                invalidCount++;
                allErrors.push(...result.errors.map(e => `${path.basename(irFile)}: ${e}`));
            }
            console.log('');
        }
        // Summary
        const summarySpinner = ora('Validation summary').start();
        if (invalidCount === 0) {
            summarySpinner.succeed(`All ${validCount} file(s) valid`);
        }
        else {
            summarySpinner.fail(`${invalidCount} file(s) invalid, ${validCount} valid`);
            console.error('');
            console.error(chalk.bold.red('Errors:'));
            for (const error of allErrors) {
                console.error(chalk.red(`  - ${error}`));
            }
            process.exit(1);
        }
    }
    catch (error) {
        spinner.fail(`Validation failed: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}
//# sourceMappingURL=validate.js.map