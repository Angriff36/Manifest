/**
 * Command- and policy-level rateLimit for the Convex projection (mutations).
 *
 * Sliding-window buckets persist in a dedicated Convex table (same semantics as
 * reference-runtime RateLimiter / RateLimitBucketState). Checked inside the
 * mutation runner before policies/guards so idempotent replays that skip the
 * runner do not consume a new token.
 *
 * Read-policy rateLimit stays unsupported — Convex queries cannot mutate
 * durable buckets (`CONVEX_UNSUPPORTED_READ_POLICY_RATE_LIMIT`).
 */

import type { IR, IRCommand, IRPolicy, IRRateLimit } from '../../ir.js';

export const DEFAULT_COMMAND_RATE_LIMIT_TABLE = 'commandRateLimitBuckets';

/** True when schema must emit the sliding-window bucket table. */
export function irNeedsRateLimitTable(ir: IR): boolean {
  if ((ir.commands ?? []).some((c) => !!c.rateLimit)) return true;
  return (ir.policies ?? []).some(
    (p) => !!p.rateLimit && p.action !== 'read',
  );
}

/** @deprecated Prefer irNeedsRateLimitTable — kept for call-site clarity. */
export function irHasCommandRateLimit(ir: IR): boolean {
  return irNeedsRateLimitTable(ir);
}

export function commandRateLimitNeedsAuth(rateLimit: IRRateLimit): boolean {
  return rateLimit.scope === 'user' || rateLimit.scope === 'tenant';
}

export function renderCommandRateLimitSchemaBlock(tableName: string): string {
  return (
    `  ${tableName}: defineTable({\n` +
    `    scopeKey: v.string(),\n` +
    `    timestamps: v.array(v.number()),\n` +
    `    windowStart: v.number(),\n` +
    `  })\n` +
    `    .index("by_scopeKey", ["scopeKey"])`
  );
}

export function renderCommandRateLimitHelpers(tableName: string): string {
  const t = JSON.stringify(tableName);
  return (
    `async function __consumeCommandRateLimit(\n` +
    `  ctx: MutationCtx,\n` +
    `  scopeKey: string,\n` +
    `  maxRequests: number,\n` +
    `  windowMs: number,\n` +
    `  burstAllowance: number,\n` +
    `): Promise<void> {\n` +
    `  const now = Date.now();\n` +
    `  const effectiveLimit = maxRequests + burstAllowance;\n` +
    `  const existing = await ctx.db\n` +
    `    .query(${t})\n` +
    `    .withIndex("by_scopeKey", (q) => q.eq("scopeKey", scopeKey))\n` +
    `    .first();\n` +
    `  let timestamps: number[] = [];\n` +
    `  let windowStart = now;\n` +
    `  if (existing !== null) {\n` +
    `    const windowEnd = existing.windowStart + windowMs;\n` +
    `    if (now < windowEnd) {\n` +
    `      const cutoff = now - windowMs;\n` +
    `      timestamps = existing.timestamps.filter((ts: number) => ts > cutoff);\n` +
    `      windowStart = existing.windowStart;\n` +
    `    }\n` +
    `  }\n` +
    `  if (timestamps.length >= effectiveLimit) {\n` +
    `    const oldest = timestamps[0] ?? now;\n` +
    `    const retryAfterMs = Math.max(0, oldest + windowMs - now);\n` +
    `    throw new Error(\`Rate limit exceeded (retry after \${retryAfterMs}ms)\`);\n` +
    `  }\n` +
    `  timestamps = [...timestamps, now];\n` +
    `  if (existing !== null) {\n` +
    `    await ctx.db.patch(existing._id, { timestamps, windowStart });\n` +
    `  } else {\n` +
    `    await ctx.db.insert(${t}, { scopeKey, timestamps, windowStart });\n` +
    `  }\n` +
    `}`
  );
}

export interface RateLimitEmitOptions {
  keyPrefix: string;
  tenantProp: string | undefined;
}

/** Shared sliding-window check lines for command or policy rateLimit. */
export function renderRateLimitCheckLines(
  rateLimit: IRRateLimit,
  options: RateLimitEmitOptions,
): string[] {
  const prefix = JSON.stringify(options.keyPrefix);
  const burst = rateLimit.burstAllowance ?? 0;
  const lines: string[] = [];

  if (rateLimit.scope === 'user') {
    lines.push('    const __rlUserId = __auth?.id ?? __auth?.user?.id;');
    lines.push(
      '    if (typeof __rlUserId !== "string" || !__rlUserId) throw new Error("Rate limit denied: unresolved user scope");',
    );
    lines.push(`    const __rlScopeKey = ${prefix} + ":user:" + __rlUserId;`);
  } else if (rateLimit.scope === 'tenant') {
    if (!options.tenantProp) {
      lines.push(
        '    throw new Error("Rate limit denied: unresolved tenant scope (no tenant property)");',
      );
      return lines;
    }
    lines.push(`    const __rlTenant = __auth?.${options.tenantProp};`);
    lines.push(
      '    if (typeof __rlTenant !== "string" || !__rlTenant) throw new Error("Rate limit denied: unresolved tenant scope");',
    );
    lines.push(`    const __rlScopeKey = ${prefix} + ":tenant:" + __rlTenant;`);
  } else {
    lines.push(`    const __rlScopeKey = ${prefix} + ":global";`);
  }

  lines.push(
    `    await __consumeCommandRateLimit(ctx, __rlScopeKey, ${rateLimit.maxRequests}, ${rateLimit.windowMs}, ${burst});`,
  );
  return lines;
}

export function renderCommandRateLimitCheckLines(
  cmd: IRCommand,
  options: RateLimitEmitOptions,
): string[] {
  if (!cmd.rateLimit) return [];
  return renderRateLimitCheckLines(cmd.rateLimit, options);
}

/** Runtime key prefix for policy gates: `policy:<name>`. */
export function policyRateLimitKeyPrefix(policy: IRPolicy): string {
  return `policy:${policy.name}`;
}

export function renderPolicyRateLimitCheckLines(
  policy: IRPolicy,
  options: Omit<RateLimitEmitOptions, 'keyPrefix'> & { keyPrefix?: string },
): string[] {
  if (!policy.rateLimit) return [];
  return renderRateLimitCheckLines(policy.rateLimit, {
    keyPrefix: options.keyPrefix ?? policyRateLimitKeyPrefix(policy),
    tenantProp: options.tenantProp,
  });
}

/** True when any command-attached policy rateLimit needs user/tenant auth. */
export function commandPoliciesNeedRateLimitAuth(ir: IR, cmd: IRCommand): boolean {
  for (const pName of cmd.policies ?? []) {
    const policy = ir.policies.find((p) => p.name === pName);
    if (policy?.rateLimit && commandRateLimitNeedsAuth(policy.rateLimit)) return true;
  }
  return false;
}
