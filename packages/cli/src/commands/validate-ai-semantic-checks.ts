import { checkDomainCompleteness } from '@angriff36/manifest/domain-completeness';
import { checkReactionCompleteness } from '@angriff36/manifest/reaction-completeness';
import type {
  IRCommand,
  IREntity,
  IREvent,
  IRReactionRule,
  IRStore,
  IRTenant,
} from '@angriff36/manifest/ir';
import type { IrRecord, ParsedIrSnapshot, ValidationDiagnostic } from './validate-ai-types.js';

export function parseIrSnapshot(ir: unknown): ParsedIrSnapshot | null {
  if (!ir || typeof ir !== 'object') return null;
  const record = ir as IrRecord;
  return {
    entities: Array.isArray(record.entities) ? (record.entities as IrRecord[]) : [],
    commands: Array.isArray(record.commands) ? (record.commands as IrRecord[]) : [],
    policies: Array.isArray(record.policies) ? (record.policies as IrRecord[]) : [],
    stores: Array.isArray(record.stores) ? (record.stores as IrRecord[]) : [],
    events: Array.isArray(record.events) ? (record.events as IrRecord[]) : [],
    reactions: Array.isArray(record.reactions) ? (record.reactions as IrRecord[]) : [],
    tenant: record.tenant as IRTenant | undefined,
  };
}

function domainCompletenessCode(isError: boolean, message: string): string {
  if (!isError) return 'DOMAIN_COMPLETENESS';
  return /no belongsTo/.test(message) ? 'DOMAIN_UNWIRED_FK' : 'DOMAIN_ORPHAN_CREATE';
}

function domainCompletenessSuggestion(isError: boolean, isUnwiredFk: boolean): string | undefined {
  if (!isError) return undefined;
  if (isUnwiredFk) {
    return 'Declare belongsTo/ref on the child entity, or add a nested command on the parent that sets the FK from self.id.';
  }
  return 'Add a parent command (e.g. addMilestone) that creates the child with self.id, or an on Event reaction that passes the parent FK in params.';
}

function checkPolicyCoverage(snapshot: ParsedIrSnapshot): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  const pairs: Array<{ entity: string; command: string }> = [];

  for (const cmd of snapshot.commands) {
    if (cmd.entity && cmd.name) {
      pairs.push({ entity: String(cmd.entity), command: String(cmd.name) });
    }
  }
  if (pairs.length === 0) return diagnostics;

  const executePolicies = snapshot.policies.filter(
    (p) => p.action === 'execute' || p.action === 'all',
  );
  const coveredEntities = new Set(
    executePolicies.filter((p) => p.entity).map((p) => String(p.entity)),
  );
  const hasGlobal = executePolicies.some((p) => !p.entity);

  for (const pair of pairs) {
    if (hasGlobal || coveredEntities.has(pair.entity)) continue;
    diagnostics.push({
      code: 'SEMANTIC_NO_POLICY',
      message: `Command '${pair.entity}.${pair.command}' has no policy covering it.`,
      severity: 'warning',
      category: 'semantic',
      path: `commands[?(@.name=="${pair.command}")]`,
      suggestion: `Add a policy for entity '${pair.entity}' with action 'execute' or 'all'. Example:\n    policy ${pair.entity}Execute execute: user.role in ["admin"]`,
    });
  }
  return diagnostics;
}

function checkDuplicateConstraintCodes(entities: IrRecord[]): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  for (const entity of entities) {
    const constraints = Array.isArray(entity.constraints) ? (entity.constraints as IrRecord[]) : [];
    const codesSeen = new Map<string, number>();
    const entityName = String(entity.name);

    for (const c of constraints) {
      const code = c.code ? String(c.code) : c.name ? String(c.name) : '';
      if (!code) continue;
      const count = (codesSeen.get(code) ?? 0) + 1;
      codesSeen.set(code, count);
      if (count <= 1) continue;
      diagnostics.push({
        code: 'SEMANTIC_DUPLICATE_CONSTRAINT',
        message: `Entity '${entityName}' has duplicate constraint code '${code}'.`,
        severity: 'error',
        category: 'semantic',
        path: `entities[?(@.name=="${entityName}")].constraints`,
        suggestion:
          'Constraint codes must be unique within an entity. Rename or remove the duplicate.',
      });
    }
  }
  return diagnostics;
}

function checkOrphanEventEmits(snapshot: ParsedIrSnapshot): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  const eventNames = new Set(snapshot.events.map((e) => String(e.name)));

  for (const cmd of snapshot.commands) {
    const cmdName = cmd.name == null ? '' : String(cmd.name);
    const emits = Array.isArray(cmd.emits) ? (cmd.emits as string[]) : [];
    for (const eventName of emits) {
      if (eventNames.has(eventName)) continue;
      diagnostics.push({
        code: 'SEMANTIC_ORPHAN_EVENT',
        message: `Command '${cmdName}' emits event '${eventName}' which is not defined in the events array.`,
        severity: 'warning',
        category: 'semantic',
        path: `commands[?(@.name=="${cmdName}")]`,
        suggestion: `Define the event '${eventName}' in the events section, or remove it from the command's emits.`,
      });
    }
  }
  return diagnostics;
}

