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
import { isConvexSearchIndexFieldType } from './type-mapping.js';
import { renderReadPolicies } from './read-policies.js';

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
  {
    feature: 'Read/all policies on generated queries',
    status: 'partial',
    note: 'Renderable predicates are evaluated with authContextImport; flag, relationship traversal, and rateLimit stay internal (fail closed).',
  },
  { feature: 'Roles + roleAllows', status: 'supported' },
  { feature: 'Events + emit payloads', status: 'supported' },
  { feature: 'Reactions', status: 'supported' },
  { feature: 'Transitions', status: 'supported' },
  { feature: 'Private properties', status: 'supported' },
  { feature: 'Computed self-only properties', status: 'supported' },
  { feature: 'Schedules', status: 'supported' },
  { feature: 'Webhooks', status: 'supported' },
  {
    feature: 'Authenticated command dispatcher',
    status: 'supported',
    note: 'POST /api/manifest/{entity}/commands/{command}; ctx.auth → governed mutation.',
  },
  { feature: 'Sagas', status: 'supported' },
  { feature: 'Tenant / soft-delete filters', status: 'supported' },
  { feature: 'authContextImport', status: 'supported' },
  { feature: 'encryptionImport', status: 'supported' },
  {
    feature: 'Webhook signature',
    status: 'partial',
    note: 'Generated httpAction does not verify HMAC.',
  },
  {
    feature: 'Saga step arguments',
    status: 'partial',
    note: 'A single input is forwarded to every step.',
  },
  {
    feature: 'trustedSource params',
    status: 'partial',
    note: 'Exposed as normal args unless the auth/create seam injects them.',
  },
  { feature: 'Referential onDelete/onUpdate', status: 'partial', note: 'No schema cascade.' },
  {
    feature: 'Computed relation aggregates',
    status: 'partial',
    note: 'Unresolved unless self-only or count via reactions.',
  },
  {
    feature: 'Encrypted properties',
    status: 'supported',
    note: 'Runtime-compatible envelope via encryptionImport; missing seam is a hard diagnostic.',
  },
  { feature: "policyMode: 'skip'", status: 'partial', note: 'Omits authorization only.' },
  { feature: 'Approvals', status: 'unsupported', note: 'CONVEX_UNSUPPORTED_APPROVAL' },
  {
    feature: 'realtime hint',
    status: 'partial',
    note: 'CONVEX_PARTIAL_REALTIME — Convex queries are already reactive; no SSE artifact (unlike Next.js).',
  },
  {
    feature: 'versionProperty / optimistic concurrency',
    status: 'supported',
    note: 'Create seeds version=1; updates optional expected version + increment (VERSION_MISMATCH throw)',
  },
  {
    feature: 'masked / unmask when',
    status: 'supported',
    note: 'Read-time masking on list/get; unmaskWhen lowered when expression is Convex-renderable (secure default if user/context missing)',
  },
  {
    feature: 'searchable (string-like → .searchIndex)',
    status: 'supported',
    note: 'Non-string searchable still emits CONVEX_UNSUPPORTED_SEARCHABLE',
  },
  {
    feature: 'Computed cache directives',
    status: 'partial',
    note: 'CONVEX_PARTIAL_COMPUTED_CACHE — helpers stay pure; Manifest cache strategies are not lowered (platform query caching applies).',
  },
  { feature: 'Command/policy retry', status: 'unsupported', note: 'CONVEX_UNSUPPORTED_RETRY' },
  {
    feature: 'Command rateLimit',
    status: 'supported',
    note: 'Sliding-window buckets in commandRateLimitBuckets; user/tenant scopes need authContextImport. Policy/read rateLimit still unsupported.',
  },
  {
    feature: 'Policy/read rateLimit',
    status: 'unsupported',
    note: 'CONVEX_UNSUPPORTED_RATE_LIMIT / CONVEX_UNSUPPORTED_READ_POLICY_RATE_LIMIT',
  },
  {
    feature: 'async commands / job queue',
    status: 'unsupported',
    note: 'CONVEX_UNSUPPORTED_ASYNC_COMMAND',
  },
  {
    feature: 'Action kinds effect / publish / persist',
    status: 'unsupported',
    note: 'CONVEX_UNSUPPORTED_ACTION_KIND',
  },
];

/**
 * Emit warnings for IR constructs the Convex projection does not enforce.
 * Field-aware: only fires when the program actually declares the construct.
 */
export function collectUnsupportedDiagnostics(
  ir: IR,
  options: { authContextImport?: string } = {},
): ProjectionDiagnostic[] {
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
        severity: 'info',
        code: 'CONVEX_PARTIAL_REALTIME',
        entity: entity.name,
        message: `Entity '${entity.name}' declares realtime; Convex queries are already reactive, so no SSE/subscription artifact is emitted for this hint (unlike the Next.js projection).`,
      });
    }

    for (const p of entity.properties) {
      if (p.modifiers.includes('searchable') && persistent) {
        if (!isConvexSearchIndexFieldType(p.type.name)) {
          out.push({
            severity: 'warning',
            code: 'CONVEX_UNSUPPORTED_SEARCHABLE',
            entity: entity.name,
            message: `Property '${entity.name}.${p.name}' is searchable but type '${p.type.name}' is not a Convex string searchField; no .searchIndex is emitted (string/text/uuid supported).`,
          });
        }
      }
    }

    for (const cp of entity.computedProperties) {
      if (cp.cache) {
        out.push({
          severity: 'info',
          code: 'CONVEX_PARTIAL_COMPUTED_CACHE',
          entity: entity.name,
          message: `Computed '${entity.name}.${cp.name}' declares cache '${cp.cache.strategy}'; Convex helpers are pure and do not lower Manifest cache directives (rely on Convex query caching).`,
        });
      }
    }
  }

  // Read/all policies require the real Convex identity seam. Without it (or
  // when an expression cannot be rendered), reads stay internal fail-closed.
  for (const policy of ir.policies) {
    if (policy.action !== 'read' && policy.action !== 'all') continue;
    const target = policy.entity;
    const gated = target
      ? ir.entities.some((e) => e.name === target && isPersistentEntity(e, ir))
      : ir.entities.some((e) => isPersistentEntity(e, ir));
    if (gated) {
      const targetEntities = ir.entities.filter(
        (e) => isPersistentEntity(e, ir) && (target === undefined || e.name === target),
      );
      const enforceable =
        !!options.authContextImport &&
        targetEntities.every((e) => renderReadPolicies(ir, e.name, '__row').renderable);
      if (enforceable) continue;
      out.push({
        severity: 'warning',
        code: 'CONVEX_UNSUPPORTED_READ_POLICY',
        entity: target,
        message: `Policy '${policy.name}' (action: ${policy.action}) requires options.authContextImport and a renderable expression; until then its queries are emitted as internalQuery (not client-callable).`,
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
