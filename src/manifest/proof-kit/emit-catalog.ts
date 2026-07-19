/**
 * Emit capability catalog from IR + Convex projection metadata.
 */

import type { IR, IRCommand, IREntity, IRExpression, IRReactionRule } from '../ir.js';
import { COMPILER_VERSION } from '../version.js';
import {
  commandCreationEntry,
  commandCreationExportName,
} from '../projections/convex/creation-entry.js';
import { normalizeOptions, resolveConvexTableName } from '../projections/convex/options.js';
import type {
  CapabilityCatalog,
  CommandCapability,
  EntityCapability,
  ProofKitVersions,
  ProofStatus,
  ReactionCapability,
} from './types.js';
import { CAPABILITY_CATALOG_SCHEMA } from './types.js';

export interface EmitCatalogOptions {
  versions?: Partial<ProofKitVersions>;
  entityFilter?: ReadonlySet<string> | readonly string[];
  structuralProofIds?: ReadonlySet<string>;
  runtimeProofIds?: ReadonlySet<string>;
  productDecisionIds?: ReadonlyMap<string, ProofStatus>;
  convexOptions?: Record<string, unknown>;
}

function collectRoleAllows(expr: IRExpression | undefined, out: Set<string>): void {
  if (!expr) return;
  switch (expr.kind) {
    case 'call': {
      const callee = expr.callee;
      if (callee.kind === 'identifier' && callee.name === 'roleAllows') {
        // roleAllows(user.role, "capability"[, target]) — capability is arg[1]
        const capability = expr.args[1];
        if (capability?.kind === 'literal' && capability.value.kind === 'string') {
          out.add(capability.value.value);
        }
      }
      collectRoleAllows(expr.callee, out);
      for (const arg of expr.args) collectRoleAllows(arg, out);
      break;
    }
    case 'binary':
      collectRoleAllows(expr.left, out);
      collectRoleAllows(expr.right, out);
      break;
    case 'unary':
      collectRoleAllows(expr.operand, out);
      break;
    case 'conditional':
      collectRoleAllows(expr.condition, out);
      collectRoleAllows(expr.consequent, out);
      collectRoleAllows(expr.alternate, out);
      break;
    case 'member':
      collectRoleAllows(expr.object, out);
      break;
    case 'array':
      for (const el of expr.elements) collectRoleAllows(el, out);
      break;
    case 'object':
      for (const p of expr.properties) collectRoleAllows(p.value, out);
      break;
    default:
      break;
  }
}

function capabilitiesForEntity(ir: IR, entity: IREntity): string[] {
  const out = new Set<string>();
  const policyNames = new Set([...(entity.policies ?? []), ...(entity.defaultPolicies ?? [])]);
  for (const policy of ir.policies ?? []) {
    if (policy.entity === entity.name || policyNames.has(policy.name)) {
      collectRoleAllows(policy.expression, out);
    }
  }
  return [...out].sort();
}

function commandCapability(
  entity: IREntity,
  cmd: IRCommand,
  caps: string[],
  creation?: IRCommand,
): CommandCapability {
  const isCreate = cmd.name === 'create';
  const isCreationEntry = creation?.name === cmd.name;
  return {
    name: cmd.name,
    mutation: `${entity.name}_${cmd.name}`,
    inputs: cmd.parameters.map((p) => p.name),
    emits: [...(cmd.emits ?? [])].sort(),
    requiredCapabilities: caps,
    allocating: isCreate || !!isCreationEntry,
    ...(isCreate || isCreationEntry ? { useCreateAlias: `useCreate${entity.name}` } : {}),
  };
}

export function reactionProofId(rule: IRReactionRule): string {
  return `${rule.event}->${rule.targetEntity}.${rule.targetCommand}`;
}

function statusFor(id: string, opts: EmitCatalogOptions, baseline: ProofStatus): ProofStatus {
  const decision = opts.productDecisionIds?.get(id);
  if (decision) return decision;
  if (opts.runtimeProofIds?.has(id)) return 'runtime_proven';
  if (opts.structuralProofIds?.has(id)) return 'structurally_proven';
  return baseline;
}

