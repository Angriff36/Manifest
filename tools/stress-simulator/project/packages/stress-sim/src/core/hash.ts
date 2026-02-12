import { createHash } from "node:crypto";

export function hashScenario(scenario: unknown): string {
  const json = JSON.stringify(scenario, null, 0);
  return createHash("sha256").update(json).digest("hex").slice(0, 16);
}
