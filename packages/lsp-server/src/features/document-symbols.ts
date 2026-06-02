import { DocumentSymbol, SymbolKind, Range } from 'vscode-languageserver';
import type { ManifestProgram, EntityNode, CommandNode, PolicyNode, ConstraintNode, EnumNode, StoreNode, OutboxEventNode, ModuleNode, PropertyNode, ComputedPropertyNode, RelationshipNode, RoleNode, ReactionNode } from '@angriff36/manifest/types';
import { toLspPosition } from '../position-utils.js';

/**
 * Build hierarchical DocumentSymbol[] from a ManifestProgram AST.
 * Provides the Outline view in IDEs.
 */
export function getDocumentSymbols(program: ManifestProgram): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];

  // Modules
  for (const mod of program.modules) {
    symbols.push(moduleSymbol(mod));
  }

  // Top-level entities
  for (const entity of program.entities) {
    symbols.push(entitySymbol(entity));
  }

  // Enums
  for (const en of program.enums) {
    symbols.push(enumSymbol(en));
  }

  // Top-level commands
  for (const cmd of program.commands) {
    symbols.push(commandSymbol(cmd));
  }

  // Policies
  for (const policy of program.policies) {
    symbols.push(policySymbol(policy));
  }

  // Stores
  for (const store of program.stores) {
    symbols.push(storeSymbol(store));
  }

  // Events
  for (const event of program.events) {
    symbols.push(eventSymbol(event));
  }

  // Reactions
  for (const reaction of program.reactions) {
    symbols.push(reactionSymbol(reaction));
  }

  // Sagas (if present in AST)
  for (const saga of (program as any).sagas ?? []) {
    symbols.push(sagaSymbol(saga));
  }

  // Roles
  for (const role of program.roles) {
    symbols.push(roleSymbol(role));
  }

  return symbols;
}

function makeRange(pos?: { line: number; column: number }, name?: string): Range {
  if (!pos) {
    return Range.create(0, 0, 0, 1);
  }
  const start = toLspPosition(pos);
  const end = { line: start.line, character: start.character + (name?.length ?? 1) };
  return Range.create(start, end);
}

function moduleSymbol(mod: ModuleNode): DocumentSymbol {
  const range = makeRange(mod.position, mod.name);
  const children: DocumentSymbol[] = [];

  for (const entity of mod.entities) children.push(entitySymbol(entity));
  for (const en of mod.enums) children.push(enumSymbol(en));
  for (const cmd of mod.commands) children.push(commandSymbol(cmd));
  for (const policy of mod.policies) children.push(policySymbol(policy));
  for (const store of mod.stores) children.push(storeSymbol(store));
  for (const event of mod.events) children.push(eventSymbol(event));
  for (const reaction of mod.reactions) children.push(reactionSymbol(reaction));
  for (const saga of (mod as any).sagas ?? []) children.push(sagaSymbol(saga));
  for (const role of mod.roles) children.push(roleSymbol(role));

  return DocumentSymbol.create(mod.name, 'module', SymbolKind.Module, range, range, children);
}

function entitySymbol(entity: EntityNode): DocumentSymbol {
  const range = makeRange(entity.position, entity.name);
  const children: DocumentSymbol[] = [];

  for (const prop of entity.properties) {
    children.push(propertySymbol(prop));
  }
  for (const comp of entity.computedProperties) {
    children.push(computedPropertySymbol(comp));
  }
  for (const rel of entity.relationships) {
    children.push(relationshipSymbol(rel));
  }
  for (const cmd of entity.commands) {
    children.push(commandSymbol(cmd));
  }
  for (const constraint of entity.constraints) {
    children.push(constraintSymbol(constraint));
  }
  for (const policy of entity.policies) {
    children.push(policySymbol(policy));
  }

  return DocumentSymbol.create(entity.name, 'entity', SymbolKind.Class, range, range, children);
}

function propertySymbol(prop: PropertyNode): DocumentSymbol {
  const range = makeRange(prop.position, prop.name);
  const detail = prop.dataType?.name ?? '';
  return DocumentSymbol.create(prop.name, detail, SymbolKind.Property, range, range);
}

function computedPropertySymbol(comp: ComputedPropertyNode): DocumentSymbol {
  const range = makeRange(comp.position, comp.name);
  return DocumentSymbol.create(comp.name, 'computed', SymbolKind.Property, range, range);
}

function relationshipSymbol(rel: RelationshipNode): DocumentSymbol {
  const range = makeRange(rel.position, rel.name);
  return DocumentSymbol.create(rel.name, `${rel.kind} → ${rel.target}`, SymbolKind.Field, range, range);
}

function commandSymbol(cmd: CommandNode): DocumentSymbol {
  const range = makeRange(cmd.position, cmd.name);
  const paramNames = cmd.parameters.map(p => p.name).join(', ');
  return DocumentSymbol.create(cmd.name, `(${paramNames})`, SymbolKind.Function, range, range);
}

function constraintSymbol(constraint: ConstraintNode): DocumentSymbol {
  const range = makeRange(constraint.position, constraint.name);
  return DocumentSymbol.create(constraint.name, constraint.severity ?? 'block', SymbolKind.Constant, range, range);
}

function policySymbol(policy: PolicyNode): DocumentSymbol {
  const range = makeRange(policy.position, policy.name);
  return DocumentSymbol.create(policy.name, policy.action, SymbolKind.Interface, range, range);
}

function enumSymbol(en: EnumNode): DocumentSymbol {
  const range = makeRange(en.position, en.name);
  const children = en.values.map(v => {
    const vRange = makeRange(v.position, v.name);
    return DocumentSymbol.create(v.name, v.label ?? '', SymbolKind.EnumMember, vRange, vRange);
  });
  return DocumentSymbol.create(en.name, 'enum', SymbolKind.Enum, range, range, children);
}

function storeSymbol(store: StoreNode): DocumentSymbol {
  const range = makeRange(store.position, store.entity);
  return DocumentSymbol.create(store.entity, store.target, SymbolKind.Module, range, range);
}

function eventSymbol(event: OutboxEventNode): DocumentSymbol {
  const range = makeRange(event.position, event.name);
  return DocumentSymbol.create(event.name, `channel: ${event.channel}`, SymbolKind.Event, range, range);
}

function reactionSymbol(reaction: ReactionNode): DocumentSymbol {
  const range = makeRange(reaction.position, reaction.event);
  return DocumentSymbol.create(
    `on ${reaction.event}`,
    `→ ${reaction.targetEntity}.${reaction.targetCommand}`,
    SymbolKind.Event,
    range,
    range
  );
}

function sagaSymbol(saga: { name: string; position?: { line: number; column: number }; steps: { name: string; command: string; position?: { line: number; column: number } }[] }): DocumentSymbol {
  const range = makeRange(saga.position, saga.name);
  const children = saga.steps.map(step => {
    const stepRange = makeRange(step.position, step.name);
    return DocumentSymbol.create(step.name, step.command, SymbolKind.Function, stepRange, stepRange);
  });
  return DocumentSymbol.create(saga.name, 'saga', SymbolKind.Class, range, range, children);
}

function roleSymbol(role: RoleNode): DocumentSymbol {
  const range = makeRange(role.position, role.name);
  const detail = role.parent ? `extends ${role.parent}` : '';
  return DocumentSymbol.create(role.name, detail, SymbolKind.Struct, range, range);
}
