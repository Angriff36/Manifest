import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadSchema, validateFile, validateDirectory } from "../src/validator.js";

const FIXTURES_DIR = resolve(import.meta.dirname, "../fixtures");
const SCHEMA_PATH = resolve(FIXTURES_DIR, "ir-v1.schema.json");
const VALID_IR = resolve(FIXTURES_DIR, "valid.ir.json");
const INVALID_IR = resolve(FIXTURES_DIR, "invalid.ir.json");

describe("loadSchema", () => {
  it("loads a valid schema file", async () => {
    const schema = await loadSchema(SCHEMA_PATH);
    expect(schema).toBeDefined();
    expect(typeof schema).toBe("object");
  });

  it("throws on missing schema file", async () => {
    await expect(loadSchema("/nonexistent/schema.json")).rejects.toThrow(
      "Failed to load schema"
    );
  });
});

describe("validateFile", () => {
  let schema: unknown;

  it("loads schema for tests", async () => {
    schema = await loadSchema(SCHEMA_PATH);
  });

  it("validates a correct IR file", async () => {
    schema = await loadSchema(SCHEMA_PATH);
    const result = await validateFile(schema, VALID_IR, { strict: false });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.parseError).toBeUndefined();
  });

  it("rejects an invalid IR file with errors", async () => {
    schema = await loadSchema(SCHEMA_PATH);
    const result = await validateFile(schema, INVALID_IR, { strict: false });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("reports errors with JSON paths", async () => {
    schema = await loadSchema(SCHEMA_PATH);
    const result = await validateFile(schema, INVALID_IR, { strict: false });
    const paths = result.errors.map((e) => e.path);
    expect(paths.some((p) => p.includes("version") || p.includes("entities") || p === "/")).toBe(
      true
    );
  });

  it("returns parse error for invalid JSON", async () => {
    schema = await loadSchema(SCHEMA_PATH);
    const result = await validateFile(schema, SCHEMA_PATH + ".nonexistent", {
      strict: false,
    });
    expect(result.valid).toBe(false);
    expect(result.parseError).toBeDefined();
  });

  it("each error has required fields", async () => {
    schema = await loadSchema(SCHEMA_PATH);
    const result = await validateFile(schema, INVALID_IR, { strict: false });
    for (const err of result.errors) {
      expect(err).toHaveProperty("path");
      expect(err).toHaveProperty("message");
      expect(err).toHaveProperty("keyword");
      expect(err).toHaveProperty("params");
      expect(typeof err.path).toBe("string");
      expect(typeof err.message).toBe("string");
      expect(typeof err.keyword).toBe("string");
    }
  });
});

describe("validateDirectory", () => {
  it("validates all JSON files in a directory", async () => {
    const schema = await loadSchema(SCHEMA_PATH);
    const summary = await validateDirectory(schema, FIXTURES_DIR, {
      strict: false,
    });
    expect(summary.total).toBeGreaterThanOrEqual(2);
    expect(summary.passed).toBeGreaterThanOrEqual(1);
    expect(summary.failed).toBeGreaterThanOrEqual(1);
    expect(summary.passed + summary.failed).toBe(summary.total);
  });

  it("throws on nonexistent directory", async () => {
    const schema = await loadSchema(SCHEMA_PATH);
    await expect(
      validateDirectory(schema, "/nonexistent/dir", { strict: false })
    ).rejects.toThrow("Directory not found");
  });

  it("results array matches total count", async () => {
    const schema = await loadSchema(SCHEMA_PATH);
    const summary = await validateDirectory(schema, FIXTURES_DIR, {
      strict: false,
    });
    expect(summary.results).toHaveLength(summary.total);
  });
});
