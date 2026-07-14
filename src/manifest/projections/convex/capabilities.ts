/**
 * Capability map diagnostics for the Convex projection (roadmap M7).
 *
 * Walks IR declarations that the projection does not (yet) lower into Convex
 * behavior and emits CONVEX_UNSUPPORTED_<FEATURE> warnings so "parsed but
 * ignored" is impossible without a diagnostic.
 *
 * Source of truth for human readers: CAPABILITIES.md in this directory.
 */

import type { IR, IREntity } from '../../ir';
import type { ProjectionCapability, ProjectionDiagnostic } from '../interface';
import { isPersistentEntity } from './persist.js';

/**
 * Structured counterpart to CAPABILITIES.md. Keep both representations aligned
 * when Convex projection support changes.
 */
export const CONVEX_PROJECTION_CAPABILITIES: ProjectionCapability[] = [
  { feature: 'Persistent entities + properties', status: 'supported' },
  { feature: 'Enums / nullable / arrays', status: 'supported' },
  { feature: 'Relationships belongsTo/ref FK + indexes', status: 'supported' },
  { feature: 'Indexed, tenant, and option indexes', status: 'supported' },
  { feature: 'Commands to mutations', status: 'supported' },
  { feature: 'Command policies / guards / constraints (in mutations)', status: 'supported' },
  { feature: 'Read/all policies on generated queries', status: 'unsupported', note: 'CONVEX_UNSUPPORTED_READ_POLICY — queries filter tenant/soft-delete only; gate reads at the app edge.' },
  { feature: 'Roles + roleAllows', status: 'supported' },
  { feature: 'Events + emit payloads', status: 'supported' },
  { feature: 'Reactions', status: 'supported' },
  { feature: 'Transitions', status: 'supported' },
  { feature: 'Private properties', status: 'supported' },
  { feature: 'Computed self-only properties', status: 'supported' },
  { feature: 'Schedules', status: 'supported' },
  { feature: 'Webhooks', status: 'supported' },
  { feature: 'Sagas', status: 'supported' },
  { feature: 'Tenant / soft-delete filters', status: 'supported' },
  { feature: 'authContextImport', status: 'supported' },
  { feature: 'Webhook signature', status: 'partial', note: 'Generated httpAction does not verify HMAC.' },
  { feature: 'Saga step arguments', status: 'partial', note: 'A single input is forwarded to every step.' },
  { feature: 'trustedSource params', status: 'partial', note: 'Exposed as normal args unless the auth/create seam injects them.' },
  { feature: 'Referential onDelete/onUpdate', status: 'partial', note: 'No schema cascade.' },
  { feature: 'Computed relation aggregates', status: 'partial', note: 'Unresolved unless self-only or count via reactions.' },
  { feature: 'Encrypted properties', status: 'partial', note: 'Stored and returned as plain strings.' },
  { feature: "policyMode: 'skip'", status: 'partial', note: 'Omits authorization only.' },
  { feature: 'Approvals', status: 'unsupported', note: 'CONVEX_UNSUPPORTED_APPROVAL' },
  { feature: 'realtime hint', status: 'unsupported', note: 'CONVEX_UNSUPPORTED_REALTIME' },
  { feature: 'versionProperty / optimistic concurrency', status: 'unsupported', note: 'CONVEX_UNSUPPORTED_VERSION' },
  { feature: 'masked / unmask when', status: 'unsupported', note: 'CONVEX_UNSUPPORTED_MASKED' },
  { feature: 'searchable', status: 'unsupported', note: 'CONVEX_UNSUPPORTED_SEARCHABLE' },
  { feature: 'Computed cache directives', status: 'unsupported', note: 'CONVEX_UNSUPPORTED_COMPUTED_CACHE' },
  { feature: 'Command/policy retry', status: 'unsupported', note: 'CONVEX_UNSUPPORTED_RETRY' },
  { feature: 'Command/policy rateLimit', status: 'unsupported', note: 'CONVEX_UNSUPPORTED_RATE_LIMIT' },
  { feature: 'async commands / job queue', status: 'unsupported', note: 'CONVEX_UNSUPPORTED_ASYNC_COMMAND' },
  { feature: 'Action kinds effect / publish / persist', status: 'unsupported', note: 'CONVEX_UNSUPPORTED_ACTION_KIND' },
];

/**
 * Emit warnings for IR constructs the Convex projection does not enforce.
 * Field-aware: only fires when the program actually declares the construct.
 */
