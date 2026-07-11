/**
 * End-to-end verification test for the Dart/Flutter projection.
 *
 * Exercises all six surfaces of the DartProjection with a realistic
 * Manifest IR fixture, verifying that the generated Dart code is
 * syntactically and structurally correct.
 */

import { describe, it, expect } from 'vitest';
import type { IR, IREntity, IRCommand } from '../../ir';
import { DartProjection } from './generator';

function makeVerificationIR(): IR {
  const userEntity: IREntity = {
    name: 'User',
    properties: [
      { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      {
        name: 'email',
        type: { name: 'string', nullable: false },
        modifiers: ['required', 'unique'],
      },
      { name: 'name', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      { name: 'age', type: { name: 'int', nullable: true }, modifiers: [] },
    ],
    computedProperties: [],
    relationships: [],
    commands: [],
    constraints: [
      {
        name: 'ageRange',
        code: 'AGE_RANGE',
        expression: {
          kind: 'binary',
          operator: '>=',
          left: { kind: 'member', object: { kind: 'identifier', name: 'self' }, property: 'age' },
          right: { kind: 'literal', value: { kind: 'number', value: 0 } },
        },
        severity: 'block',
        message: 'Age must be >= 0',
      },
    ],
    policies: [],
  };

  const taskEntity: IREntity = {
    name: 'Task',
    properties: [
      { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      { name: 'title', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      { name: 'completed', type: { name: 'bool', nullable: false }, modifiers: [] },
      { name: 'dueDate', type: { name: 'datetime', nullable: true }, modifiers: [] },
    ],
    computedProperties: [],
    relationships: [],
    commands: ['completeTask', 'createTask'],
    constraints: [],
    policies: [],
  };

  const commands: IRCommand[] = [
    {
      name: 'createTask',
      entity: 'Task',
      parameters: [
        { name: 'title', type: { name: 'string', nullable: false }, required: true },
        { name: 'description', type: { name: 'string', nullable: true }, required: false },
      ],
      guards: [],
      actions: [],
      emits: [],
    },
    {
      name: 'completeTask',
      entity: 'Task',
      parameters: [{ name: 'id', type: { name: 'string', nullable: false }, required: true }],
      guards: [],
      actions: [],
      emits: [],
      returns: { name: 'bool', nullable: false },
    },
  ];

  return {
    version: '1.0',
    provenance: {
      contentHash: 'verify-test',
      compilerVersion: 'verify',
      schemaVersion: '1.0',
      compiledAt: '2025-01-01T00:00:00.000Z',
    },
    modules: [],
    values: [],
    entities: [userEntity, taskEntity],
    enums: [],
    stores: [],
    events: [],
    commands,
    policies: [],
  };
}

describe('Dart Projection End-to-End Verification', () => {
  const projection = new DartProjection();
  const ir = makeVerificationIR();

  it('generates valid entity models with fromJson/toJson', () => {
    const result = projection.generate(ir, {
      surface: 'dart.entity',
      options: { emitHeader: false },
    });

    expect(result.artifacts).toHaveLength(2);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);

    // Verify User model
    const userCode = result.artifacts[0].code;
    expect(userCode).toContain('class User');
    expect(userCode).toContain('final String id');
    expect(userCode).toContain('final String email');
    expect(userCode).toContain('final int? age');
    expect(userCode).toContain('factory User.fromJson');
    expect(userCode).toContain("json['id'] as String");
    expect(userCode).toContain("json['email'] as String");
    expect(userCode).toContain("json['age'] != null ? json['age'] as int : null");
    expect(userCode).toContain('Map<String, dynamic> toJson()');
    expect(userCode).toContain("'id': id");
    expect(userCode).toContain("'email': email");
    // Validator from constraint
    expect(userCode).toContain('String? validate()');
    expect(userCode).toContain('age');

    // Verify Task model
    const taskCode = result.artifacts[1].code;
    expect(taskCode).toContain('class Task');
    expect(taskCode).toContain('final bool? completed');
    expect(taskCode).toContain('final DateTime? dueDate');
    expect(taskCode).toContain("DateTime.parse(json['dueDate']");
  });

  it('generates command models with params and return types', () => {
    const result = projection.generate(ir, {
      surface: 'dart.command',
      options: { emitHeader: false },
    });

    expect(result.artifacts).toHaveLength(2);

    // createTask params
    const createCode = result.artifacts[0].code;
    expect(createCode).toContain('class CreateTaskParams');
    expect(createCode).toContain('final String title');
    expect(createCode).toContain('final String? description');
    expect(createCode).toContain('factory CreateTaskParams.fromJson');

    // completeTask params + return
    const completeCode = result.artifacts[1].code;
    expect(completeCode).toContain('class CompleteTaskParams');
    expect(completeCode).toContain('class CompleteTaskReturn');
    expect(completeCode).toContain('final bool value');
  });

  it('generates a complete Dio-based HTTP client', () => {
    const result = projection.generate(ir, {
      surface: 'dart.client',
      options: { emitHeader: false },
    });

    const code = result.artifacts[0].code;
    expect(code).toContain('class ManifestClient');
    expect(code).toContain("import 'package:dio/dio.dart'");
    expect(code).toContain('final Dio _dio');
    expect(code).toContain('final String baseUrl');

    // CRUD methods for both entities
    expect(code).toContain('Future<List<User>> listUsers()');
    expect(code).toContain('Future<User> getUser(String id)');
    expect(code).toContain('Future<void> deleteUser(String id)');
    expect(code).toContain('Future<List<Task>> listTasks()');
    expect(code).toContain('Future<Task> getTask(String id)');

    // Command methods
    expect(code).toContain('Future<void> createTask(CreateTaskParams params)');
    expect(code).toContain('Future<CompleteTaskReturn> completeTask(CompleteTaskParams params)');
  });

  it('generates Riverpod providers by default', () => {
    const result = projection.generate(ir, {
      surface: 'dart.providers',
      options: { emitHeader: false },
    });

    const code = result.artifacts[0].code;
    expect(code).toContain("import 'package:flutter_riverpod/flutter_riverpod.dart'");
    expect(code).toContain('Provider<ManifestClient>');
    expect(code).toContain('FutureProvider<List<User>>');
    expect(code).toContain('FutureProvider.family<User, String>');
    expect(code).toContain('FutureProvider<List<Task>>');
  });

  it('generates Provider (ChangeNotifier) when configured', () => {
    const result = projection.generate(ir, {
      surface: 'dart.providers',
      options: { stateManagement: 'provider', emitHeader: false },
    });

    const code = result.artifacts[0].code;
    expect(code).toContain("import 'package:provider/provider.dart'");
    expect(code).toContain('class UserListNotifier extends ChangeNotifier');
    expect(code).toContain('class TaskListNotifier extends ChangeNotifier');
    expect(code).toContain('ChangeNotifierProvider');
  });

  it('generates a complete package with pubspec.yaml', () => {
    const result = projection.generate(ir, {
      surface: 'dart.package',
      options: { emitPackageFiles: true, packageName: 'my_app_sdk', emitHeader: false },
    });

    const ids = result.artifacts.map((a) => a.id);
    expect(ids).toContain('dart.models');
    expect(ids).toContain('dart.client');
    expect(ids).toContain('dart.providers');
    expect(ids).toContain('dart.package.pubspec');
    expect(ids).toContain('dart.package.readme');

    const pubspec = result.artifacts.find((a) => a.id === 'dart.package.pubspec');
    expect(pubspec?.code).toContain('name: my_app_sdk');
    expect(pubspec?.code).toContain('dio: ^5.4.0');
    expect(pubspec?.code).toContain('flutter_riverpod');

    const readme = result.artifacts.find((a) => a.id === 'dart.package.readme');
    expect(readme?.code).toContain('my_app_sdk');
    expect(readme?.code).toContain('ManifestClient');
  });

  it('respects custom client class name and base URL', () => {
    const result = projection.generate(ir, {
      surface: 'dart.client',
      options: {
        clientClassName: 'MyAPIClient',
        clientBaseUrl: 'https://api.example.com',
        emitHeader: false,
      },
    });

    const code = result.artifacts[0].code;
    expect(code).toContain('class MyAPIClient');
    expect(code).toContain("baseUrl ?? 'https://api.example.com'");
  });

  it('produces deterministic output', () => {
    const result1 = projection.generate(ir, {
      surface: 'dart.entity',
      options: { emitHeader: false },
    });
    const result2 = projection.generate(ir, {
      surface: 'dart.entity',
      options: { emitHeader: false },
    });

    expect(result1.artifacts[0].code).toBe(result2.artifacts[0].code);
    expect(result1.artifacts[1].code).toBe(result2.artifacts[1].code);
  });
});
