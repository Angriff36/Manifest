/**
 * Application pattern adapter — selects local wiring patterns for repairs.
 *
 * Capsule-Pro proven patterns first: generated client, executeCommand,
 * runManifestCommand, server actions, API/composite routes, React Query.
 */

import type { WiringCommandDescriptor } from '../types.js';

export interface LocalValueSource {
  expression: string;
  kind: 'identifier' | 'member' | 'form' | 'state';
}

export interface SafeBindingMigration {
  callee: string;
  ensureImport: { module: string; names: string[] };
}

export interface ControlSurface {
  file: string;
  controlSymbol: string;
  bindingCallee: string;
  ensureImport?: { module: string; names: string[] };
}

export interface InvocationPattern {
  kind:
    | 'execute_command'
    | 'run_manifest_command'
    | 'generated_client'
    | 'server_action'
    | 'api_route'
    | 'unknown';
}

export class PatternAdapter {
  constructor(private readonly files: Map<string, string>) {}

  detectInvocationPattern(content: string, capabilityId: string): InvocationPattern | null {
    const [entity, command] = capabilityId.split('.');
    if (!entity || !command) return null;
    if (
      new RegExp(
        `executeCommand\\s*\\(\\s*["']${escape(entity)}["']\\s*,\\s*["']${escape(command)}["']`,
      ).test(content)
    ) {
      return { kind: 'execute_command' };
    }
    if (
      /runManifestCommand\s*\(/.test(content) &&
      content.includes(`"${entity}"`) &&
      content.includes(`"${command}"`)
    ) {
      return { kind: 'run_manifest_command' };
    }
    const camel = clientFn(entity, command);
    if (new RegExp(`\\b${escape(camel)}\\s*\\(`).test(content)) {
      return { kind: 'generated_client' };
    }
    if (/["']use server["']/.test(content)) return { kind: 'server_action' };
    if (/export\s+async\s+function\s+POST/.test(content)) return { kind: 'api_route' };
    return { kind: 'unknown' };
  }

  /**
   * Find a proven local expression that can supply a missing/empty parameter.
   * Never invents sentinel values.
   */
  findLocalValueSource(
    content: string,
    param: string,
    _file: string,
    opts?: { preferDate?: boolean },
  ): LocalValueSource | undefined {
    // form.param / values.param / data.param / state.param / input.param
    const memberPatterns = [
      new RegExp(`\\b((?:form|values|data|state|input|payload|body)\\.${escape(param)})\\b`),
      new RegExp(`\\b((?:formData|formValues)\\.${escape(param)})\\b`),
    ];
    for (const re of memberPatterns) {
      const m = re.exec(content);
      if (m?.[1]) return { expression: m[1], kind: 'form' };
    }

    // form: { param: … } or (form: { param: string }) — proven form field
    const formShape = new RegExp(
      `\\b(form|values|data|input)\\s*:\\s*\\{[^}]*\\b${escape(param)}\\b`,
    );
    const formShapeMatch = formShape.exec(content);
    if (formShapeMatch?.[1]) {
      return { expression: `${formShapeMatch[1]}.${param}`, kind: 'form' };
    }

    // const param = … or let param = (value binding, not a type-only name)
    const decl = new RegExp(
      `\\b(?:const|let|var)\\s+${escape(param)}\\s*=`,
    );
    if (decl.test(content)) {
      return { expression: param, kind: 'identifier' };
    }

    // Function param: function f(param: …) or (param: string) =>
    const fnParam = new RegExp(
      `\\(\\s*(?:[\\w\\s,]*?\\b)?${escape(param)}\\s*:`,
    );
    if (fnParam.test(content) && !formShape.test(content)) {
      // Only if it's a value parameter, not nested in a type literal alone
      const nestedOnly = new RegExp(
        `\\{\\s*[^}]*\\b${escape(param)}\\s*:`,
      );
      const bareParam = new RegExp(
        `\\(\\s*${escape(param)}\\s*:`,
      );
      if (bareParam.test(content)) {
        return { expression: param, kind: 'identifier' };
      }
      void nestedOnly;
    }

    if (opts?.preferDate) {
      const dateId = /\b(dueDate|date|scheduledFor|startsAt|endsAt)\b/.exec(content);
      if (dateId && dateId[1] !== param) {
        if (new RegExp(`\\b(?:const|let|var)\\s+${escape(dateId[1]!)}\\s*=`).test(content)) {
          return { expression: dateId[1]!, kind: 'identifier' };
        }
      }
    }

    return undefined;
  }

  findSafeBindingMigration(cap: WiringCommandDescriptor): SafeBindingMigration | null {
    const callee = `bind${pascal(cap.entity, cap.command)}Input`;
    // Prefer existing bindings import path if present in repo
    for (const [file, content] of this.files) {
      if (!file.includes('manifest-wiring-bindings') && !content.includes(callee)) continue;
      const mod = extractBindingsModule(content) ?? '@/generated/manifest-wiring-bindings';
      return {
        callee,
        ensureImport: { module: mod, names: [callee] },
      };
    }
    // Default generated path when any bindings file exists
    for (const file of this.files.keys()) {
      if (file.replace(/\\/g, '/').includes('manifest-wiring-bindings')) {
        return {
          callee,
          ensureImport: {
            module: '@/generated/manifest-wiring-bindings',
            names: [callee],
          },
        };
      }
    }
    return {
      callee,
      ensureImport: {
        module: '@/generated/manifest-wiring-bindings',
        names: [callee],
      },
    };
  }

  /**
   * Detect an existing control that clearly represents this capability
   * (placeholder / local-only / matching symbol name). Does not invent UI.
   */
  findExistingControlSurface(cap: WiringCommandDescriptor): ControlSurface | null {
    const needles = [
      `${cap.entity}${cap.command[0]!.toUpperCase()}${cap.command.slice(1)}`,
      `${cap.command}${cap.entity}`,
      cap.command,
    ];
    const bindingCallee = clientFn(cap.entity, cap.command);

    for (const [file, content] of this.files) {
      const norm = file.replace(/\\/g, '/').toLowerCase();
      if (norm.includes('node_modules') || norm.includes('.generated')) continue;
      if (!/\.(tsx|jsx|ts)$/.test(norm)) continue;

      // Local-only setState that mirrors the command name
      for (const needle of needles) {
        const localOnly = new RegExp(
          `\\b(onClick|onPress|action)\\s*=\\s*\\{?\\s*(?:\\(\\s*\\)\\s*=>\\s*)?(set[A-Z]\\w*|noop|undefined)`,
        );
        const symbolRe = new RegExp(`\\b${escape(needle)}\\b`, 'i');
        if (
          symbolRe.test(content) &&
          (localOnly.test(content) ||
            content.includes(`TODO wire ${cap.capabilityId}`) ||
            content.includes(`// local-only`) ||
            content.includes(`data-manifest-capability="${cap.capabilityId}"`))
        ) {
          return {
            file,
            controlSymbol: needle,
            bindingCallee,
            ensureImport: {
              module: '@/app/lib/manifest-client.generated',
              names: [bindingCallee],
            },
          };
        }
      }

      // Explicit placeholder attribute
      if (content.includes(`data-manifest-capability="${cap.capabilityId}"`)) {
        return {
          file,
          controlSymbol: cap.command,
          bindingCallee,
          ensureImport: {
            module: '@/app/lib/manifest-client.generated',
            names: [bindingCallee],
          },
        };
      }
    }
    return null;
  }

  findCanonicalLifecycleCommand(
    entity: string,
    content: string,
  ): { entity: string; command: string; capabilityId: string } | null {
    // Look for comments / attributes pointing at canonical command
    const m =
      /data-manifest-lifecycle=["']([\w]+)\.([\w]+)["']/.exec(content) ||
      /canonical lifecycle:\s*([\w]+)\.([\w]+)/i.exec(content);
    if (m) {
      return {
        entity: m[1]!,
        command: m[2]!,
        capabilityId: `${m[1]}.${m[2]}`,
      };
    }
    // Common publish/archive naming when entity matches
    if (/\bpublish\b/i.test(content) && entity) {
      return { entity, command: 'markPublished', capabilityId: `${entity}.markPublished` };
    }
    return null;
  }

  findStaleCapabilityRemap(
    staleId: string,
  ): { entity: string; command: string; capabilityId: string } | null {
    // Explicit remap comment in any file: // manifest-remap Entity.old -> Entity.new
    const re = new RegExp(
      `manifest-remap\\s+${escape(staleId)}\\s*->\\s*([\\w]+)\\.([\\w]+)`,
    );
    for (const content of this.files.values()) {
      const m = re.exec(content);
      if (m) {
        return {
          entity: m[1]!,
          command: m[2]!,
          capabilityId: `${m[1]}.${m[2]}`,
        };
      }
    }
    return null;
  }

  /**
   * Prefer composite route when it is the proven canonical path for trusted enrichment.
   */
  findCompositeRoute(cap: WiringCommandDescriptor): string | null {
    const needle = `${cap.entity.toLowerCase()}/${cap.command.toLowerCase()}`;
    for (const file of this.files.keys()) {
      const norm = file.replace(/\\/g, '/').toLowerCase();
      if (norm.includes('/api/') && norm.includes(needle) && norm.endsWith('route.ts')) {
        return file;
      }
      if (norm.includes('composite') && norm.includes(cap.entity.toLowerCase())) {
        return file;
      }
    }
    return null;
  }

  detectInvalidationPattern(content: string): 'react-query' | 'custom' | null {
    if (/useQueryClient|queryClient\.invalidateQueries|invalidateQueries/.test(content)) {
      return 'react-query';
    }
    if (/revalidatePath|revalidateTag|router\.refresh/.test(content)) {
      return 'custom';
    }
    return null;
  }
}

function clientFn(entity: string, command: string): string {
  return `${entity[0]!.toLowerCase()}${entity.slice(1)}${command[0]!.toUpperCase()}${command.slice(1)}`;
}

function pascal(entity: string, command: string): string {
  const e = entity === '_program' ? '' : entity;
  return `${e}${command[0]!.toUpperCase()}${command.slice(1)}`;
}

function extractBindingsModule(content: string): string | undefined {
  const m =
    /from\s+["']([^"']*manifest-wiring-bindings[^"']*)["']/.exec(content);
  return m?.[1];
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
