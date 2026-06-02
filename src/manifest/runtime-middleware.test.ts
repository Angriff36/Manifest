/**
 * Unit tests for Runtime Middleware API
 *
 * Tests the middleware system including:
 * - Middleware hook execution at lifecycle points
 * - Context patch application
 * - Short-circuit behavior
 * - Middleware ordering
 * - All hook types (before-policy, before-guard, before-action, after-emit)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RuntimeEngine, type RuntimeContext, type Middleware, type MiddlewareContext } from './runtime-engine';
import { IRCompiler } from './ir-compiler';
import type { IR } from './ir';

// Helper to compile manifest source to IR
async function compileToIR(source: string): Promise<IR> {
  const compiler = new IRCompiler();
  const result = await compiler.compileToIR(source);
  if (!result.ir) {
    throw new Error(`Compilation failed: ${result.diagnostics.map(d => d.message).join(', ')}`);
  }
  return result.ir;
}

// Simple test program with commands and policies
const testProgram = `
entity Counter {
  property value: number = 0
  property lastUpdated: string = ""

  command increment() {
    mutate value = value + 1
    mutate lastUpdated = "now"
    emit CounterIncremented
  }

  command reset() {
    mutate value = 0
    emit CounterReset
  }

  command setValue(newValue: number) {
    mutate value = newValue
    emit CounterSet
  }
}

store Counter in memory

event CounterIncremented: "counter.incremented" {
  counterId: string
}

event CounterReset: "counter.reset" {
  counterId: string
}

event CounterSet: "counter.set" {
  counterId: string
  newValue: number
}
`;

describe('Runtime Middleware API', () => {
  let ir: IR;
  let testContext: RuntimeContext;

  beforeEach(async () => {
    ir = await compileToIR(testProgram);
    testContext = { user: { id: 'test-user', role: 'admin' } };
  });

  describe('before-policy hook', () => {
    it('should execute middleware before policy evaluation', async () => {
      const hookOrder: string[] = [];
      const middleware: Middleware = {
        hooks: ['before-policy'],
        handler: async (_ctx: MiddlewareContext) => {
          hookOrder.push('before-policy');
          return {};
        },
      };

      const runtime = new RuntimeEngine(ir, testContext, { middleware: [middleware] });
      const result = await runtime.runCommand('increment', {}, { entityName: 'Counter', instanceId: 'test-counter' });

      expect(hookOrder).toEqual(['before-policy']);
      expect(result.success).toBe(true);
    });

    it('should allow middleware to patch evalContext', async () => {
      const middleware: Middleware = {
        hooks: ['before-policy'],
        handler: async (_ctx: MiddlewareContext) => {
          return { contextPatch: { middlewareInjected: true } };
        },
      };

      const runtime = new RuntimeEngine(ir, testContext, { middleware: [middleware] });
      const result = await runtime.runCommand('increment', {}, { entityName: 'Counter', instanceId: 'test-counter' });

      expect(result.success).toBe(true);
    });

    it('should support short-circuit from before-policy', async () => {
      const middleware: Middleware = {
        hooks: ['before-policy'],
        handler: async (_ctx: MiddlewareContext) => {
          return {
            shortCircuit: true,
            result: {
              success: false,
              error: 'Blocked by before-policy middleware',
              emittedEvents: [],
            },
          };
        },
      };

      const runtime = new RuntimeEngine(ir, testContext, { middleware: [middleware] });
      const result = await runtime.runCommand('increment', {}, { entityName: 'Counter', instanceId: 'test-counter' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Blocked by before-policy middleware');
    });
  });

  describe('before-guard hook', () => {
    it('should execute middleware before guard evaluation', async () => {
      const hookOrder: string[] = [];
      const middleware: Middleware = {
        hooks: ['before-guard'],
        handler: async (_ctx: MiddlewareContext) => {
          hookOrder.push('before-guard');
          return {};
        },
      };

      const runtime = new RuntimeEngine(ir, testContext, { middleware: [middleware] });
      const result = await runtime.runCommand('increment', {}, { entityName: 'Counter', instanceId: 'test-counter' });

      expect(hookOrder).toEqual(['before-guard']);
      expect(result.success).toBe(true);
    });

    it('should support short-circuit from before-guard', async () => {
      const middleware: Middleware = {
        hooks: ['before-guard'],
        handler: async (_ctx: MiddlewareContext) => {
          return {
            shortCircuit: true,
            result: {
              success: false,
              error: 'Blocked by before-guard middleware',
              emittedEvents: [],
            },
          };
        },
      };

      const runtime = new RuntimeEngine(ir, testContext, { middleware: [middleware] });
      const result = await runtime.runCommand('increment', {}, { entityName: 'Counter', instanceId: 'test-counter' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Blocked by before-guard middleware');
    });
  });

  describe('before-action hook', () => {
    it('should execute middleware before action execution', async () => {
      const hookOrder: string[] = [];
      const middleware: Middleware = {
        hooks: ['before-action'],
        handler: async (_ctx: MiddlewareContext) => {
          hookOrder.push('before-action');
          return {};
        },
      };

      const runtime = new RuntimeEngine(ir, testContext, { middleware: [middleware] });
      const result = await runtime.runCommand('increment', {}, { entityName: 'Counter', instanceId: 'test-counter' });

      expect(hookOrder).toEqual(['before-action']);
      expect(result.success).toBe(true);
    });

    it('should support short-circuit from before-action', async () => {
      const middleware: Middleware = {
        hooks: ['before-action'],
        handler: async (_ctx: MiddlewareContext) => {
          return {
            shortCircuit: true,
            result: {
              success: false,
              error: 'Blocked by before-action middleware',
              emittedEvents: [],
            },
          };
        },
      };

      const runtime = new RuntimeEngine(ir, testContext, { middleware: [middleware] });
      const result = await runtime.runCommand('increment', {}, { entityName: 'Counter', instanceId: 'test-counter' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Blocked by before-action middleware');
    });
  });

  describe('after-emit hook', () => {
    it('should execute middleware after event emission', async () => {
      const hookOrder: string[] = [];
      const capturedEvents: unknown[] = [];
      const middleware: Middleware = {
        hooks: ['after-emit'],
        handler: async (ctx: MiddlewareContext) => {
          hookOrder.push('after-emit');
          capturedEvents.push(...ctx.emittedEvents);
          return {};
        },
      };

      const runtime = new RuntimeEngine(ir, testContext, { middleware: [middleware] });
      const result = await runtime.runCommand('increment', {}, { entityName: 'Counter', instanceId: 'test-counter' });

      expect(hookOrder).toEqual(['after-emit']);
      expect(capturedEvents.length).toBeGreaterThan(0);
      expect(result.success).toBe(true);
    });

    it('should receive emitted events in context', async () => {
      let capturedEvents: unknown[] = [];
      const middleware: Middleware = {
        hooks: ['after-emit'],
        handler: async (ctx: MiddlewareContext) => {
          capturedEvents = ctx.emittedEvents;
          return {};
        },
      };

      const runtime = new RuntimeEngine(ir, testContext, { middleware: [middleware] });
      const result = await runtime.runCommand('increment', {}, { entityName: 'Counter', instanceId: 'test-counter' });

      expect(result.success).toBe(true);
      expect(capturedEvents.length).toBe(1);
      expect((capturedEvents[0] as { name: string }).name).toBe('CounterIncremented');
    });

    it('should support short-circuit from after-emit', async () => {
      const middleware: Middleware = {
        hooks: ['after-emit'],
        handler: async (_ctx: MiddlewareContext) => {
          return {
            shortCircuit: true,
            result: {
              success: false,
              error: 'Blocked by after-emit middleware',
              emittedEvents: [],
            },
          };
        },
      };

      const runtime = new RuntimeEngine(ir, testContext, { middleware: [middleware] });
      const result = await runtime.runCommand('increment', {}, { entityName: 'Counter', instanceId: 'test-counter' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Blocked by after-emit middleware');
    });
  });

  describe('Middleware ordering', () => {
    it('should execute middleware in declaration order', async () => {
      const executionOrder: string[] = [];
      const middleware1: Middleware = {
        hooks: ['before-policy'],
        handler: async (_ctx: MiddlewareContext) => {
          executionOrder.push('middleware1');
          return {};
        },
      };
      const middleware2: Middleware = {
        hooks: ['before-policy'],
        handler: async (_ctx: MiddlewareContext) => {
          executionOrder.push('middleware2');
          return {};
        },
      };

      const runtime = new RuntimeEngine(ir, testContext, {
        middleware: [middleware1, middleware2],
      });
      await runtime.runCommand('increment', {}, { entityName: 'Counter', instanceId: 'test-counter' });

      expect(executionOrder).toEqual(['middleware1', 'middleware2']);
    });

    it('should stop middleware execution on short-circuit', async () => {
      const executionOrder: string[] = [];
      const middleware1: Middleware = {
        hooks: ['before-policy'],
        handler: async (_ctx: MiddlewareContext) => {
          executionOrder.push('middleware1');
          return {
            shortCircuit: true,
            result: {
              success: false,
              error: 'Short-circuited',
              emittedEvents: [],
            },
          };
        },
      };
      const middleware2: Middleware = {
        hooks: ['before-policy'],
        handler: async (_ctx: MiddlewareContext) => {
          executionOrder.push('middleware2');
          return {};
        },
      };

      const runtime = new RuntimeEngine(ir, testContext, {
        middleware: [middleware1, middleware2],
      });
      await runtime.runCommand('increment', {}, { entityName: 'Counter', instanceId: 'test-counter' });

      expect(executionOrder).toEqual(['middleware1']);
    });
  });

  describe('Multiple hooks', () => {
    it('should execute middleware registered for multiple hooks', async () => {
      const hookOrder: string[] = [];
      const middleware: Middleware = {
        hooks: ['before-policy', 'before-guard', 'before-action', 'after-emit'],
        handler: async (ctx: MiddlewareContext) => {
          hookOrder.push(ctx.hook);
          return {};
        },
      };

      const runtime = new RuntimeEngine(ir, testContext, { middleware: [middleware] });
      await runtime.runCommand('increment', {}, { entityName: 'Counter', instanceId: 'test-counter' });
      await runtime.runCommand('reset', {}, { entityName: 'Counter', instanceId: 'test-counter' });

      expect(hookOrder).toEqual([
        'before-policy',
        'before-guard',
        'before-action',
        'after-emit',
        'before-policy',
        'before-guard',
        'before-action',
        'after-emit',
      ]);
    });

    it('should only execute middleware for registered hooks', async () => {
      const hookOrder: string[] = [];
      const middleware: Middleware = {
        hooks: ['before-policy'],
        handler: async (ctx: MiddlewareContext) => {
          hookOrder.push(ctx.hook);
          return {};
        },
      };

      const runtime = new RuntimeEngine(ir, testContext, { middleware: [middleware] });
      await runtime.runCommand('increment', {}, { entityName: 'Counter', instanceId: 'test-counter' });

      expect(hookOrder).toEqual(['before-policy']);
    });
  });

  describe('Middleware context', () => {
    it('should provide command in context', async () => {
      let capturedCommand: unknown;
      const middleware: Middleware = {
        hooks: ['before-policy'],
        handler: async (ctx: MiddlewareContext) => {
          capturedCommand = ctx.command;
          return {};
        },
      };

      const runtime = new RuntimeEngine(ir, testContext, { middleware: [middleware] });
      await runtime.runCommand('increment', {}, { entityName: 'Counter', instanceId: 'test-counter' });

      expect((capturedCommand as { name: string }).name).toBe('increment');
    });

    it('should provide evalContext in context', async () => {
      let capturedEvalContext: unknown;
      const middleware: Middleware = {
        hooks: ['before-policy'],
        handler: async (ctx: MiddlewareContext) => {
          capturedEvalContext = ctx.evalContext;
          return {};
        },
      };

      const runtime = new RuntimeEngine(ir, testContext, { middleware: [middleware] });
      await runtime.runCommand('setValue', { newValue: 42 }, { entityName: 'Counter', instanceId: 'test-counter' });

      expect(capturedEvalContext).toBeDefined();
      expect((capturedEvalContext as Record<string, unknown>).newValue).toBe(42);
    });

    it('should provide input in context', async () => {
      let capturedInput: unknown;
      const middleware: Middleware = {
        hooks: ['before-policy'],
        handler: async (ctx: MiddlewareContext) => {
          capturedInput = ctx.input;
          return {};
        },
      };

      const runtime = new RuntimeEngine(ir, testContext, { middleware: [middleware] });
      await runtime.runCommand('setValue', { newValue: 42 }, { entityName: 'Counter', instanceId: 'test-counter' });

      expect(capturedInput).toEqual({ newValue: 42 });
    });

    it('should provide runtimeContext in context', async () => {
      let capturedRuntimeContext: unknown;
      const customContext: RuntimeContext = { user: { id: 'user1', role: 'admin' } };
      const middleware: Middleware = {
        hooks: ['before-policy'],
        handler: async (ctx: MiddlewareContext) => {
          capturedRuntimeContext = ctx.runtimeContext;
          return {};
        },
      };

      const runtime = new RuntimeEngine(ir, customContext, { middleware: [middleware] });
      await runtime.runCommand('increment', {}, { entityName: 'Counter', instanceId: 'test-counter' });

      expect(capturedRuntimeContext).toBe(customContext);
    });

    it('should provide entityName in context when applicable', async () => {
      let capturedEntityName: unknown;
      const middleware: Middleware = {
        hooks: ['before-policy'],
        handler: async (ctx: MiddlewareContext) => {
          capturedEntityName = ctx.entityName;
          return {};
        },
      };

      const runtime = new RuntimeEngine(ir, testContext, { middleware: [middleware] });
      await runtime.runCommand('increment', {}, { entityName: 'Counter', instanceId: 'test-counter' });

      expect(capturedEntityName).toBe('Counter');
    });

    it('should provide instanceId in context when applicable', async () => {
      let capturedInstanceId: unknown;
      const middleware: Middleware = {
        hooks: ['before-action'],
        handler: async (ctx: MiddlewareContext) => {
          capturedInstanceId = ctx.instanceId;
          return {};
        },
      };

      const runtime = new RuntimeEngine(ir, testContext, { middleware: [middleware] });
      await runtime.runCommand('increment', {}, { entityName: 'Counter', instanceId: 'test-counter' });

      expect(capturedInstanceId).toBe('test-counter');
    });
  });

  describe('Complex scenarios', () => {
    it('should allow logging middleware to track all phases', async () => {
      const log: string[] = [];
      const loggingMiddleware: Middleware = {
        hooks: ['before-policy', 'before-guard', 'before-action', 'after-emit'],
        handler: async (ctx: MiddlewareContext) => {
          log.push(`[${ctx.hook}] ${ctx.command.name}`);
          return {};
        },
      };

      const runtime = new RuntimeEngine(ir, testContext, { middleware: [loggingMiddleware] });
      const result1 = await runtime.runCommand('increment', {}, { entityName: 'Counter', instanceId: 'test-counter' });
      expect(result1.success).toBe(true);

      const result2 = await runtime.runCommand('reset', {}, { entityName: 'Counter', instanceId: 'test-counter' });
      expect(result2.success).toBe(true);

      expect(log.length).toBeGreaterThan(0);
      expect(log.some(entry => entry.includes('before-policy'))).toBe(true);
      expect(log.some(entry => entry.includes('after-emit'))).toBe(true);
    });

    it('should allow middleware to enrich context with timestamps', async () => {
      const timestampMiddleware: Middleware = {
        hooks: ['before-policy'],
        handler: async (_ctx: MiddlewareContext) => {
          return {
            contextPatch: { _middlewareTimestamp: Date.now() },
          };
        },
      };

      let capturedTimestamp: unknown;
      const verifyingMiddleware: Middleware = {
        hooks: ['before-action'],
        handler: async (ctx: MiddlewareContext) => {
          capturedTimestamp = ctx.evalContext._middlewareTimestamp;
          return {};
        },
      };

      const runtime = new RuntimeEngine(ir, testContext, {
        middleware: [timestampMiddleware, verifyingMiddleware],
      });
      await runtime.runCommand('increment', {}, { entityName: 'Counter', instanceId: 'test-counter' });

      expect(capturedTimestamp).toBeDefined();
      expect(typeof capturedTimestamp).toBe('number');
    });

    it('should allow conditional short-circuit based on context', async () => {
      const conditionalMiddleware: Middleware = {
        hooks: ['before-policy'],
        handler: async (ctx: MiddlewareContext) => {
          // Only block commands named 'reset'
          if (ctx.command.name === 'reset') {
            return {
              shortCircuit: true,
              result: {
                success: false,
                error: 'Reset commands are blocked by middleware',
                emittedEvents: [],
              },
            };
          }
          return {};
        },
      };

      const runtime = new RuntimeEngine(ir, testContext, { middleware: [conditionalMiddleware] });
      const incrementResult = await runtime.runCommand('increment', {}, { entityName: 'Counter', instanceId: 'test-counter' });
      expect(incrementResult.success).toBe(true);

      const resetResult = await runtime.runCommand('reset', {}, { entityName: 'Counter', instanceId: 'test-counter' });
      expect(resetResult.success).toBe(false);
      expect(resetResult.error).toBe('Reset commands are blocked by middleware');
    });
  });
});
