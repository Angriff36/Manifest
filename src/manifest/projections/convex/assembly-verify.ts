/**
 * End-to-end Convex application assembly verification.
 *
 * Builder / CI call this after generating a Convex preset to prove the
 * assembly is complete: required surfaces, companions, seed binding, and
 * contract-tests are present — not merely individually registered.
 */

import { describeProjection, hasProjection } from '../registry.js';
import type { ConvexSeedBinding } from '../../seed-pack/convex-binding.js';

export const CONVEX_ASSEMBLY_REQUIRED_SURFACES = [
  'convex.schema',
  'convex.queries',
  'convex.mutations',
  'convex.crons',
  'convex.http',
  'convex.sagas',
  'convex.react',
] as const;

export const CONVEX_ASSEMBLY_REQUIRED_COMPANIONS = [
  'wiring',
  'llm-context',
  'mermaid',
  'zod',
  'contract-tests',
] as const;

export interface ConvexAssemblyArtifact {
  id: string;
  code: string;
}

export interface VerifyConvexApplicationAssemblyInput {
  /** Generated artifacts keyed by surface id (or artifact.id). */
  artifacts: ConvexAssemblyArtifact[];
  /** Optional seed binding from describeConvexSeedBinding / generateConvexSeedScript. */
  seedBinding?: ConvexSeedBinding;
  /** When true (default), require contract-tests projection to be registered. */
  requireContractTests?: boolean;
}

export interface ConvexAssemblyCheck {
  id: string;
  pass: boolean;
  detail: string;
}

export interface ConvexAssemblyVerification {
  ok: boolean;
  checks: ConvexAssemblyCheck[];
}

function artifactMap(artifacts: ConvexAssemblyArtifact[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of artifacts) m.set(a.id, a.code);
  return m;
}

/**
 * Verify a Convex application assembly against Manifest-published contracts.
 */
export function verifyConvexApplicationAssembly(
  input: VerifyConvexApplicationAssemblyInput,
): ConvexAssemblyVerification {
  const checks: ConvexAssemblyCheck[] = [];
  const codes = artifactMap(input.artifacts);
  const convex = describeProjection('convex');
  const companions = new Set(convex.compatibleCompanions);

  for (const surface of CONVEX_ASSEMBLY_REQUIRED_SURFACES) {
    const listed = convex.surfaceIds.includes(surface);
    const code = codes.get(surface);
    const hasCode = typeof code === 'string' && code.trim().length > 0;
    const pass = listed && hasCode;
    checks.push({
      id: `surface:${surface}`,
      pass,
      detail: !listed
        ? `${surface} missing from convex descriptor`
        : !hasCode
          ? `${surface} artifact missing or empty`
          : `${surface} present`,
    });
  }

  for (const name of CONVEX_ASSEMBLY_REQUIRED_COMPANIONS) {
    const pass = companions.has(name) && hasProjection(name);
    checks.push({
      id: `companion:${name}`,
      pass,
      detail: pass
        ? `${name} listed on convex.compatibleCompanions and registered`
        : `${name} not a published Convex companion or not registered`,
    });
  }

  const requireCt = input.requireContractTests !== false;
  if (requireCt) {
    const ctOk = hasProjection('contract-tests');
    const ctCode = codes.get('contract-tests.convex');
    const pass = ctOk && typeof ctCode === 'string' && ctCode.includes('Manifest Convex contract');
    checks.push({
      id: 'contract-tests',
      pass,
      detail: pass
        ? 'contract-tests.convex artifact present'
        : 'contract-tests projection/artifact missing',
    });
  }

  if (input.seedBinding) {
    const pass =
      input.seedBinding.packId.length > 0 &&
      input.seedBinding.entities.some((e) => e.createMutation != null);
    checks.push({
      id: 'seed-binding',
      pass,
      detail: pass
        ? `seed binding for pack ${input.seedBinding.packId}`
        : 'seed binding missing create mutations',
    });
  } else {
    checks.push({
      id: 'seed-binding',
      pass: false,
      detail: 'seedBinding not provided — call describeConvexSeedBinding / generateConvexSeedScript',
    });
  }

  const reactCode = codes.get('convex.react') ?? '';
  checks.push({
    id: 'frontend-convex-api',
    pass: reactCode.includes('convex/react') && reactCode.includes('useMutation'),
    detail: reactCode.includes('convex/react')
      ? 'convex.react client surface present'
      : 'convex.react artifact does not look like a Convex React client',
  });

  return { ok: checks.every((c) => c.pass), checks };
}
