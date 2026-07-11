/**
 * IR-to-descriptor conversion — builds ServiceDescriptors from Manifest IRs.
 *
 * Extracts exposed entities and commands from a compiled IR so services
 * can advertise their federation surface to peers.
 *
 * @module federation/descriptor
 */

import type { IR, IREntity, IRCommand, IRPolicy } from '../ir';
import type { ServiceDescriptor, ExposedEntity, ExposedCommand } from './types';

/**
 * Build a ServiceDescriptor from a compiled IR and a service identity.
 * Only entities and commands explicitly listed in `expose` are advertised;
 * if `expose` is omitted, all entities with commands are exposed.
 */
export function buildDescriptor(
  serviceId: string,
  ir: IR,
  options: {
    endpoint: string;
    displayName?: string;
    auth?: ServiceDescriptor['auth'];
    /** Explicit list of entity names to expose. Omit to expose all with commands. */
    exposeEntities?: string[];
    /** Per-command policy requirements. Defaults to the command's own policy list. */
    commandPolicies?: Record<string, string[]>;
  },
): ServiceDescriptor {
  const commandsByEntity = indexCommands(ir);
  const policyByName = indexPolicies(ir);

  const entityFilter = options.exposeEntities ? new Set(options.exposeEntities) : null;

  const exposedEntities: ExposedEntity[] = [];

  for (const entity of ir.entities) {
    if (entityFilter && !entityFilter.has(entity.name)) continue;

    const commands = commandsByEntity.get(entity.name) ?? [];
    if (commands.length === 0 && !entityFilter) continue;

    const exposedCommands: ExposedCommand[] = commands.map((cmd) => {
      const requiredPolicies =
        options.commandPolicies?.[cmd.name] ?? resolveCommandPolicies(cmd, entity, policyByName);
      return {
        name: cmd.name,
        idempotent: !cmd.async && isIdempotentCommand(cmd),
        requiredPolicies,
      };
    });

    if (exposedCommands.length > 0 || entityFilter) {
      exposedEntities.push({
        name: entity.name,
        module: entity.module,
        commands: exposedCommands,
      });
    }
  }

  return {
    serviceId,
    displayName: options.displayName,
    endpoint: options.endpoint,
    schemaVersion: ir.provenance.schemaVersion,
    entities: exposedEntities,
    auth: options.auth,
  };
}

/**
 * Heuristic: a command is idempotent if it has no `async` flag
 * and its actions are all create/set (no increment, no random, no effect).
 * This is a conservative default — callers can override via commandPolicies.
 */
function isIdempotentCommand(cmd: IRCommand): boolean {
  for (const action of cmd.actions) {
    const k = action.kind;
    if (k === 'emit' || k === 'effect' || k === 'publish') {
      return false;
    }
  }
  return true;
}

function resolveCommandPolicies(
  cmd: IRCommand,
  entity: IREntity,
  policyByName: Map<string, IRPolicy>,
): string[] {
  const policies: string[] = [];
  if (cmd.policies) policies.push(...cmd.policies);
  if (entity.defaultPolicies) policies.push(...entity.defaultPolicies);
  for (const name of policies) {
    if (!policyByName.has(name)) continue;
  }
  return policies;
}

function indexCommands(ir: IR): Map<string, IRCommand[]> {
  const map = new Map<string, IRCommand[]>();
  for (const cmd of ir.commands) {
    if (!cmd.entity) continue;
    if (!map.has(cmd.entity)) map.set(cmd.entity, []);
    map.get(cmd.entity)!.push(cmd);
  }
  return map;
}

function indexPolicies(ir: IR): Map<string, IRPolicy> {
  const map = new Map<string, IRPolicy>();
  for (const policy of ir.policies) {
    map.set(policy.name, policy);
  }
  return map;
}
