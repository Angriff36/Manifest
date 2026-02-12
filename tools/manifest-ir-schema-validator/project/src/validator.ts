import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  BatchSummary,
  FileResult,
  ValidatorOptions,
} from "./types.js";
import { toValidationError } from "./types.js";

function createAjv(strict: boolean): Ajv {
  const ajv = new Ajv({
    allErrors: true,
    verbose: true,
    strict: strict,
    strictSchema: false, // Allow $schema reference without validating it
    strictTypes: strict,
  });
  addFormats(ajv);
  return ajv;
}

async function loadJson(filePath: string): Promise<unknown> {
  const raw = await readFile(resolve(filePath), "utf-8");
  return JSON.parse(raw) as unknown;
}

export async function loadSchema(schemaPath: string): Promise<unknown> {
  try {
    return await loadJson(schemaPath);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error loading schema";
    throw new Error(`Failed to load schema from ${schemaPath}: ${message}`);
  }
}

export async function validateFile(
  schemaData: unknown,
  filePath: string,
  options: ValidatorOptions
): Promise<FileResult> {
  const resolvedPath = resolve(filePath);
  const ajv = createAjv(options.strict);

  let validate;
  try {
    validate = ajv.compile(schemaData as Record<string, unknown>);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown schema compilation error";
    return {
      filePath: resolvedPath,
      valid: false,
      errors: [],
      parseError: `Schema compilation failed: ${message}`,
    };
  }

  let data: unknown;
  try {
    data = await loadJson(resolvedPath);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown parse error";
    return {
      filePath: resolvedPath,
      valid: false,
      errors: [],
      parseError: `Failed to parse JSON: ${message}`,
    };
  }

  const valid = validate(data);

  if (valid) {
    return { filePath: resolvedPath, valid: true, errors: [] };
  }

  const errors = (validate.errors ?? []).map(toValidationError);
  return { filePath: resolvedPath, valid: false, errors };
}

export async function validateDirectory(
  schemaData: unknown,
  dirPath: string,
  options: ValidatorOptions
): Promise<BatchSummary> {
  const resolvedDir = resolve(dirPath);

  let dirStat;
  try {
    dirStat = await stat(resolvedDir);
  } catch {
    throw new Error(`Directory not found: ${resolvedDir}`);
  }

  if (!dirStat.isDirectory()) {
    throw new Error(`Not a directory: ${resolvedDir}`);
  }

  const entries = await readdir(resolvedDir);
  const jsonFiles = entries
    .filter((f) => f.endsWith(".ir.json"))
    .map((f) => join(resolvedDir, f));

  if (jsonFiles.length === 0) {
    throw new Error(`No JSON files found in ${resolvedDir}`);
  }

  const results = await Promise.all(
    jsonFiles.map((f) => validateFile(schemaData, f, options))
  );

  const passed = results.filter((r) => r.valid).length;
  const failed = results.filter((r) => !r.valid).length;

  return {
    total: results.length,
    passed,
    failed,
    results,
  };
}
