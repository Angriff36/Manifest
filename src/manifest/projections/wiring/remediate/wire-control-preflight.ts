/**
 * Preflight eligibility for wire-existing-control.
 *
 * A plan is executable only when the patch engine already has enough proven
 * information to construct the complete intended replacement — never discover
 * missing bindings/inputs/identity during apply/verify.
 */

import type { WiringCommandDescriptor } from '../types.js';
import type { ControlSemanticSurface } from './control-semantic-match.js';
import { clientFn } from './control-semantic-helpers.js';

export interface PreflightVerdict {
  ok: boolean;
  reason: string;
  decision?: 'ambiguous-product-decision' | 'unsafe-to-apply';
}

/** Prove the generated binding exists and the planned import module resolves. */
export function proveBindingAvailable(
  files: Map<string, string>,
  bindingCallee: string,
  importModule?: string,
): PreflightVerdict {
  const exportRe = new RegExp(
    `export\\s+(?:async\\s+)?function\\s+${escape(bindingCallee)}\\b` +
      `|export\\s+(?:const|let)\\s+${escape(bindingCallee)}\\b` +
      `|export\\s*\\{[^}]*\\b${escape(bindingCallee)}\\b`,
  );

  const moduleFiles = importModule ? resolveModuleFiles(files, importModule) : [...files.keys()];

  if (importModule && moduleFiles.length === 0) {
    return {
      ok: false,
      decision: 'unsafe-to-apply',
      reason: `Import module ${importModule} does not resolve to a known source file`,
    };
  }

  for (const file of moduleFiles) {
    const content = get(files, file);
    if (content && exportRe.test(content)) {
      return { ok: true, reason: `Binding ${bindingCallee} exported from ${file}` };
    }
  }

  // If a specific module was required, do not fall back to unrelated files.
  if (importModule) {
    return {
      ok: false,
      decision: 'unsafe-to-apply',
      reason: `Binding ${bindingCallee} is not exported from import module ${importModule}`,
    };
  }

  for (const [file, content] of files) {
    if (exportRe.test(content)) {
      return { ok: true, reason: `Binding ${bindingCallee} exported from ${file}` };
    }
  }

  return {
    ok: false,
    decision: 'unsafe-to-apply',
    reason: `Binding ${bindingCallee} has no proven export in application sources`,
  };
}

