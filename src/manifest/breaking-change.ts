/**
 * Breaking-Change Classification Engine
 *
 * Takes an IRDiffReport (from ir-diff.ts) and classifies each change as:
 *   - compatible: backward-compatible (e.g., adding optional properties)
 *   - deprecated: may change runtime behavior but not type-level contract
 *   - breaking: breaks existing consumers (e.g., removing entities, changing types)
 *
 * Also produces consumer impact analysis (which commands, routes, projections are
 * affected) and supports acknowledgment filtering for CI integration.
 *
 * Design notes:
 *   - Deterministic: same IRDiffReport always produces same output (sorted, no random).
 *   - IR is the authority -- classifications derive from IR diffs, never from source.
 *   - Pure function: no I/O, no side effects.
 */

import type {
  IRDiffReport,
  EntityDiff,
  PropertyDiff,
  ComputedPropertyDiff,
  RelationshipDiff,
  ConstraintDiff,
  CommandDiff,
  PolicyDiff,
  StoreDiff,
  EventDiff,
  ModuleDiff,
} from './ir-diff';

// ============================================================================
// Public types
// ============================================================================

export type ChangeSeverity = 'compatible' | 'deprecated' | 'breaking';

export interface ClassifiedChange {
  /** Dot-separated path to the changed element, e.g. "User.email", "createUser.parameters.email" */
  path: string;
  /** Severity classification */
  severity: ChangeSeverity;
  /** Machine-readable category, e.g. "property-removed", "entity-added" */
  category: string;
  /** Human-readable description */
  description: string;
  /** Which consumers are affected, e.g. ["command:createUser", "route:/api/users"] */
  consumerImpact: string[];
}

export interface AcknowledgmentEntry {
  /** Dot-separated path matching ClassifiedChange.path */
  path: string;
  /** Category matching ClassifiedChange.category */
  category: string;
  /** ISO timestamp of acknowledgment */
  acknowledgedAt: string;
  /** Human-readable reason */
  reason: string;
}

export interface AcknowledgmentsFile {
  version: 1;
  acknowledged: AcknowledgmentEntry[];
}

export interface ConsumerImpactSummary {
  commands: string[];
  routes: string[];
  projections: string[];
}

export interface BreakingChangeReport {
  /** All classified changes, sorted by path */
  classified: ClassifiedChange[];
  /** Counts by severity */
  summary: {
    compatible: number;
    deprecated: number;
    breaking: number;
    total: number;
  };
  /** Breaking changes NOT found in the acknowledgments file */
  unacknowledged: ClassifiedChange[];
  /** Breaking changes found in the acknowledgments file */
  acknowledged: ClassifiedChange[];
  /** Aggregated consumer impact */
  consumerImpact: ConsumerImpactSummary;
}

// ============================================================================
// Helpers
// ============================================================================

function q(s: string): string {
  return "'" + s + "'";
}

function entityImpact(entityName: string): string[] {
  return ['projection:' + entityName, 'route:/api/' + entityName.toLowerCase()];
}

// ============================================================================
// Property classification
// ============================================================================

