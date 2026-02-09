import { SeededRng } from "./rng.js";

export function generateScenario(rng: SeededRng): unknown {
  return buildValue(rng, 0);
}

function buildValue(rng: SeededRng, depth: number): unknown {
  if (depth > 4) return buildPrimitive(rng);

  const roll = rng.float();
  if (roll < 0.35) return buildObject(rng, depth);
  if (roll < 0.55) return buildArray(rng, depth);
  return buildPrimitive(rng);
}

function buildObject(rng: SeededRng, depth: number): Record<string, unknown> {
  const fieldCount = rng.int(1, 6);
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < fieldCount; i++) {
    const key = rng.string(rng.int(3, 10));
    obj[key] = buildValue(rng, depth + 1);
  }
  return obj;
}

function buildArray(rng: SeededRng, depth: number): unknown[] {
  const len = rng.int(0, 5);
  const arr: unknown[] = [];
  for (let i = 0; i < len; i++) {
    arr.push(buildValue(rng, depth + 1));
  }
  return arr;
}

function buildPrimitive(rng: SeededRng): unknown {
  const roll = rng.float();
  if (roll < 0.2) return rng.int(-1000, 1000);
  if (roll < 0.4) return rng.float() * 200 - 100;
  if (roll < 0.6) return rng.string(rng.int(1, 20));
  if (roll < 0.75) return rng.bool();
  if (roll < 0.85) return null;
  return rng.pick(["active", "pending", "closed", "error", "unknown"]);
}
