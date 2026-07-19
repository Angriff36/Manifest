/**
 * Reaction-payload reserved-key collision handling for Convex mutations.
 *
 * Mirrors runtime-engine emit construction: `{ ...input, result }` then G7
 * fields overwrite. Duplicate object-literal keys (TS1117) are forbidden;
 * both meanings are preserved without silently renaming domain fields.
 */

import type { ProjectionDiagnostic } from '../interface.js';

/** Keys the Convex reaction payload reserves (runtime enrichment contract). */
export const RESERVED_REACTION_PAYLOAD_KEYS = [
  'result',
  '_subject',
  '_eventName',
  '_channel',
] as const;

export type ReservedReactionPayloadKey = (typeof RESERVED_REACTION_PAYLOAD_KEYS)[number];

export interface ReactionPayloadField {
  name: string;
  code: string;
}

export interface ReactionPayloadCollisionPlan {
  /** G7 fields safe to emit as object-literal entries on the reaction payload. */
  reactionFields: ReactionPayloadField[];
  /**
   * When false, omit the reserved command-result envelope (`result: { …entity }`).
   * G7's business `result` field wins (same overwrite order as runtime-engine).
   * Entity identity remains on `_subject`.
   */
  includeEnvelopeResult: boolean;
  diagnostics: ProjectionDiagnostic[];
}

/**
 * Plan reaction-payload field emission when G7 emit fields may collide with
 * reserved keys. Domain field names are never silently renamed.
 */
export class ReactionPayloadCollisionPlanner {
  plan(
    fields: ReactionPayloadField[],
    context: { entity: string; command: string },
  ): ReactionPayloadCollisionPlan {
    const diagnostics: ProjectionDiagnostic[] = [];
    const reactionFields: ReactionPayloadField[] = [];
    let includeEnvelopeResult = true;

    for (const field of fields) {
      if (field.name === 'result') {
        includeEnvelopeResult = false;
        reactionFields.push(field);
        diagnostics.push({
          severity: 'warning',
          code: 'CONVEX_PAYLOAD_FIELD_COLLISION',
          entity: context.entity,
          message:
            `emit payload field '${context.entity}.${context.command} → result' collides with ` +
            `reserved reaction payload key 'result'; business field kept, command-result ` +
            `envelope omitted (use payload._subject for entity identity).`,
        });
        continue;
      }

      if (field.name === '_subject' || field.name === '_eventName' || field.name === '_channel') {
        diagnostics.push({
          severity: 'warning',
          code: 'CONVEX_PAYLOAD_FIELD_COLLISION',
          entity: context.entity,
          message:
            `emit payload field '${context.entity}.${context.command} → ${field.name}' collides with ` +
            `reserved reaction payload key '${field.name}'; omitted from reaction payload ` +
            `(event-row payload still includes it — domain name not renamed).`,
        });
        continue;
      }

      reactionFields.push(field);
    }

    return { reactionFields, includeEnvelopeResult, diagnostics };
  }
}