function classifyPropertyDiff(entityPath: string, prop: PropertyDiff): ClassifiedChange[] {
  const path = entityPath + '.' + prop.name;
  const results: ClassifiedChange[] = [];

  if (prop.change === 'added') {
    const isOptional = prop.details?.modifiers?.to?.includes('optional') ?? false;
    const hasDefault = prop.details?.defaultValue !== undefined;
    const severity: ChangeSeverity = hasDefault || isOptional ? 'compatible' : 'breaking';
    results.push({
      path,
      severity,
      category: 'property-added',
      description:
        'Property ' +
        q(path) +
        ' was added' +
        (severity === 'breaking'
          ? ' (required, no default -- existing data violates constraint)'
          : ''),
      consumerImpact: severity === 'breaking' ? entityImpact(entityPath) : [],
    });
    return results;
  }

  if (prop.change === 'removed') {
    results.push({
      path,
      severity: 'breaking',
      category: 'property-removed',
      description: 'Property ' + q(path) + ' was removed',
      consumerImpact: entityImpact(entityPath),
    });
    return results;
  }

  const details = prop.details;
  if (!details) return results;

  if (details.type) {
    const fromNullable = details.type.from.endsWith('?');
    const toNullable = details.type.to.endsWith('?');
    const fromBase = details.type.from.replace(/\?$/, '');
    const toBase = details.type.to.replace(/\?$/, '');
    const baseChanged = fromBase !== toBase;

    if (baseChanged) {
      results.push({
        path,
        severity: 'breaking',
        category: 'property-type-changed',
        description:
          'Property ' +
          q(path) +
          ' type changed from ' +
          q(details.type.from) +
          ' to ' +
          q(details.type.to),
        consumerImpact: entityImpact(entityPath),
      });
    } else if (!fromNullable && toNullable) {
      results.push({
        path,
        severity: 'compatible',
        category: 'property-made-optional',
        description:
          'Property ' +
          q(path) +
          ' was made optional (was ' +
          q(details.type.from) +
          ', now ' +
          q(details.type.to) +
          ')',
        consumerImpact: [],
      });
    } else if (fromNullable && !toNullable) {
      results.push({
        path,
        severity: 'breaking',
        category: 'property-made-required',
        description:
          'Property ' +
          q(path) +
          ' was made required (was ' +
          q(details.type.from) +
          ', now ' +
          q(details.type.to) +
          ')',
        consumerImpact: entityImpact(entityPath),
      });
    }
  }

  if (details.modifiers) {
    const fromRequired = details.modifiers.from.includes('required');
    const toRequired = details.modifiers.to.includes('required');

    if (!fromRequired && toRequired) {
      results.push({
        path,
        severity: 'breaking',
        category: 'property-made-required',
        description: 'Property ' + q(path) + ' was made required',
        consumerImpact: entityImpact(entityPath),
      });
    } else if (fromRequired && !toRequired) {
      results.push({
        path,
        severity: 'compatible',
        category: 'property-made-optional',
        description: 'Property ' + q(path) + ' was made optional',
        consumerImpact: [],
      });
    }
  }

  if (details.defaultValue) {
    results.push({
      path,
      severity: 'compatible',
      category: 'property-default-changed',
      description:
        'Property ' +
        q(path) +
        ' default value changed from ' +
        details.defaultValue.from +
        ' to ' +
        details.defaultValue.to,
      consumerImpact: [],
    });
  }

  return results;
}

// ============================================================================
// Computed property classification
// ============================================================================

function classifyComputedPropertyDiff(
  entityPath: string,
  cp: ComputedPropertyDiff,
): ClassifiedChange[] {
  const path = entityPath + '.' + cp.name;

  if (cp.change === 'added') {
    return [
      {
        path,
        severity: 'compatible',
        category: 'computed-property-added',
        description: 'Computed property ' + q(path) + ' was added',
        consumerImpact: [],
      },
    ];
  }

  if (cp.change === 'removed') {
    return [
      {
        path,
        severity: 'breaking',
        category: 'computed-property-removed',
        description: 'Computed property ' + q(path) + ' was removed',
        consumerImpact: entityImpact(entityPath),
      },
    ];
  }

  const results: ClassifiedChange[] = [];
  const details = cp.details;
  if (!details) return results;

  if (details.type) {
    results.push({
      path,
      severity: 'breaking',
      category: 'computed-property-type-changed',
      description:
        'Computed property ' +
        q(path) +
        ' type changed from ' +
        q(details.type.from) +
        ' to ' +
        q(details.type.to),
      consumerImpact: entityImpact(entityPath),
    });
  }

  if (details.expression) {
    results.push({
      path,
      severity: 'deprecated',
      category: 'computed-property-expression-changed',
      description: 'Computed property ' + q(path) + ' expression changed',
      consumerImpact: ['projection:' + entityPath],
    });
  }

  if (details.dependencies) {
    results.push({
      path,
      severity: 'deprecated',
      category: 'computed-property-dependencies-changed',
      description:
        'Computed property ' +
        q(path) +
        ' dependencies changed from [' +
        details.dependencies.from.join(', ') +
        '] to [' +
        details.dependencies.to.join(', ') +
        ']',
      consumerImpact: ['projection:' + entityPath],
    });
  }

  return results;
}

// ============================================================================
// Relationship classification
// ============================================================================

