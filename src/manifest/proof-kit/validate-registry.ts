/**
 * Validate proof registry against catalog, filesystem evidence, and versions.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import type { CapabilityCatalog, ProofRegistry, ProofStatus } from './types.js';

export interface ValidateProofRegistryOptions {
  rootDir: string;
  catalog: CapabilityCatalog;
  installedManifestVersion: string;
  installedPreset?: { id: string; version: string };
  /** Override existence check (tests). */
  fileExists?: (absolutePath: string) => boolean;
}

export interface ProofValidationIssue {
  code:
    | 'RUNTIME_PROOF_MISSING_TEST'
    | 'HANDWRITTEN_RUNTIME_CLAIM'
    | 'VERSION_MISMATCH'
    | 'PRESET_MISMATCH'
    | 'REACTION_MISSING'
    | 'UNKNOWN_COMMAND'
    | 'UNKNOWN_EVENT'
    | 'UNKNOWN_TEST_PATH'
    | 'STATUS_CONTRADICTS_EVIDENCE';
  message: string;
  proofId?: string;
}

const PRODUCT_STATUSES: ReadonlySet<ProofStatus> = new Set([
  'blocked_by_product_decision',
  'intentionally_unavailable',
]);

function evidenceCeiling(entry: {
  runtimeTest?: string;
  structuralTest?: string;
  status: ProofStatus;
}): ProofStatus {
  if (PRODUCT_STATUSES.has(entry.status)) return entry.status;
  if (entry.runtimeTest) return 'runtime_proven';
  if (entry.structuralTest) return 'structurally_proven';
  return entry.status === 'declared' ? 'declared' : 'generated';
}

/**
 * Returns issues. Empty array means the registry is consistent.
 */
export function validateProofRegistry(
  registry: ProofRegistry,
  options: ValidateProofRegistryOptions,
): ProofValidationIssue[] {
  const issues: ProofValidationIssue[] = [];
  const exists =
    options.fileExists ??
    ((abs: string) => existsSync(abs));

  if (registry.versions.manifestVersion !== options.installedManifestVersion) {
    issues.push({
      code: 'VERSION_MISMATCH',
      message: `Registry manifestVersion ${registry.versions.manifestVersion} != installed ${options.installedManifestVersion}`,
    });
  }

  if (options.installedPreset && registry.versions.preset) {
    const preset = registry.versions.preset;
    if (
      preset.id !== options.installedPreset.id ||
      preset.version !== options.installedPreset.version
    ) {
      issues.push({
        code: 'PRESET_MISMATCH',
        message: `Registry preset ${preset.id}@${preset.version} != installed ${options.installedPreset.id}@${options.installedPreset.version}`,
      });
    }
  }

  const catalogCommands = new Set<string>();
  const catalogEvents = new Set<string>();
  const catalogReactionIds = new Set<string>();
  for (const entity of options.catalog.entities) {
    for (const cmd of entity.commands) {
      catalogCommands.add(`${entity.entity}.${cmd.name}`);
      for (const ev of cmd.emits) catalogEvents.add(ev);
    }
    for (const reaction of entity.reactions) {
      catalogReactionIds.add(reaction.id);
      catalogEvents.add(reaction.event);
    }
  }

  for (const proof of registry.proofs) {
    if (proof.kind === 'command' && proof.command) {
      const key = `${proof.entity}.${proof.command}`;
      if (!catalogCommands.has(key)) {
        issues.push({
          code: 'UNKNOWN_COMMAND',
          proofId: proof.id,
          message: `Proof references unknown command ${key}`,
        });
      }
    }

    if (proof.kind === 'reaction') {
      if (proof.event && !catalogEvents.has(proof.event) && !catalogReactionIds.has(proof.id)) {
        // Reaction may be only on registry when filter dropped source entity;
        // still require target command if present in catalog.
      }
      if (proof.event && catalogReactionIds.size > 0 && !catalogReactionIds.has(proof.id)) {
        const stillDeclared = options.catalog.entities.some((e) =>
          e.reactions.some((r) => r.id === proof.id),
        );
        if (!stillDeclared && options.catalog.entities.length > 0) {
          // Only flag disappearance when catalog includes related entities.
          const related = options.catalog.entities.some(
            (e) => e.entity === proof.entity || e.commands.some((c) => c.emits.includes(proof.event!)),
          );
          if (related) {
            issues.push({
              code: 'REACTION_MISSING',
              proofId: proof.id,
              message: `Declared reaction ${proof.id} missing from catalog`,
            });
          }
        }
      }
    }

    for (const rel of [proof.structuralTest, proof.runtimeTest]) {
      if (!rel) continue;
      const abs = path.resolve(options.rootDir, rel);
      if (!exists(abs)) {
        issues.push({
          code: 'UNKNOWN_TEST_PATH',
          proofId: proof.id,
          message: `Proof ${proof.id} references missing test file ${rel}`,
        });
      }
    }

    if (proof.status === 'runtime_proven') {
      if (!proof.runtimeTest) {
        issues.push({
          code: 'HANDWRITTEN_RUNTIME_CLAIM',
          proofId: proof.id,
          message: `Proof ${proof.id} claims runtime_proven without runtimeTest path`,
        });
      } else {
        const abs = path.resolve(options.rootDir, proof.runtimeTest);
        if (!exists(abs)) {
          issues.push({
            code: 'RUNTIME_PROOF_MISSING_TEST',
            proofId: proof.id,
            message: `Proof ${proof.id} claims runtime_proven but test missing: ${proof.runtimeTest}`,
          });
        }
      }
    }

    const ceiling = evidenceCeiling(proof);
    if (
      !PRODUCT_STATUSES.has(proof.status) &&
      proof.status === 'runtime_proven' &&
      ceiling !== 'runtime_proven'
    ) {
      issues.push({
        code: 'STATUS_CONTRADICTS_EVIDENCE',
        proofId: proof.id,
        message: `Proof ${proof.id} status runtime_proven contradicts evidence`,
      });
    }
  }

  return issues;
}

export function assertProofRegistryValid(
  registry: ProofRegistry,
  options: ValidateProofRegistryOptions,
): void {
  const issues = validateProofRegistry(registry, options);
  if (issues.length === 0) return;
  const text = issues.map((i) => `[${i.code}] ${i.message}`).join('\n');
  throw new Error(`Proof registry validation failed:\n${text}`);
}