export function collectUnsupportedDiagnostics(ir: IR): ProjectionDiagnostic[] {
  const out: ProjectionDiagnostic[] = [];

  for (const entity of ir.entities) {
    if (!isPersistentEntity(entity, ir) && !(entity as { external?: boolean }).external) {
      // Still scan non-persistent for declarations that would surprise authors
      // if they flip the store later — but only for entity-level metadata.
    }
    const persistent = isPersistentEntity(entity, ir);

    if (entity.approvals && entity.approvals.length > 0) {
      for (const a of entity.approvals) {
        out.push({
          severity: 'warning',
          code: 'CONVEX_UNSUPPORTED_APPROVAL',
          entity: entity.name,
          message: `Approval '${entity.name}.${a.name}' is not enforced by the Convex projection; stages are ignored at generation time.`,
        });
      }
    }

    if (entity.realtime === true && persistent) {
      out.push({
        severity: 'warning',
        code: 'CONVEX_UNSUPPORTED_REALTIME',
        entity: entity.name,
        message: `Entity '${entity.name}' declares realtime; Convex queries are already reactive, but no SSE/subscription artifact is emitted for this hint.`,
      });
    }

    if (entity.versionProperty && persistent) {
      out.push({
        severity: 'warning',
        code: 'CONVEX_UNSUPPORTED_VERSION',
        entity: entity.name,
        message: `Entity '${entity.name}' declares versionProperty '${entity.versionProperty}'; optimistic concurrency is not enforced in generated Convex mutations.`,
      });
    }

    for (const p of entity.properties) {
      if (p.modifiers.includes('masked')) {
        out.push({
          severity: 'warning',
          code: 'CONVEX_UNSUPPORTED_MASKED',
          entity: entity.name,
          message: `Property '${entity.name}.${p.name}' is masked; the Convex projection does not apply read-time masking.`,
        });
      }
      if (p.modifiers.includes('searchable') && persistent) {
        out.push({
          severity: 'warning',
          code: 'CONVEX_UNSUPPORTED_SEARCHABLE',
          entity: entity.name,
          message: `Property '${entity.name}.${p.name}' is searchable; no Convex search index is emitted.`,
        });
      }
    }

    for (const cp of entity.computedProperties) {
      if (cp.cache) {
        out.push({
          severity: 'warning',
          code: 'CONVEX_UNSUPPORTED_COMPUTED_CACHE',
          entity: entity.name,
          message: `Computed '${entity.name}.${cp.name}' declares cache '${cp.cache.strategy}'; Convex helpers are pure and do not honor cache directives.`,
        });
      }
    }
  }

  // Read/all policies are NOT applied to generated queries (queries filter
  // tenant/soft-delete only; command policies are enforced in mutations).
  for (const policy of ir.policies) {
    if (policy.action !== 'read' && policy.action !== 'all') continue;
    const target = policy.entity;
    const gated = target
      ? ir.entities.some((e) => e.name === target && isPersistentEntity(e, ir))
      : ir.entities.some((e) => isPersistentEntity(e, ir));
    if (gated) {
      out.push({
        severity: 'warning',
        code: 'CONVEX_UNSUPPORTED_READ_POLICY',
        entity: target,
        message: `Policy '${policy.name}' (action: ${policy.action}) is not applied to generated Convex queries; gate reads at the app edge or hand-write policy-aware queries.`,
      });
    }
  }

  for (const cmd of ir.commands) {
    if (cmd.retry) {
      out.push({
        severity: 'warning',
        code: 'CONVEX_UNSUPPORTED_RETRY',
        entity: cmd.entity,
        message: `Command '${cmd.entity ?? '?'}.${cmd.name}' declares retry; the Convex projection does not emit retry/backoff wrappers.`,
      });
    }
    if (cmd.rateLimit) {
      out.push({
        severity: 'warning',
        code: 'CONVEX_UNSUPPORTED_RATE_LIMIT',
        entity: cmd.entity,
        message: `Command '${cmd.entity ?? '?'}.${cmd.name}' declares rateLimit; the Convex projection does not emit rate-limit checks.`,
      });
    }
    if (cmd.async) {
      out.push({
        severity: 'warning',
        code: 'CONVEX_UNSUPPORTED_ASYNC_COMMAND',
        entity: cmd.entity,
        message: `Command '${cmd.entity ?? '?'}.${cmd.name}' is async; the Convex projection does not emit a job queue / drain path (use Convex actions/schedulers manually).`,
      });
    }
    for (const a of cmd.actions ?? []) {
      if (a.kind === 'effect' || a.kind === 'publish' || a.kind === 'persist') {
        out.push({
          severity: 'warning',
          code: 'CONVEX_UNSUPPORTED_ACTION_KIND',
          entity: cmd.entity,
          message: `Command '${cmd.entity ?? '?'}.${cmd.name}' action kind '${a.kind}' has no Convex lowering (no-op without an adapter).`,
        });
      }
    }
    for (const p of cmd.parameters ?? []) {
      if (p.trustedSource) {
        // Auth seam covers some cases; still warn that trustedSource paths are
        // not auto-injected unless they map to the auth context contract.
        out.push({
          severity: 'info',
          code: 'CONVEX_PARTIAL_TRUSTED_SOURCE',
          entity: cmd.entity,
          message: `Parameter '${cmd.entity ?? '?'}.${cmd.name}.${p.name}' has trustedSource '${p.trustedSource}'; Convex mutations expose it as a normal arg unless your auth/create seam injects it.`,
        });
      }
    }
  }

  for (const pol of ir.policies) {
    if (pol.rateLimit) {
      out.push({
        severity: 'warning',
        code: 'CONVEX_UNSUPPORTED_RATE_LIMIT',
        entity: pol.entity,
        message: `Policy '${pol.name}' declares rateLimit; the Convex projection does not emit rate-limit checks.`,
      });
    }
  }

  for (const wh of ir.webhooks ?? []) {
    if (wh.signature) {
      out.push({
        severity: 'warning',
        code: 'CONVEX_UNSUPPORTED_WEBHOOK_SIGNATURE',
        message: `Webhook '${wh.name}' declares signature verification; generated httpActions do not verify HMAC (front with a verifying edge or extend the projection).`,
      });
    }
  }

  return out;
}

/** Entity helper used by tests — re-export persistent check without expanding scope. */
export function persistentEntityNames(ir: IR): string[] {
  return ir.entities.filter((e) => isPersistentEntity(e, ir)).map((e: IREntity) => e.name);
}
