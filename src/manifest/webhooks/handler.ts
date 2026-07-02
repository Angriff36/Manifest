/**
 * Webhook runtime handler — the HTTP surface for inbound `webhook` declarations.
 *
 * A `webhook` in the IR (see docs/spec/ir/ir-v1.schema.json → IRWebhook) declares
 * an inbound HTTP endpoint that dispatches a command. Until this module, that IR
 * had no reference-runtime behavior outside the Convex projection: no signature
 * verification, no idempotency, no transform evaluation (2026-07-01 docs↔feature
 * reconciliation audit, "Webhook declarations produce no HTTP surface outside
 * Convex"). This is that behavior, and it is the executable contract the spec
 * (docs/spec/semantics.md § "Webhooks") and every projected webhook route bind to.
 *
 * Everything here is fail-closed: an under-configured or unauthenticated request
 * is rejected, never coerced into a success. The handler is transport-agnostic —
 * a projection adapts its framework's Request into {@link WebhookHttpRequest} and
 * turns {@link WebhookHttpResponse} back into a framework Response.
 *
 * Determinism: the handler performs no wall-clock reads. HMAC, JSON parsing, and
 * string comparison only; identical IR + context + request produce an identical
 * response (house-style determinism invariant).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import type { CommandResult, RuntimeContext, RuntimeEngine } from '../runtime-engine';
import type { IRWebhook } from '../ir';

/** An inbound HTTP request, normalized from whatever framework served it. */
export interface WebhookHttpRequest {
  method: string;
  /** Path as received, e.g. `/webhooks/stripe`. Matched verbatim against the IR. */
  path: string;
  headers: Record<string, string | string[] | undefined>;
  /** Exact request bytes as a string. HMAC is computed over THIS, not a re-serialization. */
  rawBody: string;
  query?: Record<string, string | undefined>;
}

/** The handler's response. `body` is a `ManifestCommandResponse`-shaped object or `{ error }`. */
export interface WebhookHttpResponse {
  status: number;
  body: unknown;
}

export interface WebhookHandlerOptions {
  /**
   * Explicit secret resolution override. Called with the matched webhook; a
   * non-empty return value is used as the HMAC secret. When it returns
   * `undefined`/empty, the handler falls back to resolving the IR's context path
   * (`webhook.signature.secret`) against the engine's runtime context. If neither
   * yields a secret the request is rejected fail-closed (config error).
   */
  resolveSecret?: (webhook: IRWebhook) => string | undefined;
}

/**
 * Handle one inbound webhook request against a runtime.
 *
 * Pipeline (each step fails closed):
 *  1. MATCH   — exact `path`, then `method` (default POST, case-insensitive).
 *  2. VERIFY  — HMAC signature when declared.
 *  3. DEDUPE  — idempotency key when declared.
 *  4. PARSE   — JSON body + transform expressions → command input.
 *  5. DISPATCH— runCommand, mapped to the shared command-response envelope.
 */
