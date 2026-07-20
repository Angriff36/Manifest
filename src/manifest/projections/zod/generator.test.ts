/**
 * Tests for the Zod schema projection.
 *
 * Verifies:
 * - Projection metadata (name, surfaces, description)
 * - Entity schema generation with type mapping
 * - Constraint refinements (.min()/.max())
 * - Computed property extension schemas
 * - Command parameter schemas
 * - zod.schemas combined surface
 * - Options (emitTypes, emitComputedSchemas, zodImportPath, emitHeader)
 * - Edge cases (empty IR, unknown surfaces, unknown types)
 * - Deterministic output
 */

import { describe, expect, it } from 'vitest';
import type { IR } from '../../ir';
import { compileToIR } from '../../ir-compiler';
// Static import: pulling the full registry graph through a dynamic import
// inside a test body can exceed the 5s test timeout under full-suite load.
// Registration stays lazy — it happens inside getProjection(), not at import.
import { getProjection } from '../registry';
import { ZodProjection } from './generator';

describe('ZodProjection', () => {
  const projection = new ZodProjection();

  function firstCode(result: ReturnType<typeof projection.generate>): string {
    expect(result.artifacts.length).toBeGreaterThan(0);
    return result.artifacts[0].code;
  }

  function makeMinimalIR(overrides: Partial<IR> = {}): IR {
    return {
      version: '1.0',
      provenance: {
        contentHash: 'abc123',
        compilerVersion: '0.3.21',
        schemaVersion: '1.0',
        compiledAt: '2026-01-01T00:00:00.000Z',
      },
      modules: [],
      values: [],
      entities: [],
      enums: [],
      stores: [],
      events: [],
      commands: [],
      policies: [],
      ...overrides,
    };
  }

  function bareEntity(name: string, properties: any[] = [], extras: Record<string, unknown> = {}) {
    return {
      name,
      properties,
      computedProperties: [] as any[],
      relationships: [] as any[],
      commands: [] as string[],
      constraints: [] as any[],
      policies: [] as string[],
      ...extras,
    };
  }

  // ========================================================================
  // Projection metadata
  // ========================================================================

  describe('projection metadata', () => {
    it('has correct name, description, and surfaces', () => {
      expect(projection.name).toBe('zod');
      expect(projection.description).toContain('Zod');
      expect(projection.surfaces).toEqual(['zod.entity', 'zod.command', 'zod.schemas']);
    });

    it('is registered as a built-in projection', () => {
      const p = getProjection('zod');
      expect(p).toBeDefined();
      expect(p!.name).toBe('zod');
    });
  });

  // ========================================================================
  // zod.entity surface — basic entity schema
  // ========================================================================

  describe('zod.entity surface', () => {
    it('generates schema for a single entity', () => {
      const ir = makeMinimalIR({
        entities: [
          bareEntity('Recipe', [
            {
              name: 'id',
              type: { name: 'string', nullable: false },
              modifiers: ['required'],
            },
            {
              name: 'title',
              type: { name: 'string', nullable: false },
              modifiers: ['required'],
            },
          ]),
        ],
      });

      const result = projection.generate(ir, { surface: 'zod.entity' });
      expect(result.artifacts).toHaveLength(1);

      const code = firstCode(result);
      expect(code).toContain('export const RecipeSchema = z.object({');
      expect(code).toContain('id: z.string(),');
      expect(code).toContain('title: z.string(),');
      expect(code).toContain('});');
    });

    it('generates one artifact per entity when no entity specified', () => {
      const ir = makeMinimalIR({
        entities: [
          bareEntity('Recipe', [
            {
              name: 'id',
              type: { name: 'string', nullable: false },
              modifiers: ['required'],
            },
          ]),
          bareEntity('Ingredient', [
            {
              name: 'id',
              type: { name: 'string', nullable: false },
              modifiers: ['required'],
            },
          ]),
        ],
      });

      const result = projection.generate(ir, { surface: 'zod.entity' });
      expect(result.artifacts).toHaveLength(2);
      expect(result.artifacts[0].id).toBe('zod.entity.Recipe');
      expect(result.artifacts[1].id).toBe('zod.entity.Ingredient');
    });

    it('filters to specific entity when request.entity is set', () => {
      const ir = makeMinimalIR({
        entities: [
          bareEntity('Recipe', [
            {
              name: 'id',
              type: { name: 'string', nullable: false },
              modifiers: ['required'],
            },
          ]),
          bareEntity('Ingredient', [
            {
              name: 'id',
              type: { name: 'string', nullable: false },
              modifiers: ['required'],
            },
          ]),
        ],
      });

      const result = projection.generate(ir, {
        surface: 'zod.entity',
        entity: 'Recipe',
      });
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].id).toBe('zod.entity.Recipe');
    });

    it('returns error for missing entity', () => {
      const ir = makeMinimalIR({
        entities: [bareEntity('Recipe', [])],
      });

      const result = projection.generate(ir, {
        surface: 'zod.entity',
        entity: 'NonExistent',
      });
      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].code).toBe('ZOD_ENTITY_NOT_FOUND');
    });

    it('generates empty schema for entity with no properties', () => {
      const ir = makeMinimalIR({
        entities: [bareEntity('Empty', [])],
      });

      const result = projection.generate(ir, { surface: 'zod.entity' });
      const code = firstCode(result);
      expect(code).toContain('export const EmptySchema = z.object({');
      expect(code).toContain('});');
    });
  });

  // ========================================================================
  // Type mapping
  // ========================================================================

  describe('type mapping', () => {
    it('maps all basic IR types to Zod expressions', () => {
      const properties = [
        {
          name: 'str',
          type: { name: 'string', nullable: false },
          modifiers: [],
        },
        { name: 'txt', type: { name: 'text', nullable: false }, modifiers: [] },
        {
          name: 'bool',
          type: { name: 'boolean', nullable: false },
          modifiers: [],
        },
        { name: 'b', type: { name: 'bool', nullable: false }, modifiers: [] },
        {
          name: 'num',
          type: { name: 'number', nullable: false },
          modifiers: [],
        },
        {
          name: 'flt',
          type: { name: 'float', nullable: false },
          modifiers: [],
        },
        {
          name: 'dec',
          type: { name: 'decimal', nullable: false },
          modifiers: [],
        },
        {
          name: 'mon',
          type: { name: 'money', nullable: false },
          modifiers: [],
        },
        { name: 'int', type: { name: 'int', nullable: false }, modifiers: [] },
        {
          name: 'intg',
          type: { name: 'integer', nullable: false },
          modifiers: [],
        },
        {
          name: 'big',
          type: { name: 'bigint', nullable: false },
          modifiers: [],
        },
        { name: 'dt', type: { name: 'date', nullable: false }, modifiers: [] },
        {
          name: 'dttm',
          type: { name: 'datetime', nullable: false },
          modifiers: [],
        },
        { name: 'uid', type: { name: 'uuid', nullable: false }, modifiers: [] },
        { name: 'em', type: { name: 'email', nullable: false }, modifiers: [] },
        { name: 'u', type: { name: 'url', nullable: false }, modifiers: [] },
        { name: 'ur', type: { name: 'uri', nullable: false }, modifiers: [] },
        { name: 'jsn', type: { name: 'json', nullable: false }, modifiers: [] },
        { name: 'any', type: { name: 'any', nullable: false }, modifiers: [] },
        {
          name: 'byt',
          type: { name: 'bytes', nullable: false },
          modifiers: [],
        },
        {
          name: 'obj',
          type: { name: 'object', nullable: false },
          modifiers: [],
        },
      ];

      const ir = makeMinimalIR({
        entities: [bareEntity('TypeTest', properties)],
      });

      const result = projection.generate(ir, { surface: 'zod.entity' });
      const code = firstCode(result);

      expect(code).toContain('z.string()');
      expect(code).toContain('z.boolean()');
      expect(code).toContain('z.number()');
      expect(code).toContain('z.number().int()');
      expect(code).toContain('z.bigint()');
      expect(code).toContain('z.coerce.date()');
      expect(code).toContain('z.string().uuid()');
      expect(code).toContain('z.string().email()');
      expect(code).toContain('z.string().url()');
      expect(code).toContain('z.unknown()');
      expect(code).toContain('z.instanceof(Uint8Array)');
      expect(code).toContain('z.record(z.unknown())');
    });

    it('maps array types with generic inner type', () => {
      const ir = makeMinimalIR({
        entities: [
          bareEntity('ArrayTest', [
            {
              name: 'tags',
              type: {
                name: 'array',
                generic: { name: 'string', nullable: false },
                nullable: false,
              },
              modifiers: [],
            },
          ]),
        ],
      });

      const result = projection.generate(ir, { surface: 'zod.entity' });
      const code = firstCode(result);
      expect(code).toContain('z.array(z.string())');
    });

    it('maps nested array types', () => {
      const ir = makeMinimalIR({
        entities: [
          bareEntity('NestedArray', [
            {
              name: 'matrix',
              type: {
                name: 'array',
                generic: {
                  name: 'array',
                  generic: { name: 'number', nullable: false },
                  nullable: false,
                },
                nullable: false,
              },
              modifiers: [],
            },
          ]),
        ],
      });

      const result = projection.generate(ir, { surface: 'zod.entity' });
      const code = firstCode(result);
      expect(code).toContain('z.array(z.array(z.number()))');
    });

    it('maps map types with generic value type', () => {
      const ir = makeMinimalIR({
        entities: [
          bareEntity('MapTest', [
            {
              name: 'meta',
              type: {
                name: 'map',
                generic: { name: 'string', nullable: false },
                nullable: false,
              },
              modifiers: [],
            },
          ]),
        ],
      });

      const result = projection.generate(ir, { surface: 'zod.entity' });
      const code = firstCode(result);
      expect(code).toContain('z.record(z.string())');
    });

    it('warns on unknown type and falls back to z.unknown()', () => {
      const ir = makeMinimalIR({
        entities: [
          bareEntity('UnknownTest', [
            {
              name: 'weird',
              type: { name: 'customType', nullable: false },
              modifiers: [],
            },
          ]),
        ],
      });

      const result = projection.generate(ir, { surface: 'zod.entity' });
      const code = firstCode(result);
      expect(code).toContain('z.unknown()');
      expect(result.diagnostics.some((d) => d.code === 'ZOD_UNKNOWN_TYPE')).toBe(true);
    });
  });

  // ========================================================================
  // Property modifiers
  // ========================================================================

  describe('property modifiers', () => {
    it('marks required properties without .optional()', () => {
      const ir = makeMinimalIR({
        entities: [
          bareEntity('Req', [
            {
              name: 'id',
              type: { name: 'string', nullable: false },
              modifiers: ['required'],
            },
          ]),
        ],
      });

      const result = projection.generate(ir, {
        surface: 'zod.entity',
        options: { emitTypes: false },
      });
      const code = firstCode(result);
      expect(code).toContain('id: z.string(),');
      expect(code).not.toContain('id: z.string().optional()');
    });

    it('marks non-required properties with .optional()', () => {
      const ir = makeMinimalIR({
        entities: [
          bareEntity('Opt', [
            {
              name: 'bio',
              type: { name: 'string', nullable: false },
              modifiers: [],
            },
          ]),
        ],
      });

      const result = projection.generate(ir, {
        surface: 'zod.entity',
        options: { emitTypes: false },
      });
      const code = firstCode(result);
      expect(code).toContain('bio: z.string().optional(),');
    });

    it('handles nullable types with .nullable()', () => {
      const ir = makeMinimalIR({
        entities: [
          bareEntity('Null', [
            {
              name: 'name',
              type: { name: 'string', nullable: true },
              modifiers: [],
            },
          ]),
        ],
      });

      const result = projection.generate(ir, {
        surface: 'zod.entity',
        options: { emitTypes: false },
      });
      const code = firstCode(result);
      expect(code).toContain('name: z.string().nullable().optional(),');
    });

    it('handles default values with .default()', () => {
      const ir = makeMinimalIR({
        entities: [
          bareEntity('Defaults', [
            {
              name: 'status',
              type: { name: 'string', nullable: false },
              defaultValue: { kind: 'string', value: 'draft' },
              modifiers: [],
            },
            {
              name: 'count',
              type: { name: 'int', nullable: false },
              defaultValue: { kind: 'number', value: 0 },
              modifiers: [],
            },
            {
              name: 'active',
              type: { name: 'boolean', nullable: false },
              defaultValue: { kind: 'boolean', value: true },
              modifiers: [],
            },
          ]),
        ],
      });

      const result = projection.generate(ir, {
        surface: 'zod.entity',
        options: { emitTypes: false },
      });
      const code = firstCode(result);
      expect(code).toContain('status: z.string().optional().default("draft"),');
      expect(code).toContain('count: z.number().int().optional().default(0),');
      expect(code).toContain('active: z.boolean().optional().default(true),');
    });
  });

  // ========================================================================
  // Constraint refinements
  // ========================================================================

  describe('constraint refinements', () => {
    it('applies numeric range constraints as .min()/.max()', async () => {
      const source = `
        entity Product {
          property required id: string
          property required price: number
          constraint valid_price: self.price >= 0
          constraint max_price: self.price <= 10000
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const zodResult = projection.generate(result.ir!, {
        surface: 'zod.entity',
        options: { emitTypes: false },
      });
      const code = firstCode(zodResult);
      expect(code).toContain('price: z.number().min(0).max(10000),');
    });

    it('applies length constraints as .min()/.max() on strings', async () => {
      const source = `
        entity User {
          property required id: string
          property required name: string
          constraint name_length: length(self.name) >= 1
          constraint name_max: length(self.name) <= 255
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const zodResult = projection.generate(result.ir!, {
        surface: 'zod.entity',
        options: { emitTypes: false },
      });
      const code = firstCode(zodResult);
      expect(code).toContain('name: z.string().min(1).max(255),');
    });

    it('applies between() constraint', async () => {
      const source = `
        entity Score {
          property required id: string
          property required value: number
          constraint in_range: between(self.value, 0, 100)
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const zodResult = projection.generate(result.ir!, {
        surface: 'zod.entity',
        options: { emitTypes: false },
      });
      const code = firstCode(zodResult);
      expect(code).toContain('value: z.number().min(0).max(100),');
    });
  });

  // ========================================================================
  // Computed properties
  // ========================================================================

  describe('computed properties', () => {
    it('generates computed schema extension when entity has computed props', async () => {
      const source = `
        entity OrderItem {
          property required id: string
          property price: number = 0
          property quantity: number = 1
          computed subtotal: number = price * quantity
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const zodResult = projection.generate(result.ir!, {
        surface: 'zod.entity',
      });
      const code = firstCode(zodResult);
      expect(code).toContain('OrderItemSchema = z.object({');
      expect(code).toContain('OrderItemComputedSchema = OrderItemSchema.extend({');
      expect(code).toContain('subtotal: z.number(),');
    });

    it('does not generate computed schema when no computed props', () => {
      const ir = makeMinimalIR({
        entities: [
          bareEntity('Simple', [
            {
              name: 'id',
              type: { name: 'string', nullable: false },
              modifiers: ['required'],
            },
          ]),
        ],
      });

      const result = projection.generate(ir, { surface: 'zod.entity' });
      const code = firstCode(result);
      expect(code).not.toContain('ComputedSchema');
    });

    it('skips computed schema when emitComputedSchemas is false', async () => {
      const source = `
        entity OrderItem {
          property required id: string
          property price: number = 0
          computed subtotal: number = price * 2
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const zodResult = projection.generate(result.ir!, {
        surface: 'zod.entity',
        options: { emitComputedSchemas: false },
      });
      const code = firstCode(zodResult);
      expect(code).not.toContain('ComputedSchema');
    });
  });

  // ========================================================================
  // Type exports
  // ========================================================================

  describe('type exports', () => {
    it('emits type exports by default', () => {
      const ir = makeMinimalIR({
        entities: [
          bareEntity('Recipe', [
            {
              name: 'id',
              type: { name: 'string', nullable: false },
              modifiers: ['required'],
            },
          ]),
        ],
      });

      const result = projection.generate(ir, { surface: 'zod.entity' });
      const code = firstCode(result);
      expect(code).toContain('export type Recipe = z.infer<typeof RecipeSchema>;');
    });

    it('emits WithComputed type when computed props present', async () => {
      const source = `
        entity Item {
          property required id: string
          computed total: number = 42
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const zodResult = projection.generate(result.ir!, {
        surface: 'zod.entity',
      });
      const code = firstCode(zodResult);
      expect(code).toContain('export type Item = z.infer<typeof ItemSchema>;');
      expect(code).toContain('export type ItemWithComputed = z.infer<typeof ItemComputedSchema>;');
    });

    it('skips type exports when emitTypes is false', () => {
      const ir = makeMinimalIR({
        entities: [
          bareEntity('Recipe', [
            {
              name: 'id',
              type: { name: 'string', nullable: false },
              modifiers: ['required'],
            },
          ]),
        ],
      });

      const result = projection.generate(ir, {
        surface: 'zod.entity',
        options: { emitTypes: false },
      });
      const code = firstCode(result);
      expect(code).not.toContain('export type Recipe = z.infer');
    });
  });

  // ========================================================================
  // zod.command surface
  // ========================================================================

  describe('zod.command surface', () => {
    it('generates schema for command parameters', () => {
      const ir = makeMinimalIR({
        entities: [
          bareEntity('Task', [
            {
              name: 'id',
              type: { name: 'string', nullable: false },
              modifiers: ['required'],
            },
          ]),
        ],
        commands: [
          {
            name: 'createTask',
            entity: 'Task',
            parameters: [
              {
                name: 'title',
                type: { name: 'string', nullable: false },
                required: true,
              },
              {
                name: 'priority',
                type: { name: 'int', nullable: false },
                required: false,
              },
            ],
            guards: [],
            actions: [],
            emits: [],
          },
        ],
      });

      const result = projection.generate(ir, { surface: 'zod.command' });
      const code = firstCode(result);
      // Entity-prefixed schema name (zodParamsSchemaName): Task + createTask.
      expect(code).toContain('export const TaskCreateTaskParamsSchema = z.object({');
      expect(code).toContain('title: z.string(),');
      expect(code).toContain('priority: z.number().int().optional(),');
    });

    it('emits trusted server-owned params as optional even when required', () => {
      // `from context.*` params are injected by the runtime (client values are
      // stripped), so a client-facing schema must never require them.
      const ir = makeMinimalIR({
        entities: [
          bareEntity('Task', [
            {
              name: 'id',
              type: { name: 'string', nullable: false },
              modifiers: ['required'],
            },
          ]),
        ],
        commands: [
          {
            name: 'claim',
            entity: 'Task',
            parameters: [
              {
                name: 'userId',
                type: { name: 'string', nullable: false },
                required: true,
                trustedSource: 'context.user.id',
              },
              {
                name: 'note',
                type: { name: 'string', nullable: false },
                required: true,
              },
            ],
            guards: [],
            actions: [],
            emits: [],
          },
        ],
      });

      const result = projection.generate(ir, { surface: 'zod.command' });
      const code = firstCode(result);
      expect(code).toContain('userId: z.string().optional(),');
      expect(code).toContain('note: z.string(),');
    });

    it('emits opaque string schemas for uuid command params that are relationship FKs', () => {
      // Convex (and similar stores) use opaque document ids, not RFC UUIDs.
      // FK params typed as uuid in Manifest must accept those ids in client Zod.
      const ir = makeMinimalIR({
        entities: [
          bareEntity(
            'PackList',
            [
              {
                name: 'id',
                type: { name: 'uuid', nullable: false },
                modifiers: ['required'],
              },
              {
                name: 'eventId',
                type: { name: 'uuid', nullable: false },
                modifiers: ['required'],
              },
              {
                name: 'tenantId',
                type: { name: 'uuid', nullable: false },
                modifiers: ['required'],
              },
            ],
            {
              relationships: [
                {
                  name: 'event',
                  kind: 'belongsTo',
                  target: 'Event',
                  foreignKey: { fields: ['tenantId', 'eventId'], references: ['tenantId', 'id'] },
                },
              ],
            },
          ),
        ],
        commands: [
          {
            name: 'open',
            entity: 'PackList',
            parameters: [
              {
                name: 'eventId',
                type: { name: 'uuid', nullable: false },
                required: true,
              },
              {
                name: 'name',
                type: { name: 'string', nullable: false },
                required: true,
              },
              {
                name: 'correlationId',
                type: { name: 'uuid', nullable: false },
                required: false,
              },
            ],
            guards: [],
            actions: [],
            emits: [],
          },
        ],
      });

      const result = projection.generate(ir, { surface: 'zod.command' });
      const code = firstCode(result);
      expect(code).toContain('eventId: z.string().min(1),');
      expect(code).not.toContain('eventId: z.string().uuid()');
      expect(code).toContain('correlationId: z.string().uuid().optional(),');
      expect(code).toContain('name: z.string(),');
    });

    it('generates empty object for command with no parameters', () => {
      const ir = makeMinimalIR({
        commands: [
          {
            name: 'ping',
            parameters: [],
            guards: [],
            actions: [],
            emits: [],
          },
        ],
      });

      const result = projection.generate(ir, { surface: 'zod.command' });
      const code = firstCode(result);
      expect(code).toContain('export const PingParamsSchema = z.object({});');
    });

    it('filters to specific command when request.command is set', () => {
      const ir = makeMinimalIR({
        commands: [
          {
            name: 'create',
            parameters: [
              {
                name: 'name',
                type: { name: 'string', nullable: false },
                required: true,
              },
            ],
            guards: [],
            actions: [],
            emits: [],
          },
          {
            name: 'delete',
            parameters: [
              {
                name: 'id',
                type: { name: 'string', nullable: false },
                required: true,
              },
            ],
            guards: [],
            actions: [],
            emits: [],
          },
        ],
      });

      const result = projection.generate(ir, {
        surface: 'zod.command',
        command: 'create',
      });
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].id).toBe('zod.command.create');
    });

    it('returns error for missing command', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, {
        surface: 'zod.command',
        command: 'nope',
      });
      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics[0].code).toBe('ZOD_COMMAND_NOT_FOUND');
    });

    it('handles command parameter defaults', () => {
      const ir = makeMinimalIR({
        commands: [
          {
            name: 'configure',
            parameters: [
              {
                name: 'timeout',
                type: { name: 'int', nullable: false },
                required: false,
                defaultValue: { kind: 'number', value: 30 },
              },
            ],
            guards: [],
            actions: [],
            emits: [],
          },
        ],
      });

      const result = projection.generate(ir, {
        surface: 'zod.command',
        options: { emitTypes: false },
      });
      const code = firstCode(result);
      expect(code).toContain('timeout: z.number().int().optional().default(30),');
    });

    it('generates return type schema when command has returns', () => {
      const ir = makeMinimalIR({
        commands: [
          {
            name: 'getCount',
            parameters: [],
            guards: [],
            actions: [],
            emits: [],
            returns: { name: 'int', nullable: false },
          },
        ],
      });

      const result = projection.generate(ir, { surface: 'zod.command' });
      const code = firstCode(result);
      expect(code).toContain('export const GetCountReturnSchema = z.number().int();');
      expect(code).toContain('export type GetCountReturn = z.infer<typeof GetCountReturnSchema>;');
    });
  });

  // ========================================================================
  // zod.schemas combined surface
  // ========================================================================

  describe('zod.schemas surface', () => {
    it('generates all entities and commands in a single artifact', () => {
      const ir = makeMinimalIR({
        entities: [
          bareEntity('Recipe', [
            {
              name: 'id',
              type: { name: 'string', nullable: false },
              modifiers: ['required'],
            },
          ]),
        ],
        commands: [
          {
            name: 'createRecipe',
            entity: 'Recipe',
            parameters: [
              {
                name: 'title',
                type: { name: 'string', nullable: false },
                required: true,
              },
            ],
            guards: [],
            actions: [],
            emits: [],
          },
        ],
      });

      const result = projection.generate(ir, { surface: 'zod.schemas' });
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].id).toBe('zod.schemas');

      const code = result.artifacts[0].code;
      expect(code).toContain('RecipeSchema');
      // Entity-prefixed schema name (zodParamsSchemaName): Recipe + createRecipe.
      expect(code).toContain('RecipeCreateRecipeParamsSchema');
    });

    it('generates empty artifact for empty IR', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'zod.schemas' });
      expect(result.artifacts).toHaveLength(1);

      const code = firstCode(result);
      expect(code).toContain("import { z } from 'zod';");
      // Should have import but no schemas
      expect(code).not.toContain('Schema = z.object');
    });
  });

  // ========================================================================
  // Options
  // ========================================================================

  describe('options', () => {
    it('uses custom zod import path', () => {
      const ir = makeMinimalIR({
        entities: [
          bareEntity('Test', [
            {
              name: 'id',
              type: { name: 'string', nullable: false },
              modifiers: ['required'],
            },
          ]),
        ],
      });

      const result = projection.generate(ir, {
        surface: 'zod.entity',
        options: { zodImportPath: 'zod/v4' },
      });
      const code = firstCode(result);
      expect(code).toContain("import { z } from 'zod/v4';");
    });

    it('omits header when emitHeader is false', () => {
      const ir = makeMinimalIR({
        entities: [
          bareEntity('Test', [
            {
              name: 'id',
              type: { name: 'string', nullable: false },
              modifiers: ['required'],
            },
          ]),
        ],
      });

      const result = projection.generate(ir, {
        surface: 'zod.entity',
        options: { emitHeader: false },
      });
      const code = firstCode(result);
      expect(code).not.toContain('Auto-generated');
    });

    it('includes header by default', () => {
      const ir = makeMinimalIR({
        entities: [
          bareEntity('Test', [
            {
              name: 'id',
              type: { name: 'string', nullable: false },
              modifiers: ['required'],
            },
          ]),
        ],
      });

      const result = projection.generate(ir, { surface: 'zod.entity' });
      const code = firstCode(result);
      expect(code).toContain('Auto-generated by Manifest Zod projection');
    });
  });

  // ========================================================================
  // Artifact metadata
  // ========================================================================

  describe('artifact metadata', () => {
    it('sets correct id, pathHint, and contentType for entity surface', () => {
      const ir = makeMinimalIR({
        entities: [
          bareEntity('Recipe', [
            {
              name: 'id',
              type: { name: 'string', nullable: false },
              modifiers: ['required'],
            },
          ]),
        ],
      });

      const result = projection.generate(ir, { surface: 'zod.entity' });
      const artifact = result.artifacts[0];
      expect(artifact.id).toBe('zod.entity.Recipe');
      expect(artifact.pathHint).toBe('schemas/Recipe.schema.ts');
      expect(artifact.contentType).toBe('typescript');
    });

    it('sets correct id for command surface', () => {
      const ir = makeMinimalIR({
        commands: [
          {
            name: 'create',
            parameters: [],
            guards: [],
            actions: [],
            emits: [],
          },
        ],
      });

      const result = projection.generate(ir, { surface: 'zod.command' });
      expect(result.artifacts[0].id).toBe('zod.command.create');
      expect(result.artifacts[0].contentType).toBe('typescript');
    });
  });

  // ========================================================================
  // Edge cases
  // ========================================================================

  describe('edge cases', () => {
    it('returns error for unknown surface', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'zod.unknown' });

      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].severity).toBe('error');
      expect(result.diagnostics[0].code).toBe('ZOD_UNKNOWN_SURFACE');
    });

    it('handles entity from .manifest source via compileToIR', async () => {
      const source = `
        entity Recipe {
          property required id: string
          property title: string
          property servings: int = 4
          computed displayTitle: string = title
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const zodResult = projection.generate(result.ir!, {
        surface: 'zod.entity',
      });
      const code = firstCode(zodResult);

      expect(code).toContain('RecipeSchema');
      expect(code).toContain('RecipeComputedSchema');
      expect(code).toContain('z.number().int()');
      expect(code).toContain('.default(4)');
    });
  });

  // ========================================================================
  // Determinism
  // ========================================================================

  describe('determinism', () => {
    it('produces identical output for identical IR (sans timestamp)', () => {
      const ir = makeMinimalIR({
        entities: [
          bareEntity('Recipe', [
            {
              name: 'id',
              type: { name: 'string', nullable: false },
              modifiers: ['required'],
            },
            {
              name: 'title',
              type: { name: 'string', nullable: false },
              modifiers: [],
            },
          ]),
        ],
      });

      const result1 = projection.generate(ir, {
        surface: 'zod.entity',
        options: { emitHeader: false },
      });
      const result2 = projection.generate(ir, {
        surface: 'zod.entity',
        options: { emitHeader: false },
      });

      expect(firstCode(result1)).toBe(firstCode(result2));
    });
  });

  // ========================================================================
  // Value object types
  // ========================================================================

  describe('value object types', () => {
    it('emits z.object({...}) for a value object property (not z.unknown())', () => {
      const ir = makeMinimalIR({
        values: [
          {
            name: 'Address',
            properties: [
              {
                name: 'street',
                type: { name: 'string', nullable: false },
                modifiers: ['required'],
              },
              {
                name: 'zip',
                type: { name: 'string', nullable: false },
                modifiers: [],
              },
            ],
          },
        ],
        entities: [
          bareEntity('Customer', [
            {
              name: 'id',
              type: { name: 'string', nullable: false },
              modifiers: ['required'],
            },
            {
              name: 'address',
              type: { name: 'Address', nullable: false },
              modifiers: ['required'],
            },
          ]),
        ],
      });

      const result = projection.generate(ir, {
        surface: 'zod.entity',
        options: { emitTypes: false },
      });
      const code = firstCode(result);

      // Must contain the value object as z.object({...}) not z.unknown()
      expect(code).toContain('z.object({');
      expect(code).toContain('street: z.string()');
      // zip is not required, so it gets .optional()
      expect(code).toContain('zip: z.string().optional()');
      expect(code).not.toContain('z.unknown()');
    });

    it('emits no ZOD_UNKNOWN_TYPE diagnostic for value object types', () => {
      const ir = makeMinimalIR({
        values: [
          {
            name: 'Point',
            properties: [
              {
                name: 'x',
                type: { name: 'number', nullable: false },
                modifiers: [],
              },
              {
                name: 'y',
                type: { name: 'number', nullable: false },
                modifiers: [],
              },
            ],
          },
        ],
        entities: [
          bareEntity('Shape', [
            {
              name: 'id',
              type: { name: 'string', nullable: false },
              modifiers: ['required'],
            },
            {
              name: 'origin',
              type: { name: 'Point', nullable: false },
              modifiers: [],
            },
          ]),
        ],
      });

      const result = projection.generate(ir, { surface: 'zod.entity' });
      const warnings = result.diagnostics.filter((d) => d.code === 'ZOD_UNKNOWN_TYPE');
      expect(warnings).toHaveLength(0);
    });

    it('emits value object types correctly in command parameter schemas', () => {
      const ir = makeMinimalIR({
        values: [
          {
            name: 'Money',
            properties: [
              {
                name: 'amount',
                type: { name: 'number', nullable: false },
                modifiers: ['required'],
              },
              {
                name: 'currency',
                type: { name: 'string', nullable: false },
                modifiers: ['required'],
              },
            ],
          },
        ],
        commands: [
          {
            name: 'charge',
            entity: 'Order',
            parameters: [
              {
                name: 'amount',
                type: { name: 'Money', nullable: false },
                required: true,
              },
            ],
            guards: [],
            actions: [],
            emits: [],
          },
        ],
      });

      const result = projection.generate(ir, {
        surface: 'zod.command',
        options: { emitTypes: false },
      });
      const code = firstCode(result);

      expect(code).toContain('z.object({');
      expect(code).toContain('amount: z.number()');
      expect(code).toContain('currency: z.string()');
      expect(code).not.toContain('z.unknown()');
    });
  });

  // ========================================================================
  // Date/time primitive types
  // ========================================================================

  describe('date/time primitive types', () => {
    it('maps time → z.string().regex(...) and duration → z.number()', () => {
      const ir = makeMinimalIR({
        entities: [
          bareEntity('Gadget', [
            {
              name: 'id',
              type: { name: 'string', nullable: false },
              modifiers: ['required'],
            },
            {
              name: 'openAt',
              type: { name: 'time', nullable: false },
              modifiers: ['required'],
            },
            {
              name: 'span',
              type: { name: 'duration', nullable: false },
              modifiers: ['required'],
            },
          ]),
        ],
      });

      const result = projection.generate(ir, { surface: 'zod.entity' });
      const code = firstCode(result);

      expect(code).toContain('openAt: z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d$/),');
      expect(code).toContain('span: z.number(),');

      const warnings = result.diagnostics.filter((d) => d.code === 'ZOD_UNKNOWN_TYPE');
      expect(warnings).toHaveLength(0);
    });

    it('emits z.enum([...]) for IR enum-typed properties (not z.unknown())', () => {
      const ir = makeMinimalIR({
        enums: [
          {
            name: 'Status',
            values: [{ name: 'draft' }, { name: 'published' }, { name: 'archived' }],
          },
        ],
        entities: [
          bareEntity('Article', [
            {
              name: 'status',
              type: { name: 'Status', nullable: false },
              modifiers: ['required'],
            },
            {
              name: 'tags',
              type: {
                name: 'array',
                nullable: false,
                generic: { name: 'Status', nullable: false },
              },
              modifiers: [],
            },
          ]),
        ],
        commands: [
          {
            name: 'create',
            entity: 'Article',
            parameters: [
              {
                name: 'status',
                type: { name: 'Status', nullable: false },
                required: true,
              },
              {
                name: 'tags',
                type: {
                  name: 'array',
                  nullable: false,
                  generic: { name: 'Status', nullable: false },
                },
                required: true,
              },
            ],
            guards: [],
            actions: [],
            emits: [],
          },
        ],
      });

      const entityCode = firstCode(projection.generate(ir, { surface: 'zod.entity' }));
      expect(entityCode).toContain('status: z.enum(["draft", "published", "archived"]),');
      expect(entityCode).toContain(
        'tags: z.array(z.enum(["draft", "published", "archived"])).optional(),',
      );

      const commandCode = firstCode(projection.generate(ir, { surface: 'zod.command' }));
      expect(commandCode).toContain('status: z.enum(["draft", "published", "archived"])');
      expect(commandCode).toContain('tags: z.array(z.enum(["draft", "published", "archived"]))');
      expect(entityCode).not.toContain('z.unknown()');
      expect(commandCode).not.toContain('z.unknown()');
    });

    it('maps timestamp alias like datetime (not z.unknown())', () => {
      const ir = makeMinimalIR({
        entities: [
          bareEntity('Asset', [
            {
              name: 'createdAt',
              type: { name: 'timestamp', nullable: false },
              modifiers: ['required'],
            },
          ]),
        ],
      });

      const result = projection.generate(ir, { surface: 'zod.entity' });
      const code = firstCode(result);
      expect(code).toContain('createdAt: z.coerce.date(),');
      expect(result.diagnostics.filter((d) => d.code === 'ZOD_UNKNOWN_TYPE')).toHaveLength(0);
    });

    it('maps list<T> like array<T>', () => {
      const ir = makeMinimalIR({
        entities: [
          bareEntity('Event', [
            {
              name: 'accessibilityOptions',
              type: { name: 'list', nullable: false, generic: { name: 'string', nullable: false } },
              modifiers: ['required'],
            },
          ]),
        ],
      });

      const result = projection.generate(ir, { surface: 'zod.entity' });
      const code = firstCode(result);
      expect(code).toContain('accessibilityOptions: z.array(z.string()),');
    });
  });
});
