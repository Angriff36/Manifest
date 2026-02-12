#!/usr/bin/env node
import { Command } from "commander";
import { loadSchema, validateFile, validateDirectory } from "./validator.js";
import { formatSingleResult, formatBatchSummary } from "./formatter.js";
const program = new Command();
program
    .name("ir-validate")
    .description("Validate Manifest IR JSON files against ir-v1.schema.json")
    .version("1.0.0")
    .requiredOption("--schema <path>", "Path to the JSON Schema file")
    .option("--ir <file>", "Path to a single IR JSON file to validate")
    .option("--fixtures <dir>", "Path to a directory of IR JSON files to batch-validate")
    .option("--strict", "Enable strict mode (fail on additional properties and warnings)", false);
program.action(async (opts) => {
    const schema = opts["schema"];
    const ir = opts["ir"];
    const fixtures = opts["fixtures"];
    const strict = opts["strict"];
    if (!ir && !fixtures) {
        console.error("Error: Provide either --ir <file> or --fixtures <dir>");
        process.exit(1);
    }
    if (ir && fixtures) {
        console.error("Error: Provide either --ir or --fixtures, not both");
        process.exit(1);
    }
    const options = { strict };
    let schemaData;
    try {
        schemaData = await loadSchema(schema);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`Error: ${message}`);
        process.exit(1);
    }
    if (ir) {
        const result = await validateFile(schemaData, ir, options);
        console.log(formatSingleResult(result));
        process.exit(result.valid ? 0 : 1);
    }
    if (fixtures) {
        try {
            const summary = await validateDirectory(schemaData, fixtures, options);
            console.log(formatBatchSummary(summary));
            process.exit(summary.failed > 0 ? 1 : 0);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";
            console.error(`Error: ${message}`);
            process.exit(1);
        }
    }
});
program.parse();
//# sourceMappingURL=cli.js.map