function classifyRelationshipDiff(entityPath: string, rel: RelationshipDiff): ClassifiedChange[] {
  const path = entityPath + '.' + rel.name;

  if (rel.change === 'added') {
    return [
      {
        path,
        severity: 'compatible',
        category: 'relationship-added',
        description: 'Relationship ' + q(path) + ' was added',
        consumerImpact: [],
      },
    ];
  }

  if (rel.change === 'removed') {
    return [
      {
        path,
        severity: 'breaking',
        category: 'relationship-removed',
        description: 'Relationship ' + q(path) + ' was removed',
        consumerImpact: entityImpact(entityPath),
      },
    ];
  }

  const results: ClassifiedChange[] = [];
  const details = rel.details;
  if (!details) return results;

  if (details.kind) {
    results.push({
      path,
      severity: 'breaking',
      category: 'relationship-kind-changed',
      description:
        'Relationship ' +
        q(path) +
        ' kind changed from ' +
        q(details.kind.from) +
        ' to ' +
        q(details.kind.to),
      consumerImpact: entityImpact(entityPath),
    });
  }

  if (details.target) {
    results.push({
      path,
      severity: 'breaking',
      category: 'relationship-target-changed',
      description:
        'Relationship ' +
        q(path) +
        ' target changed from ' +
        q(details.target.from) +
        ' to ' +
        q(details.target.to),
      consumerImpact: entityImpact(entityPath),
    });
  }

  if (details.foreignKeyChanged) {
    results.push({
      path,
      severity: 'breaking',
      category: 'relationship-fk-changed',
      description: 'Relationship ' + q(path) + ' foreign key changed',
      consumerImpact: entityImpact(entityPath),
    });
  }

  if (details.through !== undefined && details.through.from !== details.through.to) {
    results.push({
      path,
      severity: 'breaking',
      category: 'relationship-through-changed',
      description: 'Relationship ' + q(path) + ' through table changed',
      consumerImpact: entityImpact(entityPath),
    });
  }

  return results;
}

// ============================================================================
// Constraint classification
// ============================================================================

function classifyConstraintDiff(entityPath: string, con: ConstraintDiff): ClassifiedChange[] {
  const path = entityPath + '.' + con.name;

  if (con.change === 'added') {
    return [
      {
        path,
        severity: 'compatible',
        category: 'constraint-added',
        description: 'Constraint ' + q(path) + ' was added',
        consumerImpact: [],
      },
    ];
  }

  if (con.change === 'removed') {
    return [
      {
        path,
        severity: 'deprecated',
        category: 'constraint-removed',
        description: 'Constraint ' + q(path) + ' was removed',
        consumerImpact: [],
      },
    ];
  }

  const results: ClassifiedChange[] = [];
  const details = con.details;
  if (!details) return results;

  if (details.severity) {
    const severityOrder: Record<string, number> = { ok: 0, warn: 1, block: 2 };
    const fromLevel = severityOrder[details.severity.from] ?? 0;
    const toLevel = severityOrder[details.severity.to] ?? 0;

    if (toLevel > fromLevel) {
      results.push({
        path,
        severity: 'compatible',
        category: 'constraint-severity-raised',
        description:
          'Constraint ' +
          q(path) +
          ' severity raised from ' +
          q(details.severity.from) +
          ' to ' +
          q(details.severity.to),
        consumerImpact: [],
      });
    } else {
      results.push({
        path,
        severity: 'deprecated',
        category: 'constraint-severity-lowered',
        description:
          'Constraint ' +
          q(path) +
          ' severity lowered from ' +
          q(details.severity.from) +
          ' to ' +
          q(details.severity.to),
        consumerImpact: [],
      });
    }
  }

  if (details.message) {
    results.push({
      path,
      severity: 'compatible',
      category: 'constraint-message-changed',
      description: 'Constraint ' + q(path) + ' message changed',
      consumerImpact: [],
    });
  }

  return results;
}

// ============================================================================
// Entity classification
// ============================================================================

