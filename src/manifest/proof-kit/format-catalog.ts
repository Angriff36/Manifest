/**
 * Human-readable view of a capability catalog (same data, not a second SoT).
 */

import type { CapabilityCatalog } from './types.js';

export function formatCapabilityCatalogMarkdown(catalog: CapabilityCatalog): string {
  const lines: string[] = [];
  lines.push('# Manifest capability catalog');
  lines.push('');
  lines.push(`- Schema: \`${catalog.schemaVersion}\``);
  lines.push(`- Manifest: \`${catalog.versions.manifestVersion}\``);
  if (catalog.versions.projection) {
    lines.push(`- Projection: \`${catalog.versions.projection}\``);
  }
  if (catalog.versions.preset) {
    lines.push(`- Preset: \`${catalog.versions.preset.id}@${catalog.versions.preset.version}\``);
  }
  lines.push(`- IR hash: \`${catalog.irHash || '(none)'}\``);
  lines.push('');

  for (const entity of catalog.entities) {
    lines.push(`## ${entity.entity}`);
    lines.push('');
    lines.push(`- Table: \`${entity.table}\``);
    if (entity.listOperation) lines.push(`- List: \`${entity.listOperation}\``);
    if (entity.detailOperation) lines.push(`- Detail: \`${entity.detailOperation}\``);
    if (entity.allocatingCreate) {
      lines.push(
        `- Create: \`${entity.allocatingCreate.mutation}\` / \`${entity.allocatingCreate.useCreateAlias}\``,
      );
    }
    lines.push(
      `- Proof: structural=\`${entity.structuralProofStatus}\` runtime=\`${entity.runtimeProofStatus}\``,
    );
    if (entity.requiredRolesOrCapabilities.length) {
      lines.push(
        `- Capabilities: ${entity.requiredRolesOrCapabilities.map((c) => `\`${c}\``).join(', ')}`,
      );
    }
    lines.push('');
    lines.push('### Commands');
    for (const cmd of entity.commands) {
      const emits = cmd.emits.length ? ` emits ${cmd.emits.join(', ')}` : '';
      lines.push(`- \`${cmd.mutation}\`${emits}`);
    }
    if (entity.reactions.length) {
      lines.push('');
      lines.push('### Reactions');
      for (const r of entity.reactions) {
        lines.push(
          `- \`${r.id}\` → ${r.expectedConsequence} (runtime=\`${r.runtimeProofStatus}\`)`,
        );
      }
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
