import { describe, it, expect } from "vitest";
import { SeededRng } from "../src/core/rng.js";
import { generateScenario } from "../src/core/generator.js";
import { hashScenario } from "../src/core/hash.js";
import { runEngine } from "../src/core/engine.js";
import type { ScenarioAdapter, RunOutcome } from "../src/adapters/runner.js";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "stress-sim-test-"));
}

function createTestAdapter(): ScenarioAdapter {
  return {
    runScenario(scenario: unknown): RunOutcome {
      const json = JSON.stringify(scenario);
      const hash = Array.from(json).reduce((a, c) => a + c.charCodeAt(0), 0);
      if (hash % 5 === 0) return { kind: "error", message: "hash divisible by 5" };
      if (hash % 7 === 0) return { kind: "denial", message: "hash divisible by 7" };
      if (hash % 11 === 0) return { kind: "invariant_violation", message: "hash divisible by 11" };
      return { kind: "success" };
    },
  };
}

describe("SeededRng determinism", () => {
  it("produces identical sequences for the same seed", () => {
    const rng1 = new SeededRng(42);
    const rng2 = new SeededRng(42);

    const seq1 = Array.from({ length: 100 }, () => rng1.float());
    const seq2 = Array.from({ length: 100 }, () => rng2.float());

    expect(seq1).toEqual(seq2);
  });

  it("produces different sequences for different seeds", () => {
    const rng1 = new SeededRng(1);
    const rng2 = new SeededRng(2);

    const seq1 = Array.from({ length: 20 }, () => rng1.float());
    const seq2 = Array.from({ length: 20 }, () => rng2.float());

    expect(seq1).not.toEqual(seq2);
  });
});

describe("scenario generation determinism", () => {
  it("generates identical scenarios for the same seed", () => {
    const rng1 = new SeededRng(1);
    const rng2 = new SeededRng(1);

    const s1 = generateScenario(rng1);
    const s2 = generateScenario(rng2);

    expect(s1).toEqual(s2);
    expect(hashScenario(s1)).toBe(hashScenario(s2));
  });

  it("generates a batch deterministically", () => {
    function generateBatch(seed: number, count: number) {
      const rng = new SeededRng(seed);
      return Array.from({ length: count }, () => {
        const fork = rng.fork();
        return generateScenario(fork);
      });
    }

    const batch1 = generateBatch(123, 50);
    const batch2 = generateBatch(123, 50);

    const hashes1 = batch1.map(hashScenario);
    const hashes2 = batch2.map(hashScenario);

    expect(hashes1).toEqual(hashes2);
  });
});

describe("engine determinism", () => {
  it("seed 1 run twice produces identical failure hashes", () => {
    const dir1 = makeTempDir();
    const dir2 = makeTempDir();

    try {
      const adapter = createTestAdapter();

      const result1 = runEngine({
        seed: 1,
        count: 200,
        outDir: dir1,
        includeMeta: false,
        adapter,
      });

      const result2 = runEngine({
        seed: 1,
        count: 200,
        outDir: dir2,
        includeMeta: false,
        adapter,
      });

      expect(result1.failureHashes).toEqual(result2.failureHashes);
      expect(result1.failureHashes.length).toBeGreaterThan(0);

      expect(result1.results.map((r) => r.outcome.kind)).toEqual(
        result2.results.map((r) => r.outcome.kind)
      );
    } finally {
      rmSync(dir1, { recursive: true, force: true });
      rmSync(dir2, { recursive: true, force: true });
    }
  });
});
