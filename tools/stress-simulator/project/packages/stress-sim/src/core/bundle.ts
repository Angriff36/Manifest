import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hashScenario } from "./hash.js";
import type { RunOutcome } from "../adapters/runner.js";

export interface BundleOptions {
  outDir: string;
  seed: number;
  index: number;
  includeMeta: boolean;
}

export interface WrittenBundle {
  hash: string;
  dir: string;
}

export function writeReproBundle(
  scenario: unknown,
  outcome: RunOutcome,
  options: BundleOptions
): WrittenBundle {
  const hash = hashScenario(scenario);
  const dir = join(options.outDir, "failures", hash);

  mkdirSync(dir, { recursive: true });

  writeFileSync(join(dir, "scenario.json"), JSON.stringify(scenario, null, 2));
  writeFileSync(join(dir, "outcome.json"), JSON.stringify(outcome, null, 2));

  if (options.includeMeta) {
    const meta = {
      seed: options.seed,
      index: options.index,
      timestamp: new Date().toISOString(),
    };
    writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  }

  return { hash, dir };
}
