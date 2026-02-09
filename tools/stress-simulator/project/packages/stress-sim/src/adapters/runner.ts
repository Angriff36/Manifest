export interface RunOutcome {
  kind: "success" | "denial" | "error" | "invariant_violation";
  message?: string;
  details?: unknown;
  emittedEvents?: { name: string; payload?: unknown }[];
}

export interface ScenarioAdapter {
  runScenario(scenario: unknown): RunOutcome;
  checkInvariants?(scenario: unknown, outcome: RunOutcome): { ok: boolean; violations: string[] };
}

export function createScenarioAdapter(): ScenarioAdapter {
  throw new Error("WIRE ME IN PROJECT");
}
