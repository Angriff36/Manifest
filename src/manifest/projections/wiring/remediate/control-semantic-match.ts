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
  entityEvidenceAtControl,
  entitySurfaceProven,
  findActionIntentControls,
  findIdentityAtControlSite,
  handlerNameMatchesCommand,
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
  /** Complete object literal for the binding call. */
  payloadExpression?: string;
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

  const scopeStart = Math.max(0, candidate.index - 600);
  const scopeEnd = Math.min(content.length, candidate.index + candidate.controlSource.length + 200);
  const scope = content.slice(scopeStart, scopeEnd);

  if (!entityEvidenceAtControl(cap.entity, scope, candidate.labelText)) {
    return {
      ok: false,
      reason: `No control-local entity evidence for ${cap.entity} on the selected control`,
    };
  }

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

  if (!inputsBuildable(cap, scope, identity)) {
    return {
      ok: false,
      reason: `Cannot build ${cap.capabilityId} inputs without inventing values`,
    };
  }

  if (!isReplaceablePriorHandler(candidate.handlerSnippet, cap)) {
    return {
      ok: false,
      reason: `Existing handler behavior is not proven replaceable for ${cap.capabilityId}`,
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

  const payloadExpression = buildPayloadExpression(cap, identity, scope);

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
      payloadExpression,
      matchReasons: reasons,
      handlerSnippet: candidate.handlerSnippet,
      labelText: candidate.labelText,
      controlSource: candidate.controlSource,
    },
  };
}

function buildPayloadExpression(
  cap: WiringCommandDescriptor,
  identity: string | undefined,
  controlSource: string,
): string {
  const parts: string[] = [];
  if (identity) parts.push(`id: ${identity}`);
  const camel = cap.entity[0]!.toLowerCase() + cap.entity.slice(1);
  const segments = cap.entity.match(/[A-Z][a-z0-9]*/g) ?? [];
  const last = segments[segments.length - 1];
  const shortId = last ? `${last[0]!.toLowerCase()}${last.slice(1)}Id` : undefined;
  for (const p of cap.parameters.filter((x) => x.ownership === 'client' && x.required)) {
    if (p.name === 'id') continue;
    if (identity && (p.name === `${camel}Id` || (shortId !== undefined && p.name === shortId))) {
      continue;
    }
    if (new RegExp(`\\b${p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(controlSource)) {
      parts.push(`${p.name}: ${p.name}`);
    }
  }
  return `{ ${parts.join(', ')} }`;
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

/** Prior handler may be replaced only when absent, noop, or local-only for this action. */
function isReplaceablePriorHandler(handler: string, cap: WiringCommandDescriptor): boolean {
  const h = handler.trim();
  if (!h || h === 'noop' || h === 'undefined') return true;
  if (classifyUnrelatedHandler(h)) return false;
  if (handlerNameMatchesCommand(cap, h)) return true;
  // Local-only setState for the same action (e.g. setCompleted(true) on Complete)
  if (/^set[A-Z]\w*\(\s*(?:true|false|null)?\s*\)$/.test(h)) return true;
  if (/^\(\s*\)\s*=>\s*set[A-Z]\w*\(\s*(?:true|false|null)?\s*\)$/.test(h)) return true;
  // Multi-line product handlers (softDelete, fetch, toast, …) are not replaceable
  if (/\bawait\b|\bfetch\b|\btoast\b|\.softDelete\b|\.delete\b|\.create\b/.test(h)) {
    return false;
  }
  // Named identifier reference — only if name matches command
  if (/^[A-Za-z_$][\w$]*$/.test(h)) {
    return handlerNameMatchesCommand(cap, h);
  }
  return false;
}
