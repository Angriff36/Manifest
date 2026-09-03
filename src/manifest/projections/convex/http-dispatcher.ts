/**
 * Canonical authenticated command dispatcher for `convex.http`.
 *
 * Emits `POST /api/manifest/{entity}/commands/{command}` via `pathPrefix`.
 * Identity comes from Convex `ctx.auth.getUserIdentity()` (Bearer JWT); the
 * governed command mutation derives RuntimeContext via `getAuthContext(ctx)`.
 * Request bodies never supply tenant/user/`__auth` identity keys; declared
 * command params (which may include a business `role`) are forwarded as-is.
 *
 * Also emits a GET discovery surface on the same prefix so remote callers can
 * learn the contract without a repo checkout:
 *   GET /api/manifest/commands                       → full command catalog
 *   GET /api/manifest/{entity}/commands/{command}    → one command's params
 * Both require the same authenticated identity as POST.
 */

import { selectInitializationCommand } from '../../initialization-plan.js';
import type { IR, IRCommand, IRType } from '../../ir.js';
import type { ProjectionDiagnostic } from '../interface.js';
import { commandCreationExportName } from './creation-entry.js';
import type { NormalizedConvexOptions } from './options.js';

/** Body keys that must never become mutation args (caller cannot override identity). */
export const DISPATCHER_FORBIDDEN_BODY_KEYS = [
  '__auth',
  'user',
  'tenantId',
  'orgId',
  'userId',
  'actorId',
  'identity',
] as const;

export interface DispatcherParamInfo {
  name: string;
  /** IR type rendered as text, e.g. `string`, `datetime`, `list<string>`. */
  type: string;
  required: boolean;
}

export interface DispatcherCommandEntry {
  entity: string;
  command: string;
  mutationExport: string;
  /** Client-owned param names only (no trustedSource; optional idempotencyKey). */
  paramNames: string[];
  /** Wire metadata for the GET discovery routes (same params as `paramNames`). */
  paramInfo: DispatcherParamInfo[];
}

/**
 * Render an IR type as text for discovery responses. Nullability is omitted
 * on purpose: generated mutation validators (`paramValidator`) do not accept
 * `null` for nullable params, so advertising `| null` would misstate the wire.
 */
function formatIRType(type: IRType): string {
  const inner = type.generic ? `<${formatIRType(type.generic)}>` : '';
  return `${type.name}${inner}`;
}

/** Entity.command keys that allocate through the Convex createVia* entry. */
function createViaCommandKeys(ir: IR): Set<string> {
  const keys = new Set<string>();
  for (const entity of ir.entities ?? []) {
    const selected = selectInitializationCommand(ir, entity);
    if (selected && selected.name !== 'create') {
      keys.add(`${entity.name}.${selected.name}`);
    }
  }
  return keys;
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
  const createViaKeys = createViaCommandKeys(ir);
  const entityByName = new Map((ir.entities ?? []).map((e) => [e.name, e]));
  const out: DispatcherCommandEntry[] = [];

  for (const cmd of ir.commands ?? []) {
    const entity = cmd.entity;
    if (!entity) continue;

    const allocates = allocatesDocument(entity, cmd, createViaKeys);
    const versionProperty = entityByName.get(entity)?.versionProperty;
    const paramInfo = clientOwnedParams(cmd, options, forbidden, allocates, versionProperty);
    out.push({
      entity,
      command: cmd.name,
      mutationExport: dispatcherMutationExport(entity, cmd, createViaKeys),
      paramNames: paramInfo.map((p) => p.name),
      paramInfo,
    });
  }

  return out.sort((a, b) => {
    const ak = `${a.entity}.${a.command}`;
    const bk = `${b.entity}.${b.command}`;
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });
}

function allocatesDocument(entity: string, cmd: IRCommand, createViaKeys: Set<string>): boolean {
  return (
    cmd.name === 'create' ||
    cmd.name.startsWith('createVia') ||
    createViaKeys.has(`${entity}.${cmd.name}`)
  );
}

function dispatcherMutationExport(
  entity: string,
  cmd: IRCommand,
  createViaKeys: Set<string>,
): string {
  if (createViaKeys.has(`${entity}.${cmd.name}`)) {
    return commandCreationExportName(entity, cmd.name);
  }
  return `${entity}_${cmd.name}`;
}

