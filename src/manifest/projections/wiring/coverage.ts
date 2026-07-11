/**
 * Capability coverage validation: compare generated wiring capabilities
 * against an application-declared consumer registry.
 *
 * Does NOT inspect visual source. The app supplies an explicit registry.
 */

import type {
  WiringConsumersRegistry,
  WiringContract,
  WiringCoverageFinding,
  WiringCoverageReport,
  WiringConsumerEntry,
} from './types.js';
import { WIRING_CONSUMERS_SCHEMA } from './types.js';

export function parseConsumersRegistry(raw: unknown): WiringConsumersRegistry {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Wiring consumers registry must be an object');
  }
  const obj = raw as Record<string, unknown>;
  if (obj.$schema !== WIRING_CONSUMERS_SCHEMA) {
    throw new Error(`Wiring consumers registry $schema must be "${WIRING_CONSUMERS_SCHEMA}"`);
  }
  if (!Array.isArray(obj.consumers)) {
    throw new Error('Wiring consumers registry requires a consumers array');
  }
  const consumers: WiringConsumerEntry[] = [];
  for (const entry of obj.consumers) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Each consumer entry must be an object');
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.capabilityId !== 'string' || !e.capabilityId) {
      throw new Error('consumer.capabilityId must be a non-empty string');
    }
    if (
      e.disposition !== 'consumed' &&
      e.disposition !== 'backend-only' &&
      e.disposition !== 'deferred'
    ) {
      throw new Error(
        `consumer.disposition for ${e.capabilityId} must be consumed|backend-only|deferred`,
      );
    }
    consumers.push({
      capabilityId: e.capabilityId,
      disposition: e.disposition,
      ...(typeof e.note === 'string' ? { note: e.note } : {}),
    });
  }
  return { $schema: WIRING_CONSUMERS_SCHEMA, consumers };
}

/**
 * Validate coverage. Defects:
 * - unwired: capability exists in contract, no consumer declaration
 * - stale-consumer: consumer refers to a nonexistent capability
 *
 * Non-defects: exposed (consumed), backend-only, deferred.
 */
export function validateWiringCoverage(
  contract: WiringContract,
  registry: WiringConsumersRegistry,
): WiringCoverageReport {
  const capabilityIds = new Set(contract.capabilities.map((c) => c.capabilityId));
  const byId = new Map<string, WiringConsumerEntry>();
  for (const c of registry.consumers) {
    byId.set(c.capabilityId, c);
  }

  const findings: WiringCoverageFinding[] = [];

  for (const cap of contract.capabilities) {
    const declared = byId.get(cap.capabilityId);
    if (!declared) {
      findings.push({
        capabilityId: cap.capabilityId,
        status: 'unwired',
        defect: true,
        message: `Capability '${cap.capabilityId}' is exposed by Manifest but has no consumer declaration`,
      });
      continue;
    }
    if (declared.disposition === 'consumed') {
      findings.push({
        capabilityId: cap.capabilityId,
        status: 'exposed',
        defect: false,
        message: `Capability '${cap.capabilityId}' is intentionally consumed`,
      });
    } else if (declared.disposition === 'backend-only') {
      findings.push({
        capabilityId: cap.capabilityId,
        status: 'backend-only',
        defect: false,
        message: `Capability '${cap.capabilityId}' is intentionally backend-only`,
      });
    } else {
      findings.push({
        capabilityId: cap.capabilityId,
        status: 'deferred',
        defect: false,
        message: `Capability '${cap.capabilityId}' is deferred`,
      });
    }
  }

  for (const consumer of registry.consumers) {
    if (!capabilityIds.has(consumer.capabilityId)) {
      findings.push({
        capabilityId: consumer.capabilityId,
        status: 'stale-consumer',
        defect: true,
        message: `Consumer refers to nonexistent capability '${consumer.capabilityId}'`,
      });
    }
  }

  findings.sort(
    (a, b) => a.capabilityId.localeCompare(b.capabilityId) || a.status.localeCompare(b.status),
  );

  const summary = {
    totalCapabilities: contract.capabilities.length,
    exposed: findings.filter((f) => f.status === 'exposed').length,
    backendOnly: findings.filter((f) => f.status === 'backend-only').length,
    deferred: findings.filter((f) => f.status === 'deferred').length,
    unwired: findings.filter((f) => f.status === 'unwired').length,
    staleConsumers: findings.filter((f) => f.status === 'stale-consumer').length,
  };

  return {
    $schema: 'manifest-wiring-coverage/v1',
    ok: summary.unwired === 0 && summary.staleConsumers === 0,
    summary,
    findings,
  };
}