function reactionsForEntity(
  entityName: string,
  ir: IR,
  opts: EmitCatalogOptions,
): ReactionCapability[] {
  const byId = new Map<string, IRReactionRule>();
  for (const rule of ir.reactions ?? []) {
    const fromEntity = ir.commands.some(
      (c) => c.entity === entityName && (c.emits ?? []).includes(rule.event),
    );
    const targetsEntity = rule.targetEntity === entityName;
    if (fromEntity || targetsEntity) byId.set(reactionProofId(rule), rule);
  }

  return [...byId.values()]
    .map((rule) => {
      const id = reactionProofId(rule);
      return {
        id,
        event: rule.event,
        targetEntity: rule.targetEntity,
        targetCommand: rule.targetCommand,
        expectedConsequence: `${rule.targetEntity}.${rule.targetCommand}`,
        structuralProofStatus: statusFor(id, opts, 'generated'),
        runtimeProofStatus: statusFor(id, opts, 'declared'),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function entityCapability(
  entity: IREntity,
  ir: IR,
  table: string,
  opts: EmitCatalogOptions,
): EntityCapability {
  const caps = capabilitiesForEntity(ir, entity);
  const creation = commandCreationEntry(ir, entity);
  const commands = ir.commands
    .filter((c) => c.entity === entity.name)
    .map((c) => commandCapability(entity, c, caps, creation))
    .sort((a, b) => a.name.localeCompare(b.name));

  const createCmd = commands.find((c) => c.name === 'create');
  const reactions = reactionsForEntity(entity.name, ir, opts);
  const entityProofId = `entity:${entity.name}`;

  let allocatingCreate: EntityCapability['allocatingCreate'];
  if (createCmd) {
    allocatingCreate = {
      command: createCmd.name,
      mutation: createCmd.mutation,
      useCreateAlias: `useCreate${entity.name}`,
    };
  } else if (creation) {
    allocatingCreate = {
      command: creation.name,
      mutation: commandCreationExportName(entity.name, creation.name),
      useCreateAlias: `useCreate${entity.name}`,
    };
  }

  return {
    entity: entity.name,
    table,
    listOperation: `list${entity.name}`,
    detailOperation: `get${entity.name}`,
    ...(allocatingCreate ? { allocatingCreate } : {}),
    commands,
    lifecycle: (entity.transitions ?? []).map((t) => ({
      property: t.property,
      from: t.from,
      to: [...t.to],
    })),
    reactions,
    requiredRolesOrCapabilities: caps,
    structuralProofStatus: statusFor(entityProofId, opts, 'generated'),
    runtimeProofStatus: statusFor(
      entityProofId,
      opts,
      reactions.some((r) => r.runtimeProofStatus === 'runtime_proven')
        ? 'runtime_proven'
        : 'declared',
    ),
  };
}

/** Build a deterministic capability catalog from compiled IR. */
export function emitCapabilityCatalog(ir: IR, options: EmitCatalogOptions = {}): CapabilityCatalog {
  const versions: ProofKitVersions = {
    manifestVersion: options.versions?.manifestVersion ?? COMPILER_VERSION,
    projection: options.versions?.projection ?? 'convex',
    ...(options.versions?.preset ? { preset: options.versions.preset } : {}),
  };

  const convexOpts = normalizeOptions(options.convexOptions);
  const filter = options.entityFilter
    ? new Set(
        Array.isArray(options.entityFilter) ? options.entityFilter : [...options.entityFilter],
      )
    : null;

  const entities = ir.entities
    .filter((e) => !e.external)
    .filter((e) => !filter || filter.has(e.name))
    .map((e) => entityCapability(e, ir, resolveConvexTableName(e.name, convexOpts), options))
    .sort((a, b) => a.entity.localeCompare(b.entity));

  return {
    schemaVersion: CAPABILITY_CATALOG_SCHEMA,
    irHash: ir.provenance?.contentHash ?? '',
    versions,
    entities,
  };
}
