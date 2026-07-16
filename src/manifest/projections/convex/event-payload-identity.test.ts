/**
 * Regression: logical Manifest `id` in event payloads must lower to the Convex
 * document identity (`docId` / `_id`), never `${selfVar}.id` (schema has no id).
 *
 * Preserves app-facing field names such as `clientId`.
 */

import { describe, it, expect } from 'vitest';
import type { IR, IRCommand, IREntity, IRProperty, IRStore } from '../../ir';
import { ConvexProjection } from './generator.js';
import {
  convexIdentityExpr,
  isLogicalIdentityExpression,
  renderEmitPayloadFields,
  synthesizePayloadFromEventSchema,
} from './event-payload.js';

function emptyIR(): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'h',
      compilerVersion: 'test',
      schemaVersion: '1.0',
      compiledAt: '2025-01-01T00:00:00.000Z',
    },
    modules: [],
    values: [],
    entities: [],
    enums: [],
    stores: [],
    events: [],
    commands: [],
    policies: [],
  };
}

function prop(name: string, typeName: string, modifiers: IRProperty['modifiers'] = []): IRProperty {
  return { name, type: { name: typeName, nullable: false }, modifiers };
}

function entity(name: string, props: IRProperty[]): IREntity {
  return {
    name,
    properties: props,
    computedProperties: [],
    relationships: [],
    commands: [],
    constraints: [],
    policies: [],
  };
}

describe('convex event-payload identity mapping', () => {
  it('maps Client.archive clientId from self.id to docId (not __after.id)', () => {
    const ir = emptyIR();
    // IR still declares `id`; Convex schema omits it in favor of `_id`.
    ir.entities = [
      entity('Client', [
        prop('id', 'string', ['required']),
        prop('tenantId', 'string', ['required']),
        prop('status', 'string', ['required']),
      ]),
    ];
    ir.stores = [{ entity: 'Client', target: 'durable', config: {} } satisfies IRStore];
    const archive: IRCommand = {
      name: 'archive',
      entity: 'Client',
      parameters: [{ name: 'reason', type: { name: 'string', nullable: false }, required: true }],
      guards: [],
      actions: [
        {
          kind: 'mutate',
          target: 'status',
          expression: { kind: 'literal', value: { kind: 'string', value: 'archived' } },
        },
      ],
      emits: ['ClientArchived'],
      emitPayloads: [
        {
          eventName: 'ClientArchived',
          fields: [
            {
              name: 'clientId',
              expression: {
                kind: 'member',
                object: { kind: 'identifier', name: 'self' },
                property: 'id',
              },
            },
            {
              name: 'tenantId',
              expression: {
                kind: 'member',
                object: { kind: 'identifier', name: 'self' },
                property: 'tenantId',
              },
            },
            {
              name: 'reason',
              expression: { kind: 'identifier', name: 'reason' },
            },
          ],
        },
      ],
    };
    ir.commands = [archive];

    const code = new ConvexProjection().generate(ir, {
      surface: 'convex.mutations',
      options: { authContextImport: './lib/authContext', policyMode: 'skip' },
    }).artifacts[0]!.code;

    expect(code).toContain('Client_archive');
    expect(code).toContain('clientId: docId');
    expect(code).toMatch(/payload:\s*\{[^}]*clientId:\s*docId/);
    expect(code).not.toContain('__after.id');
    expect(code).not.toContain('clientId: __after.id');
  });

  it('shared helpers: logical identity never renders as __after.id', () => {
    const selfId = {
      kind: 'member' as const,
      object: { kind: 'identifier' as const, name: 'self' },
      property: 'id',
    };
    expect(isLogicalIdentityExpression(selfId)).toBe(true);
    expect(convexIdentityExpr({ selfVar: '__after' }, 'docId')).toBe('docId');
    expect(convexIdentityExpr({ selfVar: '__after', idExpr: '_id' }, 'docId')).toBe('_id');

    const g7 = renderEmitPayloadFields(
      {
        name: 'archive',
        entity: 'Client',
        parameters: [],
        guards: [],
        actions: [],
        emits: ['ClientArchived'],
        emitPayloads: [
          {
            eventName: 'ClientArchived',
            fields: [{ name: 'clientId', expression: selfId }],
          },
        ],
      },
      'ClientArchived',
      { selfVar: '__after' }, // deliberately omit idExpr — renderer must still fix it
      'docId',
    );
    expect(g7.fields).toEqual([{ name: 'clientId', code: 'docId' }]);

    const syn = synthesizePayloadFromEventSchema(
      {
        ...emptyIR(),
        events: [
          {
            name: 'ClientArchived',
            channel: 'client.archived',
            payload: [
              { name: 'clientId', type: { name: 'string', nullable: false }, required: true },
              { name: 'id', type: { name: 'string', nullable: false }, required: true },
            ],
          },
        ],
      },
      entity('Client', [prop('id', 'string'), prop('tenantId', 'string')]),
      'ClientArchived',
      { selfVar: '__after', idExpr: 'docId' },
      'docId',
    );
    expect(syn.fields.find((f) => f.name === 'clientId')?.code).toBe('docId');
    expect(syn.fields.find((f) => f.name === 'id')?.code).toBe('docId');
    expect(syn.fields.every((f) => f.code !== '__after.id')).toBe(true);
  });
});
