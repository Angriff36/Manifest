import { SeededRng } from "./rng.js";
import { generateScenario } from "./generator.js";
import { writeReproBundle } from "./bundle.js";
import { printSummary, type RunResult } from "./summary.js";
import type { ScenarioAdapter } from "../adapters/runner.js";

export interface EngineOptions {
  seed: number;
  count: number;
  outDir: string;
  includeMeta: boolean;
  adapter: ScenarioAdapter;
}

export interface EngineResult {
  results: RunResult[];
  failureHashes: string[];
}

export function runEngine(options: EngineOptions): EngineResult {
  const { seed, count, outDir, includeMeta, adapter } = options;
  const rng = new SeededRng(seed);
  const results: RunResult[] = [];
  const failureHashes: string[] = [];

  for (let i = 0; i < count; i++) {
    const scenarioRng = rng.fork();
    const scenario = generateScenario(scenarioRng);
    let outcome = adapter.runScenario(scenario);

    if (outcome.kind === "success" && adapter.checkInvariants) {
      const check = adapter.checkInvariants(scenario, outcome);
      if (!check.ok) {
        outcome = {
          kind: "invariant_violation",
          message: check.violations.join("; "),
          details: { originalOutcome: outcome, violations: check.violations },
        };
      }
    }

    results.push({ scenario, outcome, index: i });

    if (outcome.kind !== "success") {
      const bundle = writeReproBundle(scenario, outcome, {
        outDir,
        seed,
        index: i,
        includeMeta,
      });
      failureHashes.push(bundle.hash);
    }
  }

  printSummary(results);

  return { results, failureHashes };
}
