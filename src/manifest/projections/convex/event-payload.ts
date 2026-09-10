/**
 * Convex event-row payload rendering (G7 emit fields + schema synthesis).
 *
 * Reference runtime (`runtime-engine.ts`) builds payloads as `{ ...input, result }`
 * then overlays G7 `emit Event { field: expr }` fields. Capsule-scale Manifest
 * sources often use bare `emit EventName` while still declaring event schema
 * fields — those must not persist as `payload: {}`.
 */

import type { IR, IRCommand, IREntity, IREventField, IRExpression } from '../../ir.js';
import type { ProjectionDiagnostic } from '../interface.js';
import { withComputeLocals } from './compute-bindings.js';
import { renderExpression, type RenderScope } from './expression.js';

export {
  computeBindingLines,
  renderCommandComputeBindings,
  withComputeLocals,
} from './compute-bindings.js';
export type { ComputeBinding } from './compute-bindings.js';

/** Event envelope delivered inside the originating Convex mutation. */
export interface ConvexCommandEvent {
  readonly eventId: string;
  readonly type: string;
  readonly entity: string;
  readonly entityId: string;
  readonly command: string;
  readonly emitIndex: number;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: number;
}

function commandBindings(cmd: IRCommand): string[] {
  return [
    ...cmd.parameters.map((param) => param.name),
    ...cmd.actions
      .filter((action) => action.kind === 'compute')
      .map((action) => action.target ?? ''),
  ];
}

function unboundName(base: string, bindings: readonly string[]): string {
  let name = base;
  while (bindings.includes(name)) name += '_';
  return name;
}

/** Keep the imported function callable even when an author uses its stem. */
export function transactionalEventHandlerName(ir: IR): string {
  return unboundName('__handleManifestEvent', ir.commands.flatMap(commandBindings));
}

export interface RenderedPayloadField {
  name: string;
  /**
   * Rendered TS expression. Current/new fields use the post-action instance;
   * previous-state values use command `compute` locals (pre-update snapshot).
   */
  code: string;
}

/**
 * Candidate identity field names for an entity (e.g. ActionMilestone →
 * ActionMilestoneId, actionMilestoneId, milestoneId).
 *
 * Includes bare `id` — the IR may declare an `id` property, but Convex schema
 * omits it (document identity is `_id`). Event fields named `id` must use the
 * Convex identity expression, never `${selfVar}.id`.
 */
export function entityIdFieldAliases(entityName: string): Set<string> {
  const aliases = new Set<string>([
    'id',
    `${entityName}Id`,
    `${entityName.charAt(0).toLowerCase()}${entityName.slice(1)}Id`,
  ]);
  const parts = entityName.match(/[A-Z][a-z0-9]*/g) ?? [];
  if (parts.length > 0) {
    const last = parts[parts.length - 1]!;
    aliases.add(`${last.charAt(0).toLowerCase()}${last.slice(1)}Id`);
  }
  return aliases;
}

/**
 * Shared Convex identity mapping for logical Manifest `id`.
 * Prefer `scope.idExpr` (`docId` / `_id`); fall back to the mutation id var.
 */
export function convexIdentityExpr(scope: RenderScope, idVar: string): string {
  return scope.idExpr ?? idVar;
}

/** True when an emit expression is logical entity identity (`self.id` / `this.id` / bare `id`). */
export function isLogicalIdentityExpression(expr: IRExpression): boolean {
  if (expr.kind === 'identifier' && expr.name === 'id') return true;
  return (
    expr.kind === 'member' &&
    expr.object.kind === 'identifier' &&
    (expr.object.name === 'self' || expr.object.name === 'this') &&
    expr.property === 'id'
  );
}

/**
 * Scope used for payload field rendering — always carries a resolvable idExpr.
 * Pass `computeLocals` so bare identifiers from IR `compute` bindings resolve
 * to pre-update locals (e.g. `previousStatus`) instead of `${selfVar}.…`.
 */
export function payloadRenderScope(
  scope: RenderScope,
  idVar: string,
  computeLocals: readonly string[] = [],
): RenderScope {
  return withComputeLocals({ ...scope, idExpr: convexIdentityExpr(scope, idVar) }, computeLocals);
}

function eventSchemaFields(ir: IR, eventName: string): IREventField[] {
  const event = ir.events.find((e) => e.name === eventName);
  if (!event || !Array.isArray(event.payload)) return [];
  return event.payload;
}

/**
 * When a command uses bare `emit Event` (no G7 field expressions), map declared
 * event schema fields onto the post-action instance where possible.
 */
