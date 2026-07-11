/**
 * Reaction wiring checks — silent no-op prevention for event reactions.
 */

import type { IRCommand, IREntity, IREvent, IRReactionRule } from './ir.js';
import {
  buildEmittersByEvent,
  checkReactionPayloadReferences,
  type ReactionCompletenessEmit,
} from './reaction-completeness-checks.js';

export type { ReactionCompletenessEmit } from './reaction-completeness-checks.js';

function entityPropertyNames(entity: IREntity): Set<string> {
  const names = new Set(entity.properties.map((p) => p.name));
  for (const c of entity.computedProperties) names.add(c.name);
  names.add('id');
  return names;
}

function eventPayloadFieldNames(payload: IREvent['payload']): Set<string> {
  const names = new Set<string>();
  if (!Array.isArray(payload)) return names;
  for (const f of payload) names.add(f.name);
  return names;
}

export function checkReactionCompleteness(
  entities: IREntity[],
  commands: IRCommand[],
  reactions: IRReactionRule[],
  emit: ReactionCompletenessEmit,
  events: IREvent[] = [],
): void {
  const entityProps = new Map(entities.map((e) => [e.name, entityPropertyNames(e)]));
  const declaredEventPayload = new Map(
    events.map((ev) => [ev.name, eventPayloadFieldNames(ev.payload)]),
  );
  const emittersByEvent = buildEmittersByEvent(commands);

  for (const reaction of reactions) {
    const label = `${reaction.event} → ${reaction.targetEntity}.${reaction.targetCommand}`;
    const emitters = emittersByEvent.get(reaction.event) ?? [];

    if (emitters.length === 0) {
      emit(
        'error',
        `Reaction '${label}' listens for event '${reaction.event}' but no command emits that event — the reaction can never fire.`,
      );
      continue;
    }

    checkReactionPayloadReferences(reaction, emitters, declaredEventPayload, entityProps, emit);
  }
}

export { collectPayloadChains } from './reaction-completeness-checks.js';
