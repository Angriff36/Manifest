/**
 * manifest validate command
 *
 * Validates IR against the schema using Ajv for full JSON Schema compliance.
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';
import chalk from 'chalk';
import ora from 'ora';
import Ajv from 'ajv';
/**
 * Resolve the bundled schema path — works whether the CLI is run from inside
 * the manifest repo or installed as a package in a consumer project.
 *
 * The schema ships at: <package-root>/docs/spec/ir/ir-v1.schema.json
 * This file lives at:  <package-root>/packages/cli/dist/commands/validate.js
 * So we walk up 4 levels: commands → dist → cli → packages → package-root
 */
function bundledSchemaPath() {
    const here = path.dirname(fileURLToPath(import.meta.url));
    return path.join(here, '..', '..', '..', '..', 'docs', 'spec', 'ir', 'ir-v1.schema.json');
}
/**
 * Load JSON schema
 */
async function loadSchema(schemaPath) {
    if (!schemaPath) {
        // Use the schema bundled with the package — works in any consumer project
        const defaultPath = bundledSchemaPath();
        try {
            const content = await fs.readFile(defaultPath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            throw new Error(`Bundled schema not found at ${defaultPath}. ` +
                `This is a packaging bug — please report it. ` +
                `Workaround: specify --schema <path>`);
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
 * Format an Ajv error into a human-readable string
 */
function formatAjvError(error) {
    const field = error.instancePath
        ? error.instancePath.replace(/^\//, '').replace(/\//g, '.')
        : 'root';
    switch (error.keyword) {
        case 'required': {
            const missing = error.params?.missingProperty ?? '';
            const prefix = error.instancePath ? `${field}.` : '';
            return `Missing required field: ${prefix}${missing}`;
        }
        case 'additionalProperties': {
            const extra = error.params?.additionalProperty ?? '';
            return `Unknown field: ${field}.${extra}`;
        }
        case 'type':
            return `${field} must be of type ${error.params?.type}`;
        case 'const':
            return `${field} must be ${JSON.stringify(error.params?.allowedValue)}`;
        case 'enum':
            return `${field} must be one of: ${(error.params?.allowedValues ?? []).join(', ')}`;
        default:
            return `${field}: ${error.message}`;
    }
}
/**
 * Validate IR against schema using Ajv
 */
async function validateIR(irPath, schema, _strict) {
    const warnings = [];
    try {
        const irContent = await fs.readFile(irPath, 'utf-8');
        const ir = JSON.parse(irContent);
        const ajv = new Ajv({ allErrors: true });
        const validate = ajv.compile(schema);
        const valid = validate(ir);
        const errors = valid
            ? []
            : (validate.errors ?? []).map(formatAjvError);
        return { valid, errors, warnings };
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