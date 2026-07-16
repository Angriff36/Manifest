/**
 * Convex event-row payload rendering (G7 emit fields + schema synthesis).
 *
 * Reference runtime (`runtime-engine.ts`) builds payloads as `{ ...input, result }`
 * then overlays G7 `emit Event { field: expr }` fields. Capsule-scale Manifest
 * sources often use bare `emit EventName` while still declaring event schema
 * fields — those must not persist as `payload: {}`.
 */

import type { IR, IRCommand, IREntity, IREventField } from '../../ir.js';
import type { ProjectionDiagnostic } from '../interface.js';
import { renderExpression, type RenderScope } from './expression.js';

export interface RenderedPayloadField {
  name: string;
  /** Rendered TS expression, already scoped to the post-action instance. */
  code: string;
}

/**
 * Candidate identity field names for an entity (e.g. ActionMilestone →
 * ActionMilestoneId, actionMilestoneId, milestoneId).
 */
export function entityIdFieldAliases(entityName: string): Set<string> {
  const aliases = new Set<string>([
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
  const idExpr = scope.idExpr ?? idVar;
  const fields: RenderedPayloadField[] = [];
  const diagnostics: ProjectionDiagnostic[] = [];

  for (const f of schema) {
    if (idAliases.has(f.name)) {
      fields.push({ name: f.name, code: idExpr });
      continue;
    }
    if (propNames.has(f.name)) {
      fields.push({ name: f.name, code: `${scope.selfVar}.${f.name}` });
      continue;
    }
    const typeName = f.type?.name?.toLowerCase() ?? '';
    if (
      (typeName === 'datetime' || typeName === 'date') &&
      /(At|Date|Time)$/.test(f.name)
    ) {
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
 */
export function renderEmitPayloadFields(
  cmd: IRCommand,
  eventName: string,
  scope: RenderScope,
): { fields: RenderedPayloadField[]; diagnostics: ProjectionDiagnostic[] } {
  const spec = cmd.emitPayloads?.find((ep) => ep.eventName === eventName);
  if (!spec) return { fields: [], diagnostics: [] };
  const fields: RenderedPayloadField[] = [];
  const diagnostics: ProjectionDiagnostic[] = [];
  for (const f of spec.fields) {
    const { code, unresolved } = renderExpression(f.expression, scope);
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
): { fields: RenderedPayloadField[]; diagnostics: ProjectionDiagnostic[] } {
  const seen = new Set<string>();
  const fields: RenderedPayloadField[] = [];
  const diagnostics: ProjectionDiagnostic[] = [];
  for (const ev of cmd.emits ?? []) {
    const r = renderEmitPayloadFields(cmd, ev, scope);
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
): { fields: RenderedPayloadField[]; diagnostics: ProjectionDiagnostic[]; usedSchema: boolean } {
  const g7 = renderEmitPayloadFields(cmd, eventName, scope);
  if (g7.fields.length > 0) {
    return { fields: g7.fields, diagnostics: g7.diagnostics, usedSchema: false };
  }
  const synthesized = synthesizePayloadFromEventSchema(ir, entity, eventName, scope, idVar);
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
): { lines: string[]; diagnostics: ProjectionDiagnostic[] } {
  const lines: string[] = [];
  const diagnostics: ProjectionDiagnostic[] = [];
  for (const ev of cmd.emits ?? []) {
    const { fields, diagnostics: d } = resolveEventPayloadFields(
      ir,
      entity,
      cmd,
      ev,
      scope,
      idVar,
    );
    diagnostics.push(...d);
    const payloadLit =
      fields.length > 0 ? payloadObjectLiteral(fields) : bareEmitFallbackLiteral(scope, idVar);
    lines.push(
      `    await ctx.db.insert("${eventsTable}", { type: ${JSON.stringify(ev)}, entity: ${JSON.stringify(cmd.entity)}, entityId: ${idVar}, payload: ${payloadLit}, createdAt: Date.now() });`,
    );
  }
  return { lines, diagnostics };
}

/**
 * True when any emit needs post-action instance scope (`__after`) for schema
 * synthesis or G7 fields on a non-create command.
 */
export function commandNeedsAfterSnapshot(
  ir: IR,
  entity: IREntity,
  cmd: IRCommand,
): boolean {
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
