/**
 * Policy bridge — enforces authorization across service boundaries.
 *
 * The policy bridge solves a critical federation problem: when Service A
 * invokes a command on Service B, Service B must still enforce its own
 * authorization policies. The bridge:
 *
 * 1. Extracts the caller's identity from the local RuntimeContext
 * 2. Propagates it across the network as policy bridge headers
 * 3. On the receiving side, reconstructs a RuntimeContext from those headers
 * 4. The receiving service's policy engine evaluates against the reconstructed context
 *
 * The bridge NEVER trusts the caller to enforce its own policies — every
 * service is responsible for evaluating its own authorization rules using
 * the forwarded identity.
 *
 * @module federation/policy-bridge
 */

import type { PolicyBridgeHeaders } from './types';
import type { RuntimeContext } from '../runtime-engine';

/**
 * Build policy bridge headers from a local RuntimeContext.
 * Extracts actor identity, tenant, org, and roles for cross-service propagation.
 */
export function buildBridgeFromContext(context: RuntimeContext): PolicyBridgeHeaders {
  const headers: PolicyBridgeHeaders = {};
  if (context.actorId) headers.actorId = context.actorId;
  if (context.tenantId) headers.tenantId = context.tenantId;
  if (context.orgId) headers.orgId = context.orgId;
  if (context.requestId) headers.requestId = context.requestId;
  if (context.user?.role) headers.actorRoles = [context.user.role];
  return headers;
}

/**
 * Reconstruct a RuntimeContext from incoming policy bridge headers.
 * The receiving service uses this to evaluate its own policies against
 * the caller's identity.
 *
 * Strict by default: missing actor identity is preserved as undefined
 * (policies that require actor checks will fail closed).
 */
export function contextFromBridgeHeaders(headers: PolicyBridgeHeaders): RuntimeContext {
  const context: RuntimeContext = {};
  if (headers.actorId) context.actorId = headers.actorId;
  if (headers.tenantId) context.tenantId = headers.tenantId;
  if (headers.orgId) context.orgId = headers.orgId;
  if (headers.requestId) context.requestId = headers.requestId;
  if (headers.correlationId) context.correlationId = headers.correlationId;
  if (headers.actorRoles && headers.actorRoles.length > 0) {
    context.user = { id: headers.actorId ?? 'unknown', role: headers.actorRoles[0] };
    context.user = { ...context.user, roles: headers.actorRoles };
  }
  return context;
}

/**
 * Extract policy bridge headers from a standard Headers object or plain object.
 * Handles both case-insensitive HTTP headers and the canonical camelCase form.
 */
export function parseBridgeHeaders(source: Headers | Record<string, string>): PolicyBridgeHeaders {
  const get = (key: string): string | undefined => {
    if (source instanceof Headers) {
      return source.get(key) ?? undefined;
    }
    // Case-insensitive lookup for plain objects
    const found = Object.keys(source).find((k) => k.toLowerCase() === key.toLowerCase());
    return found ? source[found] : undefined;
  };

  const headers: PolicyBridgeHeaders = {};
  const actor = get('X-Manifest-Actor');
  if (actor) headers.actorId = actor;
  const tenant = get('X-Manifest-Tenant');
  if (tenant) headers.tenantId = tenant;
  const org = get('X-Manifest-Org');
  if (org) headers.orgId = org;
  const roles = get('X-Manifest-Roles');
  if (roles)
    headers.actorRoles = roles
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);
  const reqId = get('X-Request-Id');
  if (reqId) headers.requestId = reqId;
  const corrId = get('X-Correlation-Id');
  if (corrId) headers.correlationId = corrId;
  const bearer = get('Authorization');
  if (bearer && bearer.startsWith('Bearer ')) headers.bearerToken = bearer.slice(7);
  return headers;
}

/**
 * Validate that a set of bridge headers carries the minimum required
 * identity information for cross-service policy enforcement.
 * Returns null if valid, or a string explaining the validation failure.
 */
export function validateBridgeHeaders(headers: PolicyBridgeHeaders): string | null {
  if (!headers.actorId) {
    return 'Policy bridge missing actor identity (X-Manifest-Actor)';
  }
  return null;
}

/**
 * Compute a correlation ID for a cross-service workflow if one isn't provided.
 * Uses a deterministic prefix + timestamp + counter for tracing.
 */
export function ensureCorrelationId(existing?: string): string {
  if (existing) return existing;
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `fed-${ts}-${rand}`;
}
