import { describe, expect, it } from 'vitest';
import type { IR, IRCommand, IREntity, IRExpression, IRProperty } from '../../ir';
import { commandCreationEntry } from './creation-entry.js';
import { ConvexProjection } from './generator.js';

const literal = (value: string): IRExpression => ({
  kind: 'literal',
  value: { kind: 'string', value },
});

const identifier = (name: string): IRExpression => ({ kind: 'identifier', name });
const member = (property: string): IRExpression => ({
  kind: 'member',
  object: identifier('self'),
  property,
});
const nullLiteral = (): IRExpression => ({ kind: 'literal', value: { kind: 'null' } });
const equalsNull = (property: string): IRExpression => ({
  kind: 'binary',
  operator: '==',
  left: member(property),
  right: nullLiteral(),
});
const notEqualsNull = (property: string): IRExpression => ({
  kind: 'binary',
  operator: '!=',
  left: member(property),
  right: nullLiteral(),
});
const now = (): IRExpression => ({
  kind: 'call',
  callee: identifier('now'),
  args: [],
});
const mutate = (target: string, expression: IRExpression) => ({
  kind: 'mutate' as const,
  target,
  expression,
});

function governedCatalogIR(): IR {
  const requiredString = (name: string, defaultValue?: string): IRProperty => ({
    name,
    type: { name: 'string', nullable: false },
    modifiers: ['required'],
    ...(defaultValue === undefined
      ? {}
      : { defaultValue: { kind: 'string' as const, value: defaultValue } }),
  });
  const optionalDate = (name: string): IRProperty => ({
    name,
    type: { name: 'datetime', nullable: true },
    modifiers: [],
  });
  const optionalString = (name: string): IRProperty => ({
    name,
    type: { name: 'string', nullable: true },
    modifiers: [],
  });
  const entity = (name: string, properties: IRProperty[], commands: string[]): IREntity => ({
    name,
    properties,
    computedProperties: [],
    relationships: [],
    commands,
    constraints: [],
    policies: [],
  });
  const command = (
    entityName: string,
    name: string,
    guards: IRExpression[],
    actions: IRCommand['actions'],
    parameters: IRCommand['parameters'] = [],
  ): IRCommand => ({
    entity: entityName,
    name,
    parameters,
    guards,
    actions,
    emits: [],
  });

  const entities = [
    entity(
      'Ingredient',
      [
        requiredString('tenantId'),
        requiredString('name', ''),
        requiredString('status', 'active'),
        optionalDate('introducedAt'),
      ],
      ['introduce', 'discontinue'],
    ),
    entity(
      'Recipe',
      [
        requiredString('tenantId'),
        requiredString('name', ''),
        requiredString('status', 'draft'),
        optionalDate('draftedAt'),
      ],
      ['draft', 'publish'],
    ),
    entity(
      'QualityCheck',
      [
        requiredString('tenantId'),
        requiredString('status', 'pending'),
        optionalString('prepTaskId'),
        optionalString('productionBatchId'),
        optionalString('notes'),
        optionalString('result'),
        optionalString('checkedById'),
        optionalDate('openedAt'),
        optionalDate('completedAt'),
      ],
      ['open', 'fail'],
    ),
    entity(
      'VendorOrderLine',
      [
        requiredString('tenantId'),
        requiredString('vendorOrderId'),
        requiredString('ingredientId'),
        requiredString('status', 'pending'),
        optionalDate('addedAt'),
        optionalDate('completedAt'),
      ],
      ['addLine', 'recordReceipt'],
    ),
  ];

  const commands: IRCommand[] = [
    command(
      'Ingredient',
      'introduce',
      [equalsNull('introducedAt')],
      [mutate('name', identifier('name')), mutate('introducedAt', now())],
      [{ name: 'name', type: { name: 'string', nullable: false }, required: true }],
    ),
    command(
      'Ingredient',
      'discontinue',
      [],
      [mutate('status', literal('discontinued')), mutate('completedAt', now())],
    ),
    command(
      'Recipe',
      'draft',
      [equalsNull('draftedAt')],
      [mutate('name', identifier('name')), mutate('draftedAt', now())],
      [{ name: 'name', type: { name: 'string', nullable: false }, required: true }],
    ),
    command(
      'Recipe',
      'publish',
      [notEqualsNull('draftedAt')],
      [mutate('status', literal('published'))],
    ),
    command(
      'QualityCheck',
      'open',
      [equalsNull('openedAt')],
      [
        mutate('prepTaskId', identifier('prepTaskId')),
        mutate('productionBatchId', identifier('productionBatchId')),
        mutate('notes', identifier('notes')),
        mutate('openedAt', now()),
      ],
    ),
    command(
      'QualityCheck',
      'fail',
      [notEqualsNull('openedAt')],
      [
        mutate('result', literal('fail')),
        mutate('checkedById', identifier('userId')),
        mutate('notes', identifier('notes')),
        mutate('status', literal('failed')),
        mutate('completedAt', now()),
      ],
    ),
    command(
      'VendorOrderLine',
      'addLine',
      [equalsNull('addedAt')],
      [
        mutate('vendorOrderId', identifier('vendorOrderId')),
        mutate('ingredientId', identifier('ingredientId')),
        mutate('status', literal('added')),
        mutate('addedAt', now()),
      ],
      [
        { name: 'vendorOrderId', type: { name: 'string', nullable: false }, required: true },
        { name: 'ingredientId', type: { name: 'string', nullable: false }, required: true },
      ],
    ),
    command(
      'VendorOrderLine',
      'recordReceipt',
      [notEqualsNull('addedAt')],
      [mutate('completedAt', now())],
    ),
  ];

  return {
    version: '1.0',
    provenance: {
      contentHash: 'catalog',
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
    entities,
    enums: [],
    stores: entities.map((item) => ({ entity: item.name, target: 'durable', config: {} })),
    events: [],
    commands,
    policies: [],
  };
}

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
    { name: 'notes', type: { name: 'string', nullable: true }, modifiers: [] },
    { name: 'correctedAt', type: { name: 'datetime', nullable: true }, modifiers: [] },
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
    actions: [
      { kind: 'mutate', target: 'name', expression: literal('updated') },
      { kind: 'mutate', target: 'rsvpStatus', expression: literal('pending') },
      { kind: 'mutate', target: 'notes', expression: literal('corrected') },
      {
        kind: 'mutate',
        target: 'correctedAt',
        expression: { kind: 'call', callee: { kind: 'identifier', name: 'now' }, args: [] },
      },
    ],
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

  it('keeps initialization command selection stable and never selects a completion command', () => {
    const ir = governedCatalogIR();
    const selected = Object.fromEntries(
      ir.entities.map((entity) => [entity.name, commandCreationEntry(ir, entity)?.name]),
    );

    expect(selected).toEqual({
      Ingredient: 'introduce',
      Recipe: 'draft',
      QualityCheck: 'open',
      VendorOrderLine: 'addLine',
    });
  });

  it('allocates defaults without pre-applying command mutations, then governs and cleans up', () => {
    const code = new ConvexProjection().generate(governedCatalogIR(), {
      surface: 'convex.mutations',
      options: { authContextImport: './lib/authContext' },
    }).artifacts[0]!.code;

    const ingredientCreate = code.slice(
      code.indexOf('export const Ingredient_createViaIntroduce'),
      code.indexOf('async function __runIngredientDiscontinue'),
    );
    expect(ingredientCreate).toContain('name: ""');
    expect(ingredientCreate).not.toContain('introducedAt: Date.now()');
    expect(ingredientCreate).toContain('await __runIngredientIntroduce');
    expect(ingredientCreate).toContain('await ctx.db.delete(docId)');

    const recipeCreate = code.slice(
      code.indexOf('export const Recipe_createViaDraft'),
      code.indexOf('async function __runRecipePublish'),
    );
    expect(recipeCreate).toContain('name: ""');
    expect(recipeCreate).not.toContain('draftedAt: Date.now()');
    expect(recipeCreate).toContain('await __runRecipeDraft');
    expect(recipeCreate).toContain('await ctx.db.delete(docId)');

    expect(code).toContain('export const QualityCheck_createViaOpen = mutation({');
    expect(code).not.toContain('QualityCheck_createViaFail');
    expect(code).toContain('vendorOrderId: args.vendorOrderId');
    expect(code).toContain('ingredientId: args.ingredientId');
    expect(code).toContain('export const VendorOrderLine_createViaAddLine = mutation({');
  });
});