export function synthesizePayloadFromEventSchema(
  ir: IR,
  entity: IREntity,
  eventName: string,
  scope: RenderScope,
  idVar: string,
): { fields: RenderedPayloadField[]; diagnostics: ProjectionDiagnostic[] } {
  const schema = eventSchemaFields(ir, eventName);
  if (schema.length === 0) return { fields: [], diagnostics: [] };

  const idAliases = entityIdFieldAliases(entity.name);
  const propNames = new Set(entity.properties.map((p) => p.name));
  const idExpr = convexIdentityExpr(scope, idVar);
  const fields: RenderedPayloadField[] = [];
  const diagnostics: ProjectionDiagnostic[] = [];

  for (const f of schema) {
    // Logical identity (bare `id` or EntityId aliases) → Convex document id.
    // Never `${selfVar}.id` — schema drops IR `id`; that expression is undefined.
    if (idAliases.has(f.name)) {
      fields.push({ name: f.name, code: idExpr });
      continue;
    }
    if (propNames.has(f.name)) {
      fields.push({ name: f.name, code: `${scope.selfVar}.${f.name}` });
      continue;
    }
    const typeName = f.type?.name?.toLowerCase() ?? '';
    if ((typeName === 'datetime' || typeName === 'date') && /(At|Date|Time)$/.test(f.name)) {
      fields.push({ name: f.name, code: 'Date.now()' });
      continue;
    }
    diagnostics.push({
      severity: 'warning',
      code: 'CONVEX_UNMAPPED_EVENT_FIELD',
      message: `event '${eventName}' field '${f.name}' has no entity property or id alias; omitted from Convex payload.`,
    });
  }
  return { fields, diagnostics };
}

/**
 * Render G7 `emit Event { field: expr }` payload fields for ONE event.
 * Logical `self.id` / bare `id` always lower through {@link convexIdentityExpr}
 * so app field names (`clientId`, `eventId`, …) keep their names while the
 * value is the real Convex document id (`docId` / `_id`).
 */
export function renderEmitPayloadFields(
  cmd: IRCommand,
  eventName: string,
  scope: RenderScope,
  idVar = 'docId',
  computeLocals: readonly string[] = [],
): { fields: RenderedPayloadField[]; diagnostics: ProjectionDiagnostic[] } {
  const spec = cmd.emitPayloads?.find((ep) => ep.eventName === eventName);
  if (!spec) return { fields: [], diagnostics: [] };
  const payloadScope = payloadRenderScope(scope, idVar, computeLocals);
  const identity = convexIdentityExpr(payloadScope, idVar);
  const fields: RenderedPayloadField[] = [];
  const diagnostics: ProjectionDiagnostic[] = [];
  for (const f of spec.fields) {
    if (isLogicalIdentityExpression(f.expression)) {
      fields.push({ name: f.name, code: identity });
      continue;
    }
    const { code, unresolved } = renderExpression(f.expression, payloadScope);
    if (unresolved.length) {
      diagnostics.push({
        severity: 'warning',
        code: 'CONVEX_UNRESOLVED_EMIT_PAYLOAD',
        message: `emit payload field '${cmd.entity}.${eventName}.${f.name}' unresolved (${unresolved.join('; ')}); omitted.`,
      });
      continue;
    }
    fields.push({ name: f.name, code });
  }
  return { fields, diagnostics };
}

/**
 * Union of G7 payload fields across ALL of a command's emits (deduped by name).
 */
export function unionEmitPayloadFields(
  cmd: IRCommand,
  scope: RenderScope,
  idVar = 'docId',
  computeLocals: readonly string[] = [],
): { fields: RenderedPayloadField[]; diagnostics: ProjectionDiagnostic[] } {
  const seen = new Set<string>();
  const fields: RenderedPayloadField[] = [];
  const diagnostics: ProjectionDiagnostic[] = [];
  for (const ev of cmd.emits ?? []) {
    const r = renderEmitPayloadFields(cmd, ev, scope, idVar, computeLocals);
    diagnostics.push(...r.diagnostics);
    for (const f of r.fields) {
      if (seen.has(f.name)) continue;
      seen.add(f.name);
      fields.push(f);
    }
  }
  return { fields, diagnostics };
}

export function payloadObjectLiteral(fields: RenderedPayloadField[]): string {
  return fields.length ? `{ ${fields.map((f) => `${f.name}: ${f.code}`).join(', ')} }` : '{}';
}

