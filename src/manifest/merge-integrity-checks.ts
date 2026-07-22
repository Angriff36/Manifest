/**
 * Config G3 — cross-file uniqueness + reference checks used by multi-compiler.
 */

import type { IR, IRDiagnostic } from './ir.js';
import type { ResolvedMergeIntegrity } from './merge-integrity.js';

function claimUniqueName(
  map: Map<string, string>,
  name: string,
  absPath: string,
  kind: string,
  diagnostics: IRDiagnostic[],
  policy: 'error' | 'lastWins',
): void {
  const existing = map.get(name);
  if (existing) {
    if (policy === 'lastWins') {
      map.set(name, absPath);
      return;
    }
    diagnostics.push({
      severity: 'error',
      message: `Duplicate ${kind} '${name}' declared in '${absPath}' and '${existing}'`,
    });
    return;
  }
  map.set(name, absPath);
}

export function collectCrossFileNameUniqueness(
  compiledIRs: Array<{ ir: IR; absPath: string }>,
  integrity: ResolvedMergeIntegrity,
): {
  entityNames: Map<string, string>;
  diagnostics: IRDiagnostic[];
} {
  const diagnostics: IRDiagnostic[] = [];
  const entityNames = new Map<string, string>();
  const enumNames = new Map<string, string>();
  const commandKeys = new Map<string, string>();
  let tenantFile: string | undefined;

  for (const { ir, absPath } of compiledIRs) {
    for (const entity of ir.entities) {
      claimUniqueName(
        entityNames,
        entity.name,
        absPath,
        'entity',
        diagnostics,
        integrity.onDuplicateEntity,
      );
    }
    for (const en of ir.enums) {
      // Enums stay strict — only entity/command policies are configurable (G3).
      claimUniqueName(enumNames, en.name, absPath, 'enum', diagnostics, 'error');
    }
    for (const cmd of ir.commands) {
      const key = cmd.entity ? `${cmd.entity}.${cmd.name}` : cmd.name;
      claimUniqueName(
        commandKeys,
        key,
        absPath,
        'command',
        diagnostics,
        integrity.onDuplicateCommand,
      );
    }
    if (ir.tenant) {
      if (tenantFile) {
        diagnostics.push({
          severity: 'error',
          message: `Duplicate tenant declaration in '${absPath}' and '${tenantFile}'`,
        });
      } else {
        tenantFile = absPath;
      }
    }
  }

  return { entityNames, diagnostics };
}

export function validateCrossFileReferences(
  compiledIRs: Array<{ ir: IR; absPath: string }>,
  entityNames: Map<string, string>,
  integrity: ResolvedMergeIntegrity,
): IRDiagnostic[] {
  const diagnostics: IRDiagnostic[] = [];
  for (const { ir, absPath } of compiledIRs) {
    for (const entity of ir.entities) {
      for (const rel of entity.relationships) {
        if (!entityNames.has(rel.target)) {
          diagnostics.push({
            severity: 'error',
            message: `[${absPath}] Entity '${entity.name}' has relationship '${rel.name}' targeting unknown entity '${rel.target}'`,
          });
        } else if (!integrity.allowCrossModuleRefs) {
          const targetFile = entityNames.get(rel.target);
          if (targetFile && targetFile !== absPath) {
            diagnostics.push({
              severity: 'error',
              message: `[${absPath}] Cross-module relationship '${rel.name}' → '${rel.target}' forbidden (mergeIntegrity.allowCrossModuleRefs=false)`,
            });
          }
        }
        if (rel.through && !entityNames.has(rel.through)) {
          diagnostics.push({
            severity: 'error',
            message: `[${absPath}] Entity '${entity.name}' has relationship '${rel.name}' with unknown through entity '${rel.through}'`,
          });
        }
      }
    }
    for (const store of ir.stores) {
      if (!entityNames.has(store.entity)) {
        diagnostics.push({
          severity: 'error',
          message: `[${absPath}] Store references unknown entity '${store.entity}'`,
        });
      } else if (!integrity.allowCrossModuleRefs) {
        const targetFile = entityNames.get(store.entity);
        if (targetFile && targetFile !== absPath) {
          diagnostics.push({
            severity: 'error',
            message: `[${absPath}] Cross-module store for '${store.entity}' forbidden (mergeIntegrity.allowCrossModuleRefs=false)`,
          });
        }
      }
    }
  }
  return diagnostics;
}
