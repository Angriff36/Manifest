import { describe, expect, it } from 'vitest';
import type { IR, IRCommand, IREntity, IRExpression, IRProperty } from '../../ir';
import { ConvexProjection } from './generator.js';

const literal = (value: string): IRExpression => ({
  kind: 'literal',
  value: { kind: 'string', value },
});

function eventGuestIR(): IR {
  const properties: IRProperty[] = [
    { name: 'tenantId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
    { name: 'eventId', type: { name: 'uuid', nullable: false }, modifiers: ['required'] },
    {
      name: 'name',
      type: { name: 'string', nullable: false },
      modifiers: ['required'],
      defaultValue: { kind: 'string', value: '' },
    },
    {
      name: 'rsvpStatus',
      type: { name: 'string', nullable: false },
      modifiers: ['required'],
      defaultValue: { kind: 'string', value: 'pending' },
    },
  ];
  const entity: IREntity = {
    name: 'EventGuest',
    properties,
    computedProperties: [],
    relationships: [],
    commands: ['assignTable', 'invite', 'stayPending'],
    constraints: [],
    policies: [],
    versionProperty: 'version',
    transitions: [{ property: 'rsvpStatus', from: 'pending', to: ['confirmed'] }],
  };
  const invite: IRCommand = {
    entity: 'EventGuest',
    name: 'invite',
    parameters: [
      { name: 'eventId', type: { name: 'uuid', nullable: false }, required: true },
      { name: 'name', type: { name: 'string', nullable: false }, required: true },
    ],
    guards: [],
    actions: [
      { kind: 'mutate', target: 'eventId', expression: { kind: 'identifier', name: 'eventId' } },
      { kind: 'mutate', target: 'name', expression: { kind: 'identifier', name: 'name' } },
      { kind: 'mutate', target: 'rsvpStatus', expression: literal('pending') },
    ],
    emits: [],
  };
  const stayPending: IRCommand = {
    entity: 'EventGuest',
    name: 'stayPending',
    parameters: [],
    guards: [],
    actions: [{ kind: 'mutate', target: 'rsvpStatus', expression: literal('pending') }],
    emits: [],
  };
  const assignTable: IRCommand = {
    entity: 'EventGuest',
    name: 'assignTable',
    parameters: [],
    guards: [],
    actions: [{ kind: 'mutate', target: 'name', expression: literal('updated') }],
    emits: [],
  };
  return {
    version: '1.0',
    provenance: {
      contentHash: 'h',
      compilerVersion: 'test',
      schemaVersion: '1.0',
      compiledAt: '2026-01-01T00:00:00.000Z',
    },
    tenant: {
      property: 'tenantId',
      type: { name: 'string', nullable: false },
      contextPath: 'context.tenantId',
    },
    modules: [],
    values: [],
    entities: [entity],
    enums: [],
    stores: [{ entity: 'EventGuest', target: 'durable', config: {} }],
    events: [],
    commands: [assignTable, invite, stayPending],
    policies: [],
  };
}

describe('Convex governed creation entries', () => {
  it('allocates, governs, returns docId, and cleans up named creation commands', () => {
    const result = new ConvexProjection().generate(eventGuestIR(), {
      surface: 'convex.mutations',
      options: { authContextImport: './lib/authContext' },
    });
    const code = result.artifacts[0]!.code;

    expect(code).toContain('export const EventGuest_createViaInvite = mutation({');
    expect(code).toContain('const docId = await ctx.db.insert("eventGuests"');
    expect(code).toContain('await __runEventGuestInvite(ctx, { ...args, docId }, true)');
    expect(code).toContain('await ctx.db.delete(docId)');
    expect(code).toContain('return { docId };');
    expect(code).toContain('tenantId: __auth.tenantId');
    expect(code).toContain('eventId: args.eventId');
  });

  it('allows initial-state reassertion only through creation mode', () => {
    const code = new ConvexProjection().generate(eventGuestIR(), {
      surface: 'convex.mutations',
      options: { authContextImport: './lib/authContext' },
    }).artifacts[0]!.code;

    expect(code).toContain('!(__creation && __from === __to)');
    expect(code).toContain('handler: __runEventGuestStayPending');
    expect(code).not.toContain('await __runEventGuestStayPending(ctx, { ...args, docId }, true)');
  });

  it('emits a generated React creation hook for the inferred initialization command', () => {
    const code = new ConvexProjection().generate(eventGuestIR(), {
      surface: 'convex.react',
      options: { authContextImport: './lib/authContext' },
    }).artifacts[0]!.code;
    expect(code).toContain('export function useCreateEventGuest()');
    expect(code).toContain('useMutation(api.mutations.EventGuest_createViaInvite)');
  });
});
