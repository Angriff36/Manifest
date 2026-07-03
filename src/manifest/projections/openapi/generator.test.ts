/**
 * Tests for the OpenAPI 3.1 projection.
 *
 * Verifies:
 * - Projection metadata (name, surfaces, description)
 * - OpenAPI spec generation from entities and commands
 * - JSON Schema type mapping from IR types
 * - Entity read operations (GET list + GET detail)
 * - Command write operations (POST)
 * - Security scheme integration
 * - Constraint error response shapes
 * - Operation ID derivation
 * - Deterministic output
 * - Edge cases (empty IR, unknown surfaces)
 */

import { describe, it, expect } from 'vitest';
import { compileToIR } from '../../ir-compiler';
import { OpenApiProjection } from './generator';
// Static import: pulling the full registry graph through a dynamic import
// inside a test body can exceed the 5s test timeout under full-suite load.
// Registration stays lazy — it happens inside getProjection(), not at import.
import { getProjection } from '../registry';

describe('OpenApiProjection', () => {
  const projection = new OpenApiProjection();

  function firstCode(result: ReturnType<typeof projection.generate>): string {
    expect(result.artifacts.length).toBeGreaterThan(0);
    return result.artifacts[0].code;
  }

  function parseSpec(result: ReturnType<typeof projection.generate>) {
    const code = firstCode(result);
    return JSON.parse(code);
  }

  function makeMinimalIR(overrides: Record<string, unknown> = {}) {
    return {
      version: '1.0' as const,
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

  // ========================================================================
  // Projection metadata
  // ========================================================================

  describe('projection metadata', () => {
    it('has correct name, description, and surfaces', () => {
      expect(projection.name).toBe('openapi');
      expect(projection.description).toContain('OpenAPI');
      expect(projection.surfaces).toContain('openapi.spec');
    });

    it('is registered as a built-in projection', () => {
      const p = getProjection('openapi');
      expect(p).toBeDefined();
      expect(p!.name).toBe('openapi');
    });
  });

  // ========================================================================
  // openapi.spec surface — basic structure
  // ========================================================================

  describe('openapi.spec surface — basic structure', () => {
    it('generates valid OpenAPI 3.1.0 spec', async () => {
      const source = `
        entity Recipe {
          property required id: string
          property required name: string
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, { surface: 'openapi.spec' });
      const spec = parseSpec(specResult);

      expect(spec.openapi).toBe('3.1.0');
      expect(spec.info).toBeDefined();
      expect(spec.info.version).toBeDefined();
      expect(spec.paths).toBeDefined();
      expect(spec.components).toBeDefined();
      expect(spec.components.schemas).toBeDefined();
    });

    it('uses custom title and version when provided', async () => {
      const source = `entity Foo { property id: string }`;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, {
        surface: 'openapi.spec',
        options: {
          info: {
            title: 'My Custom API',
            version: '2.0.0',
            description: 'A test API',
          },
        },
      });
      const spec = parseSpec(specResult);

      expect(spec.info.title).toBe('My Custom API');
      expect(spec.info.version).toBe('2.0.0');
      expect(spec.info.description).toBe('A test API');
    });

    it('derives title from module name', async () => {
      const source = `
        module kitchen {
          entity Recipe { property id: string }
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, { surface: 'openapi.spec' });
      const spec = parseSpec(specResult);

      expect(spec.info.title).toBe('Kitchen API');
    });

    it('includes servers when provided', async () => {
      const ir = makeMinimalIR();
      const specResult = projection.generate(ir, {
        surface: 'openapi.spec',
        options: {
          servers: [
            { url: 'https://api.example.com', description: 'Production' },
            { url: 'https://staging.example.com', description: 'Staging' },
          ],
        },
      });
      const spec = parseSpec(specResult);

      expect(spec.servers).toHaveLength(2);
      expect(spec.servers[0].url).toBe('https://api.example.com');
      expect(spec.servers[1].url).toBe('https://staging.example.com');
    });
  });

  // ========================================================================
  // Entity read operations
  // ========================================================================

  describe('entity read operations', () => {
    it('generates GET list and GET detail routes for each entity', async () => {
      const source = `
        entity Recipe {
          property required id: string
          property required name: string
          property description: string?
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, { surface: 'openapi.spec' });
      const spec = parseSpec(specResult);

      // Should have list and detail paths
      expect(spec.paths['/api/recipe/list']).toBeDefined();
      expect(spec.paths['/api/recipe/list'].get).toBeDefined();
      expect(spec.paths['/api/recipe/{id}']).toBeDefined();
      expect(spec.paths['/api/recipe/{id}'].get).toBeDefined();
    });

    it('generates correct operation IDs for read operations', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, { surface: 'openapi.spec' });
      const spec = parseSpec(specResult);

      expect(spec.paths['/api/recipe/list'].get.operationId).toBe('listRecipes');
      expect(spec.paths['/api/recipe/{id}'].get.operationId).toBe('getRecipe');
    });

    it('includes entity schema ref in list response', async () => {
      const source = `entity Recipe { property required id: string }`;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, { surface: 'openapi.spec' });
      const spec = parseSpec(specResult);

      const listOp = spec.paths['/api/recipe/list'].get;
      expect(listOp.responses['200'].content['application/json'].schema.type).toBe('array');
      expect(listOp.responses['200'].content['application/json'].schema.items.$ref).toBe('#/components/schemas/Recipe');
    });

    it('includes id parameter in detail route', async () => {
      const source = `entity Recipe { property required id: string }`;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, { surface: 'openapi.spec' });
      const spec = parseSpec(specResult);

      const detailOp = spec.paths['/api/recipe/{id}'].get;
      expect(detailOp.parameters).toHaveLength(1);
      expect(detailOp.parameters[0].name).toBe('id');
      expect(detailOp.parameters[0].in).toBe('path');
      expect(detailOp.parameters[0].required).toBe(true);
    });

    it('uses custom basePath', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, {
        surface: 'openapi.spec',
        options: { basePath: '/api/v2' },
      });
      const spec = parseSpec(specResult);

      expect(spec.paths['/api/v2/recipe/list']).toBeDefined();
      expect(spec.paths['/api/v2/recipe/{id}']).toBeDefined();
    });
  });

  // ========================================================================
  // Command operations
  // ========================================================================

  describe('command operations', () => {
    it('generates POST route for entity commands', async () => {
      const source = `
        entity PrepTask {
          property required id: string
          property status: string = "pending"

          command claim(employeeId: string) {
            guard self.status == "pending"
            mutate status = "in_progress"
          }
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, { surface: 'openapi.spec' });
      const spec = parseSpec(specResult);

      expect(spec.paths['/api/preptask/claim']).toBeDefined();
      expect(spec.paths['/api/preptask/claim'].post).toBeDefined();
    });

    it('generates correct operation ID for commands', async () => {
      const source = `
        entity PrepTask {
          property required id: string
          command claim(employeeId: string) {
            guard self.status == "pending"
            mutate status = "claimed"
          }
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, { surface: 'openapi.spec' });
      const spec = parseSpec(specResult);

      expect(spec.paths['/api/preptask/claim'].post.operationId).toBe('prepTaskClaim');
    });

    it('generates request body schema for command parameters', async () => {
      const source = `
        entity PrepTask {
          property required id: string
          command claim(employeeId: string, priority: number) {
            mutate status = "claimed"
          }
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, { surface: 'openapi.spec' });
      const spec = parseSpec(specResult);

      const postOp = spec.paths['/api/preptask/claim'].post;
      expect(postOp.requestBody).toBeDefined();
      expect(postOp.requestBody.required).toBe(true);

      const bodySchema = postOp.requestBody.content['application/json'].schema;
      expect(bodySchema.type).toBe('object');
      expect(bodySchema.properties.employeeId).toBeDefined();
      expect(bodySchema.properties.priority).toBeDefined();
      expect(bodySchema.required).toContain('employeeId');
    });

    it('warns about commands without entities', async () => {
      const ir = makeMinimalIR({
        commands: [{
          name: 'orphanCommand',
          module: undefined,
          entity: undefined,
          parameters: [],
          guards: [],
          actions: [],
          emits: [],
        }],
      });

      const specResult = projection.generate(ir, { surface: 'openapi.spec' });
      expect(specResult.diagnostics.some(d => d.code === 'COMMAND_NO_ENTITY')).toBe(true);
    });
  });

  // ========================================================================
  // Entity schemas in components
  // ========================================================================

  describe('entity schemas', () => {
    it('generates entity schema with required and optional properties', async () => {
      const source = `
        entity Recipe {
          property required id: string
          property required name: string
          property description: string?
          property servings: number = 4
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, { surface: 'openapi.spec' });
      const spec = parseSpec(specResult);

      const recipeSchema = spec.components.schemas.Recipe;
      expect(recipeSchema.type).toBe('object');
      expect(recipeSchema.properties.id).toBeDefined();
      expect(recipeSchema.properties.name).toBeDefined();
      expect(recipeSchema.properties.description).toBeDefined();
      expect(recipeSchema.properties.servings).toBeDefined();
      expect(recipeSchema.properties.servings.default).toBe(4);
      expect(recipeSchema.required).toContain('id');
      expect(recipeSchema.required).toContain('name');
    });

    it('includes computed properties as readOnly', async () => {
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

      const specResult = projection.generate(result.ir!, { surface: 'openapi.spec' });
      const spec = parseSpec(specResult);

      const schema = spec.components.schemas.OrderItem;
      expect(schema.properties.subtotal).toBeDefined();
      expect(schema.properties.subtotal.readOnly).toBe(true);
      expect(schema.properties.subtotal.description).toContain('Computed');
    });

    it('maps IR types to JSON Schema types correctly', async () => {
      const source = `
        entity TypeTest {
          property str: string
          property num: number
          property bool: boolean
          property dt: date
          property dttm: datetime
          property uid: uuid
          property em: email
          property doc: json
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, { surface: 'openapi.spec' });
      const spec = parseSpec(specResult);

      const schema = spec.components.schemas.TypeTest;
      expect(schema.properties.str.type).toBe('string');
      expect(schema.properties.num.type).toBe('number');
      expect(schema.properties.bool.type).toBe('boolean');
      expect(schema.properties.dt).toEqual({ type: 'string', format: 'date' });
      expect(schema.properties.dttm).toEqual({ type: 'string', format: 'date-time' });
      expect(schema.properties.uid).toEqual({ type: 'string', format: 'uuid' });
      expect(schema.properties.em).toEqual({ type: 'string', format: 'email' });
      // json is a JSON document, not a string (the old unknown-type fallback).
      expect(schema.properties.doc).toEqual({ type: 'object', additionalProperties: true });
    });

    it('handles nullable types with type arrays', async () => {
      const source = `
        entity NullableTest {
          property name: string?
          property count: number?
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, { surface: 'openapi.spec' });
      const spec = parseSpec(specResult);

      const schema = spec.components.schemas.NullableTest;
      expect(schema.properties.name.type).toEqual(['string', 'null']);
      expect(schema.properties.count.type).toEqual(['number', 'null']);
    });

    it('generates write schema excluding readOnly properties', async () => {
      const source = `
        entity Recipe {
          property required id: string
          property required name: string
          property status: string = "pending"
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, { surface: 'openapi.spec' });
      const spec = parseSpec(specResult);

      const writeSchema = spec.components.schemas.RecipeWrite;
      expect(writeSchema).toBeDefined();
      expect(writeSchema.properties.id).toBeDefined();
      expect(writeSchema.properties.name).toBeDefined();
    });

    it('generates command-specific request schemas in components', async () => {
      const source = `
        entity Task {
          property required id: string
          command assign(userId: string, role: string) {
            mutate status = "assigned"
          }
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, { surface: 'openapi.spec' });
      const spec = parseSpec(specResult);

      const requestSchema = spec.components.schemas.TaskAssignRequest;
      expect(requestSchema).toBeDefined();
      expect(requestSchema.type).toBe('object');
      expect(requestSchema.properties.userId).toBeDefined();
      expect(requestSchema.properties.role).toBeDefined();
      expect(requestSchema.required).toContain('userId');
      expect(requestSchema.required).toContain('role');
    });
  });

  // ========================================================================
  // Error response schemas
  // ========================================================================

  describe('error response schemas', () => {
    it('includes constraint error response schema by default', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, { surface: 'openapi.spec' });
      const spec = parseSpec(specResult);

      expect(spec.components.schemas.ConstraintErrorResponse).toBeDefined();
      expect(spec.components.schemas.GuardFailureResponse).toBeDefined();
      expect(spec.components.schemas.ConcurrencyConflictResponse).toBeDefined();
    });

    it('excludes error schemas when option is false', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, {
        surface: 'openapi.spec',
        options: { includeConstraintErrors: false },
      });
      const spec = parseSpec(specResult);

      expect(spec.components.schemas.ConstraintErrorResponse).toBeUndefined();
      expect(spec.components.schemas.GuardFailureResponse).toBeUndefined();
    });

    it('includes 422 and 409 responses for entity operations', () => {
      const ir = makeMinimalIR({
        entities: [{
          name: 'Recipe',
          properties: [
            { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
            { name: 'status', type: { name: 'string', nullable: false }, defaultValue: { kind: 'string', value: 'draft' }, modifiers: [] },
          ],
          computedProperties: [],
          relationships: [],
          commands: ['publish'],
          constraints: [],
          policies: [],
        }],
        commands: [{
          name: 'publish',
          entity: 'Recipe',
          parameters: [],
          guards: [
            { kind: 'binary', operator: '==', left: { kind: 'member', object: { kind: 'identifier', name: 'self' }, property: 'status' }, right: { kind: 'literal', value: { kind: 'string', value: 'draft' } } },
          ],
          actions: [
            { kind: 'mutate', target: 'self.status', expression: { kind: 'literal', value: { kind: 'string', value: 'published' } } },
          ],
          emits: [],
        }],
      });

      const specResult = projection.generate(ir, { surface: 'openapi.spec' });
      const spec = parseSpec(specResult);

      const postOp = spec.paths['/api/recipe/publish'].post;
      expect(postOp.responses['422']).toBeDefined();
      expect(postOp.responses['422'].content['application/json'].schema.$ref)
        .toBe('#/components/schemas/ConstraintErrorResponse');
      expect(postOp.responses['409']).toBeDefined();
      expect(postOp.responses['409'].content['application/json'].schema.$ref)
        .toBe('#/components/schemas/GuardFailureResponse');
    });

    it('includes 401, 403, 500 error responses', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, { surface: 'openapi.spec' });
      const spec = parseSpec(specResult);

      const listOp = spec.paths['/api/recipe/list'].get;
      expect(listOp.responses['401']).toBeDefined();
      expect(listOp.responses['403']).toBeDefined();
      expect(listOp.responses['500']).toBeDefined();
    });

    it('constraint error schema has correct structure', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, { surface: 'openapi.spec' });
      const spec = parseSpec(specResult);

      const errSchema = spec.components.schemas.ConstraintErrorResponse;
      expect(errSchema.type).toBe('object');
      expect(errSchema.properties.error).toBeDefined();
      expect(errSchema.properties.error.type).toBe('object');
      expect(errSchema.properties.error.properties.constraintViolations).toBeDefined();
      expect(errSchema.properties.error.properties.constraintViolations.type).toBe('array');
      expect(errSchema.required).toContain('error');
    });
  });

  // ========================================================================
  // Security schemes
  // ========================================================================

  describe('security schemes', () => {
    it('includes security schemes in components', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, {
        surface: 'openapi.spec',
        options: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
          },
        },
      });
      const spec = parseSpec(specResult);

      expect(spec.components.securitySchemes).toBeDefined();
      expect(spec.components.securitySchemes.bearerAuth.type).toBe('http');
      expect(spec.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
    });

    it('applies security to operations for entities with policies', async () => {
      const source = `
        entity Recipe {
          property required id: string
          policy canView read: true
          policy canEdit write: user.role == "chef"
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, {
        surface: 'openapi.spec',
        options: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
            },
          },
        },
      });
      const spec = parseSpec(specResult);

      const listOp = spec.paths['/api/recipe/list'].get;
      expect(listOp.security).toBeDefined();
      expect(listOp.security[0]).toHaveProperty('bearerAuth');
    });

    it('applies global security when provided', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, {
        surface: 'openapi.spec',
        options: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer' },
          },
          security: [{ ref: 'bearerAuth' }],
        },
      });
      const spec = parseSpec(specResult);

      expect(spec.security).toBeDefined();
      expect(spec.security[0]).toHaveProperty('bearerAuth');
    });

    it('skips operation security when includeAuth is false', async () => {
      const source = `
        entity Recipe {
          property id: string
          policy canView read: true
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, {
        surface: 'openapi.spec',
        options: {
          includeAuth: false,
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer' },
          },
        },
      });
      const spec = parseSpec(specResult);

      const listOp = spec.paths['/api/recipe/list'].get;
      expect(listOp.security).toBeUndefined();
    });
  });

  // ========================================================================
  // Tags and operation metadata
  // ========================================================================

  describe('tags and operation metadata', () => {
    it('tags operations by entity name', async () => {
      const source = `
        entity Recipe { property id: string }
        entity Ingredient { property id: string }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, { surface: 'openapi.spec' });
      const spec = parseSpec(specResult);

      expect(spec.paths['/api/recipe/list'].get.tags).toContain('Recipe');
      expect(spec.paths['/api/ingredient/list'].get.tags).toContain('Ingredient');
    });

    it('includes command guard info in description', async () => {
      const source = `
        entity Task {
          property required id: string
          property status: string = "pending"
          command complete() {
            guard self.status == "in_progress"
            mutate status = "completed"
          }
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, { surface: 'openapi.spec' });
      const spec = parseSpec(specResult);

      const postOp = spec.paths['/api/task/complete'].post;
      expect(postOp.description).toContain('Guards');
      expect(postOp.description).toContain('1 guard');
    });
  });

  // ========================================================================
  // Determinism
  // ========================================================================

  describe('determinism', () => {
    it('produces identical output for identical IR', () => {
      const ir = makeMinimalIR({
        entities: [
          {
            name: 'Recipe',
            properties: [
              { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
              { name: 'name', type: { name: 'string', nullable: false }, modifiers: [] },
            ],
            computedProperties: [],
            relationships: [],
            commands: [],
            constraints: [],
            policies: [],
          },
          {
            name: 'Ingredient',
            properties: [
              { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
              { name: 'name', type: { name: 'string', nullable: false }, modifiers: [] },
            ],
            computedProperties: [],
            relationships: [],
            commands: [],
            constraints: [],
            policies: [],
          },
        ],
        commands: [{
          name: 'publish',
          entity: 'Recipe',
          parameters: [],
          guards: [],
          actions: [
            { kind: 'mutate', target: 'self.status', expression: { kind: 'literal', value: { kind: 'string', value: 'published' } } },
          ],
          emits: [],
        }],
      });

      const result1 = projection.generate(ir, { surface: 'openapi.spec' });
      const result2 = projection.generate(ir, { surface: 'openapi.spec' });

      expect(firstCode(result1)).toBe(firstCode(result2));
    });

    it('sorts entities and commands deterministically', async () => {
      const source = `
        entity Zebra { property id: string }
        entity Alpha { property id: string }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, { surface: 'openapi.spec' });
      const spec = parseSpec(specResult);

      const pathKeys = Object.keys(spec.paths);
      const alphaIdx = pathKeys.findIndex(k => k.includes('alpha'));
      const zebraIdx = pathKeys.findIndex(k => k.includes('zebra'));
      expect(alphaIdx).toBeLessThan(zebraIdx);
    });
  });

  // ========================================================================
  // Edge cases
  // ========================================================================

  describe('edge cases', () => {
    it('handles empty IR', () => {
      const ir = makeMinimalIR();
      const specResult = projection.generate(ir, { surface: 'openapi.spec' });
      const spec = parseSpec(specResult);

      expect(spec.openapi).toBe('3.1.0');
      expect(spec.paths).toEqual({});
      // Error response schemas are still generated for empty IR
      expect(spec.components.schemas.ConstraintErrorResponse).toBeDefined();
      expect(spec.components.schemas.GuardFailureResponse).toBeDefined();
    });

    it('returns error for unknown surface', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'unknown.surface' });

      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].severity).toBe('error');
      expect(result.diagnostics[0].code).toBe('UNKNOWN_SURFACE');
    });

    it('handles entity with no properties', async () => {
      const source = `entity Empty { }`;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, { surface: 'openapi.spec' });
      const spec = parseSpec(specResult);

      const emptySchema = spec.components.schemas.Empty;
      expect(emptySchema).toBeDefined();
      expect(emptySchema.type).toBe('object');
      expect(emptySchema.properties).toEqual({});
    });

    it('handles command with no parameters', async () => {
      const source = `
        entity Task {
          property required id: string
          command complete() {
            mutate status = "completed"
          }
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, { surface: 'openapi.spec' });
      const spec = parseSpec(specResult);

      const postOp = spec.paths['/api/task/complete'].post;
      expect(postOp.requestBody).toBeDefined();
      const bodySchema = postOp.requestBody.content['application/json'].schema;
      expect(bodySchema.type).toBe('object');
    });
  });

  // ========================================================================
  // Artifact metadata
  // ========================================================================

  describe('artifact metadata', () => {
    it('returns correct artifact id, pathHint, and contentType', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, { surface: 'openapi.spec' });
      expect(specResult.artifacts).toHaveLength(1);

      const artifact = specResult.artifacts[0];
      expect(artifact.id).toBe('openapi.spec');
      expect(artifact.pathHint).toBe('openapi.json');
      expect(artifact.contentType).toBe('json');
    });

    it('produces valid JSON output', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const specResult = projection.generate(result.ir!, { surface: 'openapi.spec' });
      const code = firstCode(specResult);

      // Should parse without error
      expect(() => JSON.parse(code)).not.toThrow();
    });
  });
});
