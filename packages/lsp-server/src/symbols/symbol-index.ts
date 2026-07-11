import type { ManifestProgram, Position } from '@angriff36/manifest/types';

/** Saga AST shape (not yet part of the published @angriff36/manifest types). */
interface SagaNode {
  name: string;
  position?: Position;
}

export interface SymbolEntry {
  name: string;
  kind:
    | 'entity'
    | 'enum'
    | 'command'
    | 'property'
    | 'computed'
    | 'relationship'
    | 'policy'
    | 'constraint'
    | 'store'
    | 'event'
    | 'module'
    | 'reaction'
    | 'saga'
    | 'role'
    | 'parameter';
  position?: Position;
  /** The enclosing entity or module name */
  container?: string;
}

/**
 * Build a flat symbol table from the AST for definition lookup.
 */
export function buildSymbolIndex(program: ManifestProgram): SymbolEntry[] {
  const symbols: SymbolEntry[] = [];

  // Modules
  for (const mod of program.modules) {
    symbols.push({ name: mod.name, kind: 'module', position: mod.position });
    addEntitySymbols(symbols, mod.entities, mod.name);
    addEnumSymbols(symbols, mod.enums, mod.name);
    addCommandSymbols(symbols, mod.commands, mod.name);
    addPolicySymbols(symbols, mod.policies, mod.name);
    addStoreSymbols(symbols, mod.stores, mod.name);
    addEventSymbols(symbols, mod.events, mod.name);
    for (const reaction of mod.reactions) {
      symbols.push({
        name: reaction.event,
        kind: 'reaction',
        position: reaction.position,
        container: mod.name,
      });
    }
    for (const saga of (mod as { sagas?: SagaNode[] }).sagas ?? []) {
      symbols.push({ name: saga.name, kind: 'saga', position: saga.position, container: mod.name });
    }
    for (const role of mod.roles) {
      symbols.push({ name: role.name, kind: 'role', position: role.position, container: mod.name });
    }
  }

  // Top-level
  addEntitySymbols(symbols, program.entities);
  addEnumSymbols(symbols, program.enums);
  addCommandSymbols(symbols, program.commands);
  addPolicySymbols(symbols, program.policies);
  addStoreSymbols(symbols, program.stores);
  addEventSymbols(symbols, program.events);
  for (const reaction of program.reactions) {
    symbols.push({ name: reaction.event, kind: 'reaction', position: reaction.position });
  }
  for (const saga of (program as { sagas?: SagaNode[] }).sagas ?? []) {
    symbols.push({ name: saga.name, kind: 'saga', position: saga.position });
  }
  for (const role of program.roles) {
    symbols.push({ name: role.name, kind: 'role', position: role.position });
  }

  return symbols;
}

function addEntitySymbols(
  symbols: SymbolEntry[],
  entities: ManifestProgram['entities'],
  container?: string,
) {
  for (const entity of entities) {
    symbols.push({ name: entity.name, kind: 'entity', position: entity.position, container });

    for (const prop of entity.properties) {
      symbols.push({
        name: prop.name,
        kind: 'property',
        position: prop.position,
        container: entity.name,
      });
    }
    for (const comp of entity.computedProperties) {
      symbols.push({
        name: comp.name,
        kind: 'computed',
        position: comp.position,
        container: entity.name,
      });
    }
    for (const rel of entity.relationships) {
      symbols.push({
        name: rel.name,
        kind: 'relationship',
        position: rel.position,
        container: entity.name,
      });
    }
    for (const cmd of entity.commands) {
      symbols.push({
        name: cmd.name,
        kind: 'command',
        position: cmd.position,
        container: entity.name,
      });
      for (const param of cmd.parameters) {
        symbols.push({
          name: param.name,
          kind: 'parameter',
          position: param.position,
          container: `${entity.name}.${cmd.name}`,
        });
      }
    }
    for (const constraint of entity.constraints) {
      symbols.push({
        name: constraint.name,
        kind: 'constraint',
        position: constraint.position,
        container: entity.name,
      });
    }
    for (const policy of entity.policies) {
      symbols.push({
        name: policy.name,
        kind: 'policy',
        position: policy.position,
        container: entity.name,
      });
    }
  }
}

function addEnumSymbols(
  symbols: SymbolEntry[],
  enums: ManifestProgram['enums'],
  container?: string,
) {
  for (const en of enums) {
    symbols.push({ name: en.name, kind: 'enum', position: en.position, container });
  }
}

function addCommandSymbols(
  symbols: SymbolEntry[],
  commands: ManifestProgram['commands'],
  container?: string,
) {
  for (const cmd of commands) {
    symbols.push({ name: cmd.name, kind: 'command', position: cmd.position, container });
    for (const param of cmd.parameters) {
      symbols.push({
        name: param.name,
        kind: 'parameter',
        position: param.position,
        container: cmd.name,
      });
    }
  }
}

function addPolicySymbols(
  symbols: SymbolEntry[],
  policies: ManifestProgram['policies'],
  container?: string,
) {
  for (const policy of policies) {
    symbols.push({ name: policy.name, kind: 'policy', position: policy.position, container });
  }
}

function addStoreSymbols(
  symbols: SymbolEntry[],
  stores: ManifestProgram['stores'],
  container?: string,
) {
  for (const store of stores) {
    symbols.push({ name: store.entity, kind: 'store', position: store.position, container });
  }
}

function addEventSymbols(
  symbols: SymbolEntry[],
  events: ManifestProgram['events'],
  container?: string,
) {
  for (const event of events) {
    symbols.push({ name: event.name, kind: 'event', position: event.position, container });
  }
}

/**
 * Find a symbol by name. Returns the first match.
 * For qualified names like "Entity.property", searches with container match.
 */
export function findSymbol(
  symbols: SymbolEntry[],
  name: string,
  container?: string,
): SymbolEntry | undefined {
  if (container) {
    return symbols.find((s) => s.name === name && s.container === container);
  }
  return symbols.find((s) => s.name === name);
}
