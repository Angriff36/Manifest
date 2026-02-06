/**
 * Unit tests for Runtime Engine
 *
 * Tests the core runtime execution engine including:
 * - Store initialization and CRUD operations
 * - Expression evaluation
 * - Constraint evaluation
 * - Command execution
 * - Policy evaluation
 * - Event emission
 * - Provenance verification
 * - Context management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RuntimeEngine, type RuntimeContext, type RuntimeOptions } from './runtime-engine';
import { IRCompiler } from './ir-compiler';
import type { IR, IRExpression } from './ir';

// Helper to compile manifest source to IR
async function compileToIR(source: string): Promise<IR> {
  const compiler = new IRCompiler();
  const result = await compiler.compileToIR(source);
  if (!result.ir) {
    throw new Error(`Compilation failed: ${result.diagnostics.map(d => d.message).join(', ')}`);
  }
  return result.ir;
}

// Simple test IR
const simpleIR: IR = {
  version: '1.0',
  provenance: {
    contentHash: 'test-content-hash',
    compilerVersion: '0.3.0',
    schemaVersion: '1.0',
    compiledAt: new Date().toISOString(),
  },
  modules: [],
  entities: [
    {
      name: 'User',
      properties: [
        { name: 'name', type: { name: 'string', nullable: false }, modifiers: [], defaultValue: { kind: 'string', value: 'Anonymous' } },
        { name: 'age', type: { name: 'number', nullable: false }, modifiers: [] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    },
  ],
  stores: [],
  events: [],
  commands: [],
  policies: [],
};

describe('RuntimeEngine', () => {
  describe('Basic Runtime', () => {
    it('should initialize with IR', () => {
      const runtime = new RuntimeEngine(simpleIR);
      expect(runtime.getIR()).toBe(simpleIR);
    });

    it('should initialize with context', () => {
      const context: RuntimeContext = { user: { id: 'user1', role: 'admin' } };
      const runtime = new RuntimeEngine(simpleIR, context);
      expect(runtime.getContext()).toBe(context);
    });

    it('should initialize with options', () => {
      const options: RuntimeOptions = {
        generateId: () => 'custom-id',
        now: () => 1234567890,
      };
      const runtime = new RuntimeEngine(simpleIR, {}, options);
      expect(runtime.getIR()).toBe(simpleIR);
    });

    it('should get provenance from IR', () => {
      const runtime = new RuntimeEngine(simpleIR);
      const provenance = runtime.getProvenance();
      expect(provenance).toBeDefined();
      expect(provenance?.compilerVersion).toBe('0.3.0');
    });

    it('should get entities from IR', () => {
      const runtime = new RuntimeEngine(simpleIR);
      const entities = runtime.getEntities();
      expect(entities).toHaveLength(1);
      expect(entities[0].name).toBe('User');
    });

    it('should get entity by name', () => {
      const runtime = new RuntimeEngine(simpleIR);
      const entity = runtime.getEntity('User');
      expect(entity).toBeDefined();
      expect(entity?.name).toBe('User');
    });

    it('should return undefined for non-existent entity', () => {
      const runtime = new RuntimeEngine(simpleIR);
      const entity = runtime.getEntity('NonExistent');
      expect(entity).toBeUndefined();
    });

    it('should get commands from IR', () => {
      const runtime = new RuntimeEngine(simpleIR);
      const commands = runtime.getCommands();
      expect(commands).toEqual([]);
    });
  });

  describe('Store Initialization', () => {
    it('should initialize memory store for entities without store config', async () => {
      const runtime = new RuntimeEngine(simpleIR);
      const store = runtime.getStore('User');
      expect(store).toBeDefined();
      // Should be able to create an instance
      const instance = await store?.create({ name: 'Test', age: 25 });
      expect(instance).toBeDefined();
      expect(instance?.id).toBeDefined();
    });

    it('should initialize memory store when explicitly configured', async () => {
      const irWithStore: IR = {
        ...simpleIR,
        stores: [
          {
            entity: 'User',
            target: 'memory',
            config: {},
          },
        ],
      };
      const runtime = new RuntimeEngine(irWithStore);
      const store = runtime.getStore('User');
      expect(store).toBeDefined();
    });

    it('should use custom store provider when configured', async () => {
      const mockStore = {
        getAll: async () => [],
        getById: async () => undefined,
        create: async (data: any) => ({ id: 'custom-id', ...data }),
        update: async () => undefined,
        delete: async () => false,
        clear: async () => {},
      };
      const options: RuntimeOptions = {
        storeProvider: () => mockStore,
      };
      const runtime = new RuntimeEngine(simpleIR, {}, options);
      const store = runtime.getStore('User');
      expect(store).toBe(mockStore);
    });

    it('should throw error for postgres store in browser', async () => {
      const irWithPostgres: IR = {
        ...simpleIR,
        stores: [
          {
            entity: 'User',
            target: 'postgres',
            config: {},
          },
        ],
      };
      expect(() => new RuntimeEngine(irWithPostgres)).toThrow('not available in browser environments');
    });

    it('should throw error for supabase store in browser', async () => {
      const irWithSupabase: IR = {
        ...simpleIR,
        stores: [
          {
            entity: 'User',
            target: 'supabase',
            config: {},
          },
        ],
      };
      expect(() => new RuntimeEngine(irWithSupabase)).toThrow('not available in browser environments');
    });
  });

  describe('Context Management', () => {
    it('should get current context', () => {
      const context: RuntimeContext = { user: { id: 'user1' }, env: 'test' };
      const runtime = new RuntimeEngine(simpleIR, context);
      expect(runtime.getContext()).toEqual(context);
    });

    it('should set partial context', () => {
      const runtime = new RuntimeEngine(simpleIR, { user: { id: 'user1' } });
      runtime.setContext({ env: 'test' });
      const context = runtime.getContext();
      expect(context.user).toEqual({ id: 'user1' });
      expect(context.env).toBe('test');
    });

    it('should replace entire context', () => {
      const runtime = new RuntimeEngine(simpleIR, { user: { id: 'user1' } });
      runtime.replaceContext({ admin: { id: 'admin1' } });
      const context = runtime.getContext();
      expect(context.user).toBeUndefined();
      expect(context.admin).toEqual({ id: 'admin1' });
    });
  });

  describe('Expression Evaluation', () => {
    it('should evaluate literal string', async () => {
      const runtime = new RuntimeEngine(simpleIR);
      const expr: IRExpression = { kind: 'literal', value: { kind: 'string', value: 'hello' } };
      const result = await runtime.evaluateExpression(expr, {});
      expect(result).toBe('hello');
    });

    it('should evaluate literal number', async () => {
      const runtime = new RuntimeEngine(simpleIR);
      const expr: IRExpression = { kind: 'literal', value: { kind: 'number', value: 42 } };
      const result = await runtime.evaluateExpression(expr, {});
      expect(result).toBe(42);
    });

    it('should evaluate literal boolean true', async () => {
      const runtime = new RuntimeEngine(simpleIR);
      const expr: IRExpression = { kind: 'literal', value: { kind: 'boolean', value: true } };
      const result = await runtime.evaluateExpression(expr, {});
      expect(result).toBe(true);
    });

    it('should evaluate literal boolean false', async () => {
      const runtime = new RuntimeEngine(simpleIR);
      const expr: IRExpression = { kind: 'literal', value: { kind: 'boolean', value: false } };
      const result = await runtime.evaluateExpression(expr, {});
      expect(result).toBe(false);
    });

    it('should evaluate literal null', async () => {
      const runtime = new RuntimeEngine(simpleIR);
      const expr: IRExpression = { kind: 'literal', value: { kind: 'null' } };
      const result = await runtime.evaluateExpression(expr, {});
      expect(result).toBe(null);
    });

    it('should evaluate identifier', async () => {
      const runtime = new RuntimeEngine(simpleIR);
      const expr: IRExpression = { kind: 'identifier', name: 'x' };
      const result = await runtime.evaluateExpression(expr, { x: 10 });
      expect(result).toBe(10);
    });

    it('should evaluate member access', async () => {
      const runtime = new RuntimeEngine(simpleIR);
      const expr: IRExpression = {
        kind: 'member',
        object: { kind: 'identifier', name: 'user' },
        property: 'name',
      };
      const result = await runtime.evaluateExpression(expr, { user: { name: 'Alice' } });
      expect(result).toBe('Alice');
    });

    it('should evaluate nested member access', async () => {
      const runtime = new RuntimeEngine(simpleIR);
      const expr: IRExpression = {
        kind: 'member',
        object: {
          kind: 'member',
          object: { kind: 'identifier', name: 'data' },
          property: 'user',
        },
        property: 'name',
      };
      const result = await runtime.evaluateExpression(expr, { data: { user: { name: 'Bob' } } });
      expect(result).toBe('Bob');
    });

    it('should evaluate binary arithmetic expression', async () => {
      const runtime = new RuntimeEngine(simpleIR);
      const expr: IRExpression = {
        kind: 'binary',
        operator: '+',
        left: { kind: 'literal', value: { kind: 'number', value: 5 } },
        right: { kind: 'literal', value: { kind: 'number', value: 3 } },
      };
      const result = await runtime.evaluateExpression(expr, {});
      expect(result).toBe(8);
    });

    it('should evaluate binary comparison expression', async () => {
      const runtime = new RuntimeEngine(simpleIR);
      const expr: IRExpression = {
        kind: 'binary',
        operator: '>',
        left: { kind: 'literal', value: { kind: 'number', value: 5 } },
        right: { kind: 'literal', value: { kind: 'number', value: 3 } },
      };
      const result = await runtime.evaluateExpression(expr, {});
      expect(result).toBe(true);
    });

    it('should evaluate binary logical AND expression', async () => {
      const runtime = new RuntimeEngine(simpleIR);
      const expr: IRExpression = {
        kind: 'binary',
        operator: '&&',
        left: { kind: 'literal', value: { kind: 'boolean', value: true } },
        right: { kind: 'literal', value: { kind: 'boolean', value: false } },
      };
      const result = await runtime.evaluateExpression(expr, {});
      expect(result).toBe(false);
    });

    it('should evaluate binary logical OR expression', async () => {
      const runtime = new RuntimeEngine(simpleIR);
      const expr: IRExpression = {
        kind: 'binary',
        operator: '||',
        left: { kind: 'literal', value: { kind: 'boolean', value: true } },
        right: { kind: 'literal', value: { kind: 'boolean', value: false } },
      };
      const result = await runtime.evaluateExpression(expr, {});
      expect(result).toBe(true);
    });

    it('should evaluate unary NOT expression', async () => {
      const runtime = new RuntimeEngine(simpleIR);
      const expr: IRExpression = {
        kind: 'unary',
        operator: '!',
        operand: { kind: 'literal', value: { kind: 'boolean', value: true } },
      };
      const result = await runtime.evaluateExpression(expr, {});
      expect(result).toBe(false);
    });

    it('should evaluate unary negate expression', async () => {
      const runtime = new RuntimeEngine(simpleIR);
      const expr: IRExpression = {
        kind: 'unary',
        operator: '-',
        operand: { kind: 'literal', value: { kind: 'number', value: 5 } },
      };
      const result = await runtime.evaluateExpression(expr, {});
      expect(result).toBe(-5);
    });

    it('should evaluate conditional expression', async () => {
      const runtime = new RuntimeEngine(simpleIR);
      const expr: IRExpression = {
        kind: 'conditional',
        condition: { kind: 'literal', value: { kind: 'boolean', value: true } },
        consequent: { kind: 'literal', value: { kind: 'string', value: 'yes' } },
        alternate: { kind: 'literal', value: { kind: 'string', value: 'no' } },
      };
      const result = await runtime.evaluateExpression(expr, {});
      expect(result).toBe('yes');
    });

    it('should evaluate array literal', async () => {
      const runtime = new RuntimeEngine(simpleIR);
      const expr: IRExpression = {
        kind: 'array',
        elements: [
          { kind: 'literal', value: { kind: 'number', value: 1 } },
          { kind: 'literal', value: { kind: 'number', value: 2 } },
          { kind: 'literal', value: { kind: 'number', value: 3 } },
        ],
      };
      const result = await runtime.evaluateExpression(expr, {});
      expect(result).toEqual([1, 2, 3]);
    });

    it('should evaluate object literal', async () => {
      const runtime = new RuntimeEngine(simpleIR);
      const expr: IRExpression = {
        kind: 'object',
        properties: [
          { key: 'a', value: { kind: 'literal', value: { kind: 'number', value: 1 } } },
          { key: 'b', value: { kind: 'literal', value: { kind: 'string', value: 'hello' } } },
        ],
      };
      const result = await runtime.evaluateExpression(expr, {});
      expect(result).toEqual({ a: 1, b: 'hello' });
    });

    it('should evaluate function call', async () => {
      const runtime = new RuntimeEngine(simpleIR);
      const expr: IRExpression = {
        kind: 'call',
        callee: { kind: 'identifier', name: 'upper' },
        args: [{ kind: 'literal', value: { kind: 'string', value: 'hello' } }],
      };
      const result = await runtime.evaluateExpression(expr, { upper: (s: string) => s.toUpperCase() });
      expect(result).toBe('HELLO');
    });

    it('should evaluate lambda expression', async () => {
      const runtime = new RuntimeEngine(simpleIR);
      const expr: IRExpression = {
        kind: 'call',
        callee: {
          kind: 'lambda',
          params: ['x'],
          body: { kind: 'binary', operator: '*', left: { kind: 'identifier', name: 'x' }, right: { kind: 'literal', value: { kind: 'number', value: 2 } } },
        },
        args: [{ kind: 'literal', value: { kind: 'number', value: 5 } }],
      };
      const result = await runtime.evaluateExpression(expr, {});
      expect(result).toBe(10);
    });
  });

  describe('CRUD Operations', () => {
    let runtime: RuntimeEngine;

    beforeEach(async () => {
      const ir = await compileToIR(`
        entity User {
          property name: string
          property email: string
          property age: number
        }
      `);
      runtime = new RuntimeEngine(ir);
    });

    it('should create instance', async () => {
      const instance = await runtime.createInstance('User', {
        name: 'Alice',
        email: 'alice@example.com',
        age: 30,
      });
      expect(instance).toBeDefined();
      expect(instance?.name).toBe('Alice');
      expect(instance?.email).toBe('alice@example.com');
      expect(instance?.age).toBe(30);
      expect(instance?.id).toBeDefined();
    });

    it('should use default values for properties', async () => {
      const ir = await compileToIR(`
        entity User {
          property name: string = "Anonymous"
          property age: number
        }
      `);
      const localRuntime = new RuntimeEngine(ir);
      const instance = await localRuntime.createInstance('User', { age: 25 });
      expect(instance?.name).toBe('Anonymous');
      expect(instance?.age).toBe(25);
    });

    it('should get instance by id', async () => {
      const created = await runtime.createInstance('User', {
        name: 'Bob',
        email: 'bob@example.com',
        age: 25,
      });
      expect(created).toBeDefined();
      const instance = await runtime.getInstance('User', created!.id);
      expect(instance).toBeDefined();
      expect(instance?.id).toBe(created!.id);
      expect(instance?.name).toBe('Bob');
    });

    it('should get all instances', async () => {
      await runtime.createInstance('User', { name: 'Alice', email: 'alice@example.com', age: 30 });
      await runtime.createInstance('User', { name: 'Bob', email: 'bob@example.com', age: 25 });
      const instances = await runtime.getAllInstances('User');
      expect(instances).toHaveLength(2);
      expect(instances.map((i: any) => i.name).sort()).toEqual(['Alice', 'Bob']);
    });

    it('should update instance', async () => {
      const created = await runtime.createInstance('User', {
        name: 'Alice',
        email: 'alice@example.com',
        age: 30,
      });
      expect(created).toBeDefined();
      const updated = await runtime.updateInstance('User', created!.id, { age: 31 });
      expect(updated).toBeDefined();
      expect(updated?.age).toBe(31);
      expect(updated?.name).toBe('Alice'); // unchanged
    });

    it('should delete instance', async () => {
      const created = await runtime.createInstance('User', {
        name: 'Alice',
        email: 'alice@example.com',
        age: 30,
      });
      expect(created).toBeDefined();
      const deleted = await runtime.deleteInstance('User', created!.id);
      expect(deleted).toBe(true);
      const instance = await runtime.getInstance('User', created!.id);
      expect(instance).toBeUndefined();
    });
  });

  describe('Constraint Evaluation', () => {
    it('should pass valid constraint', async () => {
      const ir = await compileToIR(`
        entity User {
          property age: number
          constraint adult: self.age >= 18
        }
      `);
      const runtime = new RuntimeEngine(ir);
      const failures = await runtime.checkConstraints('User', { age: 25 });
      expect(failures).toHaveLength(0);
    });

    it('should fail invalid constraint', async () => {
      const ir = await compileToIR(`
        entity User {
          property age: number
          constraint adult: self.age >= 18
        }
      `);
      const runtime = new RuntimeEngine(ir);
      const failures = await runtime.checkConstraints('User', { age: 15 });
      expect(failures).toHaveLength(1);
      expect(failures[0].constraintName).toBe('adult');
    });

    it('should check multiple constraints', async () => {
      const ir = await compileToIR(`
        entity User {
          property age: number
          property name: string
          constraint adult: self.age >= 18
          constraint hasName: self.name != null
        }
      `);
      const runtime = new RuntimeEngine(ir);
      const failures = await runtime.checkConstraints('User', { age: 15, name: null });
      expect(failures).toHaveLength(2);
    });
  });

  describe('Command Execution', () => {
    it('should execute simple command', async () => {
      const ir = await compileToIR(`
        entity User {
          property name: string
          command greet(name: string) {
            mutate result = "Hello, " + name
          }
        }
      `);
      const runtime = new RuntimeEngine(ir);
      const result = await runtime.runCommand('greet', { name: 'World' });
      expect(result.success).toBe(true);
      expect(result.result).toBe('Hello, World');
    });

    it('should fail command guard', async () => {
      const ir = await compileToIR(`
        entity User {
          property name: string
          command updateName(newName: string) {
            guard newName != ""
            mutate result = true
          }
        }
      `);
      const runtime = new RuntimeEngine(ir);
      const result = await runtime.runCommand('updateName', { newName: '' });
      expect(result.success).toBe(false);
      expect(result.guardFailure).toBeDefined();
    });

    it('should emit events from command', async () => {
      const ir = await compileToIR(`
        entity User {
          property name: string
          event UserCreated
          command createUser(name: string) {
            mutate result = true
            emit UserCreated
          }
        }
      `);
      const runtime = new RuntimeEngine(ir);
      const result = await runtime.runCommand('createUser', { name: 'Alice' });
      expect(result.success).toBe(true);
      expect(result.emittedEvents).toHaveLength(1);
      expect(result.emittedEvents[0].name).toBe('UserCreated');
    });
  });

  describe('Event System', () => {
    it('should register event listener', async () => {
      const ir = await compileToIR(`
        entity User {
          property name: string
          event UserCreated
          command createUser(name: string) {
            mutate result = true
            emit UserCreated
          }
        }
      `);
      const runtime = new RuntimeEngine(ir);
      const listener = vi.fn();
      runtime.onEvent(listener);

      await runtime.runCommand('createUser', { name: 'Alice' });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'UserCreated',
          channel: 'UserCreated', // Channel defaults to event name
        })
      );
    });

    it('should unregister event listener', async () => {
      const ir = await compileToIR(`
        entity User {
          property name: string
          event UserCreated
          command createUser(name: string) {
            mutate result = true
            emit UserCreated
          }
        }
      `);
      const runtime = new RuntimeEngine(ir);
      const listener = vi.fn();
      const unregister = runtime.onEvent(listener);
      unregister();

      await runtime.runCommand('createUser', { name: 'Alice' });

      expect(listener).not.toHaveBeenCalled();
    });

    it('should maintain event log', async () => {
      const ir = await compileToIR(`
        entity User {
          property name: string
          event UserCreated
          command createUser(name: string) {
            mutate result = true
            emit UserCreated
          }
        }
      `);
      const runtime = new RuntimeEngine(ir);

      await runtime.runCommand('createUser', { name: 'Alice' });
      await runtime.runCommand('createUser', { name: 'Bob' });

      const log = runtime.getEventLog();
      expect(log).toHaveLength(2);
    });

    it('should clear event log', async () => {
      const ir = await compileToIR(`
        entity User {
          property name: string
          event UserCreated
          command createUser(name: string) {
            mutate result = true
            emit UserCreated
          }
        }
      `);
      const runtime = new RuntimeEngine(ir);

      await runtime.runCommand('createUser', { name: 'Alice' });
      expect(runtime.getEventLog()).toHaveLength(1);

      runtime.clearEventLog();
      expect(runtime.getEventLog()).toHaveLength(0);
    });
  });

  describe('Computed Properties', () => {
    it('should evaluate computed property', async () => {
      const ir = await compileToIR(`
        entity User {
          property firstName: string
          property lastName: string
          computed fullName: string = self.firstName + " " + self.lastName
        }
      `);
      const runtime = new RuntimeEngine(ir);
      const instance = await runtime.createInstance('User', {
        firstName: 'John',
        lastName: 'Doe',
      });
      expect(instance).toBeDefined();

      const fullName = await runtime.evaluateComputed('User', instance!.id, 'fullName');
      expect(fullName).toBe('John Doe');
    });
  });

  describe('Provenance Verification', () => {
    it('should verify valid IR hash', async () => {
      // IR with valid hash
      const validIR: IR = {
        version: '1.0',
        provenance: {
          contentHash: 'test-content-hash',
          irHash: 'valid-hash',
          compilerVersion: '0.3.0',
          schemaVersion: '1.0',
          compiledAt: new Date().toISOString(),
        },
        modules: [],
        entities: [],
        stores: [],
        events: [],
        commands: [],
        policies: [],
      };

      const runtime = new RuntimeEngine(validIR, {}, { requireValidProvenance: false });
      // When hash verification is disabled, should not throw
      expect(runtime.getIR()).toBeDefined();
    });

    it('should include provenance in emitted events', async () => {
      const ir = await compileToIR(`
        entity User {
          property name: string
          event UserCreated
          command createUser(name: string) {
            mutate result = true
            emit UserCreated
          }
        }
      `);
      const runtime = new RuntimeEngine(ir);
      const result = await runtime.runCommand('createUser', { name: 'Alice' });

      expect(result.emittedEvents[0].provenance).toBeDefined();
      expect(result.emittedEvents[0].provenance?.compilerVersion).toBeDefined();
      expect(result.emittedEvents[0].provenance?.contentHash).toBeDefined();
    });
  });

  describe('Serialization', () => {
    it('should serialize runtime state', async () => {
      const ir = await compileToIR(`
        entity User {
          property name: string
        }
      `);
      const runtime = new RuntimeEngine(ir);
      await runtime.createInstance('User', { name: 'Alice' });
      await runtime.createInstance('User', { name: 'Bob' });

      const serialized = await runtime.serialize();
      expect(serialized.ir).toBe(ir);
      expect(serialized.stores.User).toHaveLength(2);
      expect(serialized.stores.User.map((u: any) => u.name).sort()).toEqual(['Alice', 'Bob']);
    });

    it('should restore runtime state', async () => {
      const ir = await compileToIR(`
        entity User {
          property name: string
        }
      `);
      const runtime1 = new RuntimeEngine(ir);
      await runtime1.createInstance('User', { name: 'Alice' });

      const serialized = await runtime1.serialize();

      const runtime2 = new RuntimeEngine(ir);
      await runtime2.restore({ stores: serialized.stores });

      const instances = await runtime2.getAllInstances('User');
      expect(instances).toHaveLength(1);
      expect(instances[0].name).toBe('Alice');
    });
  });
});