function classifyEntityDiff(entity: EntityDiff, _report: IRDiffReport): ClassifiedChange[] {
  const results: ClassifiedChange[] = [];
  const entityPath = entity.name;

  if (entity.change === 'added') {
    results.push({
      path: entityPath,
      severity: 'compatible',
      category: 'entity-added',
      description: 'Entity ' + q(entity.name) + ' was added',
      consumerImpact: [],
    });
    return results;
  }

  if (entity.change === 'removed') {
    const impact = entityImpact(entityPath);
    results.push({
      path: entityPath,
      severity: 'breaking',
      category: 'entity-removed',
      description:
        'Entity ' +
        q(entity.name) +
        ' was removed -- all routes and projections referencing it will break',
      consumerImpact: impact,
    });
    for (const prop of entity.properties) {
      results.push({
        path: entityPath + '.' + prop.name,
        severity: 'breaking',
        category: 'property-removed',
        description:
          'Property ' + q(entityPath + '.' + prop.name) + ' was removed (entity removed)',
        consumerImpact: [],
      });
    }
    return results;
  }

  // entity.change === 'changed'
  if (entity.module) {
    results.push({
      path: entityPath + '.$module',
      severity: 'compatible',
      category: 'entity-module-changed',
      description:
        'Entity ' +
        q(entity.name) +
        ' moved from module ' +
        q(entity.module.from ?? '(none)') +
        ' to ' +
        q(entity.module.to ?? '(none)'),
      consumerImpact: [],
    });
  }

  for (const prop of entity.properties) {
    results.push(...classifyPropertyDiff(entityPath, prop));
  }

  for (const cp of entity.computedProperties) {
    results.push(...classifyComputedPropertyDiff(entityPath, cp));
  }

  for (const rel of entity.relationships) {
    results.push(...classifyRelationshipDiff(entityPath, rel));
  }

  for (const con of entity.constraints) {
    results.push(...classifyConstraintDiff(entityPath, con));
  }

  return results;
}

// ============================================================================
// Command classification
// ============================================================================

function classifyCommandDiff(cmd: CommandDiff): ClassifiedChange[] {
  const path = cmd.name;

  if (cmd.change === 'added') {
    return [
      {
        path,
        severity: 'compatible',
        category: 'command-added',
        description: 'Command ' + q(cmd.name) + ' was added',
        consumerImpact: [],
      },
    ];
  }

  if (cmd.change === 'removed') {
    return [
      {
        path,
        severity: 'breaking',
        category: 'command-removed',
        description: 'Command ' + q(cmd.name) + ' was removed -- callers will fail',
        consumerImpact: ['command:' + cmd.name, 'route:/api/*/' + cmd.name],
      },
    ];
  }

  const results: ClassifiedChange[] = [];
  const details = cmd.details;
  if (!details) return results;

  if (details.entity) {
    results.push({
      path: path + '.entity',
      severity: 'breaking',
      category: 'command-entity-changed',
      description:
        'Command ' +
        q(cmd.name) +
        ' entity binding changed from ' +
        q(details.entity.from ?? '(none)') +
        ' to ' +
        q(details.entity.to ?? '(none)'),
      consumerImpact: ['command:' + cmd.name],
    });
  }

  if (details.parametersRemoved && details.parametersRemoved.length > 0) {
    for (const param of details.parametersRemoved) {
      const paramName = param.split(':')[0];
      results.push({
        path: path + '.parameters.' + paramName,
        severity: 'breaking',
        category: 'command-parameter-removed',
        description: 'Command ' + q(cmd.name) + ' parameter ' + q(paramName) + ' was removed',
        consumerImpact: ['command:' + cmd.name],
      });
    }
  }

  if (details.parametersAdded && details.parametersAdded.length > 0) {
    for (const param of details.parametersAdded) {
      const paramName = param.split(':')[0];
      results.push({
        path: path + '.parameters.' + paramName,
        severity: 'breaking',
        category: 'command-parameter-added',
        description: 'Command ' + q(cmd.name) + ' parameter ' + q(paramName) + ' was added',
        consumerImpact: ['command:' + cmd.name],
      });
    }
  }

  if (details.guardsChanged) {
    results.push({
      path: path + '.guards',
      severity: 'deprecated',
      category: 'command-guards-changed',
      description:
        'Command ' + q(cmd.name) + ' guard logic changed (may reject previously valid calls)',
      consumerImpact: ['command:' + cmd.name],
    });
  }

  if (details.actionsChanged) {
    results.push({
      path: path + '.actions',
      severity: 'deprecated',
      category: 'command-actions-changed',
      description: 'Command ' + q(cmd.name) + ' action logic changed',
      consumerImpact: ['command:' + cmd.name],
    });
  }

  if (details.emitsChanged) {
    results.push({
      path: path + '.emits',
      severity: 'deprecated',
      category: 'command-emits-changed',
      description: 'Command ' + q(cmd.name) + ' emitted events changed',
      consumerImpact: ['command:' + cmd.name],
    });
  }

  if (details.returnsChanged) {
    results.push({
      path: path + '.returns',
      severity: 'breaking',
      category: 'command-returns-changed',
      description: 'Command ' + q(cmd.name) + ' return type changed',
      consumerImpact: ['command:' + cmd.name],
    });
  }

  return results;
}

