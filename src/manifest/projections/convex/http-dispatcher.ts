/**
 * Canonical authenticated command dispatcher for `convex.http`.
 *
 * Emits `POST /api/manifest/{entity}/commands/{command}` via `pathPrefix`.
 * Identity comes from Convex `ctx.auth.getUserIdentity()` (Bearer JWT); the
 * governed command mutation derives RuntimeContext via `getAuthContext(ctx)`.
 * Request bodies never supply tenant/role/user/`__auth`.
 */

import type { IR, IRCommand } from '../../ir.js';
import type { ProjectionDiagnostic } from '../interface.js';
import type { NormalizedConvexOptions } from './options.js';

/** Body keys that must never become mutation args (caller cannot override identity). */
export const DISPATCHER_FORBIDDEN_BODY_KEYS = [
  '__auth',
  'user',
  'role',
  'tenantId',
  'orgId',
  'userId',
  'actorId',
  'identity',
] as const;

export interface DispatcherCommandEntry {
  entity: string;
  command: string;
  mutationExport: string;
  /** Client-owned param names only (no trustedSource; optional idempotencyKey). */
  paramNames: string[];
}

/**
 * Collect entity-scoped commands for the HTTP dispatcher registry.
 * Generated at projection time from IR — not a hand-maintained lookup table.
 */
export function collectDispatcherCommands(
  ir: IR,
  options: NormalizedConvexOptions,
): DispatcherCommandEntry[] {
  const forbidden = new Set<string>(DISPATCHER_FORBIDDEN_BODY_KEYS);
  const out: DispatcherCommandEntry[] = [];

  for (const cmd of ir.commands ?? []) {
    const entity = cmd.entity;
    if (!entity) continue;

    const paramNames = clientOwnedParamNames(cmd, options, forbidden);
    out.push({
      entity,
      command: cmd.name,
      mutationExport: `${entity}_${cmd.name}`,
      paramNames,
    });
  }

  return out.sort((a, b) => {
    const ak = `${a.entity}.${a.command}`;
    const bk = `${b.entity}.${b.command}`;
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });
}

function clientOwnedParamNames(
  cmd: IRCommand,
  options: NormalizedConvexOptions,
  forbidden: Set<string>,
): string[] {
  const names: string[] = [];
  for (const p of cmd.parameters ?? []) {
    if (p.trustedSource) continue;
    if (forbidden.has(p.name)) continue;
    names.push(p.name);
  }
  if (options.enableCommandIdempotency && !names.includes('idempotencyKey')) {
    names.push('idempotencyKey');
  }
  return names;
}

/**
 * Emit the authenticated dispatcher route + command registry.
 * Returns empty string when there are no dispatchable commands.
 */
export function emitDispatcherRoute(
  ir: IR,
  options: NormalizedConvexOptions,
  diagnostics: ProjectionDiagnostic[],
): { code: string; commandCount: number } {
  if (!options.dispatcher.enabled) {
    diagnostics.push({
      severity: 'info',
      code: 'CONVEX_DISPATCHER_DISABLED',
      message: 'dispatcher.enabled is false — skipping authenticated command HTTP route.',
    });
    return { code: '', commandCount: 0 };
  }

  const commands = collectDispatcherCommands(ir, options);
  if (commands.length === 0) {
    diagnostics.push({
      severity: 'info',
      code: 'CONVEX_NO_DISPATCHER_COMMANDS',
      message: 'No entity-scoped commands; authenticated command dispatcher omitted.',
    });
    return { code: '', commandCount: 0 };
  }

  const registryLines = commands.map((c) => {
    const paramsLit = JSON.stringify(c.paramNames);
    return (
      `  ${JSON.stringify(`${c.entity}.${c.command}`)}: {\n` +
      `    ref: api.mutations.${c.mutationExport},\n` +
      `    params: ${paramsLit} as const,\n` +
      `  },`
    );
  });

  const forbiddenLit = JSON.stringify([...DISPATCHER_FORBIDDEN_BODY_KEYS]);

  const code =
    `/** IR-derived command registry for the authenticated HTTP dispatcher. */\n` +
    `const COMMAND_DISPATCH = {\n` +
    `${registryLines.join('\n')}\n` +
    `} as const;\n\n` +
    `const DISPATCHER_FORBIDDEN_BODY_KEYS = new Set(${forbiddenLit});\n\n` +
    `http.route({\n` +
    `  pathPrefix: "/api/manifest/",\n` +
    `  method: "POST",\n` +
    `  handler: httpAction(async (ctx, request) => {\n` +
    `    const identity = await ctx.auth.getUserIdentity();\n` +
    `    if (identity === null) {\n` +
    `      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });\n` +
    `    }\n` +
    `    const url = new URL(request.url);\n` +
    `    const match = url.pathname.match(/^\\/api\\/manifest\\/([^/]+)\\/commands\\/([^/]+)\\/?$/);\n` +
    `    if (!match) {\n` +
    `      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });\n` +
    `    }\n` +
    `    const entity = match[1]!;\n` +
    `    const command = match[2]!;\n` +
    `    const entry = (COMMAND_DISPATCH as Record<string, { ref: any; params: readonly string[] }>)[entity + "." + command];\n` +
    `    if (!entry) {\n` +
    `      return new Response(JSON.stringify({ error: "Unknown command " + entity + "." + command }), { status: 404, headers: { "Content-Type": "application/json" } });\n` +
    `    }\n` +
    `    let body: Record<string, unknown> = {};\n` +
    `    try {\n` +
    `      const parsed = await request.json();\n` +
    `      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {\n` +
    `        return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { "Content-Type": "application/json" } });\n` +
    `      }\n` +
    `      body = parsed as Record<string, unknown>;\n` +
    `    } catch {\n` +
    `      return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { "Content-Type": "application/json" } });\n` +
    `    }\n` +
    `    const args: Record<string, unknown> = {};\n` +
    `    for (const name of entry.params) {\n` +
    `      if (DISPATCHER_FORBIDDEN_BODY_KEYS.has(name)) continue;\n` +
    `      if (Object.prototype.hasOwnProperty.call(body, name)) args[name] = body[name];\n` +
    `    }\n` +
    `    try {\n` +
    `      const result = await ctx.runMutation(entry.ref, args as any);\n` +
    `      return new Response(JSON.stringify({ data: result }), { status: 200, headers: { "Content-Type": "application/json" } });\n` +
    `    } catch (err) {\n` +
    `      const message = err instanceof Error ? err.message : String(err);\n` +
    `      return new Response(JSON.stringify({ error: message }), { status: 400, headers: { "Content-Type": "application/json" } });\n` +
    `    }\n` +
    `  }),\n` +
    `});\n`;

  return { code, commandCount: commands.length };
}