export async function handleWebhookRequest(
  runtime: RuntimeEngine,
  request: WebhookHttpRequest,
  options: WebhookHandlerOptions = {},
): Promise<WebhookHttpResponse> {
  const webhooks = runtime.getIR().webhooks ?? [];
  const requestMethod = request.method.toUpperCase();

  // 1. MATCH — path is authoritative; method disambiguates. A path with no
  // webhook at all is a 404; a path that exists under a different method is a
  // 405 (more debuggable than a blanket 404, and correct HTTP semantics).
  const pathMatches = webhooks.filter((w) => w.path === request.path);
  if (pathMatches.length === 0) {
    return notFound(`No webhook registered for path '${request.path}'`);
  }
  const webhook = pathMatches.find(
    (w) => (w.method ?? 'POST').toUpperCase() === requestMethod,
  );
  if (!webhook) {
    const allowed = pathMatches
      .map((w) => (w.method ?? 'POST').toUpperCase())
      .join(', ');
    return {
      status: 405,
      body: {
        error: `Method ${requestMethod} not allowed for '${request.path}'. Allowed: ${allowed}`,
      },
    };
  }

  // 2. VERIFY — HMAC signature (fail closed). Undeclared signature means the
  // endpoint is unauthenticated by design (spec § "Signature verification").
  if (webhook.signature) {
    const sig = webhook.signature;

    // Unsupported algorithm is a configuration fault, never a silent accept.
    if (sig.algorithm !== 'hmac-sha256' && sig.algorithm !== 'hmac-sha512') {
      return configError(
        `Webhook '${webhook.name}' declares unsupported signature algorithm '${String(sig.algorithm)}' (supported: hmac-sha256, hmac-sha512)`,
      );
    }

    // Resolve the shared secret: explicit override first, then the IR context path.
    let secret = options.resolveSecret ? options.resolveSecret(webhook) : undefined;
    if (secret === undefined || secret === '') {
      const resolved = resolveContextPath(runtime.getContext(), sig.secret);
      secret = typeof resolved === 'string' ? resolved : undefined;
    }
    if (secret === undefined || secret === '') {
      return configError(
        `Webhook '${webhook.name}' signature secret could not be resolved from '${sig.secret}'`,
      );
    }

    const provided = firstHeader(request.headers, sig.header);
    if (provided === undefined || provided === '') {
      return unauthorized(`Missing signature header '${sig.header}'`);
    }

    const nodeAlgo = sig.algorithm === 'hmac-sha512' ? 'sha512' : 'sha256';
    const expected = createHmac(nodeAlgo, secret).update(request.rawBody, 'utf8').digest('hex');
    if (!timingSafeHexEqual(expected, stripSignaturePrefix(provided))) {
      return unauthorized('Invalid webhook signature');
    }
  }

  // 3. DEDUPE — idempotency key (fail closed). A declared header the runtime
  // cannot honor (no IdempotencyStore wired) is a config error, not a silent
  // downgrade to at-least-once. See runtime-engine.ts runCommand.
  let idempotencyKey: string | undefined;
  if (webhook.idempotencyHeader) {
    if (!runtime.hasIdempotencyStore()) {
      return configError(
        `Webhook '${webhook.name}' declares idempotencyHeader '${webhook.idempotencyHeader}' but the runtime has no IdempotencyStore configured`,
      );
    }
    const key = firstHeader(request.headers, webhook.idempotencyHeader);
    if (key === undefined || key === '') {
      return {
        status: 400,
        body: { error: `Missing idempotency header '${webhook.idempotencyHeader}'` },
      };
    }
    idempotencyKey = key;
  }

  // 4. PARSE — JSON body, then transform expressions against it (bound as
  // `payload`/`self`, mirroring reaction param evaluation).
  let payload: unknown;
  try {
    payload = JSON.parse(request.rawBody);
  } catch {
    return { status: 400, body: { error: 'Invalid JSON body' } };
  }

  let input: Record<string, unknown>;
  if (webhook.transform && webhook.transform.length > 0) {
    const evalContext = { payload, self: payload };
    input = {};
    try {
      for (const param of webhook.transform) {
        input[param.name] = await runtime.evaluateExpression(param.expression, evalContext);
      }
    } catch (e) {
      return {
        status: 400,
        body: {
          error: `Webhook '${webhook.name}' transform failed: ${e instanceof Error ? e.message : String(e)}`,
        },
      };
    }
  } else {
    // No transform: pass the parsed body through as-is. A non-object body has no
    // command params to bind, so it becomes an empty input.
    input = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  }

  // 5. DISPATCH — mirror the Next.js dispatcher's instanceId derivation
  // (input.instanceId → input.id → undefined). Instance-scoped webhook commands
  // must therefore surface an id via transform or passthrough body.
  const instanceId =
    typeof input.instanceId === 'string'
      ? input.instanceId
      : typeof input.id === 'string'
        ? input.id
        : undefined;

  const result = await runtime.runCommand(webhook.command, input, {
    entityName: webhook.entity,
    instanceId,
    idempotencyKey,
  });

  if (result.success) {
    return {
      status: 200,
      body: { data: result.result, events: result.emittedEvents, diagnostics: [] },
    };
  }
  return buildFailureResponse(result);
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function notFound(error: string): WebhookHttpResponse {
  return { status: 404, body: { error } };
}

function unauthorized(error: string): WebhookHttpResponse {
  return { status: 401, body: { error } };
}

/** Configuration faults (unresolved secret, missing store, bad algorithm) are 5xx. */
function configError(error: string): WebhookHttpResponse {
  return { status: 500, body: { error } };
}

/**
 * Map a failed `CommandResult` to a status + `{ error, diagnostics }` body. The
 * policy/guard/constraint statuses mirror the Next.js dispatcher exactly
 * (projections/nextjs/generator.ts); concurrency and approval failures get their
 * semantically-correct 409 rather than the dispatcher's catch-all 400, because
 * the handler holds the structured result and can tell them apart.
 */
function buildFailureResponse(result: CommandResult): WebhookHttpResponse {
  let kind = 'command_error';
  let status = 400;
  if (result.policyDenial) {
    kind = 'policy_denial';
    status = 403;
  } else if (result.guardFailure) {
    kind = 'guard_failure';
    status = 422;
  } else if (result.constraintOutcomes?.some((o) => !o.passed && o.severity === 'block')) {
    kind = 'constraint_block';
    status = 422;
  } else if (result.concurrencyConflict) {
    kind = 'concurrency_conflict';
    status = 409;
  } else if (result.approvalRequired) {
    kind = 'approval_required';
    status = 409;
  }
  const message = result.error ?? kind;
  return { status, body: { error: message, diagnostics: [{ kind, message }] } };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Case-insensitive header lookup; multi-value headers collapse to the first value. */
function firstHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      const value = headers[key];
      if (Array.isArray(value)) return value.length > 0 ? value[0] : undefined;
      return value;
    }
  }
  return undefined;
}

/**
 * Resolve a context-path string (e.g. `context.stripeWebhookSecret`) against the
 * runtime context. Mirrors the engine's own tenant-path resolution: a leading
 * `context` segment maps to the whole context, `user` to `context.user`, else a
 * top-level context key.
 */
function resolveContextPath(ctx: RuntimeContext, path: string): unknown {
  const parts = path.split('.');
  let current: unknown;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i === 0) {
      if (part === 'context') current = ctx;
      else if (part === 'user') current = ctx.user;
      else current = (ctx as Record<string, unknown>)[part];
    } else if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Strip a GitHub-style `sha256=` / `sha512=` prefix from a provided signature,
 * leaving bare hex. Any other value is returned unchanged (treated as bare hex).
 */
function stripSignaturePrefix(signature: string): string {
  const eq = signature.indexOf('=');
  if (eq > 0) {
    const prefix = signature.slice(0, eq).toLowerCase();
    if (prefix === 'sha256' || prefix === 'sha512') {
      return signature.slice(eq + 1);
    }
  }
  return signature;
}

/** Constant-time hex-string comparison. Unequal lengths short-circuit to false. */
function timingSafeHexEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a.toLowerCase(), 'utf8');
  const bufB = Buffer.from(b.toLowerCase(), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
