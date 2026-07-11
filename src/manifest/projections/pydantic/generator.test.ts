/**
 * Tests for Pydantic v2 projection
 */

import { describe, expect, it } from 'vitest';
import { PydanticProjection } from './generator';
import type { IR } from '../../ir';

/** Build a minimal valid IR skeleton with sensible defaults for unspecified fields. */
function makeIR(partial: Partial<IR> = {}): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'test-hash',
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
    ...partial,
  };
}

describe('PydanticProjection', () => {
  const projection = new PydanticProjection();

  describe('projection metadata', () => {
    it('should have correct name and description', () => {
      expect(projection.name).toBe('pydantic');
      expect(projection.description).toContain('Pydantic v2');
    });

    it('should declare correct surfaces', () => {
      expect(projection.surfaces).toEqual([
        'pydantic.entity',
        'pydantic.command',
        'pydantic.models',
        'pydantic.client',
      ]);
    });
  });

  describe('pydantic.entity surface', () => {
    it('should generate a simple entity model', () => {
      const ir: IR = makeIR({
        entities: [
          {
            name: 'User',
            properties: [
              {
                name: 'id',
                type: { name: 'uuid', nullable: false },
                modifiers: ['required', 'unique'],
              },
              {
                name: 'email',
                type: { name: 'string', nullable: false },
                modifiers: ['required'],
              },
              {
                name: 'age',
                type: { name: 'int', nullable: true },
                modifiers: [],
              },
            ],
            computedProperties: [],
            relationships: [],
            constraints: [],
            commands: [],
            policies: [],
          },
        ],
        commands: [],
      });

      const result = projection.generate(ir, {
        surface: 'pydantic.entity',
        entity: 'User',
      });

      expect(result.diagnostics).toHaveLength(0);
      expect(result.artifacts).toHaveLength(1);

      const artifact = result.artifacts[0];
      expect(artifact.id).toBe('pydantic.entity.User');
      expect(artifact.pathHint).toBe('models/User.py');
      expect(artifact.contentType).toBe('python');

      const code = artifact.code;
      expect(code).toContain('class User(BaseModel):');
      expect(code).toContain('id: UUID');
      expect(code).toContain('email: str');
      expect(code).toContain('age: int | None = None');
      expect(code).toContain('from uuid import UUID');
      expect(code).toContain('from pydantic import BaseModel');
    });

    it('should handle optional properties with defaults', () => {
      const ir: IR = makeIR({
        entities: [
          {
            name: 'Product',
            properties: [
              {
                name: 'name',
                type: { name: 'string', nullable: false },
                modifiers: ['required'],
              },
              {
                name: 'price',
                type: { name: 'decimal', nullable: false },
                modifiers: [],
                defaultValue: { kind: 'number', value: 0 },
              },
              {
                name: 'description',
                type: { name: 'text', nullable: true },
                modifiers: [],
              },
            ],
            computedProperties: [],
            relationships: [],
            constraints: [],
            commands: [],
            policies: [],
          },
        ],
        commands: [],
      });

      const result = projection.generate(ir, {
        surface: 'pydantic.entity',
        entity: 'Product',
      });

      expect(result.diagnostics).toHaveLength(0);
      const code = result.artifacts[0].code;

      expect(code).toContain('price: Decimal = 0');
      expect(code).toContain('description: str | None = None');
      expect(code).toContain('from decimal import Decimal');
    });

    it('should generate field validators from constraints', () => {
      const ir: IR = makeIR({
        entities: [
          {
            name: 'Person',
            properties: [
              {
                name: 'age',
                type: { name: 'int', nullable: false },
                modifiers: ['required'],
              },
              {
                name: 'username',
                type: { name: 'string', nullable: false },
                modifiers: ['required'],
              },
            ],
            computedProperties: [],
            relationships: [],
            constraints: [
              {
                name: 'age_range',
                code: 'age_range',
                severity: 'block',
                expression: {
                  kind: 'call',
                  callee: { kind: 'identifier', name: 'between' },
                  args: [
                    { kind: 'identifier', name: 'age' },
                    { kind: 'literal', value: { kind: 'number', value: 0 } },
                    { kind: 'literal', value: { kind: 'number', value: 120 } },
                  ],
                },
              },
              {
                name: 'username_length',
                code: 'username_length',
                severity: 'block',
                expression: {
                  kind: 'binary',
                  operator: '<=',
                  left: {
                    kind: 'call',
                    callee: { kind: 'identifier', name: 'length' },
                    args: [{ kind: 'identifier', name: 'username' }],
                  },
                  right: { kind: 'literal', value: { kind: 'number', value: 20 } },
                },
              },
            ],
            commands: [],
            policies: [],
          },
        ],
        commands: [],
      });

      const result = projection.generate(ir, {
        surface: 'pydantic.entity',
        entity: 'Person',
      });

      expect(result.diagnostics).toHaveLength(0);
      const code = result.artifacts[0].code;

      // Check for numeric range validator
      expect(code).toContain('@field_validator');
      expect(code).toContain('validate_age');
      expect(code).toContain('between 0 and 120');

      // Check for length validator
      expect(code).toContain('validate_username_length');
      expect(code).toContain('length must be at most 20');
    });

    it('should generate computed properties with @computed_field', () => {
      const ir: IR = makeIR({
        entities: [
          {
            name: 'Invoice',
            properties: [
              {
                name: 'subtotal',
                type: { name: 'decimal', nullable: false },
                modifiers: ['required'],
              },
              {
                name: 'taxRate',
                type: { name: 'float', nullable: false },
                modifiers: ['required'],
              },
            ],
            computedProperties: [
              {
                name: 'total',
                type: { name: 'decimal', nullable: false },
                expression: {
                  kind: 'binary',
                  operator: '*',
                  left: { kind: 'identifier', name: 'subtotal' },
                  right: { kind: 'identifier', name: 'taxRate' },
                },
                dependencies: ['subtotal', 'taxRate'],
              },
            ],
            relationships: [],
            constraints: [],
            commands: [],
            policies: [],
          },
        ],
        commands: [],
      });

      const result = projection.generate(ir, {
        surface: 'pydantic.entity',
        entity: 'Invoice',
        options: { emitComputedFields: true },
      });

      expect(result.diagnostics).toHaveLength(0);
      const code = result.artifacts[0].code;

      expect(code).toContain('@computed_field');
      expect(code).toContain('@property');
      expect(code).toContain('def total(self)');
      expect(code).toContain('from pydantic import computed_field');
    });

    it('should handle array and map types', () => {
      const ir: IR = makeIR({
        entities: [
          {
            name: 'Blog',
            properties: [
              {
                name: 'tags',
                type: {
                  name: 'array',
                  nullable: false,
                  generic: { name: 'string', nullable: false },
                },
                modifiers: [],
              },
              {
                name: 'metadata',
                type: {
                  name: 'map',
                  nullable: false,
                  generic: { name: 'string', nullable: false },
                },
                modifiers: [],
              },
            ],
            computedProperties: [],
            relationships: [],
            constraints: [],
            commands: [],
            policies: [],
          },
        ],
        commands: [],
      });

      const result = projection.generate(ir, {
        surface: 'pydantic.entity',
        entity: 'Blog',
      });

      expect(result.diagnostics).toHaveLength(0);
      const code = result.artifacts[0].code;

      expect(code).toContain('tags: list[str]');
      expect(code).toContain('metadata: dict[str, str]');
    });

    it('should return error for non-existent entity', () => {
      const ir: IR = makeIR({
        entities: [],
        commands: [],
      });

      const result = projection.generate(ir, {
        surface: 'pydantic.entity',
        entity: 'NonExistent',
      });

      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].severity).toBe('error');
      expect(result.diagnostics[0].code).toBe('PYDANTIC_ENTITY_NOT_FOUND');
    });
  });

  describe('pydantic.command surface', () => {
    it('should generate command parameter models', () => {
      const ir: IR = makeIR({
        entities: [],
        commands: [
          {
            name: 'createUser',
            entity: 'User',
            parameters: [
              {
                name: 'email',
                type: { name: 'string', nullable: false },
                required: true,
              },
              {
                name: 'name',
                type: { name: 'string', nullable: true },
                required: false,
              },
            ],
            guards: [],
            actions: [],
            emits: [],
          },
        ],
      });

      const result = projection.generate(ir, {
        surface: 'pydantic.command',
        command: 'createUser',
      });

      expect(result.diagnostics).toHaveLength(0);
      expect(result.artifacts).toHaveLength(1);

      const code = result.artifacts[0].code;
      expect(code).toContain('class CreateUserParams(BaseModel):');
      expect(code).toContain('email: str');
      expect(code).toContain('name: str | None = None');
    });

    it('should generate command return type models', () => {
      const ir: IR = makeIR({
        entities: [],
        commands: [
          {
            name: 'getUser',
            entity: 'User',
            parameters: [],
            guards: [],
            actions: [],
            emits: [],
            returns: { name: 'object', nullable: false },
          },
        ],
      });

      const result = projection.generate(ir, {
        surface: 'pydantic.command',
        command: 'getUser',
      });

      expect(result.diagnostics).toHaveLength(0);
      const code = result.artifacts[0].code;

      expect(code).toContain('class GetUserReturn(BaseModel):');
      expect(code).toContain('value: dict[str, Any]');
    });
  });

  describe('pydantic.models surface', () => {
    it('should generate all models in a single artifact', () => {
      const ir: IR = makeIR({
        entities: [
          {
            name: 'User',
            properties: [
              { name: 'id', type: { name: 'uuid', nullable: false }, modifiers: ['required'] },
            ],
            computedProperties: [],
            relationships: [],
            constraints: [],
            commands: [],
            policies: [],
          },
        ],
        commands: [
          {
            name: 'createUser',
            entity: 'User',
            parameters: [
              { name: 'email', type: { name: 'string', nullable: false }, required: true },
            ],
            guards: [],
            actions: [],
            emits: [],
          },
        ],
      });

      const result = projection.generate(ir, {
        surface: 'pydantic.models',
      });

      expect(result.diagnostics).toHaveLength(0);
      expect(result.artifacts).toHaveLength(1);

      const code = result.artifacts[0].code;
      expect(code).toContain('class User(BaseModel):');
      expect(code).toContain('class CreateUserParams(BaseModel):');
      expect(result.artifacts[0].pathHint).toBe('models/manifest_models.py');
    });

    it('should emit JSON schema export when requested', () => {
      const ir: IR = makeIR({
        entities: [
          {
            name: 'Item',
            properties: [
              { name: 'name', type: { name: 'string', nullable: false }, modifiers: ['required'] },
            ],
            computedProperties: [],
            relationships: [],
            constraints: [],
            commands: [],
            policies: [],
          },
        ],
        commands: [],
      });

      const result = projection.generate(ir, {
        surface: 'pydantic.entity',
        entity: 'Item',
        options: { emitJsonSchema: true },
      });

      expect(result.diagnostics).toHaveLength(0);
      const code = result.artifacts[0].code;

      expect(code).toContain('ItemJsonSchema = Item.model_json_schema()');
      expect(code).toContain('class Config:');
    });
  });

  describe('type mapping', () => {
    it('should map all IR types correctly', () => {
      const ir: IR = makeIR({
        entities: [
          {
            name: 'TypeTest',
            properties: [
              { name: 'str_field', type: { name: 'string', nullable: false }, modifiers: [] },
              { name: 'bool_field', type: { name: 'boolean', nullable: false }, modifiers: [] },
              { name: 'int_field', type: { name: 'int', nullable: false }, modifiers: [] },
              { name: 'float_field', type: { name: 'float', nullable: false }, modifiers: [] },
              { name: 'decimal_field', type: { name: 'decimal', nullable: false }, modifiers: [] },
              { name: 'date_field', type: { name: 'date', nullable: false }, modifiers: [] },
              {
                name: 'datetime_field',
                type: { name: 'datetime', nullable: false },
                modifiers: [],
              },
              { name: 'uuid_field', type: { name: 'uuid', nullable: false }, modifiers: [] },
              { name: 'email_field', type: { name: 'email', nullable: false }, modifiers: [] },
              { name: 'url_field', type: { name: 'url', nullable: false }, modifiers: [] },
              { name: 'bytes_field', type: { name: 'bytes', nullable: false }, modifiers: [] },
              { name: 'json_field', type: { name: 'json', nullable: false }, modifiers: [] },
            ],
            computedProperties: [],
            relationships: [],
            constraints: [],
            commands: [],
            policies: [],
          },
        ],
        commands: [],
      });

      const result = projection.generate(ir, {
        surface: 'pydantic.entity',
        entity: 'TypeTest',
      });

      expect(result.diagnostics).toHaveLength(0);
      const code = result.artifacts[0].code;

      // Check all type mappings
      expect(code).toContain('str_field: str');
      expect(code).toContain('bool_field: bool');
      expect(code).toContain('int_field: int');
      expect(code).toContain('float_field: float');
      expect(code).toContain('decimal_field: Decimal');
      expect(code).toContain('date_field: date');
      expect(code).toContain('datetime_field: datetime');
      expect(code).toContain('uuid_field: UUID');
      expect(code).toContain('email_field: str');
      expect(code).toContain('url_field: str');
      expect(code).toContain('bytes_field: bytes');
      expect(code).toContain('json_field: dict[str, Any] | Any');

      // Check imports
      expect(code).toContain('from datetime import');
      expect(code).toContain('from uuid import UUID');
      expect(code).toContain('from decimal import Decimal');
      expect(code).toContain('from typing import Any');
    });

    it('should generate warning for unknown types', () => {
      const ir: IR = makeIR({
        entities: [
          {
            name: 'UnknownTest',
            properties: [
              {
                name: 'unknown_field',
                type: { name: 'foobar_type', nullable: false },
                modifiers: [],
              },
            ],
            computedProperties: [],
            relationships: [],
            constraints: [],
            commands: [],
            policies: [],
          },
        ],
        commands: [],
      });

      const result = projection.generate(ir, {
        surface: 'pydantic.entity',
        entity: 'UnknownTest',
      });

      // Should have a warning diagnostic
      const warningDiagnostics = result.diagnostics.filter((d) => d.severity === 'warning');
      expect(warningDiagnostics.length).toBeGreaterThan(0);

      const warning = warningDiagnostics.find((d) => d.code === 'PYDANTIC_UNKNOWN_TYPE');
      expect(warning).toBeDefined();

      // Code should still generate with Any fallback
      const code = result.artifacts[0].code;
      expect(code).toContain('unknown_field: Any');
    });
  });

  describe('unknown surface', () => {
    it('should return error for unknown surface', () => {
      const ir: IR = makeIR({
        entities: [],
        commands: [],
      });

      const result = projection.generate(ir, {
        surface: 'pydantic.unknown',
      } as any);

      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].severity).toBe('error');
      expect(result.diagnostics[0].code).toBe('PYDANTIC_UNKNOWN_SURFACE');
    });
  });

  describe('pydantic.client surface', () => {
    it('should generate Python client with httpx', () => {
      const ir: IR = makeIR({
        entities: [
          {
            name: 'User',
            properties: [
              { name: 'id', type: { name: 'uuid', nullable: false }, modifiers: ['required'] },
              { name: 'email', type: { name: 'string', nullable: false }, modifiers: ['required'] },
            ],
            computedProperties: [],
            relationships: [],
            constraints: [],
            commands: [],
            policies: [],
          },
        ],
        commands: [
          {
            name: 'createUser',
            entity: 'User',
            parameters: [
              { name: 'email', type: { name: 'string', nullable: false }, required: true },
              { name: 'name', type: { name: 'string', nullable: true }, required: false },
            ],
            guards: [],
            actions: [],
            emits: [],
          },
        ],
      });

      const result = projection.generate(ir, {
        surface: 'pydantic.client',
      });

      expect(result.diagnostics).toHaveLength(0);
      expect(result.artifacts).toHaveLength(1);

      const code = result.artifacts[0].code;
      expect(result.artifacts[0].pathHint).toBe('client/manifest_client.py');
      expect(result.artifacts[0].contentType).toBe('python');

      // Check for client class
      expect(code).toContain('class ManifestClient:');
      expect(code).toContain('async def __aenter__');
      expect(code).toContain('async def __aexit__');

      // Check for httpx import
      expect(code).toContain('import httpx');

      // Check for entity query methods
      expect(code).toContain('async def list_users(self)');
      expect(code).toContain('async def get_user(self, id: str)');

      // Check for command invocation methods
      expect(code).toContain('async def create_user(');
      expect(code).toContain('email: str');
      expect(code).toContain('name: str | None = None');
    });

    it('should generate convenience functions for commands', () => {
      const ir: IR = makeIR({
        entities: [],
        commands: [
          {
            name: 'createPost',
            entity: 'Post',
            parameters: [
              { name: 'title', type: { name: 'string', nullable: false }, required: true },
              { name: 'content', type: { name: 'text', nullable: false }, required: true },
            ],
            guards: [],
            actions: [],
            emits: [],
          },
        ],
      });

      const result = projection.generate(ir, {
        surface: 'pydantic.client',
      });

      expect(result.diagnostics).toHaveLength(0);
      const code = result.artifacts[0].code;

      // Check for convenience function
      expect(code).toContain('async def create_post(');
      expect(code).toContain('base_url: str = "http://localhost:3000"');
      expect(code).toContain('api_key: Optional[str] = None');
      expect(code).toContain('async with ManifestClient(');
    });

    it('should generate enum classes in client', () => {
      const ir: IR = makeIR({
        entities: [],
        commands: [],
        enums: [
          {
            name: 'Status',
            values: [
              { name: 'active', label: 'Active' },
              { name: 'inactive', label: 'Inactive' },
              { name: 'pending', label: 'Pending' },
            ],
          },
        ],
      });

      const result = projection.generate(ir, {
        surface: 'pydantic.client',
      });

      expect(result.diagnostics).toHaveLength(0);
      const code = result.artifacts[0].code;

      // Check for enum class
      expect(code).toContain('class Status(str):');
      expect(code).toContain('Active = "active"');
      expect(code).toContain('Inactive = "inactive"');
      expect(code).toContain('Pending = "pending"');
    });
  });

  describe('pydantic.models with enums', () => {
    it('should generate enum models in pydantic.models surface', () => {
      const ir: IR = makeIR({
        entities: [],
        commands: [],
        enums: [
          {
            name: 'Role',
            module: 'auth',
            values: [
              { name: 'admin', label: 'Administrator' },
              { name: 'user', label: 'Standard User' },
              { name: 'guest', label: 'Guest' },
            ],
          },
        ],
      });

      const result = projection.generate(ir, {
        surface: 'pydantic.models',
      });

      expect(result.diagnostics).toHaveLength(0);
      const code = result.artifacts[0].code;

      // Check for enum class in models
      expect(code).toContain('class Role(str):');
      expect(code).toContain('Admin = "admin"');
      expect(code).toContain('User = "user"');
      expect(code).toContain('Guest = "guest"');
    });
  });
});
