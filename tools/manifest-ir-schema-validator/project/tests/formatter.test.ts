import { describe, it, expect } from "vitest";
import { formatSingleResult, formatBatchSummary } from "../src/formatter.js";
import type { FileResult, BatchSummary } from "../src/types.js";

describe("formatSingleResult", () => {
  it("shows pass indicator for valid file", () => {
    const result: FileResult = {
      filePath: "/path/to/valid.ir.json",
      valid: true,
      errors: [],
    };
    const output = formatSingleResult(result);
    expect(output).toContain("\u2705");
    expect(output).toContain("valid.ir.json");
  });

  it("shows fail indicator for invalid file", () => {
    const result: FileResult = {
      filePath: "/path/to/invalid.ir.json",
      valid: false,
      errors: [
        {
          path: "/version",
          message: "must be equal to one of the allowed values",
          keyword: "enum",
          params: { allowedValues: ["1.0"] },
        },
      ],
    };
    const output = formatSingleResult(result);
    expect(output).toContain("\u274C");
    expect(output).toContain("invalid.ir.json");
    expect(output).toContain("/version");
    expect(output).toContain("enum");
  });

  it("shows parse error when JSON is malformed", () => {
    const result: FileResult = {
      filePath: "/path/to/broken.json",
      valid: false,
      errors: [],
      parseError: "Unexpected token at position 42",
    };
    const output = formatSingleResult(result);
    expect(output).toContain("\u274C");
    expect(output).toContain("Parse error");
    expect(output).toContain("Unexpected token");
  });

  it("displays multiple errors on separate lines", () => {
    const result: FileResult = {
      filePath: "/path/to/multi-error.json",
      valid: false,
      errors: [
        {
          path: "/version",
          message: "must be equal to one of the allowed values",
          keyword: "enum",
          params: {},
        },
        {
          path: "/entities/0/name",
          message: "must NOT have fewer than 1 characters",
          keyword: "minLength",
          params: {},
        },
      ],
    };
    const output = formatSingleResult(result);
    const lines = output.split("\n");
    expect(lines.length).toBe(3);
    expect(lines[1]).toContain("/version");
    expect(lines[2]).toContain("/entities/0/name");
  });
});

describe("formatBatchSummary", () => {
  it("includes summary counts", () => {
    const summary: BatchSummary = {
      total: 3,
      passed: 2,
      failed: 1,
      results: [
        { filePath: "/a.json", valid: true, errors: [] },
        { filePath: "/b.json", valid: true, errors: [] },
        {
          filePath: "/c.json",
          valid: false,
          errors: [
            { path: "/version", message: "bad version", keyword: "enum", params: {} },
          ],
        },
      ],
    };
    const output = formatBatchSummary(summary);
    expect(output).toContain("Total: 3");
    expect(output).toContain("Passed: 2");
    expect(output).toContain("Failed: 1");
  });

  it("includes each file result", () => {
    const summary: BatchSummary = {
      total: 2,
      passed: 1,
      failed: 1,
      results: [
        { filePath: "/ok.ir.json", valid: true, errors: [] },
        {
          filePath: "/bad.ir.json",
          valid: false,
          errors: [
            { path: "/entities", message: "missing", keyword: "required", params: {} },
          ],
        },
      ],
    };
    const output = formatBatchSummary(summary);
    expect(output).toContain("ok.ir.json");
    expect(output).toContain("bad.ir.json");
    expect(output).toContain("\u2705");
    expect(output).toContain("\u274C");
  });
});