// ============================================================================
// Policy classification
// ============================================================================

function classifyPolicyDiff(policy: PolicyDiff): ClassifiedChange[] {
  const path = policy.name;

  if (policy.change === 'added') {
    return [
      {
        path,
        severity: 'compatible',
        category: 'policy-added',
        description: 'Policy ' + q(policy.name) + ' was added',
        consumerImpact: [],
      },
    ];
  }

  if (policy.change === 'removed') {
    return [
      {
        path,
        severity: 'breaking',
        category: 'policy-removed',
        description:
          'Policy ' +
          q(policy.name) +
          ' was removed -- previously protected operations are now unrestricted',
        consumerImpact: ['policy:' + policy.name],
      },
    ];
  }

  const results: ClassifiedChange[] = [];
  const details = policy.details;
  if (!details) return results;

  if (details.action) {
    results.push({
      path: path + '.action',
      severity: 'breaking',
      category: 'policy-action-changed',
      description:
        'Policy ' +
        q(policy.name) +
        ' action changed from ' +
        q(details.action.from) +
        ' to ' +
        q(details.action.to),
      consumerImpact: ['policy:' + policy.name],
    });
  }

  if (details.expressionChanged) {
    results.push({
      path: path + '.expression',
      severity: 'deprecated',
      category: 'policy-expression-changed',
      description: 'Policy ' + q(policy.name) + ' expression changed',
      consumerImpact: ['policy:' + policy.name],
    });
  }

  return results;
}

// ============================================================================
// Store classification
// ============================================================================

function classifyStoreDiff(store: StoreDiff): ClassifiedChange[] {
  const path = 'store:' + store.entity;

  if (store.change === 'added') {
    return [
      {
        path,
        severity: 'compatible',
        category: 'store-added',
        description: 'Store for ' + q(store.entity) + ' was added',
        consumerImpact: [],
      },
    ];
  }

  if (store.change === 'removed') {
    return [
      {
        path,
        severity: 'breaking',
        category: 'store-removed',
        description: 'Store for ' + q(store.entity) + ' was removed -- data persistence lost',
        consumerImpact: ['store:' + store.entity],
      },
    ];
  }

  const results: ClassifiedChange[] = [];
  const details = store.details;
  if (!details) return results;

  if (details.target) {
    results.push({
      path: path + '.target',
      severity: 'breaking',
      category: 'store-target-changed',
      description:
        'Store for ' +
        q(store.entity) +
        ' target changed from ' +
        q(details.target.from) +
        ' to ' +
        q(details.target.to),
      consumerImpact: ['store:' + store.entity],
    });
  }

  if (details.configChanged) {
    results.push({
      path: path + '.config',
      severity: 'deprecated',
      category: 'store-config-changed',
      description: 'Store for ' + q(store.entity) + ' configuration changed',
      consumerImpact: ['store:' + store.entity],
    });
  }

  return results;
}

// ============================================================================
// Event classification
// ============================================================================

