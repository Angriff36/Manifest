import type { IRCommand, IRExpression, IRReactionRule } from './ir.js';

export type ReactionCompletenessEmit = (
  severity: 'error' | 'warning' | 'info',
  message: string,
) => void;

const ENRICHED_PAYLOAD_FIELDS = new Set(['_subject', '_eventName', '_channel']);

export type CommandEmitter = { entity: string; command: string; paramNames: Set<string> };

function collectMemberChain(expr: IRExpression): string[] | null {
  const chain: string[] = [];
  let spine: IRExpression | undefined = expr;
  while (spine?.kind === 'member' && typeof spine.property === 'string') {
    chain.unshift(spine.property);
    spine = spine.object;
  }
  if (spine?.kind === 'identifier' && (spine.name === 'payload' || spine.name === 'self')) {
    return chain.length > 0 ? chain : null;
  }
  return null;
}

function walkExpressionChildren(node: IRExpression, visit: (child: unknown) => void): void {
  for (const key of Object.keys(node)) {
    if (key === 'kind' || key === 'property' || key === 'name' || key === 'operator') continue;
    visit((node as Record<string, unknown>)[key]);
  }
}

export function collectPayloadChains(node: unknown, out: string[][]): void {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) collectPayloadChains(n, out);
    return;
  }

  const expr = node as IRExpression;
  if (expr.kind === 'member') {
    const chain = collectMemberChain(expr);
    if (chain) {
      out.push(chain);
      return;
    }
    walkExpressionChildren(expr, child => collectPayloadChains(child, out));
    return;
  }

  walkExpressionChildren(expr, child => collectPayloadChains(child, out));
}

export function buildEmittersByEvent(commands: IRCommand[]): Map<string, CommandEmitter[]> {
  const emittersByEvent = new Map<string, CommandEmitter[]>();
  for (const cmd of commands) {
    for (const ev of cmd.emits) {
      const list = emittersByEvent.get(ev) ?? [];
      list.push({
        entity: cmd.entity ?? '',
        command: cmd.name,
        paramNames: new Set(cmd.parameters.map(p => p.name)),
      });
      emittersByEvent.set(ev, list);
    }
  }
  return emittersByEvent;
}

function checkResultPayloadReference(
  label: string,
  chain: string[],
  emitters: CommandEmitter[],
  entityProps: Map<string, Set<string>>,
  emit: ReactionCompletenessEmit,
): void {
  if (chain.length === 1) return;
  const field = chain[1];
  for (const em of emitters) {
    const props = entityProps.get(em.entity) ?? new Set<string>();
    if (em.command === 'create') {
      if (!props.has(field)) {
        emit(
          'error',
          `Reaction '${label}' references payload.result.${field} but '${field}' is not a property of ${em.entity} (create result is the new instance) — undefined at runtime.`,
        );
      }
      continue;
    }
    emit(
      'error',
      `Reaction '${label}' references payload.result.${field} via ${em.entity}.${em.command} — non-create commands set result to the last action value, not the instance; use payload._subject.id or an input param instead.`,
    );
  }
}

function checkInputPayloadReference(
  label: string,
  chain: string[],
  eventFields: Set<string>,
  emitters: CommandEmitter[],
  emit: ReactionCompletenessEmit,
): void {
  const chainStr = chain.join('.');
  const head = chain[0];
  if (eventFields.has(head)) return;

  for (const em of emitters) {
    if (em.paramNames.has(head)) continue;
    emit(
      'error',
      `Reaction '${label}' references payload.${chainStr} but '${head}' is not a parameter of emitter ${em.entity}.${em.command} — undefined at runtime (payload = {...input, result}).`,
    );
  }
}

export function checkReactionPayloadReferences(
  reaction: IRReactionRule,
  emitters: CommandEmitter[],
  declaredEventPayload: Map<string, Set<string>>,
  entityProps: Map<string, Set<string>>,
  emit: ReactionCompletenessEmit,
): void {
  const label = `${reaction.event} → ${reaction.targetEntity}.${reaction.targetCommand}`;
  const chains: string[][] = [];
  if (reaction.resolve) collectPayloadChains(reaction.resolve, chains);
  for (const p of reaction.params ?? []) collectPayloadChains(p.expression, chains);

  const eventFields = declaredEventPayload.get(reaction.event) ?? new Set<string>();
  const seen = new Set<string>();

  for (const chain of chains) {
    const chainStr = chain.join('.');
    if (seen.has(chainStr)) continue;
    seen.add(chainStr);

    const head = chain[0];
    if (ENRICHED_PAYLOAD_FIELDS.has(head)) continue;

    if (head === 'result') {
      checkResultPayloadReference(label, chain, emitters, entityProps, emit);
      continue;
    }

    checkInputPayloadReference(label, chain, eventFields, emitters, emit);
  }
}