/** Prove the wire operation can construct a complete call site (dry construct). */
export function proveWirePatchConstructible(
  content: string,
  surface: ControlSemanticSurface,
  cap: WiringCommandDescriptor,
): PreflightVerdict {
  if (!surface.controlSource && !surface.handlerSnippet) {
    return {
      ok: false,
      decision: 'ambiguous-product-decision',
      reason: 'No control fingerprint available to construct a targeted wire patch',
    };
  }

  if (cap.instanceCommand && !surface.identityExpression) {
    return {
      ok: false,
      decision: 'ambiguous-product-decision',
      reason: `Instance command ${cap.capabilityId} missing proven identity for call construction`,
    };
  }

  // Prefer the payload already proven during semantic matching.
  const payload =
    surface.payloadExpression ??
    (surface.identityExpression ? `{ id: ${surface.identityExpression} }` : null);
  if (!payload || payload === '{}') {
    return {
      ok: false,
      decision: 'ambiguous-product-decision',
      reason: `Cannot construct ${cap.capabilityId} call: incomplete payload`,
    };
  }

  for (const p of cap.parameters.filter((x) => x.ownership === 'client' && x.required)) {
    if (p.name === 'id') continue;
    if (isEntityIdParam(cap, p.name) && surface.identityExpression) continue;
    // Payload must reference the input, or the surrounding file scope must prove it.
    if (!payload.includes(`${p.name}:`) && !new RegExp(`\\b${escape(p.name)}\\b`).test(content)) {
      return {
        ok: false,
        decision: 'ambiguous-product-decision',
        reason: `Cannot construct ${cap.capabilityId} call: missing required input ${p.name}`,
      };
    }
  }

  const callee = surface.bindingCallee || clientFn(cap.entity, cap.command);
  const replacement = `() => { void ${callee}(${payload}); }`;
  void replacement;

  // Targeted replace must be possible against the proven control fingerprint.
  if (surface.handlerSnippet && surface.handlerSnippet !== 'noop') {
    const snippet = surface.handlerSnippet.trim();
    const exactHandler = new RegExp(
      `((?:onClick|onPress)\\s*=\\s*\\{\\s*)(?:\\(\\s*\\)\\s*=>\\s*)?${escape(snippet)}(\\s*\\})`,
    );
    const named = new RegExp(`((?:onClick|onPress)\\s*=\\s*\\{\\s*)${escape(snippet)}(\\s*\\})`);
    if (exactHandler.test(content) || named.test(content)) {
      return { ok: true, reason: `Constructible wire via handler ${snippet}` };
    }
  }

  if (surface.controlSource && content.includes(surface.controlSource)) {
    if (
      /(onClick|onPress)\s*=\s*\{\s*(?:\(\s*\)\s*=>\s*)?(?:noop|undefined)\s*\}/.test(
        surface.controlSource,
      ) ||
      /(onClick|onPress)\s*=\s*\{\s*[A-Za-z_$][\w$]*\s*\}/.test(surface.controlSource) ||
      /(onClick|onPress)\s*=\s*\{\s*\(\s*\)\s*=>/.test(surface.controlSource)
    ) {
      return { ok: true, reason: 'Constructible wire via controlSource fingerprint' };
    }
  }

  return {
    ok: false,
    decision: 'ambiguous-product-decision',
    reason: `Cannot construct complete wire patch for ${cap.capabilityId} without unsafe discovery`,
  };
}

export function proveWireExistingControlPreflight(
  cap: WiringCommandDescriptor,
  surface: ControlSemanticSurface,
  files: Map<string, string>,
): PreflightVerdict {
  const binding = proveBindingAvailable(files, surface.bindingCallee, surface.ensureImport?.module);
  if (!binding.ok) return binding;

  const fileContent = get(files, surface.file);
  if (!fileContent) {
    return {
      ok: false,
      decision: 'unsafe-to-apply',
      reason: `Source file missing for wire preflight: ${surface.file}`,
    };
  }

  return proveWirePatchConstructible(fileContent, surface, cap);
}

function isEntityIdParam(cap: WiringCommandDescriptor, name: string): boolean {
  const camel = cap.entity[0]!.toLowerCase() + cap.entity.slice(1);
  const segments = cap.entity.match(/[A-Z][a-z0-9]*/g) ?? [];
  const last = segments[segments.length - 1];
  const shortId = last ? `${last[0]!.toLowerCase()}${last.slice(1)}Id` : undefined;
  return name === 'id' || name === `${camel}Id` || name === shortId;
}

function resolveModuleFiles(files: Map<string, string>, importModule: string): string[] {
  const stripped = importModule.replace(/^@\//, '').replace(/^\.\//, '').replace(/\\/g, '/');
  const base = stripped.split('/').pop() ?? stripped;
  const out: string[] = [];
  for (const file of files.keys()) {
    const norm = file.replace(/\\/g, '/');
    if (
      norm.endsWith(`/${stripped}.ts`) ||
      norm.endsWith(`/${stripped}.tsx`) ||
      norm.endsWith(`${stripped}.ts`) ||
      norm.endsWith(`${stripped}.tsx`) ||
      norm.endsWith(`/${base}.ts`) ||
      norm.endsWith(`/${base}.tsx`) ||
      norm.includes(`/${stripped}`)
    ) {
      out.push(file);
    }
  }
  return out;
}

function get(files: Map<string, string>, file: string): string | undefined {
  if (files.has(file)) return files.get(file);
  const norm = file.replace(/\\/g, '/');
  for (const [k, v] of files) {
    if (k.replace(/\\/g, '/') === norm) return v;
  }
  return undefined;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