function classifyEventDiff(event: EventDiff): ClassifiedChange[] {
  const path = event.name;

  if (event.change === 'added') {
    return [
      {
        path,
        severity: 'compatible',
        category: 'event-added',
        description: 'Event ' + q(event.name) + ' was added',
        consumerImpact: [],
      },
    ];
  }

  if (event.change === 'removed') {
    return [
      {
        path,
        severity: 'breaking',
        category: 'event-removed',
        description: 'Event ' + q(event.name) + ' was removed -- subscribers will break',
        consumerImpact: ['event:' + event.name],
      },
    ];
  }

  const results: ClassifiedChange[] = [];
  const details = event.details;
  if (!details) return results;

  if (details.channel) {
    results.push({
      path: path + '.channel',
      severity: 'breaking',
      category: 'event-channel-changed',
      description:
        'Event ' +
        q(event.name) +
        ' channel changed from ' +
        q(details.channel.from) +
        ' to ' +
        q(details.channel.to),
      consumerImpact: ['event:' + event.name],
    });
  }

  if (details.payloadChanged) {
    results.push({
      path: path + '.payload',
      severity: 'breaking',
      category: 'event-payload-changed',
      description: 'Event ' + q(event.name) + ' payload changed',
      consumerImpact: ['event:' + event.name],
    });
  }

  return results;
}

// ============================================================================
// Module classification
// ============================================================================

function classifyModuleDiff(mod: ModuleDiff): ClassifiedChange[] {
  const path = 'module:' + mod.name;

  if (mod.change === 'added') {
    return [
      {
        path,
        severity: 'compatible',
        category: 'module-added',
        description: 'Module ' + q(mod.name) + ' was added',
        consumerImpact: [],
      },
    ];
  }

  if (mod.change === 'removed') {
    return [
      {
        path,
        severity: 'breaking',
        category: 'module-removed',
        description: 'Module ' + q(mod.name) + ' was removed',
        consumerImpact: [],
      },
    ];
  }

  return [
    {
      path,
      severity: 'compatible',
      category: 'module-changed',
      description: 'Module ' + q(mod.name) + ' contents changed',
      consumerImpact: [],
    },
  ];
}

// ============================================================================
// Main classification function
// ============================================================================

/**
 * Classify all changes in an IR diff report by severity.
 *
 * @param report - Output of diffIR(oldIR, newIR)
 * @param acks - Optional parsed acknowledgments file
 * @returns Classified and analyzed breaking change report
 */
export function classifyBreakingChanges(
  report: IRDiffReport,
  acks?: AcknowledgmentsFile,
): BreakingChangeReport {
  const classified: ClassifiedChange[] = [];

  for (const entity of report.entities) {
    classified.push(...classifyEntityDiff(entity, report));
  }

  for (const cmd of report.commands) {
    classified.push(...classifyCommandDiff(cmd));
  }

  for (const policy of report.policies) {
    classified.push(...classifyPolicyDiff(policy));
  }

  for (const store of report.stores) {
    classified.push(...classifyStoreDiff(store));
  }

  for (const event of report.events) {
    classified.push(...classifyEventDiff(event));
  }

  for (const mod of report.modules) {
    classified.push(...classifyModuleDiff(mod));
  }

  // Sort deterministically by path, then category for stable output
  classified.sort((a, b) => {
    const pathCmp = a.path.localeCompare(b.path);
    if (pathCmp !== 0) return pathCmp;
    return a.category.localeCompare(b.category);
  });

  // Compute summary
  const breaking = classified.filter((c) => c.severity === 'breaking');
  const deprecated = classified.filter((c) => c.severity === 'deprecated');
  const compatible = classified.filter((c) => c.severity === 'compatible');

  // Apply acknowledgments -- match by path + category (two-key matching)
  const ackSet = new Set((acks?.acknowledged ?? []).map((a) => a.path + '::' + a.category));

  const acknowledged = breaking.filter((c) => ackSet.has(c.path + '::' + c.category));
  const unacknowledged = breaking.filter((c) => !ackSet.has(c.path + '::' + c.category));

  // Aggregate consumer impact
  const allImpact = classified.flatMap((c) => c.consumerImpact);
  const consumerImpact: ConsumerImpactSummary = {
    commands: [...new Set(allImpact.filter((i) => i.startsWith('command:')))].sort(),
    routes: [...new Set(allImpact.filter((i) => i.startsWith('route:')))].sort(),
    projections: [...new Set(allImpact.filter((i) => i.startsWith('projection:')))].sort(),
  };

  return {
    classified,
    summary: {
      compatible: compatible.length,
      deprecated: deprecated.length,
      breaking: breaking.length,
      total: classified.length,
    },
    unacknowledged,
    acknowledged,
    consumerImpact,
  };
}