/** Runtime-shaped fallback when neither G7 nor schema fields are available. */
function bareEmitFallbackLiteral(scope: RenderScope, idVar: string): string {
  const self = scope.selfVar;
  if (scope.idExpr === '_id' || idVar === '_id') {
    return `{ result: { _id, id: _id, ...${self} } }`;
  }
  return `{ result: { id: ${idVar}, ...${self} } }`;
}

/**
 * Resolve fields for one event: G7 first, then schema synthesis, else empty
 * (caller may use bare fallback literal).
 */
export function resolveEventPayloadFields(
  ir: IR,
  entity: IREntity,
  cmd: IRCommand,
  eventName: string,
  scope: RenderScope,
  idVar: string,
  computeLocals: readonly string[] = [],
): { fields: RenderedPayloadField[]; diagnostics: ProjectionDiagnostic[]; usedSchema: boolean } {
  const g7 = renderEmitPayloadFields(cmd, eventName, scope, idVar, computeLocals);
  if (g7.fields.length > 0) {
    return { fields: g7.fields, diagnostics: g7.diagnostics, usedSchema: false };
  }
  const synthesized = synthesizePayloadFromEventSchema(
    ir,
    entity,
    eventName,
    payloadRenderScope(scope, idVar, computeLocals),
    idVar,
  );
  return {
    fields: synthesized.fields,
    diagnostics: [...g7.diagnostics, ...synthesized.diagnostics],
    usedSchema: synthesized.fields.length > 0,
  };
}

/** Render the event-row inserts for a command's emits. */
export function renderEvents(
  eventsTable: string,
  ir: IR,
  entity: IREntity,
  cmd: IRCommand,
  idVar: string,
  scope: RenderScope,
  computeLocals: readonly string[] = [],
  handlerName?: string,
): { lines: string[]; afterReactionLines: string[]; diagnostics: ProjectionDiagnostic[] } {
  const lines: string[] = [];
  const afterReactionLines: string[] = [];
  const diagnostics: ProjectionDiagnostic[] = [];
  for (const [emitIndex, ev] of (cmd.emits ?? []).entries()) {
    const { fields, diagnostics: d } = resolveEventPayloadFields(
      ir,
      entity,
      cmd,
      ev,
      scope,
      idVar,
      computeLocals,
    );
    diagnostics.push(...d);
    const payloadLit =
      fields.length > 0 ? payloadObjectLiteral(fields) : bareEmitFallbackLiteral(scope, idVar);
    const eventLiteral = `{ type: ${JSON.stringify(ev)}, entity: ${JSON.stringify(cmd.entity)}, entityId: ${idVar}, payload: ${payloadLit}, createdAt: Date.now() }`;
    if (handlerName) {
      const bindings = commandBindings(cmd);
      const eventVar = unboundName(`__manifestEvent${emitIndex}`, bindings);
      const eventIdVar = unboundName(`__manifestEventId${emitIndex}`, bindings);
      lines.push(
        `    const ${eventVar} = ${eventLiteral};`,
        `    const ${eventIdVar} = await ctx.db.insert("${eventsTable}", ${eventVar});`,
      );
      afterReactionLines.push(
        `    await ${handlerName}(ctx, { ...${eventVar}, eventId: ${eventIdVar}, command: ${JSON.stringify(cmd.name)}, emitIndex: ${emitIndex} });`,
      );
    } else {
      lines.push(`    await ctx.db.insert("${eventsTable}", ${eventLiteral});`);
    }
  }
  return { lines, afterReactionLines, diagnostics };
}

/**
 * True when any emit needs post-action instance scope (`__after`) for schema
 * synthesis or G7 fields on a non-create command.
 */
export function commandNeedsAfterSnapshot(ir: IR, entity: IREntity, cmd: IRCommand): boolean {
  if (cmd.emitPayloads && cmd.emitPayloads.length > 0) {
    return (cmd.emitPayloads ?? []).some((ep) => ep.fields.length > 0);
  }
  for (const ev of cmd.emits ?? []) {
    const schema = eventSchemaFields(ir, ev);
    if (schema.length === 0) continue;
    const idAliases = entityIdFieldAliases(entity.name);
    const propNames = new Set(entity.properties.map((p) => p.name));
    if (schema.some((f) => idAliases.has(f.name) || propNames.has(f.name))) {
      return true;
    }
  }
  // Bare emit with no schema still uses result: { ...doc } — updates need merge.
  return (cmd.emits?.length ?? 0) > 0;
}