function clientOwnedParams(
  cmd: IRCommand,
  options: NormalizedConvexOptions,
  forbidden: Set<string>,
  allocates: boolean,
  versionProperty: string | undefined,
): DispatcherParamInfo[] {
  const params: DispatcherParamInfo[] = [];
  for (const p of cmd.parameters ?? []) {
    if (p.trustedSource) continue;
    if (forbidden.has(p.name)) continue;
    params.push({ name: p.name, type: formatIRType(p.type), required: p.required });
  }
  const has = (name: string) => params.some((p) => p.name === name);
  // Instance commands target an existing Convex document — forward docId plus
  // the entity's OCC expected-version arg (named by `versionProperty`; the
  // generated mutation accepts no such arg for unversioned entities).
  // Create / createVia / selected initialization commands allocate.
  if (!allocates) {
    if (!has('docId')) params.unshift({ name: 'docId', type: 'string', required: true });
    if (versionProperty && !has(versionProperty)) {
      params.push({ name: versionProperty, type: 'number', required: false });
    }
  }
  if (options.enableCommandIdempotency && !has('idempotencyKey')) {
    params.push({ name: 'idempotencyKey', type: 'string', required: false });
  }
  return params;
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
    const paramMetaLit = JSON.stringify(c.paramInfo);
    return (
      `  ${JSON.stringify(`${c.entity}.${c.command}`)}: {\n` +
      `    ref: api.mutations.${c.mutationExport},\n` +
      `    params: ${paramsLit} as const,\n` +
      `    paramMeta: ${paramMetaLit} as const,\n` +
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
    `});\n\n` +
    `/** Wire-format notes returned by the GET discovery routes. */\n` +
    `const DISPATCHER_WIRE_NOTES = {\n` +
    `  execute: "POST /api/manifest/{entity}/commands/{command} with a JSON object body of the listed params",\n` +
    `  auth: "Authorization: Bearer <JWT accepted by Convex auth>; identity/tenant fields are server-derived and ignored in the body; declared command params (including role) are accepted",\n` +
    `  datetime: "datetime/date params are epoch milliseconds numbers",\n` +
    `  lists: "list params are JSON arrays",\n` +
    `  idempotencyKey: ${JSON.stringify(
      options.enableCommandIdempotency
        ? 'optional string; retries with the same key do not repeat the command'
        : 'NOT AVAILABLE: command idempotency is disabled in this deployment — retries may repeat the command',
    )},\n` +
    `  concurrency: "instance commands take docId (Convex document id) plus, when listed, the entity's optional expected-version number for optimistic concurrency",\n` +
    `} as const;\n\n` +
    `http.route({\n` +
    `  pathPrefix: "/api/manifest/",\n` +
    `  method: "GET",\n` +
    `  handler: httpAction(async (ctx, request) => {\n` +
    `    const identity = await ctx.auth.getUserIdentity();\n` +
    `    if (identity === null) {\n` +
    `      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });\n` +
    `    }\n` +
    `    const registry = COMMAND_DISPATCH as Record<string, { params: readonly string[]; paramMeta: readonly { name: string; type: string; required: boolean }[] }>;\n` +
    `    const url = new URL(request.url);\n` +
    `    if (/^\\/api\\/manifest\\/commands\\/?$/.test(url.pathname)) {\n` +
    `      const commands = Object.keys(registry).map((key) => {\n` +
    `        const dot = key.indexOf(".");\n` +
    `        return { entity: key.slice(0, dot), command: key.slice(dot + 1), params: registry[key]!.paramMeta };\n` +
    `      });\n` +
    `      return new Response(JSON.stringify({ commands, wire: DISPATCHER_WIRE_NOTES }), { status: 200, headers: { "Content-Type": "application/json" } });\n` +
    `    }\n` +
    `    const match = url.pathname.match(/^\\/api\\/manifest\\/([^/]+)\\/commands\\/([^/]+)\\/?$/);\n` +
    `    if (!match) {\n` +
    `      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });\n` +
    `    }\n` +
    `    const key = match[1]! + "." + match[2]!;\n` +
    `    const entry = registry[key];\n` +
    `    if (!entry) {\n` +
    `      return new Response(JSON.stringify({ error: "Unknown command " + key }), { status: 404, headers: { "Content-Type": "application/json" } });\n` +
    `    }\n` +
    `    return new Response(JSON.stringify({ entity: match[1], command: match[2], params: entry.paramMeta, execute: "POST /api/manifest/" + match[1] + "/commands/" + match[2], wire: DISPATCHER_WIRE_NOTES }), { status: 200, headers: { "Content-Type": "application/json" } });\n` +
    `  }),\n` +
    `});\n`;

  return { code, commandCount: commands.length };
}
