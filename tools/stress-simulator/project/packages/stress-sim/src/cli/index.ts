#!/usr/bin/env node

import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { runEngine } from "../core/engine.js";
import { createScenarioAdapter } from "../adapters/runner.js";

function main(): void {
  const { values } = parseArgs({
    options: {
      count: { type: "string", short: "n", default: "100" },
      seed: { type: "string", short: "s", default: "42" },
      out: { type: "string", short: "o", default: "artifacts/stress" },
      meta: { type: "boolean", default: false },
    },
    strict: true,
  });

  const count = parseInt(values.count!, 10);
  const seed = parseInt(values.seed!, 10);
  const outDir = resolve(values.out!);
  const includeMeta = values.meta ?? false;

  if (isNaN(count) || count < 1) {
    console.error("--count must be a positive integer");
    process.exit(1);
  }

  if (isNaN(seed)) {
    console.error("--seed must be an integer");
    process.exit(1);
  }

  console.log(`stress-sim: running ${count} scenarios (seed=${seed})`);
  console.log(`output: ${outDir}`);

  const adapter = createScenarioAdapter();

  runEngine({ seed, count, outDir, includeMeta, adapter });
}

main();