function checkStoreEntityReferences(snapshot: ParsedIrSnapshot): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  const entityNames = new Set(snapshot.entities.map((e) => String(e.name)));

  for (const store of snapshot.stores) {
    const storeEntity = store.entity == null ? '' : String(store.entity);
    if (!storeEntity || entityNames.has(storeEntity)) continue;
    diagnostics.push({
      code: 'SEMANTIC_STORE_ORPHAN_ENTITY',
      message: `Store references entity '${storeEntity}' which is not defined.`,
      severity: 'error',
      category: 'semantic',
      path: `stores[?(@.entity=="${storeEntity}")]`,
      suggestion: `Define entity '${storeEntity}' or update the store to reference an existing entity.`,
    });
  }
  return diagnostics;
}

function checkCommandEntityReferences(snapshot: ParsedIrSnapshot): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  const entityNames = new Set(snapshot.entities.map((e) => String(e.name)));

  for (const cmd of snapshot.commands) {
    const cmdEntity = cmd.entity == null ? '' : String(cmd.entity);
    const cmdName = cmd.name == null ? '' : String(cmd.name);
    if (!cmdEntity || entityNames.has(cmdEntity)) continue;
    diagnostics.push({
      code: 'SEMANTIC_COMMAND_ORPHAN_ENTITY',
      message: `Command '${cmdName}' references entity '${cmdEntity}' which is not defined.`,
      severity: 'error',
      category: 'semantic',
      path: `commands[?(@.name=="${cmdName}")]`,
      suggestion: `Define entity '${cmdEntity}' or remove the entity reference from the command.`,
    });
  }
  return diagnostics;
}

function checkRelationshipTargets(snapshot: ParsedIrSnapshot): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  const entityNames = new Set(snapshot.entities.map((e) => String(e.name)));

  for (const entity of snapshot.entities) {
    const entityName = String(entity.name);
    const relationships = Array.isArray(entity.relationships)
      ? (entity.relationships as IrRecord[])
      : [];
    for (const rel of relationships) {
      const target = rel.target == null ? '' : String(rel.target);
      if (!target || entityNames.has(target)) continue;
      diagnostics.push({
        code: 'SEMANTIC_RELATIONSHIP_ORPHAN_TARGET',
        message: `Entity '${entityName}' relationship '${String(rel.name)}' targets '${target}' which is not defined.`,
        severity: 'warning',
        category: 'semantic',
        path: `entities[?(@.name=="${entityName}")].relationships`,
        suggestion: `Define entity '${target}' or update the relationship target.`,
      });
    }
  }
  return diagnostics;
}

function checkDomainWiring(snapshot: ParsedIrSnapshot): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  checkDomainCompleteness(
    snapshot.entities as unknown as IREntity[],
    snapshot.commands as unknown as IRCommand[],
    snapshot.stores as unknown as IRStore[],
    (severity, message) => {
      const isError = severity === 'error';
      const isUnwiredFk = /no belongsTo/.test(message);
      diagnostics.push({
        code: domainCompletenessCode(isError, message),
        message,
        severity,
        category: 'domain',
        suggestion: domainCompletenessSuggestion(isError, isUnwiredFk),
      });
    },
    snapshot.reactions as unknown as IRReactionRule[],
    snapshot.tenant,
  );
  return diagnostics;
}

function checkReactionWiring(snapshot: ParsedIrSnapshot): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  checkReactionCompleteness(
    snapshot.entities as unknown as IREntity[],
    snapshot.commands as unknown as IRCommand[],
    snapshot.reactions as unknown as IRReactionRule[],
    (severity, message) => {
      const isError = severity === 'error';
      diagnostics.push({
        code: isError ? 'REACTION_UNWIRED' : 'REACTION_COMPLETENESS',
        message,
        severity,
        category: 'domain',
        suggestion: isError
          ? 'Ensure the event is emitted by a command and payload references use emitter params, payload._subject, or valid create-result properties.'
          : undefined,
      });
    },
    snapshot.events as unknown as IREvent[],
  );
  return diagnostics;
}

function structuralSummary(snapshot: ParsedIrSnapshot): ValidationDiagnostic {
  return {
    code: 'STRUCTURAL_SUMMARY',
    message: `IR contains ${snapshot.entities.length} entities, ${snapshot.commands.length} commands, ${snapshot.policies.length} policies, ${snapshot.stores.length} stores, ${snapshot.events.length} events.`,
    severity: 'info',
    category: 'structural',
  };
}

export function runSemanticChecks(ir: unknown): ValidationDiagnostic[] {
  const snapshot = parseIrSnapshot(ir);
  if (!snapshot) return [];

  return [
    ...checkPolicyCoverage(snapshot),
    ...checkDuplicateConstraintCodes(snapshot.entities),
    ...checkOrphanEventEmits(snapshot),
    ...checkStoreEntityReferences(snapshot),
    ...checkCommandEntityReferences(snapshot),
    ...checkRelationshipTargets(snapshot),
    ...checkDomainWiring(snapshot),
    ...checkReactionWiring(snapshot),
    structuralSummary(snapshot),
  ];
}
