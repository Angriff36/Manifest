/**
 * Tests for the Dart/Flutter projection.
 *
 * Verifies that entity models, command models, client SDK, and
 * state management providers are generated correctly from IR.
 */

import { describe, it, expect } from 'vitest';
import type {
  IR,
  IREntity,
  IRCommand,
  IREnum,
  IRProperty,
} from '../../ir';
import { DartProjection } from './generator';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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

function makeProperty(
  name: string,
  typeName: string,
  opts: { nullable?: boolean; required?: boolean; defaultValue?: IRProperty['defaultValue'] } = {},
): IRProperty {
  return {
    name,
    type: { name: typeName, nullable: opts.nullable ?? false },
    modifiers: opts.required === false ? [] : ['required'],
    defaultValue: opts.defaultValue,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DartProjection', () => {
  const projection = new DartProjection();

  describe('projection metadata', () => {
    it('has correct name and description', () => {
      expect(projection.name).toBe('dart');
      expect(projection.description).toContain('Dart');
    });

    it('declares all expected surfaces', () => {
      expect(projection.surfaces).toContain('dart.entity');
      expect(projection.surfaces).toContain('dart.command');
      expect(projection.surfaces).toContain('dart.models');
      expect(projection.surfaces).toContain('dart.client');
      expect(projection.surfaces).toContain('dart.providers');
      expect(projection.surfaces).toContain('dart.package');
    });
  });

  describe('dart.entity surface', () => {
    it('generates a simple entity model with fromJson/toJson', () => {
      const entity: IREntity = {
        name: 'Task',
        properties: [
          makeProperty('id', 'string', { required: true }),
          makeProperty('title', 'string', { required: true }),
        ],
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [],
        policies: [],
      };

      const ir = makeIR({ entities: [entity] });
      const result = projection.generate(ir, { surface: 'dart.entity' });

      expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].id).toBe('dart.entity.Task');
      expect(result.artifacts[0].contentType).toBe('dart');

      const code = result.artifacts[0].code;
      expect(code).toContain('class Task');
      expect(code).toContain('final String id');
      expect(code).toContain('final String title');
      expect(code).toContain('factory Task.fromJson');
      expect(code).toContain('Map<String, dynamic> toJson()');
    });

    it('generates entity with nullable properties', () => {
      const entity: IREntity = {
        name: 'User',
        properties: [
          makeProperty('id', 'string', { required: true }),
          makeProperty('email', 'string', { required: true }),
          makeProperty('avatar', 'string', { nullable: true, required: false }),
        ],
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [],
        policies: [],
      };

      const ir = makeIR({ entities: [entity] });
      const result = projection.generate(ir, { surface: 'dart.entity', entity: 'User' });

      const code = result.artifacts[0].code;
      expect(code).toContain('final String? avatar');
      expect(code).toContain("json['avatar'] != null");
    });

    it('generates entity with numeric and boolean types', () => {
      const entity: IREntity = {
        name: 'Product',
        properties: [
          makeProperty('id', 'string', { required: true }),
          makeProperty('price', 'decimal', { required: true }),
          makeProperty('quantity', 'int', { required: true }),
          makeProperty('inStock', 'bool', { required: true }),
        ],
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [],
        policies: [],
      };

      const ir = makeIR({ entities: [entity] });
      const result = projection.generate(ir, { surface: 'dart.entity' });

      const code = result.artifacts[0].code;
      expect(code).toContain('final String price');
      expect(code).toContain('final int quantity');
      expect(code).toContain('final bool inStock');
    });

    it('generates entity with array and map types', () => {
      const entity: IREntity = {
        name: 'Document',
        properties: [
          makeProperty('id', 'string', { required: true }),
          {
            name: 'tags',
            type: { name: 'array', nullable: false, generic: { name: 'string', nullable: false } },
            modifiers: ['required'],
          },
          {
            name: 'metadata',
            type: { name: 'map', nullable: false, generic: { name: 'string', nullable: false } },
            modifiers: ['required'],
          },
        ],
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [],
        policies: [],
      };

      const ir = makeIR({ entities: [entity] });
      const result = projection.generate(ir, { surface: 'dart.entity' });

      const code = result.artifacts[0].code;
      expect(code).toContain('List<String>');
      expect(code).toContain('Map<String, String>');
    });

    it('generates entity with DateTime parsing', () => {
      const entity: IREntity = {
        name: 'Event',
        properties: [
          makeProperty('id', 'string', { required: true }),
          makeProperty('scheduledAt', 'datetime', { required: true }),
        ],
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [],
        policies: [],
      };

      const ir = makeIR({ entities: [entity] });
      const result = projection.generate(ir, { surface: 'dart.entity' });

      const code = result.artifacts[0].code;
      expect(code).toContain('final DateTime scheduledAt');
      expect(code).toContain('DateTime.parse(');
    });

    it('generates validator methods from constraints', () => {
      const entity: IREntity = {
        name: 'Item',
        properties: [
          makeProperty('id', 'string', { required: true }),
          makeProperty('name', 'string', { required: true }),
          makeProperty('price', 'int', { required: true }),
        ],
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [
          {
            name: 'priceRange',
            code: 'PRICE_RANGE',
            expression: {
              kind: 'binary',
              operator: '>=',
              left: { kind: 'member', object: { kind: 'identifier', name: 'self' }, property: 'price' },
              right: { kind: 'literal', value: { kind: 'number', value: 0 } },
            },
            severity: 'block',
            message: 'Price must be >= 0',
          },
        ],
        policies: [],
      };

      const ir = makeIR({ entities: [entity] });
      const result = projection.generate(ir, { surface: 'dart.entity' });

      const code = result.artifacts[0].code;
      expect(code).toContain('String? validate()');
      expect(code).toContain('price');
    });

    it('returns error for unknown entity', () => {
      const ir = makeIR({ entities: [] });
      const result = projection.generate(ir, { surface: 'dart.entity', entity: 'NonExistent' });

      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics[0].code).toBe('DART_ENTITY_NOT_FOUND');
    });
  });

  describe('dart.command surface', () => {
    it('generates command params class with toJson/fromJson', () => {
      const command: IRCommand = {
        name: 'createTask',
        entity: 'Task',
        parameters: [
          { name: 'title', type: { name: 'string', nullable: false }, required: true },
          { name: 'description', type: { name: 'string', nullable: true }, required: false },
        ],
        guards: [],
        actions: [],
        emits: [],
      };

      const ir = makeIR({ commands: [command] });
      const result = projection.generate(ir, { surface: 'dart.command' });

      expect(result.artifacts).toHaveLength(1);
      const code = result.artifacts[0].code;
      expect(code).toContain('class CreateTaskParams');
      expect(code).toContain('final String title');
      expect(code).toContain('final String? description');
      expect(code).toContain('Map<String, dynamic> toJson()');
      expect(code).toContain('factory CreateTaskParams.fromJson');
    });

    it('generates empty params class for command with no parameters', () => {
      const command: IRCommand = {
        name: 'ping',
        parameters: [],
        guards: [],
        actions: [],
        emits: [],
      };

      const ir = makeIR({ commands: [command] });
      const result = projection.generate(ir, { surface: 'dart.command' });

      const code = result.artifacts[0].code;
      expect(code).toContain('class PingParams');
      expect(code).toContain('const PingParams()');
    });

    it('generates return type class for command with return type', () => {
      const command: IRCommand = {
        name: 'getCount',
        parameters: [],
        guards: [],
        actions: [],
        emits: [],
        returns: { name: 'int', nullable: false },
      };

      const ir = makeIR({ commands: [command] });
      const result = projection.generate(ir, { surface: 'dart.command' });

      const code = result.artifacts[0].code;
      expect(code).toContain('class GetCountReturn');
      expect(code).toContain('final int value');
    });
  });

  describe('dart.models surface', () => {
    it('generates all entity and command models in one file', () => {
      const entity: IREntity = {
        name: 'Task',
        properties: [
          makeProperty('id', 'string', { required: true }),
          makeProperty('title', 'string', { required: true }),
        ],
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [],
        policies: [],
      };

      const command: IRCommand = {
        name: 'updateTask',
        entity: 'Task',
        parameters: [
          { name: 'id', type: { name: 'string', nullable: false }, required: true },
          { name: 'title', type: { name: 'string', nullable: false }, required: true },
        ],
        guards: [],
        actions: [],
        emits: [],
      };

      const ir = makeIR({ entities: [entity], commands: [command] });
      const result = projection.generate(ir, { surface: 'dart.models' });

      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].id).toBe('dart.models');
      const code = result.artifacts[0].code;
      expect(code).toContain('library manifest_models');
      expect(code).toContain('class Task');
      expect(code).toContain('class UpdateTaskParams');
    });

    it('includes enum models in models surface', () => {
      const enumDef: IREnum = {
        name: 'Status',
        values: [
          { name: 'active' },
          { name: 'inactive' },
        ],
      };

      const ir = makeIR({ enums: [enumDef] });
      const result = projection.generate(ir, { surface: 'dart.models' });

      const code = result.artifacts[0].code;
      expect(code).toContain('enum Status');
      expect(code).toContain("active('active')");
      expect(code).toContain("inactive('inactive')");
      expect(code).toContain('static Status fromString');
    });
  });

  describe('dart.client surface', () => {
    it('generates Dio-based client with CRUD methods', () => {
      const entity: IREntity = {
        name: 'Task',
        properties: [makeProperty('id', 'string', { required: true })],
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [],
        policies: [],
      };

      const ir = makeIR({ entities: [entity] });
      const result = projection.generate(ir, { surface: 'dart.client' });

      const code = result.artifacts[0].code;
      expect(code).toContain('class ManifestClient');
      expect(code).toContain('final Dio _dio');
      expect(code).toContain("import 'package:dio/dio.dart'");
      expect(code).toContain('Future<List<Task>> listTasks()');
      expect(code).toContain('Future<Task> getTask(String id)');
      expect(code).toContain('Future<void> deleteTask(String id)');
    });

    it('generates command methods in client', () => {
      const entity: IREntity = {
        name: 'Task',
        properties: [makeProperty('id', 'string', { required: true })],
        computedProperties: [],
        relationships: [],
        commands: ['completeTask'],
        constraints: [],
        policies: [],
      };

      const command: IRCommand = {
        name: 'completeTask',
        entity: 'Task',
        parameters: [
          { name: 'id', type: { name: 'string', nullable: false }, required: true },
        ],
        guards: [],
        actions: [],
        emits: [],
      };

      const ir = makeIR({ entities: [entity], commands: [command] });
      const result = projection.generate(ir, { surface: 'dart.client' });

      const code = result.artifacts[0].code;
      expect(code).toContain('Future<void> completeTask(CompleteTaskParams params)');
    });

    it('uses custom base URL and class name from options', () => {
      const ir = makeIR({ entities: [] });
      const result = projection.generate(ir, {
        surface: 'dart.client',
        options: { clientBaseUrl: 'https://api.example.com', clientClassName: 'MyApi' },
      });

      const code = result.artifacts[0].code;
      expect(code).toContain('class MyApi');
      expect(code).toContain("baseUrl ?? 'https://api.example.com'");
    });
  });

  describe('dart.providers surface', () => {
    it('generates Riverpod providers by default', () => {
      const entity: IREntity = {
        name: 'Task',
        properties: [makeProperty('id', 'string', { required: true })],
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [],
        policies: [],
      };

      const ir = makeIR({ entities: [entity] });
      const result = projection.generate(ir, { surface: 'dart.providers' });

      const code = result.artifacts[0].code;
      expect(code).toContain("import 'package:flutter_riverpod/flutter_riverpod.dart'");
      expect(code).toContain('Provider<ManifestClient>');
      expect(code).toContain('FutureProvider<List<Task>>');
      expect(code).toContain('FutureProvider.family<Task, String>');
    });

    it('generates Provider (ChangeNotifier) when configured', () => {
      const entity: IREntity = {
        name: 'Task',
        properties: [makeProperty('id', 'string', { required: true })],
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [],
        policies: [],
      };

      const ir = makeIR({ entities: [entity] });
      const result = projection.generate(ir, {
        surface: 'dart.providers',
        options: { stateManagement: 'provider' },
      });

      const code = result.artifacts[0].code;
      expect(code).toContain("import 'package:provider/provider.dart'");
      expect(code).toContain('class TaskListNotifier extends ChangeNotifier');
      expect(code).toContain('ChangeNotifierProvider');
    });

    it('generates no providers when stateManagement is none', () => {
      const ir = makeIR({ entities: [] });
      const result = projection.generate(ir, {
        surface: 'dart.providers',
        options: { stateManagement: 'none' },
      });

      const code = result.artifacts[0].code;
      expect(code).not.toContain('Provider');
      expect(code).not.toContain('ChangeNotifier');
    });
  });

  describe('dart.package surface', () => {
    it('generates complete package with models, client, and providers', () => {
      const entity: IREntity = {
        name: 'Task',
        properties: [makeProperty('id', 'string', { required: true })],
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [],
        policies: [],
      };

      const ir = makeIR({ entities: [entity] });
      const result = projection.generate(ir, { surface: 'dart.package' });

      const ids = result.artifacts.map(a => a.id);
      expect(ids).toContain('dart.models');
      expect(ids).toContain('dart.client');
      expect(ids).toContain('dart.providers');
    });

    it('generates pubspec.yaml and README when emitPackageFiles is true', () => {
      const ir = makeIR({ entities: [] });
      const result = projection.generate(ir, {
        surface: 'dart.package',
        options: { emitPackageFiles: true, packageName: 'my_app_sdk' },
      });

      const ids = result.artifacts.map(a => a.id);
      expect(ids).toContain('dart.package.pubspec');
      expect(ids).toContain('dart.package.readme');

      const pubspec = result.artifacts.find(a => a.id === 'dart.package.pubspec');
      expect(pubspec?.code).toContain('name: my_app_sdk');
      expect(pubspec?.code).toContain('dio: ^5.4.0');
      expect(pubspec?.code).toContain('flutter_riverpod');
    });
  });

  describe('unknown surface', () => {
    it('returns error diagnostic for unknown surface', () => {
      const ir = makeIR();
      const result = projection.generate(ir, { surface: 'dart.invalid' as 'dart.entity' });

      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics[0].code).toBe('DART_UNKNOWN_SURFACE');
      expect(diagnosticsHasError(result.diagnostics)).toBe(true);
    });
  });

  describe('deterministic output', () => {
    it('produces identical output on repeated calls', () => {
      const entity: IREntity = {
        name: 'Widget',
        properties: [
          makeProperty('id', 'string', { required: true }),
          makeProperty('name', 'string', { required: true }),
        ],
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [],
        policies: [],
      };

      const ir = makeIR({ entities: [entity] });

      // Note: headers include timestamps, so disable headers for this test
      const opts = { emitHeader: false };
      const result1 = projection.generate(ir, { surface: 'dart.entity', options: opts });
      const result2 = projection.generate(ir, { surface: 'dart.entity', options: opts });

      expect(result1.artifacts[0].code).toBe(result2.artifacts[0].code);
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function diagnosticsHasError(diagnostics: ReadonlyArray<{ severity: string }>): boolean {
  return diagnostics.some(d => d.severity === 'error');
}
