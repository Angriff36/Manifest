/**
 * Semantic proof for wire-existing-control — exact action intent required.
 *
 * Same entity / page / file-wide keywords are never enough. The specific
 * control must already represent the command action.
 */

import type { WiringCommandDescriptor } from '../types.js';
import {
  bindingHasInstanceIdentity,
  classifyUnrelatedHandler,
  clientFn,
  entitySurfaceProven,
  findActionIntentControls,
  findIdentityAtControlSite,
  inputsBuildable,
  labelMatchesCommand,
  wiredControlLabel,
  type ControlCandidate,
} from './control-semantic-helpers.js';

export interface ControlSemanticSurface {
  file: string;
  controlSymbol: string;
  bindingCallee: string;
  ensureImport?: { module: string; names: string[] };
  identityExpression?: string;
  matchReasons: string[];
  handlerSnippet: string;
  labelText?: string;
  /** Exact control source fingerprint for targeted patching. */
  controlSource?: string;
}

export interface ControlSemanticVerdict {
  ok: boolean;
  reason: string;
  surface?: ControlSemanticSurface;
}

export function proveControlSemanticMatch(
  cap: WiringCommandDescriptor,
  file: string,
  content: string,
): ControlSemanticVerdict {
  const norm = file.replace(/\\/g, '/').toLowerCase();
  if (norm.includes('node_modules') || norm.includes('.generated')) {
    return { ok: false, reason: 'File is not a product surface' };
  }
  if (!/\.(tsx|jsx|ts)$/.test(norm)) {
    return { ok: false, reason: 'File is not a UI control surface' };
  }

  if (!entitySurfaceProven(cap.entity, file, content)) {
    return {
      ok: false,
      reason: `No proven product surface for entity ${cap.entity} in ${file}`,
    };
  }

  const candidates = findActionIntentControls(cap, content);
  if (candidates.length === 0) {
    return {
      ok: false,
      reason: `No control with exact action intent for ${cap.capabilityId}`,
    };
  }

  // Prefer explicit capability markers, then label, then handler name.
  const ranked = [...candidates].sort((a, b) => rank(a) - rank(b));
  for (const candidate of ranked) {
    const verdict = evaluateCandidate(cap, file, content, candidate);
    if (verdict.ok) return verdict;
  }

  return {
    ok: false,
    reason:
      ranked[0]?.matchKind === 'explicit-capability'
        ? `Explicit marker found but semantic gates failed for ${cap.capabilityId}`
        : `No control passed action-intent gates for ${cap.capabilityId}`,
  };
}

function evaluateCandidate(
  cap: WiringCommandDescriptor,
  file: string,
  content: string,
  candidate: ControlCandidate,
): ControlSemanticVerdict {
  const unrelated = classifyUnrelatedHandler(candidate.handlerSnippet, candidate.labelText);
  if (unrelated) return { ok: false, reason: unrelated };

  // Label must not contradict the command even for explicit markers.
  if (
    candidate.labelText &&
    candidate.matchKind !== 'explicit-capability' &&
    !labelMatchesCommand(cap, candidate.labelText) &&
    candidate.matchKind === 'label'
  ) {
    return { ok: false, reason: `Label "${candidate.labelText}" does not match ${cap.command}` };
  }
  if (candidate.labelText && classifyUnrelatedHandler('noop', candidate.labelText)) {
    return {
      ok: false,
      reason: classifyUnrelatedHandler('noop', candidate.labelText)!,
    };
  }

  const identity = findIdentityAtControlSite(
    cap,
    content,
    candidate.index,
    candidate.controlSource,
  );
  if (cap.instanceCommand && !identity) {
    return {
      ok: false,
      reason: `Instance command ${cap.capabilityId} requires entity identity at the control site`,
    };
  }

  if (!inputsBuildable(cap, candidate.controlSource, identity)) {
    return {
      ok: false,
      reason: `Cannot build ${cap.capabilityId} inputs without inventing values`,
    };
  }

  const reasons = [
    candidate.matchKind === 'explicit-capability'
      ? 'explicit-data-manifest-capability'
      : candidate.matchKind === 'handler-name'
        ? 'handler-name-matches-command'
        : 'label-matches-command',
    'entity-surface',
    'action-intent',
    'handler-not-unrelated',
    ...(identity ? (['entity-identity-at-control'] as const) : []),
    'inputs-buildable',
  ];

  return {
    ok: true,
    reason: `Exact action-intent control for ${cap.capabilityId}`,
    surface: {
      file,
      controlSymbol: cap.command,
      bindingCallee: clientFn(cap.entity, cap.command),
      ensureImport: {
        module: '@/app/lib/manifest-client.generated',
        names: [clientFn(cap.entity, cap.command)],
      },
      identityExpression: identity,
      matchReasons: reasons,
      handlerSnippet: candidate.handlerSnippet,
      labelText: candidate.labelText,
      controlSource: candidate.controlSource,
    },
  };
}

/**
 * Post-repair verification: consumer existence is never enough.
 */
export function verifyWiredControlSemantics(
  cap: WiringCommandDescriptor,
  file: string,
  content: string,
  expectedBindingCallee: string,
  identityExpression?: string,
): ControlSemanticVerdict {
  if (!content.includes(`${expectedBindingCallee}(`)) {
    return {
      ok: false,
      reason: `Binding ${expectedBindingCallee} not present after wire-existing-control`,
    };
  }

  if (!entitySurfaceProven(cap.entity, file, content)) {
    return {
      ok: false,
      reason: `Post-repair semantic match failed: no entity surface for ${cap.entity}`,
    };
  }

  if (cap.instanceCommand) {
    if (!bindingHasInstanceIdentity(content, expectedBindingCallee, identityExpression)) {
      return {
        ok: false,
        reason:
          `Post-repair semantic match failed: instance command ${cap.capabilityId} ` +
          `must pass entity identity (empty {} rejected)`,
      };
    }
  }

  const label = wiredControlLabel(content, expectedBindingCallee);
  const hasExplicit = content.includes(`data-manifest-capability="${cap.capabilityId}"`);
  if (!hasExplicit) {
    if (!label || !labelMatchesCommand(cap, label)) {
      return {
        ok: false,
        reason:
          `Post-repair semantic match failed: ${expectedBindingCallee} is not on a ` +
          `control whose label matches ${cap.capabilityId}` +
          (label ? ` (found "${label}")` : ''),
      };
    }
  } else if (label && classifyUnrelatedHandler('noop', label)) {
    return {
      ok: false,
      reason: `Post-repair semantic match failed: ${classifyUnrelatedHandler('noop', label)}`,
    };
  }

  // Destroyed create-dialog / dismiss behavior must not be the wired site.
  if (label && classifyUnrelatedHandler('noop', label)) {
    return {
      ok: false,
      reason: `Post-repair semantic match failed: unrelated prior behavior label "${label}"`,
    };
  }

  return {
    ok: true,
    reason: `Action-intent semantic match for ${cap.capabilityId} still holds after wiring`,
  };
}

function rank(c: ControlCandidate): number {
  return c.matchKind === 'explicit-capability' ? 0 : c.matchKind === 'label' ? 1 : 2;
}
