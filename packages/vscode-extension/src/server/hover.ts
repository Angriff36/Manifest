import { Hover, Position } from 'vscode-languageserver/node';
import type { ManifestProgram, EntityNode, CommandNode, PropertyNode, ComputedPropertyNode, PolicyNode, ConstraintNode, EnumNode } from '@angriff36/manifest/compiler';

const KEYWORD_DESCRIPTIONS: Record<string, string> = {
  entity: 'Defines a business object with properties, commands, and constraints.',
  property: 'Declares a data field on an entity.',
  command: 'Defines a business operation with guards, mutations, and events.',
  policy: 'Declares an authorization rule (read/write/delete/execute).',
  constraint: 'Defines a data validation rule with severity (ok/warn/block).',
  computed: 'Declares a derived property calculated from an expression.',
  derived: 'Alias for computed — declares a derived property.',
  guard: 'A boolean precondition that must pass before a command executes.',
  mutate: 'An action that modifies entity state.',
  emit: 'Publishes an event from a command.',
  store: 'Configures persistence for an entity (memory/postgres/supabase/localStorage).',
  event: 'Defines an outbox event with a channel and payload.',
  module: 'Groups entities and commands into a namespace.',
  enum: 'Defines an enumeration type with named values.',
  hasMany: 'Declares a one-to-many relationship.',
  hasOne: 'Declares a one-to-one relationship.',
  belongsTo: 'Declares a many-to-one relationship with a foreign key.',
  ref: 'Declares a reference relationship.',
  transition: 'Defines allowed state transitions for a property.',
  approval: 'Configures a multi-stage approval workflow for a command.',
  tenant: 'Configures multi-tenancy isolation.',
  role: 'Defines a role with permissions.',
};

/**
 * Find the word at the given position in the source text.
 */
function getWordAtPosition(text: string, position: Position): string | null {
  const lines = text.split('\n');
  if (position.line >= lines.length) return null;
  const line = lines[position.line];
  const col = position.character;

  let start = col;
  while (start > 0 && /\w/.test(line[start - 1])) start--;
  let end = col;
  while (end < line.length && /\w/.test(line[end])) end++;

  if (start === end) return null;
  return line.substring(start, end);
}

function formatEntity(entity: EntityNode): string {
  const parts = [`**entity** \`${entity.name}\``];
  parts.push(`- ${entity.properties.length} properties`);
  if (entity.computedProperties.length > 0) {
    parts.push(`- ${entity.computedProperties.length} computed properties`);
  }
  parts.push(`- ${entity.commands.length} commands`);
  if (entity.constraints.length > 0) {
    parts.push(`- ${entity.constraints.length} constraints`);
  }
  if (entity.relationships.length > 0) {
    parts.push(`- ${entity.relationships.length} relationships`);
  }
  if (entity.policies.length > 0) {
    parts.push(`- ${entity.policies.length} policies`);
  }
  return parts.join('\n');
}

function formatProperty(prop: PropertyNode): string {
  const mods = prop.modifiers.length > 0 ? ` ${prop.modifiers.join(' ')}` : '';
  return `**property** \`${prop.name}\` : \`${prop.dataType.name}\`${mods}`;
}

function formatComputed(comp: ComputedPropertyNode): string {
  return `**computed** \`${comp.name}\` : \`${comp.dataType.name}\`\n\nDependencies: ${comp.dependencies.join(', ') || 'none'}`;
}

function formatCommand(cmd: CommandNode): string {
  const params = cmd.parameters.map((p) => `${p.name}: ${p.dataType.name}`).join(', ');
  const parts = [`**command** \`${cmd.name}\`(${params})`];
  if (cmd.guards && cmd.guards.length > 0) {
    parts.push(`- ${cmd.guards.length} guards`);
  }
  parts.push(`- ${cmd.actions.length} actions`);
  if (cmd.emits && cmd.emits.length > 0) {
    parts.push(`- emits: ${cmd.emits.join(', ')}`);
  }
  if (cmd.returns) {
    parts.push(`- returns: \`${cmd.returns.name}\``);
  }
  return parts.join('\n');
}

function formatPolicy(pol: PolicyNode): string {
  return `**policy** \`${pol.name}\` — ${pol.action}`;
}

function formatConstraint(con: ConstraintNode): string {
  const severity = con.severity ?? 'block';
  const parts = [`**constraint** \`${con.name}\` [${severity}]`];
  if (con.message) parts.push(`Message: ${con.message}`);
  return parts.join('\n');
}

function formatEnum(en: EnumNode): string {
  const vals = en.values.map((v) => v.name).join(' | ');
  return `**enum** \`${en.name}\`\n\nValues: ${vals}`;
}

export function getHover(
  program: ManifestProgram,
  text: string,
  position: Position,
): Hover | null {
  const word = getWordAtPosition(text, position);
  if (!word) return null;

  // Check keyword descriptions first
  if (KEYWORD_DESCRIPTIONS[word]) {
    return { contents: { kind: 'markdown', value: `**${word}**\n\n${KEYWORD_DESCRIPTIONS[word]}` } };
  }

  // Search entities
  for (const entity of program.entities) {
    if (entity.name === word) {
      return { contents: { kind: 'markdown', value: formatEntity(entity) } };
    }
    for (const prop of entity.properties) {
      if (prop.name === word) {
        return { contents: { kind: 'markdown', value: formatProperty(prop) } };
      }
    }
    for (const comp of entity.computedProperties) {
      if (comp.name === word) {
        return { contents: { kind: 'markdown', value: formatComputed(comp) } };
      }
    }
    for (const cmd of entity.commands) {
      if (cmd.name === word) {
        return { contents: { kind: 'markdown', value: formatCommand(cmd) } };
      }
    }
    for (const pol of entity.policies) {
      if (pol.name === word) {
        return { contents: { kind: 'markdown', value: formatPolicy(pol) } };
      }
    }
    for (const con of entity.constraints) {
      if (con.name === word) {
        return { contents: { kind: 'markdown', value: formatConstraint(con) } };
      }
    }
  }

  // Search modules
  for (const mod of program.modules) {
    for (const entity of mod.entities) {
      if (entity.name === word) {
        return { contents: { kind: 'markdown', value: formatEntity(entity) } };
      }
    }
  }

  // Search enums
  for (const en of program.enums) {
    if (en.name === word) {
      return { contents: { kind: 'markdown', value: formatEnum(en) } };
    }
  }

  // Search top-level commands
  for (const cmd of program.commands) {
    if (cmd.name === word) {
      return { contents: { kind: 'markdown', value: formatCommand(cmd) } };
    }
  }

  // Search top-level policies
  for (const pol of program.policies) {
    if (pol.name === word) {
      return { contents: { kind: 'markdown', value: formatPolicy(pol) } };
    }
  }

  return null;
}
