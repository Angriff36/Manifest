/**
 * Emit proof registry connecting declared capabilities/reactions to tests.
 */

import type { IR } from '../ir.js';
import { COMPILER_VERSION } from '../version.js';
import { emitCapabilityCatalog, reactionProofId, type EmitCatalogOptions } from './emit-catalog.js';
import type { ProofKitVersions, ProofRegistry, ProofRegistryEntry, ProofStatus } from './types.js';
import { PROOF_REGISTRY_SCHEMA } from './types.js';

export interface ProofTestBinding {
  proofId: string;
  structuralTest?: string;
  runtimeTest?: string;
  lastVerifiedCommit?: string;
  /** Force status (e.g. blocked_by_product_decision). Cannot invent runtime_proven without a test path. */
  statusOverride?: ProofStatus;
}

export interface EmitRegistryOptions extends EmitCatalogOptions {
  testBindings?: readonly ProofTestBinding[];
}

function evidenceStatus(binding: ProofTestBinding | undefined, declared: ProofStatus): ProofStatus {
  if (binding?.statusOverride === 'blocked_by_product_decision') {
    return 'blocked_by_product_decision';
  }
  if (binding?.statusOverride === 'intentionally_unavailable') {
    return 'intentionally_unavailable';
  }
  if (binding?.runtimeTest) return 'runtime_proven';
  if (binding?.structuralTest) return 'structurally_proven';
  return declared;
}

/**
 * Build proof registry from IR. Status is derived from test bindings — callers
 * cannot claim runtime_proven without a runtimeTest path.
 */
export function emitProofRegistry(ir: IR, options: EmitRegistryOptions = {}): ProofRegistry {
  const catalog = emitCapabilityCatalog(ir, options);
  const versions: ProofKitVersions = {
    manifestVersion: options.versions?.manifestVersion ?? COMPILER_VERSION,
    projection: options.versions?.projection ?? catalog.versions.projection ?? 'convex',
    ...((options.versions?.preset ?? catalog.versions.preset)
      ? { preset: options.versions?.preset ?? catalog.versions.preset }
      : {}),
  };

  const bindings = new Map((options.testBindings ?? []).map((b) => [b.proofId, b]));
  const proofs: ProofRegistryEntry[] = [];

  for (const entity of catalog.entities) {
    for (const cmd of entity.commands) {
      const id = `${entity.entity}.${cmd.name}`;
      const binding = bindings.get(id);
      proofs.push({
        id,
        kind: 'command',
        entity: entity.entity,
        command: cmd.name,
        structuralTest: binding?.structuralTest,
        runtimeTest: binding?.runtimeTest,
        status: evidenceStatus(binding, 'generated'),
        versions,
        ...(binding?.lastVerifiedCommit ? { lastVerifiedCommit: binding.lastVerifiedCommit } : {}),
      });
    }
    for (const reaction of entity.reactions) {
      // Deduplicate: reactions appear on both source and target entities.
      if (proofs.some((p) => p.id === reaction.id)) continue;
      const binding = bindings.get(reaction.id);
      proofs.push({
        id: reaction.id,
        kind: 'reaction',
        entity: reaction.targetEntity,
        command: reaction.targetCommand,
        event: reaction.event,
        expectedConsequence: reaction.expectedConsequence,
        structuralTest: binding?.structuralTest,
        runtimeTest: binding?.runtimeTest,
        status: evidenceStatus(binding, 'generated'),
        versions,
        ...(binding?.lastVerifiedCommit ? { lastVerifiedCommit: binding.lastVerifiedCommit } : {}),
      });
    }
  }

  // Ensure IR reactions not filtered out of catalog still appear when filter used.
  for (const rule of ir.reactions ?? []) {
    const id = reactionProofId(rule);
    if (proofs.some((p) => p.id === id)) continue;
    if (options.entityFilter) {
      const filter = new Set(
        Array.isArray(options.entityFilter) ? options.entityFilter : [...options.entityFilter],
      );
      if (!filter.has(rule.targetEntity)) continue;
    }
    const binding = bindings.get(id);
    proofs.push({
      id,
      kind: 'reaction',
      entity: rule.targetEntity,
      command: rule.targetCommand,
      event: rule.event,
      expectedConsequence: `${rule.targetEntity}.${rule.targetCommand}`,
      structuralTest: binding?.structuralTest,
      runtimeTest: binding?.runtimeTest,
      status: evidenceStatus(binding, 'declared'),
      versions,
      ...(binding?.lastVerifiedCommit ? { lastVerifiedCommit: binding.lastVerifiedCommit } : {}),
    });
  }

  proofs.sort((a, b) => a.id.localeCompare(b.id));

  return {
    schemaVersion: PROOF_REGISTRY_SCHEMA,
    irHash: ir.provenance?.contentHash ?? '',
    versions,
    proofs,
  };
}
