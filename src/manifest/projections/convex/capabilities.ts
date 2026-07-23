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
    status: 'supported',
    note: 'Renderable predicates with authContextImport; flag() public when flagProviderImport set; belongsTo/ref + hasMany + hasMany-through (single-column join FKs) hydration. Read/all policy rateLimit REJECTED_LOUD (queries cannot mutate buckets). Unhydratable relation edges stay internal (fail closed). Write/execute/delete policy rateLimit emits on mutations.',
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
  {
    feature: 'flagProviderImport / flag()',
    status: 'supported',
    note: 'Author module exporting flag(name); required for public read policies that call flag(); stub returns false without seam',
  },
  { feature: 'encryptionImport', status: 'supported' },
  {
    feature: 'Webhook signature',
    status: 'supported',
    note: 'httpAction emits Web Crypto HMAC verify (hmac-sha256/sha512) + env secret; fail-closed 500/401',
  },
  {
    feature: 'Saga step arguments',
    status: 'supported',
    note: 'IR has no per-step arg map; orchestrator forwards one shared `input` to every step/compensate (matches IRSagaStep).',
  },
  {
    feature: 'trustedSource params',
    status: 'supported',
    note: 'Omitted from client args; injected from getAuthContext (__auth.context ?? __auth) at context.* path; MISSING_TRUSTED_CONTEXT when required and absent.',
  },
  {
    feature: 'Referential onDelete cascade/restrict',
    status: 'supported',
    note: 'Hard-delete mutations (delete/remove, no mutate patches) run restrict-then-cascade for single-column and composite belongsTo/ref.',
  },
  {
    feature: 'Referential onUpdate cascade/restrict',
    status: 'supported',
    note: 'Patch mutations rewrite (cascade) or block (restrict) child FKs (single + composite) when referenced parent columns change.',
  },
  {
    feature: 'Referential setNull / setDefault',
    status: 'supported',
    note: 'setNull clears optional FK (undefined); setDefault uses IR/type default. Single + composite. Non-nullable setNull errors.',
  },
  {
    feature: 'Referential composite FK',
    status: 'supported',
    note: 'Multi-column belongsTo/ref: schema composite index + mutation helpers match all paired columns.',
  },
  {
    feature: 'Computed relation aggregates',
    status: 'supported',
    note: 'Self-only helpers; count_of/sum/avg/min_of/max_of/filter/map/flat_map on hydrated hasMany in mutations (+ nested hydrate). Unresolved expressions → CONVEX_UNRESOLVED_COMPUTED (never silent drop).',
  },
  {
    feature: 'Encrypted properties',
    status: 'supported',
    note: 'Runtime-compatible envelope via encryptionImport; missing seam is a hard diagnostic.',
  },
  {
    feature: "policyMode: 'skip'",
    status: 'supported',
    note: 'Documented escape hatch — omits authorization policy checks only (guards/constraints still run).',
  },
  {
    feature: 'Approvals',
    status: 'unsupported',
    note: 'CONVEX_UNSUPPORTED_APPROVAL (error) — no stage state or pre-command gate in Convex mutations',
  },
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
  {
    feature: 'Command retry',
    status: 'unsupported',
    note: 'CONVEX_UNSUPPORTED_RETRY (error) — Convex mutations cannot honor per-attempt rollback + backoff sleep; use platform OCC / caller-side retry',
  },
  {
    feature: 'Command rateLimit',
    status: 'supported',
    note: 'Sliding-window buckets in commandRateLimitBuckets; user/tenant scopes need authContextImport.',
  },
  {
    feature: 'Policy rateLimit (write/execute/delete)',
    status: 'supported',
    note: 'Same bucket table; key prefix policy:<name>; before each policy expression on mutations',
  },
  {
    feature: 'Policy/read rateLimit',
    status: 'unsupported',
    note: 'CONVEX_UNSUPPORTED_RATE_LIMIT / CONVEX_UNSUPPORTED_READ_POLICY_RATE_LIMIT (error) — Convex queries cannot mutate durable buckets; remove rateLimit from read/all policies',
  },
  {
    feature: 'async commands / job queue',
    status: 'unsupported',
    note: 'CONVEX_UNSUPPORTED_ASYNC_COMMAND (error) — no job queue/drain emit; use Convex actions/schedulers outside the projection',
  },
  {
    feature: 'Action kinds effect / publish / persist',
    status: 'unsupported',
    note: 'CONVEX_UNSUPPORTED_ACTION_KIND (error) — no Convex lowering for effect/publish/persist action kinds',
  },
];

