/**
 * Static coherence checks for generated Convex seed scripts + event payloads.
 * Used by verifyConvexApplicationAssembly — keeps assembly-verify.ts small.
 */

import type { IR } from '../../ir.js';

export interface AssemblySeedCheck {
  id: string;
  pass: boolean;
  detail: string;
}

function mutationExports(mutationsCode: string): Set<string> {
  return new Set(
    [...mutationsCode.matchAll(/export const (\w+) = mutation\(/g)].map((m) => m[1]!),
  );
}

function seedMutationRefs(seedCode: string): string[] {
  return [...seedCode.matchAll(/api\.mutations\.(\w+)/g)].map((m) => m[1]!);
}

/** Detect duplicate object keys inside a single seed mutation arg literal. */
export function seedLineHasDuplicateKeys(line: string): boolean {
  const keys = [...line.matchAll(/"([^"]+)":/g)].map((m) => m[1]!);
  const seen = new Set<string>();
  for (const k of keys) {
    if (seen.has(k)) return true;
    seen.add(k);
  }
  return false;
}

export function checkSeedScriptCoherence(
  seedCode: string,
  mutationsCode: string,
): AssemblySeedCheck[] {
  const checks: AssemblySeedCheck[] = [];
  if (seedCode.length === 0) return checks;

  const emptyArgs = /\.mutation\([^,]+,\s*\{\s*\}\s*as any\)/.test(seedCode);
  checks.push({
    id: 'seed-script-args',
    pass: !emptyArgs,
    detail: emptyArgs
      ? 'seed script calls create mutations with empty {} args'
      : 'seed script has no empty mutation arg objects',
  });

  const dupLines = seedCode.split('\n').filter((l) => seedLineHasDuplicateKeys(l));
  checks.push({
    id: 'seed-script-duplicate-keys',
    pass: dupLines.length === 0,
    detail:
      dupLines.length === 0
        ? 'seed script has no duplicate object keys'
        : `seed script has ${dupLines.length} lines with duplicate object keys`,
  });

  const exports = mutationExports(mutationsCode);
  const missing = [...new Set(seedMutationRefs(seedCode))].filter((name) => !exports.has(name));
  checks.push({
    id: 'seed-script-mutations-exist',
    pass: missing.length === 0,
    detail:
      missing.length === 0
        ? 'all seed mutation refs exist in convex.mutations'
        : `seed calls missing mutations: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}`,
  });

  // String literals passed where create args are clearly numeric epoch fields
  // (dueDate/createdAt/etc. as JSON strings) — coarse static gate.
  const badTemporal = /"(dueDate|createdAt|updatedAt|completedDate|scheduledDate|expiresAt|nextRunAt)"\s*:\s*"/.test(
    seedCode,
  );
  checks.push({
    id: 'seed-script-temporal-types',
    pass: !badTemporal,
    detail: badTemporal
      ? 'seed script passes string literals for temporal fields (need epoch numbers)'
      : 'seed temporal fields are not string-typed literals',
  });

  return checks;
}

/**
 * Fail when an IR event declares payload fields but mutations still insert
 * `payload: {}` for that event type (executable contract gap).
 */
export function checkEventPayloadContract(
  ir: IR | undefined,
  mutationsCode: string,
): AssemblySeedCheck[] {
  if (!ir || mutationsCode.length === 0) {
    return [
      {
        id: 'event-payload-contract',
        pass: false,
        detail: !ir
          ? 'IR not provided — pass ir to verifyConvexApplicationAssembly for event contract checks'
          : 'convex.mutations artifact missing for event contract checks',
      },
    ];
  }

  const declared = new Set<string>();
  for (const ev of ir.events) {
    if (Array.isArray(ev.payload) && ev.payload.length > 0) {
      declared.add(ev.name);
    }
  }

  const emptyInserts: string[] = [];
  const re =
    /type:\s*"([^"]+)"[\s\S]*?payload:\s*\{\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(mutationsCode)) !== null) {
    const name = m[1]!;
    if (declared.has(name)) emptyInserts.push(name);
  }

  const unique = [...new Set(emptyInserts)];
  return [
    {
      id: 'event-payload-contract',
      pass: unique.length === 0,
      detail:
        unique.length === 0
          ? 'event inserts populate payloads when IR event schemas declare fields'
          : `${unique.length} events with schema fields still insert payload: {} (e.g. ${unique.slice(0, 5).join(', ')})`,
    },
  ];
}
