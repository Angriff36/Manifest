import type { RunOutcome } from "../adapters/runner.js";

export interface RunResult {
  scenario: unknown;
  outcome: RunOutcome;
  index: number;
}

export function printSummary(results: RunResult[]): void {
  const counts: Record<string, number> = {
    success: 0,
    denial: 0,
    error: 0,
    invariant_violation: 0,
  };

  const messageCounts = new Map<string, number>();

  for (const r of results) {
    counts[r.outcome.kind] = (counts[r.outcome.kind] ?? 0) + 1;

    if (r.outcome.kind !== "success" && r.outcome.message) {
      const prev = messageCounts.get(r.outcome.message) ?? 0;
      messageCounts.set(r.outcome.message, prev + 1);
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Total scenarios: ${results.length}`);
  console.log("");

  const kindWidth = 22;
  const countWidth = 8;
  console.log(`${"Kind".padEnd(kindWidth)}${"Count".padStart(countWidth)}`);
  console.log("-".repeat(kindWidth + countWidth));
  for (const [kind, count] of Object.entries(counts)) {
    console.log(`${kind.padEnd(kindWidth)}${String(count).padStart(countWidth)}`);
  }

  if (messageCounts.size > 0) {
    console.log("");
    console.log("Top 10 unique messages:");
    console.log("-".repeat(50));

    const sorted = [...messageCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    for (const [msg, count] of sorted) {
      const truncated = msg.length > 60 ? msg.slice(0, 57) + "..." : msg;
      console.log(`  [${count}x] ${truncated}`);
    }
  }

  console.log("");
}
