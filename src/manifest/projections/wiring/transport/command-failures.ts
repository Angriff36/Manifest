/**
 * Failure rules taken from the messages the Convex generator already throws.
 * This does not invent a second error protocol.
 */

import type { IRCommand, IRConstraint, IREntity, IRPolicy } from '../../../ir.js';
import type { WiringFailureKind, WiringFailureRule } from '../types.js';

export interface CommandFailureListing {
  rules: WiringFailureRule[];
  kinds: WiringFailureKind[];
}

/** Lists the business failures a command can actually produce. */
export class CommandFailureCatalog {
  static from(input: {
    command: IRCommand;
    entity: IREntity | undefined;
    policies: readonly IRPolicy[];
    targetsExistingInstance: boolean;
  }): CommandFailureListing {
    const rules = [
      ...this.policies(input.command, input.policies),
      ...this.guards(input.command),
      ...this.constraints(input.command),
      ...this.concurrency(input.entity, input.targetsExistingInstance),
      ...this.trusted(input.command),
      ...this.missing(input.entity, input.targetsExistingInstance),
    ];
    const kinds = this.kinds(rules);
    return { rules, kinds };
  }

  private static policies(command: IRCommand, policies: readonly IRPolicy[]): WiringFailureRule[] {
    const byName = new Map(policies.map((policy) => [policy.name, policy]));
    return (command.policies ?? []).flatMap((name) => {
      const policy = byName.get(name);
      if (!policy) return [];
      return [
        { kind: 'policy_denial' as const, message: policy.message ?? `Policy ${name} denied` },
      ];
    });
  }

  private static guards(command: IRCommand): WiringFailureRule[] {
    return command.guards.map((_, index) => ({
      kind: 'guard_failure' as const,
      message: `Guard ${index} failed`,
    }));
  }

  private static constraints(command: IRCommand): WiringFailureRule[] {
    return ((command.constraints ?? []) as IRConstraint[]).flatMap((constraint) => {
      if (constraint.severity && constraint.severity !== 'block') return [];
      const message =
        constraint.message ?? constraint.messageTemplate ?? `Constraint ${constraint.code} failed`;
      return [{ kind: 'constraint_block' as const, message }];
    });
  }

  private static concurrency(
    entity: IREntity | undefined,
    targetsExistingInstance: boolean,
  ): WiringFailureRule[] {
    if (!targetsExistingInstance || !entity?.versionProperty) return [];
    return [{ kind: 'concurrency_conflict', message: 'ConcurrencyConflict:', prefix: true }];
  }

  private static trusted(command: IRCommand): WiringFailureRule[] {
    const canThrow = command.parameters.some(
      (parameter) =>
        parameter.trustedSource && parameter.required && parameter.defaultValue === undefined,
    );
    if (!canThrow) return [];
    return [{ kind: 'missing_trusted_context', message: 'MISSING_TRUSTED_CONTEXT:', prefix: true }];
  }

  private static missing(
    entity: IREntity | undefined,
    targetsExistingInstance: boolean,
  ): WiringFailureRule[] {
    if (!targetsExistingInstance || !entity) return [];
    return [{ kind: 'not_found', message: `${entity.name} not found` }];
  }

  private static kinds(rules: WiringFailureRule[]): WiringFailureKind[] {
    const seen = new Set<WiringFailureKind>();
    const kinds: WiringFailureKind[] = [];
    for (const rule of rules) {
      if (seen.has(rule.kind)) continue;
      seen.add(rule.kind);
      kinds.push(rule.kind);
    }
    kinds.push('business_failure');
    return kinds;
  }
}
