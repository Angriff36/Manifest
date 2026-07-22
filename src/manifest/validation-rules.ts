/**
 * Config G2 — optional validation rule registry (additive diagnostics).
 *
 * Does not change language severities. Rules are off by default; when set to
 * `warn` / `error`, emit CONFIG_VALIDATION_RULE_* diagnostics for CI gates.
 * `requireDescriptions` remains deferred (no entity/command description on IR).
 */

import type { IR, IREntity, IRPolicy } from './ir.js';

export const VALIDATION_RULE_IDS = [
  'missing-policy',
  'unused-entity',
  'orphan-relationship',
] as const;

export type ValidationRuleId = (typeof VALIDATION_RULE_IDS)[number];
export type ValidationRuleSeverity = 'off' | 'warn' | 'error';

export type ValidationRulesConfig = Partial<Record<ValidationRuleId, ValidationRuleSeverity>>;

export interface ValidationRuleDiagnostic {
  severity: 'warning' | 'error';
  code: string;
  message: string;
  entity?: string;
}

export function isValidationRuleSeverity(value: unknown): value is ValidationRuleSeverity {
  return value === 'off' || value === 'warn' || value === 'error';
}

export function resolveValidationRules(
  raw: ValidationRulesConfig | undefined,
): Record<ValidationRuleId, ValidationRuleSeverity> {
  const out: Record<ValidationRuleId, ValidationRuleSeverity> = {
    'missing-policy': 'off',
    'unused-entity': 'off',
    'orphan-relationship': 'off',
  };
  if (!raw || typeof raw !== 'object') return out;
  for (const id of VALIDATION_RULE_IDS) {
    const v = raw[id];
    if (isValidationRuleSeverity(v)) out[id] = v;
  }
  return out;
}

function toDiagSeverity(level: ValidationRuleSeverity): 'warning' | 'error' | null {
  if (level === 'warn') return 'warning';
  if (level === 'error') return 'error';
  return null;
}

function entityHasStore(entity: IREntity, ir: IR): boolean {
  return ir.stores.some((s) => s.entity === entity.name);
}

function entityCommandCount(entity: IREntity, ir: IR): number {
  return ir.commands.filter((c) => c.entity === entity.name).length;
}

function entityReferencedByRelationship(entity: IREntity, ir: IR): boolean {
  for (const other of ir.entities) {
    for (const rel of other.relationships ?? []) {
      if (rel.target === entity.name) return true;
    }
  }
  return false;
}

function policiesForEntity(entity: IREntity, ir: IR): IRPolicy[] {
  return ir.policies.filter((p) => !p.entity || p.entity === entity.name);
}

function parentHasInverse(parent: IREntity, childName: string): boolean {
  return (parent.relationships ?? []).some(
    (r) => (r.kind === 'hasMany' || r.kind === 'hasOne') && r.target === childName,
  );
}

function collectMissingPolicy(ir: IR, severity: 'warning' | 'error'): ValidationRuleDiagnostic[] {
  const out: ValidationRuleDiagnostic[] = [];
  for (const entity of ir.entities) {
    if (entity.external) continue;
    if (entityCommandCount(entity, ir) === 0) continue;
    const defaults = entity.defaultPolicies ?? [];
    if (defaults.length > 0) continue;
    if (policiesForEntity(entity, ir).length > 0) continue;
    out.push({
      severity,
      code: 'CONFIG_VALIDATION_RULE_MISSING_POLICY',
      entity: entity.name,
      message:
        `Entity '${entity.name}' has commands but no policies target it and ` +
        `defaultPolicies is empty (validation.rules.missing-policy).`,
    });
  }
  return out;
}

function collectUnusedEntity(ir: IR, severity: 'warning' | 'error'): ValidationRuleDiagnostic[] {
  const out: ValidationRuleDiagnostic[] = [];
  for (const entity of ir.entities) {
    if (entity.external) continue;
    if (entityHasStore(entity, ir)) continue;
    if (entityCommandCount(entity, ir) > 0) continue;
    if (entityReferencedByRelationship(entity, ir)) continue;
    out.push({
      severity,
      code: 'CONFIG_VALIDATION_RULE_UNUSED_ENTITY',
      entity: entity.name,
      message:
        `Entity '${entity.name}' is unused: no store, no entity-scoped commands, ` +
        `and not referenced by any relationship (validation.rules.unused-entity).`,
    });
  }
  return out;
}

function collectOrphanRelationship(
  ir: IR,
  severity: 'warning' | 'error',
): ValidationRuleDiagnostic[] {
  const byName = new Map(ir.entities.map((e) => [e.name, e]));
  const out: ValidationRuleDiagnostic[] = [];
  for (const entity of ir.entities) {
    if (entity.external) continue;
    for (const rel of entity.relationships ?? []) {
      if (rel.kind !== 'belongsTo' && rel.kind !== 'ref') continue;
      const parent = byName.get(rel.target);
      if (!parent) continue;
      if (parentHasInverse(parent, entity.name)) continue;
      out.push({
        severity,
        code: 'CONFIG_VALIDATION_RULE_ORPHAN_RELATIONSHIP',
        entity: entity.name,
        message:
          `Entity '${entity.name}' ${rel.kind} '${rel.target}' has no hasMany/hasOne ` +
          `inverse on '${rel.target}' (validation.rules.orphan-relationship).`,
      });
    }
  }
  return out;
}

/** Run configured G2 rules against compiled IR. */
export function runValidationRules(
  ir: IR,
  rawRules: ValidationRulesConfig | undefined,
): ValidationRuleDiagnostic[] {
  const rules = resolveValidationRules(rawRules);
  const out: ValidationRuleDiagnostic[] = [];

  const missing = toDiagSeverity(rules['missing-policy']);
  if (missing) out.push(...collectMissingPolicy(ir, missing));

  const unused = toDiagSeverity(rules['unused-entity']);
  if (unused) out.push(...collectUnusedEntity(ir, unused));

  const orphan = toDiagSeverity(rules['orphan-relationship']);
  if (orphan) out.push(...collectOrphanRelationship(ir, orphan));

  return out;
}
