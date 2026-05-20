/**
 * Emit machine-readable registries from a compiled IR.
 *
 * Schemas:
 *   - docs/spec/registry/commands.schema.json
 *   - docs/spec/registry/entities.schema.json
 *
 * Authority: see constitution §8 (governed-entity registry) and §17
 * (required repo artifacts), mirrored at docs/capsule-pro/constitution.md.
 *
 * Validation: this module emits pure data; the CLI (`manifest emit
 * registries`) is responsible for Ajv validation against the JSON schemas
 * to keep the runtime/IR core free of validator dependencies.
 */

import type { IR } from '../ir';

export type EntityClassification =
  | 'governed'
  | 'read_only_projection'
  | 'infrastructure'
  | 'bypass_allowed'
  | 'unknown_nonconforming';

export interface CommandRegistryEntry {
  entity: string;
  command: string;
  commandId: string;
  policies: string[];
  guardCount: number;
  emits: string[];
  effects: string[];
}

export interface EntityRegistryEntry {
  name: string;
  classification: EntityClassification;
  tenantScoped: boolean;
  commands: string[];
  properties: string[];
}

export interface CommandRegistry {
  irHash: string;
  compilerVersion: string;
  commands: CommandRegistryEntry[];
}

export interface EntityRegistry {
  irHash: string;
  compilerVersion: string;
  entities: EntityRegistryEntry[];
}

/**
 * Sentinel entity name used for module-level commands that do not declare an
 * owning entity. They appear in the registry under this synthetic name.
 */
export const UNOWNED_ENTITY_NAME = '__unowned__';

function classifyEntity(tenantScoped: boolean): EntityClassification {
  return tenantScoped ? 'governed' : 'unknown_nonconforming';
}

function distinct<T>(items: Iterable<T>): T[] {
  return Array.from(new Set(items));
}

export function emitRegistries(ir: IR): { commands: CommandRegistry; entities: EntityRegistry } {
  // Hash + version pinning: every emitted registry carries its provenance
  // so downstream gates can detect drift between the IR they audited and
  // the IR currently in use.
  const irHash = ir.provenance?.contentHash ?? '';
  const compilerVersion = ir.provenance?.compilerVersion ?? '';

  const commands: CommandRegistryEntry[] = [];
  const entities: EntityRegistryEntry[] = [];

  // Index commands by owning entity name (cmd.entity is optional — top-level
  // commands without an owner are surfaced under UNOWNED_ENTITY_NAME).
  const commandsByEntity = new Map<string, typeof ir.commands>();
  for (const cmd of ir.commands) {
    const owner = cmd.entity ?? UNOWNED_ENTITY_NAME;
    const bucket = commandsByEntity.get(owner) ?? [];
    bucket.push(cmd);
    commandsByEntity.set(owner, bucket);
  }

  for (const entity of ir.entities) {
    const tenantScoped = entity.properties.some(p => p.name === 'tenantId');
    const ownedCommandObjects = commandsByEntity.get(entity.name) ?? [];

    entities.push({
      name: entity.name,
      classification: classifyEntity(tenantScoped),
      tenantScoped,
      commands: ownedCommandObjects.map(c => c.name),
      properties: entity.properties.map(p => p.name),
    });

    for (const cmd of ownedCommandObjects) {
      commands.push({
        entity: entity.name,
        command: cmd.name,
        commandId: `${entity.name}.${cmd.name}`,
        policies: distinct([
          ...(entity.defaultPolicies ?? []),
          ...(cmd.policies ?? []),
        ]),
        guardCount: cmd.guards.length,
        emits: [...cmd.emits],
        effects: distinct(cmd.actions.map(a => a.kind)),
      });
    }
  }

  // Module-level (unowned) commands are still part of the inventory.
  const unowned = commandsByEntity.get(UNOWNED_ENTITY_NAME);
  if (unowned && unowned.length > 0) {
    entities.push({
      name: UNOWNED_ENTITY_NAME,
      classification: 'infrastructure',
      tenantScoped: false,
      commands: unowned.map(c => c.name),
      properties: [],
    });
    for (const cmd of unowned) {
      commands.push({
        entity: UNOWNED_ENTITY_NAME,
        command: cmd.name,
        commandId: `${UNOWNED_ENTITY_NAME}.${cmd.name}`,
        policies: [...(cmd.policies ?? [])],
        guardCount: cmd.guards.length,
        emits: [...cmd.emits],
        effects: distinct(cmd.actions.map(a => a.kind)),
      });
    }
  }

  return {
    commands: { irHash, compilerVersion, commands },
    entities: { irHash, compilerVersion, entities },
  };
}
