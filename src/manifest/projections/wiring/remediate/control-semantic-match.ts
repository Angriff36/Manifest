/**
 * Semantic proof for wire-existing-control.
 *
 * Auto-wiring an unwired capability onto an existing control is allowed only
 * when Manifest can prove the control represents that command — not merely
 * that a button (or the command word) exists nearby.
 */

import type { WiringCommandDescriptor } from '../types.js';
import {
  bindingAttachedToDismissLabel,
  classifyUnrelatedHandler,
  clientFn,
  controlLabelMatchesCommand,
  entitySurfaceProven,
  findEntityIdentity,
  findExplicitCapabilityControl,
  findMeaningMatchedControl,
  inputsBuildable,
} from './control-semantic-helpers.js';

export interface ControlSemanticSurface {
  file: string;
  controlSymbol: string;
  bindingCallee: string;
  ensureImport?: { module: string; names: string[] };
  /** Proven identity expression when the command is instance-scoped. */
  identityExpression?: string;
  /** Why this control was accepted (for verification / rationale). */
  matchReasons: string[];
  /** Exact handler snippet that will be replaced (must not be unrelated). */
  handlerSnippet: string;
  /** Visible label / text associated with the control when proven. */
  labelText?: string;
}

export interface ControlSemanticVerdict {
  ok: boolean;
  reason: string;
  surface?: ControlSemanticSurface;
}

/**
 * Prove whether an existing control in `content` may receive `cap`.
 * Returns ambiguous (ok:false) unless every required semantic gate passes.
 */
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

  const identity = findEntityIdentity(cap, content);
  if (cap.instanceCommand && !identity) {
    return {
      ok: false,
      reason: `Instance command ${cap.capabilityId} requires entity identity in scope`,
    };
  }

  const explicit = findExplicitCapabilityControl(cap, content);
  if (explicit) {
    const unrelated = classifyUnrelatedHandler(explicit.handlerSnippet, explicit.labelText);
    if (unrelated) return { ok: false, reason: unrelated };
    if (!inputsBuildable(cap, content, identity)) {
      return {
        ok: false,
        reason: `Cannot build ${cap.capabilityId} inputs without inventing values`,
      };
    }
    return {
      ok: true,
      reason: `Explicit data-manifest-capability + entity surface for ${cap.capabilityId}`,
      surface: {
        file,
        controlSymbol: cap.command,
        bindingCallee: clientFn(cap.entity, cap.command),
        ensureImport: {
          module: '@/app/lib/manifest-client.generated',
          names: [clientFn(cap.entity, cap.command)],
        },
        identityExpression: identity,
        matchReasons: [
          'explicit-data-manifest-capability',
          'entity-surface',
          ...(identity ? (['entity-identity'] as const) : []),
          'inputs-buildable',
        ],
        handlerSnippet: explicit.handlerSnippet,
        labelText: explicit.labelText,
      },
    };
  }

  const labeled = findMeaningMatchedControl(cap, content);
  if (!labeled) {
    return {
      ok: false,
      reason: `No control whose label/handler strongly matches ${cap.capabilityId}`,
    };
  }

  const unrelated = classifyUnrelatedHandler(labeled.handlerSnippet, labeled.labelText);
  if (unrelated) return { ok: false, reason: unrelated };

  if (!inputsBuildable(cap, content, identity)) {
    return {
      ok: false,
      reason: `Cannot build ${cap.capabilityId} inputs without inventing values`,
    };
  }

  if (!labeled.strongMeaning) {
    return {
      ok: false,
      reason: `Control near ${cap.command} lacks strong meaning evidence (label/state/call-chain)`,
    };
  }

  return {
    ok: true,
    reason: `Proven same-entity control matches ${cap.capabilityId}`,
    surface: {
      file,
      controlSymbol: cap.command,
      bindingCallee: clientFn(cap.entity, cap.command),
      ensureImport: {
        module: '@/app/lib/manifest-client.generated',
        names: [clientFn(cap.entity, cap.command)],
      },
      identityExpression: identity,
      matchReasons: [
        'entity-surface',
        'meaning-matched-control',
        ...(identity ? (['entity-identity'] as const) : []),
        'inputs-buildable',
        'handler-not-unrelated',
      ],
      handlerSnippet: labeled.handlerSnippet,
      labelText: labeled.labelText,
    },
  };
}

/**
 * Re-check semantic preconditions after a wire-existing-control patch.
 * Consumer existence alone is not sufficient.
 */
export function verifyWiredControlSemantics(
  cap: WiringCommandDescriptor,
  file: string,
  content: string,
  expectedBindingCallee: string,
): ControlSemanticVerdict {
  if (!content.includes(`${expectedBindingCallee}(`)) {
    return {
      ok: false,
      reason: `Binding ${expectedBindingCallee} not present after wire-existing-control`,
    };
  }

  const hasExplicit = content.includes(`data-manifest-capability="${cap.capabilityId}"`);
  const labelOk = controlLabelMatchesCommand(cap, content);
  const identity = findEntityIdentity(cap, content);

  if (cap.instanceCommand && !identity) {
    return {
      ok: false,
      reason: `Post-repair semantic match failed: missing entity identity for ${cap.capabilityId}`,
    };
  }

  if (!entitySurfaceProven(cap.entity, file, content)) {
    return {
      ok: false,
      reason: `Post-repair semantic match failed: no entity surface for ${cap.entity}`,
    };
  }

  if (!hasExplicit && !labelOk) {
    return {
      ok: false,
      reason:
        `Post-repair semantic match failed: ${expectedBindingCallee} is not on a ` +
        `meaning-matched control for ${cap.capabilityId}`,
    };
  }

  if (bindingAttachedToDismissLabel(content, expectedBindingCallee)) {
    return {
      ok: false,
      reason:
        `Post-repair semantic match failed: ${expectedBindingCallee} attached to ` +
        `unrelated dismiss/error control`,
    };
  }

  return {
    ok: true,
    reason: `Semantic match for ${cap.capabilityId} still holds after wiring`,
  };
}
