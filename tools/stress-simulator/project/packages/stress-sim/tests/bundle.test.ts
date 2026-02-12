import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runEngine } from "../src/core/engine.js";
import type { ScenarioAdapter, RunOutcome } from "../src/adapters/runner.js";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "stress-sim-bundle-"));
}

function createFailingAdapter(): ScenarioAdapter {
  return {
    runScenario(): RunOutcome {
      return { kind: "error", message: "always fails" };
    },
  };
}

function createMixedAdapter(): ScenarioAdapter {
  let counter = 0;
  return {
    runScenario(): RunOutcome {
      counter++;
      if (counter % 3 === 0) return { kind: "error", message: "mod 3 error" };
      if (counter % 5 === 0) return { kind: "denial", message: "mod 5 denial" };
      return { kind: "success" };
    },
  };
}

describe("repro bundle writing", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates failures directory with bundles", () => {
    const result = runEngine({
      seed: 42,
      count: 10,
      outDir: tempDir,
      includeMeta: false,
      adapter: createFailingAdapter(),
    });

    const failuresDir = join(tempDir, "failures");
    expect(existsSync(failuresDir)).toBe(true);

    const bundles = readdirSync(failuresDir);
    expect(bundles.length).toBeGreaterThan(0);
  });

  it("each bundle has scenario.json and outcome.json", () => {
    runEngine({
      seed: 42,
      count: 5,
      outDir: tempDir,
      includeMeta: false,
      adapter: createFailingAdapter(),
    });

    const failuresDir = join(tempDir, "failures");
    const bundles = readdirSync(failuresDir);

    for (const hash of bundles) {
      const bundleDir = join(failuresDir, hash);
      const scenarioPath = join(bundleDir, "scenario.json");
      const outcomePath = join(bundleDir, "outcome.json");

      expect(existsSync(scenarioPath)).toBe(true);
      expect(existsSync(outcomePath)).toBe(true);

      const scenario = JSON.parse(readFileSync(scenarioPath, "utf-8"));
      const outcome = JSON.parse(readFileSync(outcomePath, "utf-8"));

      expect(scenario).toBeDefined();
      expect(outcome.kind).toBe("error");
      expect(outcome.message).toBe("always fails");
    }
  });

  it("does not write meta.json when includeMeta is false", () => {
    runEngine({
      seed: 42,
      count: 5,
      outDir: tempDir,
      includeMeta: false,
      adapter: createFailingAdapter(),
    });

    const failuresDir = join(tempDir, "failures");
    const bundles = readdirSync(failuresDir);

    for (const hash of bundles) {
      expect(existsSync(join(failuresDir, hash, "meta.json"))).toBe(false);
    }
  });

  it("writes meta.json when includeMeta is true", () => {
    runEngine({
      seed: 42,
      count: 5,
      outDir: tempDir,
      includeMeta: true,
      adapter: createFailingAdapter(),
    });

    const failuresDir = join(tempDir, "failures");
    const bundles = readdirSync(failuresDir);

    for (const hash of bundles) {
      const metaPath = join(failuresDir, hash, "meta.json");
      expect(existsSync(metaPath)).toBe(true);

      const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
      expect(meta.seed).toBe(42);
      expect(typeof meta.index).toBe("number");
      expect(typeof meta.timestamp).toBe("string");
    }
  });

  it("only writes bundles for non-success outcomes", () => {
    const result = runEngine({
      seed: 99,
      count: 20,
      outDir: tempDir,
      includeMeta: false,
      adapter: createMixedAdapter(),
    });

    const failureCount = result.results.filter((r) => r.outcome.kind !== "success").length;
    const failuresDir = join(tempDir, "failures");

    if (failureCount === 0) {
      expect(existsSync(failuresDir)).toBe(false);
      return;
    }

    const bundles = readdirSync(failuresDir);
    expect(result.failureHashes.length).toBe(failureCount);
    expect(bundles.length).toBeLessThanOrEqual(failureCount);
  });

  it("bundle hash directories are 16 hex characters", () => {
    runEngine({
      seed: 42,
      count: 10,
      outDir: tempDir,
      includeMeta: false,
      adapter: createFailingAdapter(),
    });

    const failuresDir = join(tempDir, "failures");
    const bundles = readdirSync(failuresDir);

    for (const hash of bundles) {
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    }
  });
});
