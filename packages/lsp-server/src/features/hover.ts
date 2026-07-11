import { Hover, MarkupKind } from 'vscode-languageserver';
import type { Position as LspPosition } from 'vscode-languageserver';
import type { Token } from '@angriff36/manifest/types';
import type { IR } from '@angriff36/manifest/ir';
import { KEYWORD_DOCS } from '../symbols/builtin-docs.js';
import { toManifestPosition, tokenToLspRange } from '../position-utils.js';
import { findTokenAtPosition } from './completion.js';

/**
 * Provide hover information at the given position.
 */
export function getHover(tokens: Token[], ir: IR | null, position: LspPosition): Hover | null {
  const mPos = toManifestPosition(position);
  const token = findTokenAtPosition(tokens, mPos);
  if (!token) return null;

  // Keywords
  if (token.type === 'KEYWORD') {
    const doc = KEYWORD_DOCS[token.value];
    if (doc) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `**${token.value}** *(keyword)*\n\n${doc}`,
        },
        range: tokenToLspRange(token),
      };
    }
  }

  // Identifiers — look up in IR
  if (token.type === 'IDENTIFIER' && ir) {
    const hover = lookupInIR(token.value, ir);
    if (hover) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: hover,
        },
        range: tokenToLspRange(token),
      };
    }
  }

  return null;
}

function lookupInIR(name: string, ir: IR): string | null {
  // Entity
  const entity = ir.entities.find((e) => e.name === name);
  if (entity) {
    const props = entity.properties
      .map(
        (p) =>
          `- \`${p.name}\`: ${p.type.name}${p.modifiers?.includes('required') ? ' (required)' : ''}`,
      )
      .join('\n');
    // entity.commands is string[] (command names); resolve to full IRCommand objects
    const cmds = entity.commands
      .map((cmdName) => ir.commands.find((c) => c.name === cmdName))
      .filter(Boolean)
      .map(
        (c) => `- \`${c!.name}(${c!.parameters.map((p: { name: string }) => p.name).join(', ')})\``,
      )
      .join('\n');
    let md = `**entity** \`${name}\`\n\n`;
    if (props) md += `**Properties:**\n${props}\n\n`;
    if (cmds) md += `**Commands:**\n${cmds}`;
    return md;
  }

  // Enum
  const en = ir.enums.find((e) => e.name === name);
  if (en) {
    const vals = en.values
      .map((v) => `- \`${v.name}\`${v.label ? ` — "${v.label}"` : ''}`)
      .join('\n');
    return `**enum** \`${name}\`\n\n${vals}`;
  }

  // Command (top-level)
  const cmd = ir.commands.find((c) => c.name === name);
  if (cmd) {
    const params = cmd.parameters.map((p) => `\`${p.name}: ${p.type.name}\``).join(', ');
    return `**command** \`${name}(${params})\``;
  }

  // Event
  const event = ir.events.find((e) => e.name === name);
  if (event) {
    return `**event** \`${name}\`\n\nChannel: \`${event.channel}\``;
  }

  // Store
  const store = ir.stores.find((s) => s.entity === name);
  if (store) {
    return `**store** \`${name}\` → ${store.target}`;
  }

  // Search inside entities for properties/commands
  for (const ent of ir.entities) {
    const prop = ent.properties.find((p) => p.name === name);
    if (prop) {
      const mods = prop.modifiers?.length ? ` [${prop.modifiers.join(', ')}]` : '';
      return `**property** \`${ent.name}.${name}\`: ${prop.type.name}${mods}`;
    }
    // entity.commands is string[]; look up the full command from top-level ir.commands
    if (ent.commands.includes(name)) {
      const fullCmd = ir.commands.find((c) => c.name === name);
      if (fullCmd) {
        const params = fullCmd.parameters
          .map((p: { name: string; type: { name: string } }) => `\`${p.name}: ${p.type.name}\``)
          .join(', ');
        return `**command** \`${ent.name}.${name}(${params})\``;
      }
      return `**command** \`${ent.name}.${name}\``;
    }
  }

  return null;
}