/**
 * Emit warnings for IR constructs the Convex projection does not enforce.
 * Field-aware: only fires when the program actually declares the construct.
 */
export function collectUnsupportedDiagnostics(
  ir: IR,
  options: { authContextImport?: string; flagProviderImport?: string } = {},
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
          severity: 'error',
          code: 'CONVEX_UNSUPPORTED_APPROVAL',
          entity: entity.name,
          message:
            `Approval '${entity.name}.${a.name}' is rejected for Convex. ` +
            'The Convex projection does not emit approval stages, durable approval state, or a pre-command gate. ' +
            'Remove entity approvals for Convex-targeted programs, or run approvals in the reference runtime / another projection.',
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
        targetEntities.every(
          (e) =>
            renderReadPolicies(ir, e.name, '__row', {
              flagProviderImport: options.flagProviderImport,
            }).renderable,
        );
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
        severity: 'error',
        code: 'CONVEX_UNSUPPORTED_RETRY',
        entity: cmd.entity,
        message:
          `Command '${cmd.entity ?? '?'}.${cmd.name}' declares retry; rejected for Convex. ` +
          'Mutations cannot honor Manifest retry (fresh attempt after rollback + backoff sleep). ' +
          'Remove `retry` from the command, or rely on Convex OCC / caller-side retry outside the projection.',
      });
    }
    if (cmd.async) {
      out.push({
        severity: 'error',
        code: 'CONVEX_UNSUPPORTED_ASYNC_COMMAND',
        entity: cmd.entity,
        message:
          `Command '${cmd.entity ?? '?'}.${cmd.name}' is async; rejected for Convex. ` +
          'The projection does not emit a job queue / drain path. ' +
          'Remove `async` from the command, or schedule work with Convex actions/schedulers outside the projection.',
      });
    }
    for (const a of cmd.actions ?? []) {
      if (a.kind === 'effect' || a.kind === 'publish' || a.kind === 'persist') {
        out.push({
          severity: 'error',
          code: 'CONVEX_UNSUPPORTED_ACTION_KIND',
          entity: cmd.entity,
          message:
            `Command '${cmd.entity ?? '?'}.${cmd.name}' action kind '${a.kind}' is rejected for Convex. ` +
            'There is no mutation lowering for effect/publish/persist. Use mutate actions, or host adapters outside the projection.',
        });
      }
    }
    // trustedSource params: strip/inject is emitted in functions.ts
    // (trusted-source-emit.ts). Missing authContextImport is diagnosed there.
  }

  for (const pol of ir.policies) {
    if (!pol.rateLimit) continue;
    // Mutation-side write/execute/delete rateLimits are emitted. Read and `all`
    // still cannot consume buckets inside Convex queries (fail-closed internal).
    if (pol.action === 'read' || pol.action === 'all') {
      out.push({
        severity: 'error',
        code: 'CONVEX_UNSUPPORTED_RATE_LIMIT',
        entity: pol.entity,
        message:
          pol.action === 'read'
            ? `Policy '${pol.name}' declares rateLimit on read; rejected for Convex. ` +
              'Queries cannot mutate durable rate-limit buckets. Remove `rateLimit` from the read policy.'
            : `Policy '${pol.name}' declares rateLimit with action 'all'; rejected for Convex reads. ` +
              'Mutations can enforce the bucket, but read queries cannot mutate buckets. ' +
              'Split into write/execute rateLimit policies, or remove rateLimit from this `all` policy.',
      });
    }
  }

  return out;
}

/** Entity helper used by tests — re-export persistent check without expanding scope. */
export function persistentEntityNames(ir: IR): string[] {
  return ir.entities.filter((e) => isPersistentEntity(e, ir)).map((e: IREntity) => e.name);
}
